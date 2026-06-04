import { describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../../shared/ipc'
import {
  IPCBridge,
  appendStreamBufferChunk,
  createStreamBuffer,
  drainStreamBuffer,
} from '../ipc-bridge'

describe('IPCBridge stream buffer', () => {
  it('preserves reasoning before text while merging adjacent reasoning chunks', () => {
    const buffer = createStreamBuffer()

    appendStreamBufferChunk(buffer, { type: 'reasoning-delta', reasoning: 'think ' })
    appendStreamBufferChunk(buffer, { type: 'reasoning-delta', reasoning: 'more' })
    appendStreamBufferChunk(buffer, { type: 'text-delta', text: 'answer' })

    expect(drainStreamBuffer(buffer)).toEqual([
      { type: 'reasoning-delta', reasoning: 'think more' },
      { type: 'text-delta', text: 'answer' },
    ])
  })

  it('preserves text reasoning text order without cross-type merging', () => {
    const buffer = createStreamBuffer()

    appendStreamBufferChunk(buffer, { type: 'text-delta', text: 'a' })
    appendStreamBufferChunk(buffer, { type: 'reasoning-delta', reasoning: 'b' })
    appendStreamBufferChunk(buffer, { type: 'text-delta', text: 'c' })

    expect(drainStreamBuffer(buffer)).toEqual([
      { type: 'text-delta', text: 'a' },
      { type: 'reasoning-delta', reasoning: 'b' },
      { type: 'text-delta', text: 'c' },
    ])
  })

  it('does not merge non-adjacent chunks of the same type', () => {
    const buffer = createStreamBuffer()

    appendStreamBufferChunk(buffer, { type: 'text-delta', text: 'a' })
    appendStreamBufferChunk(buffer, { type: 'reasoning-delta', reasoning: 'b' })
    appendStreamBufferChunk(buffer, { type: 'text-delta', text: 'c' })

    const chunks = drainStreamBuffer(buffer)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toEqual({ type: 'text-delta', text: 'a' })
    expect(chunks[2]).toEqual({ type: 'text-delta', text: 'c' })
  })

  it('does not merge adjacent text chunks from different turns', () => {
    const buffer = createStreamBuffer()

    appendStreamBufferChunk(buffer, { type: 'text-delta', text: 'before', turnIndex: 1 })
    appendStreamBufferChunk(buffer, { type: 'text-delta', text: 'after', turnIndex: 2 })

    expect(drainStreamBuffer(buffer)).toEqual([
      { type: 'text-delta', text: 'before', turnIndex: 1 },
      { type: 'text-delta', text: 'after', turnIndex: 2 },
    ])
  })

  it('does not merge adjacent reasoning chunks with different placements', () => {
    const buffer = createStreamBuffer()

    appendStreamBufferChunk(buffer, { type: 'reasoning-delta', reasoning: 'top', placement: 'top' })
    appendStreamBufferChunk(buffer, { type: 'reasoning-delta', reasoning: 'inline', placement: 'inline' })

    expect(drainStreamBuffer(buffer)).toEqual([
      { type: 'reasoning-delta', reasoning: 'top', placement: 'top' },
      { type: 'reasoning-delta', reasoning: 'inline', placement: 'inline' },
    ])
  })

  it('merges only adjacent tool input chunks for the same tool call id', () => {
    const buffer = createStreamBuffer()

    appendStreamBufferChunk(buffer, { type: 'tool-input-delta', toolCallId: 'a', argsTextDelta: '{"x"' })
    appendStreamBufferChunk(buffer, { type: 'tool-input-delta', toolCallId: 'a', argsTextDelta: ':1}' })
    appendStreamBufferChunk(buffer, { type: 'tool-input-delta', toolCallId: 'b', argsTextDelta: '{"y":2}' })
    appendStreamBufferChunk(buffer, { type: 'tool-input-delta', toolCallId: 'a', argsTextDelta: '{"z":3}' })

    expect(drainStreamBuffer(buffer)).toEqual([
      { type: 'tool-input-delta', toolCallId: 'a', argsTextDelta: '{"x":1}' },
      { type: 'tool-input-delta', toolCallId: 'b', argsTextDelta: '{"y":2}' },
      { type: 'tool-input-delta', toolCallId: 'a', argsTextDelta: '{"z":3}' },
    ])
  })

  it('clears chunks after draining', () => {
    const buffer = createStreamBuffer()
    appendStreamBufferChunk(buffer, { type: 'text-delta', text: 'a' })

    expect(drainStreamBuffer(buffer)).toEqual([{ type: 'text-delta', text: 'a' }])
    expect(drainStreamBuffer(buffer)).toEqual([])
  })

  it('flushes buffered tool input before permission request events', () => {
    const bridge = new IPCBridge() as any
    const sent: Array<{ channel: string; payload: any }> = []
    bridge.sender = {
      isDestroyed: () => false,
      send: vi.fn((channel: string, payload: any) => {
        sent.push({ channel, payload })
      }),
    }
    bridge.sessions.set('s1', {
      messageId: 'm1',
      unsubStream: vi.fn(),
      buffer: createStreamBuffer(),
    })

    appendStreamBufferChunk(bridge.sessions.get('s1').buffer, {
      type: 'tool-input-delta',
      toolCallId: 'tc1',
      argsTextDelta: '{"path":"a',
    })

    bridge.handleSessionEvent({
      sessionId: 's1',
      sequence: 1,
      timestamp: 0,
      event: {
        type: 'permission:request',
        requestId: 'p1',
        targetChannel: 'ipc',
        toolCallId: 'tc1',
        messageId: 'm1',
        permissionType: 'file_edit',
        title: 'Edit a',
        metadata: {},
      },
    })

    expect(sent.map(item => item.channel)).toEqual([
      IPC_CHANNELS.SESSION_STREAM,
      IPC_CHANNELS.SESSION_EVENT,
    ])
    expect(sent[0].payload.chunk).toEqual({
      type: 'tool-input-delta',
      toolCallId: 'tc1',
      argsTextDelta: '{"path":"a',
      messageId: 'm1',
    })
    expect(sent[1].payload.event.type).toBe('permission:request')
  })
})
