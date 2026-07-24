import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultSettings } from '@shared/defaults/settings'
import {
  FUNASR_CHUNK_SAMPLES,
  FUNASR_SAMPLE_RATE,
  calculateRms,
  concatInt16,
  createFunASREndMessage,
  createFunASRStartMessage,
  drainPcmChunks,
  downsampleFloat32,
  float32ToInt16,
  int16ToExactArrayBuffer,
  openFunASRSocketConnection,
  parseFunASRMessage,
} from '../funasr-streaming'

interface LocalFunASRServer {
  url: string
  receivedText: string[]
  receivedBinary: NodeBuffer[]
  close: () => Promise<void>
}

interface WebSocketFrame {
  opcode: number
  payload: NodeBuffer
}

type NodeBuffer = Buffer<ArrayBufferLike>

async function createLocalFunASRServer(): Promise<LocalFunASRServer> {
  const server = createServer()
  const sockets = new Set<Duplex>()
  const receivedText: string[] = []
  const receivedBinary: NodeBuffer[] = []

  server.on('upgrade', (request, socket) => {
    const key = request.headers['sec-websocket-key']
    if (!key || Array.isArray(key)) {
      socket.destroy()
      return
    }

    const accept = createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64')
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n'))

    sockets.add(socket)
    socket.on('error', () => {})
    socket.on('close', () => sockets.delete(socket))

    let buffered: NodeBuffer = Buffer.alloc(0)
    socket.on('data', chunk => {
      buffered = Buffer.concat([buffered, chunk])
      const parsed = parseWebSocketFrames(buffered)
      buffered = parsed.remaining
      for (const frame of parsed.frames) {
        if (frame.opcode === 0x1) {
          const text = frame.payload.toString('utf8')
          receivedText.push(text)
          if (isFunASREndText(text)) {
            sendServerTextFrame(socket, JSON.stringify({ mode: '2pass-offline', text: 'server final' }))
          }
        } else if (frame.opcode === 0x2) {
          receivedBinary.push(Buffer.from(frame.payload))
          if (receivedBinary.length === 1) {
            sendServerTextFrame(socket, JSON.stringify({ mode: '2pass-online', text: 'server partial' }))
          }
        } else if (frame.opcode === 0x8) {
          sendServerCloseFrame(socket)
        }
      }
    })
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Local FunASR mock server did not expose a port.')

  return {
    url: `ws://127.0.0.1:${address.port}`,
    receivedText,
    receivedBinary,
    close: () => closeLocalServer(server, sockets),
  }
}

function parseWebSocketFrames(input: NodeBuffer): { frames: WebSocketFrame[]; remaining: NodeBuffer } {
  const frames: WebSocketFrame[] = []
  let offset = 0

  while (input.length - offset >= 2) {
    const firstByte = input[offset]
    const secondByte = input[offset + 1]
    const masked = (secondByte & 0x80) !== 0
    let length = secondByte & 0x7f
    let headerLength = 2

    if (length === 126) {
      if (input.length - offset < 4) break
      length = input.readUInt16BE(offset + 2)
      headerLength = 4
    } else if (length === 127) {
      if (input.length - offset < 10) break
      length = Number(input.readBigUInt64BE(offset + 2))
      headerLength = 10
    }

    const maskLength = masked ? 4 : 0
    const payloadOffset = offset + headerLength + maskLength
    if (input.length < payloadOffset + length) break

    const payload = Buffer.from(input.subarray(payloadOffset, payloadOffset + length))
    if (masked) {
      const mask = input.subarray(offset + headerLength, offset + headerLength + 4)
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4]
      }
    }

    frames.push({ opcode: firstByte & 0x0f, payload })
    offset = payloadOffset + length
  }

  return { frames, remaining: Buffer.from(input.subarray(offset)) }
}

function sendServerTextFrame(socket: Duplex, text: string) {
  const payload = Buffer.from(text, 'utf8')
  socket.write(Buffer.concat([createServerFrameHeader(0x1, payload.length), payload]))
}

function sendServerCloseFrame(socket: Duplex) {
  socket.write(Buffer.from([0x88, 0x00]))
  socket.end()
}

function createServerFrameHeader(opcode: number, length: number): NodeBuffer {
  if (length <= 125) return Buffer.from([0x80 | opcode, length])
  if (length <= 65535) {
    const header = Buffer.alloc(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(length, 2)
    return header
  }

  const header = Buffer.alloc(10)
  header[0] = 0x80 | opcode
  header[1] = 127
  header.writeBigUInt64BE(BigInt(length), 2)
  return header
}

function isFunASREndText(text: string): boolean {
  try {
    return JSON.parse(text).is_speaking === false
  } catch {
    return false
  }
}

async function closeLocalServer(server: Server, sockets: Set<Duplex>) {
  for (const socket of sockets) socket.destroy()
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function waitUntil(predicate: () => boolean, label: string): Promise<void> {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) {
        resolve()
        return
      }
      if (Date.now() - startedAt > 1000) {
        reject(new Error(`Timed out waiting for ${label}.`))
        return
      }
      setTimeout(check, 5)
    }
    check()
  })
}

function bufferToInt16Array(buffer: NodeBuffer): number[] {
  const copy = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return Array.from(new Int16Array(copy))
}

class FakeFunASRSocket {
  static instances: FakeFunASRSocket[] = []
  binaryType: BinaryType = 'blob'
  readyState: number = WebSocket.CONNECTING
  sent: Array<string | ArrayBuffer> = []
  onopen: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null

  constructor(public url: string) {
    FakeFunASRSocket.instances.push(this)
  }

  send(data: string | ArrayBuffer) {
    this.sent.push(data)
  }

  close() {
    this.readyState = WebSocket.CLOSED
    this.onclose?.(new CloseEvent('close'))
  }

  open() {
    this.readyState = WebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  receive(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data }))
  }
}

describe('FunASR streaming helpers', () => {
  beforeEach(() => {
    FakeFunASRSocket.instances = []
  })

  it('creates the websocket start message expected by the FunASR runtime', () => {
    const settings = createDefaultSettings().voice!
    settings.asr.funasr.mode = 'online'
    settings.asr.funasr.language = 'zh'
    settings.asr.funasr.hotwords = 'onething 20'
    settings.asr.funasr.chunkSize = [8, 16, 8]
    settings.asr.funasr.chunkInterval = 12

    expect(createFunASRStartMessage(settings, 'utterance-1')).toEqual({
      mode: 'online',
      wav_name: 'utterance-1',
      wav_format: 'pcm',
      is_speaking: true,
      audio_fs: FUNASR_SAMPLE_RATE,
      chunk_size: [8, 16, 8],
      chunk_interval: 12,
      hotwords: 'onething 20',
      itn: true,
      svs_lang: 'zh',
    })
    expect(createFunASREndMessage()).toEqual({ is_speaking: false })
  })

  it('parses partial and final FunASR transcript messages', () => {
    expect(parseFunASRMessage(JSON.stringify({
      mode: '2pass-online',
      text: '你好',
    }))).toEqual({
      mode: '2pass-online',
      text: '你好',
      isFinal: false,
    })

    expect(parseFunASRMessage(JSON.stringify({
      mode: '2pass-offline',
      text: '你好 onething',
    }))).toEqual({
      mode: '2pass-offline',
      text: '你好 onething',
      isFinal: true,
    })

    const encoded = new TextEncoder().encode(JSON.stringify({
      mode: 'online',
      text: 'done',
      is_final: true,
    }))
    expect(parseFunASRMessage(encoded.buffer)).toEqual({
      mode: 'online',
      text: 'done',
      isFinal: true,
    })
    expect(parseFunASRMessage('{bad json')).toBeNull()
    expect(parseFunASRMessage(JSON.stringify({ text: '   ' }))).toBeNull()
  })

  it('opens a websocket connection and delivers partial transcripts before final messages', async () => {
    const settings = createDefaultSettings().voice!
    const transcripts: Array<{ text: string; isFinal: boolean }> = []
    const opened: string[] = []
    const closed: string[] = []

    const promise = openFunASRSocketConnection({
      url: 'ws://127.0.0.1:10095',
      settings,
      wavName: 'stream-1',
      WebSocketCtor: FakeFunASRSocket,
      onOpen: () => {
        opened.push('open')
      },
      onTranscript: message => {
        transcripts.push({
          text: message.text,
          isFinal: message.isFinal,
        })
      },
      onClose: socket => {
        closed.push(socket.binaryType)
      },
    })

    const socket = FakeFunASRSocket.instances[0]
    socket.open()
    await expect(promise).resolves.toBe(socket)

    expect(opened).toEqual(['open'])
    expect(socket.binaryType).toBe('arraybuffer')
    expect(socket.sent).toHaveLength(1)
    expect(JSON.parse(socket.sent[0] as string)).toMatchObject({
      mode: '2pass',
      wav_name: 'stream-1',
      wav_format: 'pcm',
      is_speaking: true,
      audio_fs: 16000,
    })

    socket.receive(JSON.stringify({ mode: '2pass-online', text: 'partial text' }))
    expect(transcripts).toEqual([{ text: 'partial text', isFinal: false }])

    socket.receive(JSON.stringify({ mode: '2pass-offline', text: 'final text' }))
    expect(transcripts).toEqual([
      { text: 'partial text', isFinal: false },
      { text: 'final text', isFinal: true },
    ])

    socket.close()
    expect(closed).toEqual(['arraybuffer'])
  })

  it('streams PCM through a local websocket server and receives partial text before final text', async () => {
    const server = await createLocalFunASRServer()
    const settings = createDefaultSettings().voice!
    const transcripts: Array<{ text: string; isFinal: boolean }> = []
    const WebSocketCtor = globalThis.WebSocket as any

    const socket = await openFunASRSocketConnection({
      url: server.url,
      settings,
      wavName: 'integration-1',
      WebSocketCtor,
      onTranscript: message => {
        transcripts.push({ text: message.text, isFinal: message.isFinal })
      },
    })

    try {
      await waitUntil(() => server.receivedText.some(text => {
        try {
          const payload = JSON.parse(text)
          return payload.wav_name === 'integration-1' && payload.is_speaking === true
        } catch {
          return false
        }
      }), 'FunASR start frame')

      socket.send(int16ToExactArrayBuffer(new Int16Array([100, -100, 200, -200])))
      await waitUntil(() => server.receivedBinary.length === 1, 'FunASR binary PCM frame')
      await waitUntil(() => transcripts.some(message => message.text === 'server partial'), 'FunASR partial transcript')

      socket.send(JSON.stringify(createFunASREndMessage()))
      await waitUntil(() => server.receivedText.some(isFunASREndText), 'FunASR end-of-speech frame')
      await waitUntil(() => transcripts.some(message => message.text === 'server final'), 'FunASR final transcript')

      expect(bufferToInt16Array(server.receivedBinary[0])).toEqual([100, -100, 200, -200])
      expect(transcripts).toEqual([
        { text: 'server partial', isFinal: false },
        { text: 'server final', isFinal: true },
      ])
    } finally {
      socket.close()
      await server.close()
    }
  })

  it('rejects the websocket connection if it errors before opening', async () => {
    const settings = createDefaultSettings().voice!
    const promise = openFunASRSocketConnection({
      url: 'ws://127.0.0.1:10095',
      settings,
      wavName: 'stream-1',
      WebSocketCtor: FakeFunASRSocket,
    })

    const socket = FakeFunASRSocket.instances[0]
    socket.onerror?.(new Event('error'))

    await expect(promise).rejects.toThrow('FunASR streaming ASR could not connect.')
  })

  it('calculates energy, downsamples to 16k, and converts to PCM16', () => {
    expect(calculateRms(new Float32Array([1, -1, 0, 0]))).toBeCloseTo(Math.sqrt(0.5), 5)

    const downsampled = downsampleFloat32(
      new Float32Array([0, 3, 6, 9, 12, 15]),
      48000,
      16000,
    )
    expect(Array.from(downsampled)).toEqual([3, 12])

    const pcm = float32ToInt16(new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2]))
    expect(Array.from(pcm)).toEqual([-32768, -32768, -16384, 0, 16383, 32767, 32767])
  })

  it('concatenates PCM chunks and returns an exact ArrayBuffer slice', () => {
    const merged = concatInt16(new Int16Array([1, 2]), new Int16Array([3]))
    expect(Array.from(merged)).toEqual([1, 2, 3])

    const larger = new Int16Array([9, 8, 7, 6])
    const slice = larger.subarray(1, 3)
    const buffer = int16ToExactArrayBuffer(slice)

    expect(buffer.byteLength).toBe(4)
    expect(Array.from(new Int16Array(buffer))).toEqual([8, 7])
    expect(FUNASR_CHUNK_SAMPLES).toBe(960)
  })

  it('drains ready PCM chunks while keeping only incomplete pending audio', () => {
    const first = drainPcmChunks(
      new Int16Array([1, 2]),
      new Int16Array([3, 4, 5]),
      4,
    )

    expect(first.ready).toHaveLength(1)
    expect(Array.from(new Int16Array(first.ready[0]))).toEqual([1, 2, 3, 4])
    expect(Array.from(first.pending)).toEqual([5])

    const second = drainPcmChunks(first.pending, new Int16Array([6, 7, 8, 9, 10]), 4)
    expect(second.ready).toHaveLength(1)
    expect(Array.from(new Int16Array(second.ready[0]))).toEqual([5, 6, 7, 8])
    expect(Array.from(second.pending)).toEqual([9, 10])
  })
})
