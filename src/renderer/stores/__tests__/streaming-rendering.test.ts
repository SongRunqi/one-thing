/**
 * Streaming Rendering Tests
 * REQ-009: Verify streaming chunks flow correctly into UIMessages
 *
 * Tests the full streaming pipeline:
 * - handleUIMessageChunk: stream data → UIMessage.parts updates
 * - Text accumulation: multiple text chunks → single concatenated text part
 * - Reasoning accumulation: reasoning chunks → single reasoning part
 * - Tool parts: tool-call/tool-result insertion and update
 * - Finish chunk: metadata (usage, finish reason) applied
 * - getSessionUIMessages: reactive reads return correct data
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChatStore } from '../chat'
import type {
  UIMessage,
  TextUIPart,
  ReasoningUIPart,
  ToolUIPart,
  UIMessageStreamData,
} from '../../../shared/ipc/ui-message'

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

describe('Streaming Rendering Pipeline', () => {
  const sessionId = 'test-session-1'
  const messageId = 'assistant-msg-1'
  let store: ReturnType<typeof useChatStore>

  function seedAssistantMessage() {
    const msg: UIMessage = {
      id: messageId,
      role: 'assistant',
      parts: [],
      metadata: {},
    }
    store.addUIMessage(sessionId, msg)
  }

  function sendChunk(chunk: UIMessageStreamData['chunk']) {
    store.handleUIMessageChunk({ sessionId, messageId, chunk })
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useChatStore()
    seedAssistantMessage()
  })

  // ── Text streaming ──────────────────────────────────────────────────

  describe('Text streaming', () => {
    it('accumulates text chunks into a single text part', () => {
      sendChunk({ type: 'part', part: { type: 'text', text: 'Hello', state: 'streaming' } })
      sendChunk({ type: 'part', part: { type: 'text', text: ' world', state: 'streaming' } })
      sendChunk({ type: 'part', part: { type: 'text', text: '!', state: 'complete' } })

      const msgs = store.getSessionUIMessages(sessionId).value
      expect(msgs).toHaveLength(1)

      const textPart = msgs[0].parts.find(p => p.type === 'text') as TextUIPart
      expect(textPart).toBeDefined()
      expect(textPart.text).toBe('Hello world!')
      expect(textPart.state).toBe('complete')
    })

    it('creates text part on first chunk', () => {
      sendChunk({ type: 'part', part: { type: 'text', text: 'First', state: 'streaming' } })

      const msgs = store.getSessionUIMessages(sessionId).value
      const textPart = msgs[0].parts[0] as TextUIPart
      expect(textPart.type).toBe('text')
      expect(textPart.text).toBe('First')
    })

    it('handles text chunk with explicit partIndex', () => {
      sendChunk({
        type: 'part',
        part: { type: 'text', text: 'Indexed text', state: 'complete' },
        partIndex: 0,
      })

      const msgs = store.getSessionUIMessages(sessionId).value
      expect(msgs[0].parts[0]).toEqual({
        type: 'text',
        text: 'Indexed text',
        state: 'complete',
      })
    })
  })

  // ── Reasoning streaming ─────────────────────────────────────────────

  describe('Reasoning streaming', () => {
    it('accumulates reasoning chunks into a single reasoning part', () => {
      sendChunk({ type: 'part', part: { type: 'reasoning', text: 'Let me think', state: 'streaming' } })
      sendChunk({ type: 'part', part: { type: 'reasoning', text: '...', state: 'complete' } })

      const msgs = store.getSessionUIMessages(sessionId).value
      const reasoningPart = msgs[0].parts.find(p => p.type === 'reasoning') as ReasoningUIPart
      expect(reasoningPart).toBeDefined()
      expect(reasoningPart.text).toBe('Let me think...')
    })
  })

  // ── Tool parts ──────────────────────────────────────────────────────

  describe('Tool parts', () => {
    it('adds tool-call part', () => {
      const toolPart: ToolUIPart = {
        type: 'tool-call',
        toolCallId: 'tc-1',
        toolName: 'search',
        args: { query: 'test' },
        state: 'call',
      }
      sendChunk({ type: 'part', part: toolPart })

      const msgs = store.getSessionUIMessages(sessionId).value
      const found = msgs[0].parts.find(
        p => p.type === 'tool-call' && (p as ToolUIPart).toolCallId === 'tc-1'
      ) as ToolUIPart
      expect(found).toBeDefined()
      expect(found.toolName).toBe('search')
    })

    it('updates existing tool part by toolCallId', () => {
      const callPart: ToolUIPart = {
        type: 'tool-call',
        toolCallId: 'tc-2',
        toolName: 'read',
        args: {},
        state: 'call',
      }
      sendChunk({ type: 'part', part: callPart })

      const resultPart: ToolUIPart = {
        type: 'tool-result',
        toolCallId: 'tc-2',
        toolName: 'read',
        args: {},
        result: 'file contents',
        state: 'result',
      }
      sendChunk({ type: 'part', part: resultPart })

      const msgs = store.getSessionUIMessages(sessionId).value
      const toolParts = msgs[0].parts.filter(p =>
        p.type.startsWith('tool-') && (p as ToolUIPart).toolCallId === 'tc-2'
      )
      // Should update in-place, not duplicate
      expect(toolParts).toHaveLength(1)
      expect((toolParts[0] as ToolUIPart).state).toBe('result')
    })
  })

  // ── Mixed streaming ─────────────────────────────────────────────────

  describe('Mixed content streaming', () => {
    it('handles reasoning → text → tool in sequence', () => {
      sendChunk({ type: 'part', part: { type: 'reasoning', text: 'Thinking...', state: 'complete' } })
      sendChunk({ type: 'part', part: { type: 'text', text: 'Here is the answer', state: 'complete' } })
      sendChunk({
        type: 'part',
        part: {
          type: 'tool-call',
          toolCallId: 'tc-3',
          toolName: 'calc',
          args: { expr: '1+1' },
          state: 'call',
        },
      })

      const msgs = store.getSessionUIMessages(sessionId).value
      expect(msgs[0].parts).toHaveLength(3)
      expect(msgs[0].parts[0].type).toBe('reasoning')
      expect(msgs[0].parts[1].type).toBe('text')
      expect(msgs[0].parts[2].type).toBe('tool-call')
    })
  })

  // ── Finish chunk ────────────────────────────────────────────────────

  describe('Finish chunk', () => {
    it('applies usage metadata on finish', () => {
      sendChunk({ type: 'part', part: { type: 'text', text: 'Done', state: 'complete' } })
      sendChunk({
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      })

      const msgs = store.getSessionUIMessages(sessionId).value
      expect(msgs[0].metadata?.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      })
    })
  })

  // ── Error chunk ─────────────────────────────────────────────────────

  describe('Error chunk', () => {
    it('handles error chunk in stream', () => {
      sendChunk({ type: 'part', part: { type: 'text', text: 'Partial', state: 'streaming' } })
      sendChunk({
        type: 'error',
        error: 'Connection lost',
        messageId,
      })

      // After error, the message should still exist with partial content
      const msgs = store.getSessionUIMessages(sessionId).value
      expect(msgs).toHaveLength(1)
    })
  })

  // ── Reactive access ─────────────────────────────────────────────────

  describe('Reactive getSessionUIMessages', () => {
    it('returns empty array for unknown session', () => {
      const msgs = store.getSessionUIMessages('nonexistent').value
      expect(msgs).toEqual([])
    })

    it('reflects updates after chunks', () => {
      const computed = store.getSessionUIMessages(sessionId)
      expect(computed.value).toHaveLength(1)
      expect(computed.value[0].parts).toHaveLength(0)

      sendChunk({ type: 'part', part: { type: 'text', text: 'Updated', state: 'complete' } })

      // Computed should reflect the update
      const textPart = computed.value[0].parts[0] as TextUIPart
      expect(textPart.text).toBe('Updated')
    })
  })
})
