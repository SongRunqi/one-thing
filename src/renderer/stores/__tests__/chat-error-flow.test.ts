/**
 * Chat Error Flow Integration Tests
 * REQ-007: End-to-end message system error handling
 *
 * Tests the full chain:
 * - handleStreamErrorFromUIMessage: error stream → errorMessage in sessionMessages
 * - sendMessage failure: IPC error → error message with errorDetails
 * - rebuildContentParts: legacy data loading
 * - chatMessageToUIMessage: legacy role:'error' → UIMessage conversion
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChatStore } from '../chat'
import { chatMessageToUIMessage } from '../../../shared/message-converters'
import type { ChatMessage } from '../../../shared/ipc/chat'
import type { ErrorDataUIPart } from '../../../shared/ipc/ui-message'

// ── Mock window.electronAPI ─────────────────────────────────────────────

const mockElectronAPI = {
  sendMessageStream: vi.fn(),
  getSession: vi.fn(),
  getSessionMessages: vi.fn(),
  updateContentParts: vi.fn(),
}

vi.stubGlobal('window', {
  electronAPI: mockElectronAPI,
})

// Mock uuid for deterministic IDs in chatMessageToUIMessage
vi.mock('uuid', () => ({
  v4: () => 'mock-uuid-1',
}))

// ============================================================================

describe('handleStreamErrorFromUIMessage → sessionMessages', () => {
  let store: ReturnType<typeof useChatStore>
  const sessionId = 'test-session-stream-error'

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useChatStore()
    vi.clearAllMocks()
  })

  it('creates an error message with role:assistant and errorDetails in sessionMessages', () => {
    // Simulate a streaming assistant message already present
    const streamingMsgId = 'streaming-msg-1'
    store.sessionMessages.set(sessionId, [
      {
        id: streamingMsgId,
        role: 'assistant',
        content: 'Partial response...',
        timestamp: Date.now(),
        isStreaming: true,
      },
    ])
    store.activeStreams.set(sessionId, streamingMsgId)

    // Simulate error stream event
    store.handleStreamErrorFromUIMessage({
      sessionId,
      messageId: streamingMsgId,
      chunk: {
        type: 'error',
        messageId: streamingMsgId,
        error: 'API 密钥无效，请在设置中检查',
        errorDetails: 'invalid api_key provided',
      },
    })

    const messages = store.sessionMessages.get(sessionId)!
    expect(messages).toBeDefined()

    // The streaming message should be removed
    const streamingMsg = messages.find(m => m.id === streamingMsgId)
    expect(streamingMsg).toBeUndefined()

    // An error message should be added
    const errorMsg = messages.find(m => m.id.startsWith('error-'))
    expect(errorMsg).toBeDefined()
    expect(errorMsg!.role).toBe('assistant')
    expect(errorMsg!.content).toBe('API 密钥无效，请在设置中检查')
    expect(errorMsg!.errorDetails).toBe('invalid api_key provided')

    // Session error state should be set
    expect(store.sessionError.get(sessionId)).toBe('API 密钥无效，请在设置中检查')
    expect(store.sessionErrorDetails.get(sessionId)).toBe('invalid api_key provided')
  })

  it('clears generating/loading/activeStreams state after error', () => {
    store.sessionGenerating.set(sessionId, true)
    store.sessionLoading.set(sessionId, true)
    store.activeStreams.set(sessionId, 'msg-1')

    store.handleStreamErrorFromUIMessage({
      sessionId,
      messageId: 'msg-1',
      chunk: {
        type: 'error',
        messageId: 'msg-1',
        error: 'Streaming error',
      },
    })

    expect(store.sessionGenerating.get(sessionId)).toBe(false)
    expect(store.sessionLoading.get(sessionId)).toBe(false)
    expect(store.activeStreams.has(sessionId)).toBe(false)
  })

  it('handles error without messageId (no streaming message to remove)', () => {
    store.sessionMessages.set(sessionId, [])

    store.handleStreamErrorFromUIMessage({
      sessionId,
      messageId: '',
      chunk: {
        type: 'error',
        messageId: '',
        error: 'Connection reset',
      },
    })

    const messages = store.sessionMessages.get(sessionId)!
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('assistant')
    expect(messages[0].content).toBe('Connection reset')
  })
})

// ============================================================================

describe('sendMessage failure → error message format', () => {
  let store: ReturnType<typeof useChatStore>
  const sessionId = 'test-session-send-error'

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useChatStore()
    vi.clearAllMocks()
  })

  it('IPC returns { success: false } → creates error message with role:assistant and errorDetails', async () => {
    mockElectronAPI.sendMessageStream.mockResolvedValue({
      success: false,
      error: 'API 密钥无效，请在设置中检查',
      errorDetails: 'Status 401: Unauthorized',
    })

    const result = await store.sendMessage(sessionId, 'Hello')

    expect(result).toBe(false)

    const messages = store.sessionMessages.get(sessionId)!
    expect(messages).toBeDefined()

    // Should have user message + error message
    expect(messages.length).toBeGreaterThanOrEqual(2)

    // Error message: role is 'assistant', NOT 'error'
    const errorMsg = messages.find(m => m.id.startsWith('error-'))
    expect(errorMsg).toBeDefined()
    expect(errorMsg!.role).toBe('assistant')
    expect(errorMsg!.content).toBe('API 密钥无效，请在设置中检查')
    expect(errorMsg!.errorDetails).toBe('Status 401: Unauthorized')

    // Session error state
    expect(store.sessionError.get(sessionId)).toBe('API 密钥无效，请在设置中检查')
    expect(store.sessionErrorDetails.get(sessionId)).toBe('Status 401: Unauthorized')
  })

  it('IPC throws exception → removes temp user message', async () => {
    mockElectronAPI.sendMessageStream.mockRejectedValue(new Error('Network error'))

    const result = await store.sendMessage(sessionId, 'Hello')

    expect(result).toBe(false)

    const messages = store.sessionMessages.get(sessionId)!
    // Temp user message should be removed on exception
    const tempMsg = messages.find(m => m.id.startsWith('temp-'))
    expect(tempMsg).toBeUndefined()

    // Session error should be set
    expect(store.sessionError.get(sessionId)).toBe('Network error')
  })
})

// ============================================================================

describe('Legacy data loading: rebuildContentParts + chatMessageToUIMessage', () => {
  describe('rebuildContentParts via setMessagesFromSession', () => {
    let store: ReturnType<typeof useChatStore>
    const sessionId = 'test-session-legacy'

    beforeEach(() => {
      setActivePinia(createPinia())
      store = useChatStore()
    })

    it('assistant messages without contentParts get contentParts rebuilt', () => {
      const rawMessages: ChatMessage[] = [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'Hello from assistant',
          timestamp: 1000,
          toolCalls: [
            {
              id: 'tc-1',
              toolId: 'bash',
              toolName: 'bash',
              arguments: { command: 'ls' },
              status: 'completed',
              result: 'file1.txt',
              timestamp: 1000,
            },
          ],
        },
      ]

      store.setMessagesFromSession(sessionId, rawMessages)

      const messages = store.sessionMessages.get(sessionId)!
      expect(messages).toHaveLength(1)

      const msg = messages[0]
      // contentParts should be rebuilt
      expect(msg.contentParts).toBeDefined()
      expect(msg.contentParts!.length).toBe(2)
      expect(msg.contentParts![0].type).toBe('text')
      expect((msg.contentParts![0] as any).content).toBe('Hello from assistant')
      expect(msg.contentParts![1].type).toBe('tool-call')
      expect((msg.contentParts![1] as any).toolCalls).toHaveLength(1)
    })

    it('user messages are not modified by rebuildContentParts', () => {
      const rawMessages: ChatMessage[] = [
        {
          id: 'msg-2',
          role: 'user',
          content: 'User message',
          timestamp: 1000,
        },
      ]

      store.setMessagesFromSession(sessionId, rawMessages)

      const messages = store.sessionMessages.get(sessionId)!
      expect(messages[0].contentParts).toBeUndefined()
    })

    it('assistant messages with existing contentParts are not modified', () => {
      const existingParts = [{ type: 'text' as const, content: 'Already has parts' }]
      const rawMessages: ChatMessage[] = [
        {
          id: 'msg-3',
          role: 'assistant',
          content: 'should be ignored',
          timestamp: 1000,
          contentParts: existingParts,
        },
      ]

      store.setMessagesFromSession(sessionId, rawMessages)

      const messages = store.sessionMessages.get(sessionId)!
      expect(messages[0].contentParts).toEqual(existingParts)
    })
  })

  describe('chatMessageToUIMessage handles legacy role:error', () => {
    it('role:error → UIMessage with role:assistant, data-error part, isError metadata', () => {
      const legacyErrorMsg: ChatMessage = {
        id: 'legacy-err-1',
        role: 'error' as any,
        content: 'Something went wrong',
        timestamp: 1000,
      }

      const uiMsg = chatMessageToUIMessage(legacyErrorMsg)

      // Role converted to 'assistant'
      expect(uiMsg.role).toBe('assistant')

      // Has data-error part
      const errorPart = uiMsg.parts.find(p => p.type === 'data-error') as ErrorDataUIPart
      expect(errorPart).toBeDefined()
      expect(errorPart.text).toBe('Something went wrong')

      // metadata.isError is true
      expect(uiMsg.metadata?.isError).toBe(true)
    })

    it('assistant with errorDetails → data-error part with details, role stays assistant', () => {
      const errorMsg: ChatMessage = {
        id: 'err-details-1',
        role: 'assistant',
        content: '请求太频繁，请稍后再试',
        timestamp: 1000,
        errorDetails: 'Status 429: rate_limit_exceeded',
      }

      const uiMsg = chatMessageToUIMessage(errorMsg)

      expect(uiMsg.role).toBe('assistant')

      const errorPart = uiMsg.parts.find(p => p.type === 'data-error') as ErrorDataUIPart
      expect(errorPart).toBeDefined()
      expect(errorPart.text).toBe('请求太频繁，请稍后再试')
      expect(errorPart.details).toBe('Status 429: rate_limit_exceeded')

      // metadata.errorDetails is preserved
      expect(uiMsg.metadata?.errorDetails).toBe('Status 429: rate_limit_exceeded')
      // isError should NOT be set (this is the new format, not legacy)
      expect(uiMsg.metadata?.isError).toBeFalsy()
    })
  })

  describe('Full legacy data flow: load → rebuild → convert', () => {
    let store: ReturnType<typeof useChatStore>
    const sessionId = 'test-session-full-legacy'

    beforeEach(() => {
      setActivePinia(createPinia())
      store = useChatStore()
    })

    it('legacy role:error message loaded from backend → rebuildContentParts → chatMessageToUIMessage renders correctly', () => {
      // Simulate loading legacy data with role:'error'
      const rawMessages: ChatMessage[] = [
        {
          id: 'user-1',
          role: 'user',
          content: 'Hello',
          timestamp: 1000,
        },
        {
          id: 'err-1',
          role: 'error' as any,
          content: 'API key invalid',
          timestamp: 1001,
        },
      ]

      // Load through store (runs rebuildContentParts)
      store.setMessagesFromSession(sessionId, rawMessages)

      const messages = store.sessionMessages.get(sessionId)!
      expect(messages).toHaveLength(2)

      // The error message role is still 'error' in ChatMessage storage
      // (rebuildContentParts only rebuilds contentParts for assistant messages)
      const errorMsg = messages[1]

      // Convert to UIMessage (this is what the frontend rendering uses)
      const uiMsg = chatMessageToUIMessage(errorMsg)

      // Frontend sees role:assistant (not 'error')
      expect(uiMsg.role).toBe('assistant')

      // Has data-error part for rendering
      const errorPart = uiMsg.parts.find(p => p.type === 'data-error') as ErrorDataUIPart
      expect(errorPart).toBeDefined()
      expect(errorPart.text).toBe('API key invalid')

      // metadata.isError flag is set
      expect(uiMsg.metadata?.isError).toBe(true)
    })

    it('new-format error message with errorDetails → correct UIMessage', () => {
      const rawMessages: ChatMessage[] = [
        {
          id: 'user-1',
          role: 'user',
          content: 'Hello',
          timestamp: 1000,
        },
        {
          id: 'error-1234',
          role: 'assistant',
          content: '网络连接失败，请检查网络',
          timestamp: 1001,
          errorDetails: 'connect ECONNREFUSED 127.0.0.1:443',
        },
      ]

      store.setMessagesFromSession(sessionId, rawMessages)
      const messages = store.sessionMessages.get(sessionId)!

      // The error message role is 'assistant' (new format)
      const errorMsg = messages[1]
      expect(errorMsg.role).toBe('assistant')
      expect(errorMsg.errorDetails).toBe('connect ECONNREFUSED 127.0.0.1:443')

      // Convert to UIMessage
      const uiMsg = chatMessageToUIMessage(errorMsg)

      expect(uiMsg.role).toBe('assistant')

      // Has data-error part
      const errorPart = uiMsg.parts.find(p => p.type === 'data-error') as ErrorDataUIPart
      expect(errorPart).toBeDefined()
      expect(errorPart.text).toBe('网络连接失败，请检查网络')
      expect(errorPart.details).toBe('connect ECONNREFUSED 127.0.0.1:443')

      // metadata.isError is false (not legacy error)
      expect(uiMsg.metadata?.isError).toBeFalsy()
      expect(uiMsg.metadata?.errorDetails).toBe('connect ECONNREFUSED 127.0.0.1:443')
    })
  })
})
