// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@/types'

type SessionEventCallback = (envelope: {
  sessionId: string
  event: Record<string, unknown>
}) => void

type SessionStreamCallback = (payload: {
  sessionId: string
  chunk: Record<string, unknown>
}) => void

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: '',
    timestamp: 0,
    isStreaming: true,
    contentParts: [],
    ...overrides,
  }
}

describe('IPC hub stream subscriptions', () => {
  let sessionEventCallback: SessionEventCallback | undefined
  let sessionStreamCallback: SessionStreamCallback | undefined

  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
    sessionEventCallback = undefined
    sessionStreamCallback = undefined

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        onSessionEvent: vi.fn((callback: SessionEventCallback) => {
          sessionEventCallback = callback
          return vi.fn()
        }),
        onSessionStream: vi.fn((callback: SessionStreamCallback) => {
          sessionStreamCallback = callback
          return vi.fn()
        }),
      },
    })
  })

  it('routes unified session stream chunks into the chat store in realtime', async () => {
    const { initializeIPCHub } = await import('../ipc-hub')
    const { useChatStore } = await import('@/stores/chat')
    const store = useChatStore()

    initializeIPCHub()
    sessionEventCallback?.({
      sessionId: 's1',
      event: {
        type: 'message:assistant-created',
        message: assistantMessage(),
      },
    })

    const before = store.getSessionState('s1').messages.value[0]
    sessionStreamCallback?.({
      sessionId: 's1',
      chunk: {
        type: 'text-delta',
        messageId: 'm1',
        text: 'live',
        turnIndex: 1,
      },
    })

    const after = store.getSessionState('s1').messages.value[0]
    expect(after).not.toBe(before)
    expect(after.content).toBe('live')
    expect(after.contentParts).toEqual([
      { type: 'text', content: 'live', turnIndex: 1 },
    ])
  })

  it('routes reasoning and text stream chunks without waiting for completion', async () => {
    const { initializeIPCHub } = await import('../ipc-hub')
    const { useChatStore } = await import('@/stores/chat')
    const store = useChatStore()

    initializeIPCHub()
    sessionEventCallback?.({
      sessionId: 's1',
      event: {
        type: 'message:assistant-created',
        message: assistantMessage(),
      },
    })

    const initial = store.getSessionState('s1').messages.value[0]
    sessionStreamCallback?.({
      sessionId: 's1',
      chunk: {
        type: 'reasoning-delta',
        messageId: 'm1',
        reasoning: 'think',
        turnIndex: 1,
        placement: 'top',
      },
    })
    const afterReasoning = store.getSessionState('s1').messages.value[0]

    expect(afterReasoning).not.toBe(initial)
    expect(afterReasoning.reasoning).toBe('think')
    expect(afterReasoning.content).toBe('')
    expect(afterReasoning.isStreaming).toBe(true)

    sessionStreamCallback?.({
      sessionId: 's1',
      chunk: {
        type: 'text-delta',
        messageId: 'm1',
        text: 'answer',
        turnIndex: 1,
      },
    })
    const afterText = store.getSessionState('s1').messages.value[0]

    expect(afterText).not.toBe(afterReasoning)
    expect(afterText.reasoning).toBe('think')
    expect(afterText.content).toBe('answer')
    expect(afterText.contentParts).toEqual([
      { type: 'text', content: 'answer', turnIndex: 1 },
    ])
    expect(afterText.isStreaming).toBe(true)
  })

  it('routes final message updates so waiting does not survive until restart', async () => {
    const { initializeIPCHub } = await import('../ipc-hub')
    const { useChatStore } = await import('@/stores/chat')
    const store = useChatStore()

    initializeIPCHub()
    sessionEventCallback?.({
      sessionId: 's1',
      event: {
        type: 'message:assistant-created',
        message: assistantMessage(),
      },
    })
    sessionEventCallback?.({
      sessionId: 's1',
      event: {
        type: 'content:part',
        part: { type: 'waiting' },
      },
    })
    sessionEventCallback?.({
      sessionId: 's1',
      event: {
        type: 'message:updated',
        messageId: 'm1',
        updates: {
          content: 'final',
          contentParts: [{ type: 'text', content: 'final', turnIndex: 1 }],
          isStreaming: false,
        },
      },
    })

    const message = store.getSessionState('s1').messages.value[0]
    expect(message.isStreaming).toBe(false)
    expect(message.content).toBe('final')
    expect(message.contentParts).toEqual([
      { type: 'text', content: 'final', turnIndex: 1 },
    ])
  })
})
