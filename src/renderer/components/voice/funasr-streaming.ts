import type { VoiceSettings } from '@/types'

export const FUNASR_SAMPLE_RATE = 16000
export const FUNASR_CHUNK_SAMPLES = 960

export interface FunASRStartMessage {
  mode: '2pass' | 'online'
  wav_name: string
  wav_format: 'pcm'
  is_speaking: boolean
  audio_fs: number
  chunk_size: [number, number, number]
  chunk_interval: number
  hotwords: string
  itn: boolean
  svs_lang: string
}

export interface FunASRTranscriptMessage {
  text: string
  isFinal: boolean
  mode: string
}

export interface FunASREndMessage {
  is_speaking: false
}

export interface FunASRWebSocketLike {
  binaryType: BinaryType
  readyState: number
  send: (data: string | ArrayBuffer) => void
  close: () => void
  onopen: ((event: Event) => void) | null
  onerror: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
}

export type FunASRWebSocketCtor = new (url: string) => FunASRWebSocketLike

export interface OpenFunASRSocketOptions {
  url: string
  settings: VoiceSettings
  wavName: string
  WebSocketCtor: FunASRWebSocketCtor
  onOpen?: () => void | Promise<void>
  onTranscript?: (message: FunASRTranscriptMessage, raw: unknown) => void | Promise<void>
  onClose?: (socket: FunASRWebSocketLike) => void | Promise<void>
}

export function createFunASRStartMessage(settings: VoiceSettings, wavName: string): FunASRStartMessage {
  return {
    mode: settings.asr.funasr.mode || '2pass',
    wav_name: wavName,
    wav_format: 'pcm',
    is_speaking: true,
    audio_fs: FUNASR_SAMPLE_RATE,
    chunk_size: settings.asr.funasr.chunkSize || [5, 10, 5],
    chunk_interval: settings.asr.funasr.chunkInterval || 10,
    hotwords: settings.asr.funasr.hotwords || '',
    itn: true,
    svs_lang: settings.asr.funasr.language || 'auto',
  }
}

export function createFunASREndMessage(): FunASREndMessage {
  return { is_speaking: false }
}

export function openFunASRSocketConnection(options: OpenFunASRSocketOptions): Promise<FunASRWebSocketLike> {
  return new Promise((resolve, reject) => {
    let opened = false
    const socket = new options.WebSocketCtor(options.url)
    socket.binaryType = 'arraybuffer'
    socket.onopen = () => {
      opened = true
      socket.send(JSON.stringify(createFunASRStartMessage(options.settings, options.wavName)))
      void options.onOpen?.()
      resolve(socket)
    }
    socket.onerror = () => {
      if (!opened) reject(new Error('FunASR streaming ASR could not connect.'))
    }
    socket.onmessage = event => {
      const message = parseFunASRMessage(event.data)
      if (!message) return
      void options.onTranscript?.(message, event.data)
    }
    socket.onclose = () => {
      void options.onClose?.(socket)
    }
  })
}

export function parseFunASRMessage(raw: unknown): FunASRTranscriptMessage | null {
  const payload = parseJSONMessage(raw)
  if (!payload) return null

  const text = String(payload.text || '').trim()
  if (!text) return null

  const mode = String(payload.mode || '')
  return {
    text,
    isFinal: mode.includes('offline') || payload.is_final === true,
    mode,
  }
}

export function calculateRms(input: Float32Array): number {
  if (!input.length) return 0
  let sum = 0
  for (const sample of input) sum += sample * sample
  return Math.sqrt(sum / input.length)
}

export function downsampleFloat32(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (!Number.isFinite(inputRate) || !Number.isFinite(outputRate) || inputRate <= 0 || outputRate <= 0) {
    throw new Error('Audio sample rates must be positive numbers.')
  }
  if (inputRate <= outputRate) return new Float32Array(input)

  const ratio = inputRate / outputRate
  const outputLength = Math.floor(input.length / ratio)
  const output = new Float32Array(outputLength)
  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio)
    const end = Math.min(input.length, Math.floor((index + 1) * ratio))
    let sum = 0
    for (let cursor = start; cursor < end; cursor += 1) sum += input[cursor]
    output[index] = sum / Math.max(1, end - start)
  }
  return output
}

export function float32ToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length)
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]))
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  return output
}

export function concatInt16(left: Int16Array, right: Int16Array): Int16Array {
  if (!left.length) return new Int16Array(right)
  if (!right.length) return new Int16Array(left)
  const merged = new Int16Array(left.length + right.length)
  merged.set(left, 0)
  merged.set(right, left.length)
  return merged
}

export interface PcmChunkDrainResult {
  ready: ArrayBuffer[]
  pending: Int16Array
}

export function drainPcmChunks(
  pending: Int16Array,
  incoming: Int16Array,
  chunkSamples = FUNASR_CHUNK_SAMPLES,
): PcmChunkDrainResult {
  let buffer = concatInt16(pending, incoming)
  const ready: ArrayBuffer[] = []
  while (buffer.length >= chunkSamples) {
    const current = buffer.slice(0, chunkSamples)
    buffer = buffer.slice(chunkSamples)
    ready.push(int16ToExactArrayBuffer(current))
  }
  return { ready, pending: buffer }
}

export function int16ToExactArrayBuffer(samples: Int16Array): ArrayBuffer {
  const bytes = new Uint8Array(samples.byteLength)
  bytes.set(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength))
  return bytes.buffer
}

function parseJSONMessage(raw: unknown): Record<string, any> | null {
  try {
    if (typeof raw === 'string') return JSON.parse(raw)
    if (raw instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(raw))
    if (ArrayBuffer.isView(raw)) {
      return JSON.parse(new TextDecoder().decode(raw as ArrayBufferView))
    }
  } catch {
    return null
  }
  return null
}
