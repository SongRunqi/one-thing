import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChatStore } from '../chat'
import type { ChatMessage, Step } from '@/types'

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: '',
    timestamp: 0,
    isStreaming: true,
    toolCalls: [],
    steps: [],
    contentParts: [],
    ...overrides,
  }
}

describe('chat store permission ordering', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('window', { electronAPI: {} })
    vi.useRealTimers()
  })

  it('applies cached permission requests when the tool call and step arrive later', () => {
    const store = useChatStore()
    store.handleAssistantCreated({ sessionId: 's1', message: assistantMessage() })

    store.handlePermissionRequest({
      sessionId: 's1',
      requestId: 'p1',
      messageId: 'm1',
      callId: 'tc1',
      permissionType: 'file_edit',
      title: 'Edit file',
      metadata: { diff: 'diff --git', filePath: '/tmp/a.txt' },
      canRespond: true,
    })

    store.handleStreamChunk({
      type: 'tool_input_start',
      sessionId: 's1',
      messageId: 'm1',
      content: '',
      toolCallId: 'tc1',
      toolName: 'edit',
    })

    const message = store.sessionMessages.get('s1')![0]
    expect(message.toolCalls![0]).toMatchObject({
      id: 'tc1',
      permissionId: 'p1',
      canRespond: true,
      requiresConfirmation: true,
      status: 'pending',
    })

    const step: Step = {
      id: 'step1',
      type: 'tool-call',
      title: 'Tool: edit',
      status: 'running',
      timestamp: 0,
      toolCallId: 'tc1',
      toolCall: message.toolCalls![0],
    }
    store.handleStepAdded({ sessionId: 's1', messageId: 'm1', step })

    const updated = store.sessionMessages.get('s1')![0]
    expect(updated.steps![0].status).toBe('awaiting-confirmation')
    expect(updated.steps![0].toolCall).toBe(updated.toolCalls![0])
  })

  it('keeps batched tool input deltas if they arrive before the placeholder', () => {
    const store = useChatStore()
    store.handleAssistantCreated({ sessionId: 's1', message: assistantMessage() })

    store.handleStreamChunk({
      type: 'tool_input_delta',
      sessionId: 's1',
      messageId: 'm1',
      content: '',
      toolCallId: 'tc1',
      argsTextDelta: '{"file_path":"src/a.ts"',
    })

    store.handleStreamChunk({
      type: 'tool_input_start',
      sessionId: 's1',
      messageId: 'm1',
      content: '',
      toolCallId: 'tc1',
      toolName: 'write',
    })

    store.handleStreamChunk({
      type: 'tool_call',
      sessionId: 's1',
      messageId: 'm1',
      content: '',
      toolCall: {
        id: 'tc1',
        toolId: 'write',
        toolName: 'write',
        arguments: {},
        status: 'executing',
        timestamp: 0,
      },
    })

    const message = store.sessionMessages.get('s1')![0]
    expect(message.toolCalls![0].streamingArgs).toBe('{"file_path":"src/a.ts"')
  })
})
