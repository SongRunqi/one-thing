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

  it('replaces the streamed message object so MessageItem props update in realtime', () => {
    const store = useChatStore()
    store.setMessagesFromSession('s1', [assistantMessage()])
    const before = store.getSessionState('s1').messages.value[0]

    store.handleStreamChunk({
      type: 'text',
      sessionId: 's1',
      messageId: 'm1',
      content: 'live text',
      turnIndex: 1,
    })

    const after = store.getSessionState('s1').messages.value[0]
    expect(after).not.toBe(before)
    expect(after.content).toBe('live text')
    expect(after.contentParts).toEqual([
      { type: 'text', content: 'live text', turnIndex: 1 },
    ])
  })

  it('replaces merged text content parts on every streamed delta', () => {
    const store = useChatStore()
    store.setMessagesFromSession('s1', [assistantMessage()])

    store.handleStreamChunk({
      type: 'text',
      sessionId: 's1',
      messageId: 'm1',
      content: '对',
      turnIndex: 1,
    })

    const afterFirst = store.getSessionState('s1').messages.value[0]
    const firstPart = afterFirst.contentParts?.[0]

    store.handleStreamChunk({
      type: 'text',
      sessionId: 's1',
      messageId: 'm1',
      content: '，可以直接用。',
      turnIndex: 1,
    })

    const afterSecond = store.getSessionState('s1').messages.value[0]
    expect(afterSecond).not.toBe(afterFirst)
    expect(afterSecond.content).toBe('对，可以直接用。')
    expect(afterSecond.contentParts?.[0]).not.toBe(firstPart)
    expect(afterSecond.contentParts).toEqual([
      { type: 'text', content: '对，可以直接用。', turnIndex: 1 },
    ])
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

  it('uses finalized text content parts when no text delta arrived', () => {
    const store = useChatStore()
    store.setMessagesFromSession('s1', [assistantMessage()])

    store.handleStreamChunk({
      type: 'content_part',
      sessionId: 's1',
      messageId: 'm1',
      content: '',
      contentPart: { type: 'waiting' },
    })

    store.handleStreamChunk({
      type: 'content_part',
      sessionId: 's1',
      messageId: 'm1',
      content: '',
      contentPart: { type: 'text', content: 'hello from final part', turnIndex: 1 },
    })

    const message = store.getSessionState('s1').messages.value[0]
    expect(message.content).toBe('hello from final part')
    expect(message.contentParts).toEqual([
      { type: 'text', content: 'hello from final part', turnIndex: 1 },
    ])
  })

  it('does not duplicate finalized text content parts after text deltas', () => {
    const store = useChatStore()
    store.setMessagesFromSession('s1', [assistantMessage()])

    store.handleStreamChunk({
      type: 'text',
      sessionId: 's1',
      messageId: 'm1',
      content: 'hello from delta',
      turnIndex: 1,
    })

    store.handleStreamChunk({
      type: 'content_part',
      sessionId: 's1',
      messageId: 'm1',
      content: '',
      contentPart: { type: 'text', content: 'hello from delta', turnIndex: 1 },
    })

    const message = store.getSessionState('s1').messages.value[0]
    expect(message.content).toBe('hello from delta')
    expect(message.contentParts).toEqual([
      { type: 'text', content: 'hello from delta', turnIndex: 1 },
    ])
  })

  it('clears waiting and shows stream errors when preserved errors have no details', () => {
    const store = useChatStore()
    store.handleAssistantCreated({ sessionId: 's1', message: assistantMessage() })

    store.handleStreamChunk({
      type: 'content_part',
      sessionId: 's1',
      messageId: 'm1',
      content: '',
      contentPart: { type: 'waiting' },
    })

    store.handleStreamError({
      sessionId: 's1',
      error: 'Provider request failed',
      preserved: true,
    })

    const message = store.getSessionState('s1').messages.value[0]
    expect(message.isStreaming).toBe(false)
    expect(message.errorDetails).toBe('Provider request failed')
    expect(message.contentParts).toEqual([])
  })

  it('uses final message updates to replace waiting with completed content', () => {
    const store = useChatStore()
    store.handleAssistantCreated({ sessionId: 's1', message: assistantMessage() })

    store.handleStreamChunk({
      type: 'content_part',
      sessionId: 's1',
      messageId: 'm1',
      content: '',
      contentPart: { type: 'waiting' },
    })

    store.updateSessionMessage('s1', 'm1', {
      content: 'final answer',
      contentParts: [{ type: 'text', content: 'final answer', turnIndex: 1 }],
      isStreaming: false,
    })

    const message = store.getSessionState('s1').messages.value[0]
    expect(message.isStreaming).toBe(false)
    expect(message.content).toBe('final answer')
    expect(message.contentParts).toEqual([
      { type: 'text', content: 'final answer', turnIndex: 1 },
    ])
  })
})
