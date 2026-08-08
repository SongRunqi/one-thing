import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@shared/ipc/chat.js'
import {
  applyHistoryPage,
  applySessionEvent,
  applyStreamChunk,
  initialChatState,
  type ChatState,
  type SessionEventEnvelopeWire,
  type SessionEventPayload,
} from '../chat-reducer'

function msg(partial: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'role'>): ChatMessage {
  return { content: '', timestamp: 1_000, ...partial }
}

function env(event: SessionEventPayload, sequence = 1): SessionEventEnvelopeWire {
  return { sessionId: 's1', sequence, timestamp: 1_000, event }
}

function stateWith(messages: ChatMessage[], streamingMessageId: string | null = null): ChatState {
  return { messages, streamingMessageId }
}

describe('applySessionEvent', () => {
  it('message:assistant-created marks the message streaming and sets streamingMessageId', () => {
    const next = applySessionEvent(
      initialChatState,
      env({ type: 'message:assistant-created', message: msg({ id: 'a1', role: 'assistant' }) }),
    )
    expect(next.streamingMessageId).toBe('a1')
    expect(next.messages[0].isStreaming).toBe(true)
  })

  it('message:user-created upserts the message', () => {
    const state = applySessionEvent(
      initialChatState,
      env({ type: 'message:user-created', message: msg({ id: 'u1', role: 'user', content: 'hi' }) }),
    )
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].content).toBe('hi')
    // Upsert again → no duplicate.
    const again = applySessionEvent(
      state,
      env({ type: 'message:user-created', message: msg({ id: 'u1', role: 'user', content: 'hi' }) }, 2),
    )
    expect(again.messages).toHaveLength(1)
  })

  it('stream:start falls back to assistantMessageId and marks isStreaming', () => {
    const state = stateWith([msg({ id: 'a1', role: 'assistant' })])
    const next = applySessionEvent(
      state,
      env({ type: 'stream:start', messageId: '', assistantMessageId: 'a1' }),
    )
    expect(next.streamingMessageId).toBe('a1')
    expect(next.messages[0].isStreaming).toBe(true)
  })

  it('stream:complete clears streaming state', () => {
    const state = stateWith([msg({ id: 'a1', role: 'assistant', isStreaming: true, content: 'done' })], 'a1')
    const next = applySessionEvent(state, env({ type: 'stream:complete', data: {} }))
    expect(next.streamingMessageId).toBeNull()
    expect(next.messages[0].isStreaming).toBe(false)
  })

  it('stream:error records errorDetails on the streaming message', () => {
    const state = stateWith([msg({ id: 'a1', role: 'assistant', isStreaming: true })], 'a1')
    const next = applySessionEvent(
      state,
      env({ type: 'stream:error', data: { error: 'provider exploded' } }),
    )
    expect(next.messages[0].errorDetails).toBe('provider exploded')
    expect(next.streamingMessageId).toBeNull()
  })

  it('content:part text heals a gap when deltas were lost (post-resume)', () => {
    const state = stateWith([msg({ id: 'a1', role: 'assistant', isStreaming: true, content: 'Hello' })], 'a1')
    const next = applySessionEvent(
      state,
      env({ type: 'content:part', part: { type: 'text', content: ' world' } }),
    )
    expect(next.messages[0].content).toBe('Hello world')
  })

  it('content:part text does not duplicate already-streamed text', () => {
    const state = stateWith([msg({ id: 'a1', role: 'assistant', content: 'Hello world' })], 'a1')
    const next = applySessionEvent(
      state,
      env({ type: 'content:part', part: { type: 'text', content: 'Hello world' } }),
    )
    expect(next.messages[0].content).toBe('Hello world')
  })

  it('content:part non-text is ignored in M2 scope', () => {
    const state = stateWith([msg({ id: 'a1', role: 'assistant' })], 'a1')
    const next = applySessionEvent(
      state,
      env({ type: 'content:part', part: { type: 'waiting' } }),
    )
    expect(next).toBe(state)
  })

  it('message:updated merges updates', () => {
    const state = stateWith([msg({ id: 'a1', role: 'assistant', content: 'x' })])
    const next = applySessionEvent(
      state,
      env({ type: 'message:updated', messageId: 'a1', updates: { model: 'gpt-5' } }),
    )
    expect(next.messages[0].model).toBe('gpt-5')
  })

  it('message:deleted removes the message', () => {
    const state = stateWith([msg({ id: 'a1', role: 'assistant' }), msg({ id: 'u1', role: 'user' })])
    const next = applySessionEvent(state, env({ type: 'message:deleted', messageId: 'a1' }))
    expect(next.messages.map((m) => m.id)).toEqual(['u1'])
  })

  it('messages:replaced swaps the whole list', () => {
    const state = stateWith([msg({ id: 'a1', role: 'assistant', content: 'old' })], 'a1')
    const next = applySessionEvent(
      state,
      env({ type: 'messages:replaced', messages: [msg({ id: 'u9', role: 'user', content: 'new' })] }),
    )
    expect(next.messages.map((m) => m.id)).toEqual(['u9'])
  })

  it('unknown events leave state untouched', () => {
    const state = stateWith([msg({ id: 'a1', role: 'assistant' })])
    const next = applySessionEvent(state, env({ type: 'step:updated', stepId: 'x', updates: {} } as unknown as SessionEventPayload))
    expect(next).toBe(state)
  })
})

describe('applyStreamChunk', () => {
  it('appends text-delta to content and merges the trailing text part', () => {
    let state = stateWith([msg({ id: 'a1', role: 'assistant', isStreaming: true })], 'a1')
    state = applyStreamChunk(state, { type: 'text-delta', text: 'Hel', messageId: 'a1' })
    state = applyStreamChunk(state, { type: 'text-delta', text: 'lo', messageId: 'a1' })
    const m = state.messages[0]
    expect(m.content).toBe('Hello')
    expect(m.contentParts).toEqual([{ type: 'text', content: 'Hello' }])
    expect(m.isStreaming).toBe(true)
  })

  it('falls back to streamingMessageId when the chunk has no messageId', () => {
    const state = stateWith([msg({ id: 'a1', role: 'assistant' })], 'a1')
    const next = applyStreamChunk(state, { type: 'text-delta', text: 'x' })
    expect(next.messages[0].content).toBe('x')
  })

  it('ignores chunks with no resolvable message', () => {
    const state = stateWith([msg({ id: 'a1', role: 'assistant' })])
    const next = applyStreamChunk(state, { type: 'text-delta', text: 'x' })
    expect(next).toBe(state)
  })

  it('ignores chunks for unknown message ids', () => {
    const state = stateWith([msg({ id: 'a1', role: 'assistant' })], 'a1')
    const next = applyStreamChunk(state, { type: 'text-delta', text: 'x', messageId: 'nope' })
    expect(next).toBe(state)
  })

  it('ignores non-text chunks', () => {
    const state = stateWith([msg({ id: 'a1', role: 'assistant' })], 'a1')
    const next = applyStreamChunk(state, { type: 'reasoning-delta', text: 'thinking' } as never)
    expect(next).toBe(state)
  })
})

describe('applyHistoryPage', () => {
  it('appends the initial page and de-duplicates by id', () => {
    let state = stateWith([msg({ id: 'm2', role: 'user', content: 'live echo' })])
    state = applyHistoryPage(state, [msg({ id: 'm1', role: 'user' }), msg({ id: 'm2', role: 'user' })], false)
    expect(state.messages.map((m) => m.id)).toEqual(['m2', 'm1'])
  })

  it('prepends older pages', () => {
    let state = stateWith([msg({ id: 'm3', role: 'user' })])
    state = applyHistoryPage(state, [msg({ id: 'm1', role: 'user' }), msg({ id: 'm2', role: 'user' })], true)
    expect(state.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])
  })
})
