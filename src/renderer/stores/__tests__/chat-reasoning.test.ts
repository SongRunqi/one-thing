// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from '../chat'
import type { ChatMessage } from '@/types'

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

describe('chat store reasoning placement', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps opening reasoning at the message top', () => {
    const store = useChatStore()
    store.setMessagesFromSession('s1', [assistantMessage()])

    store.handleStreamChunk({
      type: 'reasoning',
      sessionId: 's1',
      messageId: 'm1',
      content: '',
      reasoning: 'opening thought',
      placement: 'top',
      turnIndex: 1,
    })

    const message = store.getSessionState('s1').messages.value[0]
    expect(message.reasoning).toBe('opening thought')
    expect(message.contentParts).toEqual([])
  })

  it('renders post-tool reasoning inline without hiding top reasoning', () => {
    const store = useChatStore()
    store.setMessagesFromSession('s1', [assistantMessage({ reasoning: 'opening thought' })])

    store.handleStreamChunk({
      type: 'reasoning',
      sessionId: 's1',
      messageId: 'm1',
      content: '',
      reasoning: 'after tool thought',
      placement: 'inline',
      turnIndex: 2,
    })

    const message = store.getSessionState('s1').messages.value[0]
    expect(message.reasoning).toBe('opening thought')
    expect(message.contentParts).toEqual([
      { type: 'reasoning', content: 'after tool thought', turnIndex: 2 },
    ])
  })
})

describe('chat store memory loading status', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('applies loading-memory and returns to waiting after recall finishes', () => {
    const store = useChatStore()
    store.setMessagesFromSession('s1', [assistantMessage()])

    store.handleStreamChunk({
      type: 'content_part',
      sessionId: 's1',
      messageId: 'm1',
      content: '',
      contentPart: { type: 'loading-memory' },
    })

    let message = store.getSessionState('s1').messages.value[0]
    expect(message.contentParts).toEqual([{ type: 'loading-memory' }])

    store.handleStreamChunk({
      type: 'content_part',
      sessionId: 's1',
      messageId: 'm1',
      content: '',
      contentPart: { type: 'waiting' },
    })

    message = store.getSessionState('s1').messages.value[0]
    expect(message.contentParts).toEqual([{ type: 'waiting' }])
  })
})
