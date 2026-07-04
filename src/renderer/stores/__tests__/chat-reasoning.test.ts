// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from '../chat'
import type { ChatMessage, Step, ToolCall } from '@/types'

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

function toolCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id: 'tc1',
    toolId: 'read',
    toolName: 'read',
    arguments: {},
    status: 'executing',
    timestamp: 0,
    ...overrides,
  }
}

function toolStep(call: ToolCall, overrides: Partial<Step> = {}): Step {
  return {
    id: 'step1',
    type: 'tool-call',
    title: 'Reading file',
    status: 'running',
    timestamp: 0,
    turnIndex: 1,
    toolCallId: call.id,
    toolCall: call,
    ...overrides,
  }
}

describe('chat store reasoning placement', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('starts thinking time at the first top reasoning chunk, not while waiting', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)

    const store = useChatStore()
    store.handleAssistantCreated({
      sessionId: 's1',
      message: assistantMessage({ thinkingStartTime: 500 }),
    })

    let message = store.getSessionState('s1').messages.value[0]
    expect(message.thinkingStartTime).toBeUndefined()

    store.handleStreamChunk({
      type: 'content_part',
      sessionId: 's1',
      messageId: 'm1',
      content: '',
      contentPart: { type: 'waiting' },
    })

    message = store.getSessionState('s1').messages.value[0]
    expect(message.thinkingStartTime).toBeUndefined()

    vi.setSystemTime(2500)
    store.handleStreamChunk({
      type: 'reasoning',
      sessionId: 's1',
      messageId: 'm1',
      content: '',
      reasoning: 'opening thought',
      placement: 'top',
      turnIndex: 1,
    })

    message = store.getSessionState('s1').messages.value[0]
    expect(message.thinkingStartTime).toBe(2500)

    vi.setSystemTime(4000)
    store.handleStreamChunk({
      type: 'reasoning',
      sessionId: 's1',
      messageId: 'm1',
      content: '',
      reasoning: ' continued',
      placement: 'top',
      turnIndex: 1,
    })

    message = store.getSessionState('s1').messages.value[0]
    expect(message.thinkingStartTime).toBe(2500)
    expect(message.reasoning).toBe('opening thought continued')
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

  it('shows deferred continuation waiting after the active tool finishes', () => {
    const store = useChatStore()
    const call = toolCall()
    store.setMessagesFromSession('s1', [
      assistantMessage({
        toolCalls: [call],
        steps: [toolStep(call)],
        contentParts: [{ type: 'data-steps', turnIndex: 1 }],
      }),
    ])

    store.handleStreamChunk({
      type: 'continuation',
      sessionId: 's1',
      messageId: 'm1',
      content: '',
      turnIndex: 2,
    })

    let message = store.getSessionState('s1').messages.value[0]
    expect(message.contentParts).toEqual([{ type: 'data-steps', turnIndex: 1 }])

    store.handleToolExecutionEnd({
      sessionId: 's1',
      messageId: 'm1',
      stepId: 'step1',
      toolCallId: 'tc1',
      result: { content: [{ type: 'text', text: 'done' }] },
    })

    message = store.getSessionState('s1').messages.value[0]
    expect(message.steps?.[0].status).toBe('completed')
    expect(message.toolCalls?.[0].status).toBe('completed')
    expect(message.contentParts).toEqual([
      { type: 'data-steps', turnIndex: 1 },
      { type: 'waiting', turnIndex: 2 },
    ])
  })

  it('ignores stale active tool state from older turns when flushing continuation waiting', () => {
    const store = useChatStore()
    const staleCall = toolCall({
      id: 'tc-stale',
      status: 'input-streaming',
    })
    const currentCall = toolCall({
      id: 'tc-current',
      status: 'executing',
    })

    store.setMessagesFromSession('s1', [
      assistantMessage({
        toolCalls: [staleCall, currentCall],
        steps: [
          toolStep(staleCall, {
            id: 'step-stale',
            status: 'running',
            turnIndex: 1,
            toolCallId: 'tc-stale',
          }),
          toolStep(currentCall, {
            id: 'step-current',
            status: 'running',
            turnIndex: 18,
            toolCallId: 'tc-current',
          }),
        ],
        contentParts: [
          { type: 'data-steps', turnIndex: 1 },
          { type: 'data-steps', turnIndex: 18 },
        ],
      }),
    ])
    store.handleStreamStarted({ sessionId: 's1', messageId: 'm1' })

    store.handleStreamChunk({
      type: 'continuation',
      sessionId: 's1',
      messageId: '',
      content: '',
      turnIndex: 19,
    })

    let message = store.getSessionState('s1').messages.value[0]
    expect(message.contentParts).toEqual([
      { type: 'data-steps', turnIndex: 1 },
      { type: 'data-steps', turnIndex: 18 },
    ])

    store.handleToolExecutionEnd({
      sessionId: 's1',
      messageId: '',
      stepId: 'step-current',
      toolCallId: 'tc-current',
      result: { content: [{ type: 'text', text: 'done' }] },
    })

    message = store.getSessionState('s1').messages.value[0]
    expect(message.steps?.find(step => step.id === 'step-stale')?.status).toBe('running')
    expect(message.toolCalls?.find(call => call.id === 'tc-stale')?.status).toBe('input-streaming')
    expect(message.steps?.find(step => step.id === 'step-current')?.status).toBe('completed')
    expect(message.toolCalls?.find(call => call.id === 'tc-current')?.status).toBe('completed')
    expect(message.contentParts).toEqual([
      { type: 'data-steps', turnIndex: 1 },
      { type: 'data-steps', turnIndex: 18 },
      { type: 'waiting', turnIndex: 19 },
    ])
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
