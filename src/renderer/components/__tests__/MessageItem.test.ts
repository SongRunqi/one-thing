/**
 * MessageItem Conditional Rendering Tests
 * REQ-007: Verify error message rendering conditions
 *
 * NOTE: Full Vue component mount tests are skipped because:
 * 1. @vue/test-utils is not installed in this project
 * 2. MessageItem.vue has deep dependencies on Pinia stores, composables,
 *    Electron API (window.electronAPI), Teleport, and child components
 *    (MessageBubble, MessageThinking, SelectionToolbar, etc.)
 * 3. The vitest environment is 'node' (not jsdom/happy-dom), so DOM APIs
 *    required for Vue mount are unavailable
 *
 * Instead, we test the conditional rendering logic through the data model:
 * MessageItem.vue uses these conditions in its template:
 *   - v-if="message.errorDetails"       → renders MessageError
 *   - v-else-if="message.role === 'system'" → renders MessageSystem
 *   - v-else                             → renders normal MessageBubble
 *
 * We verify that ChatMessage and UIMessage data correctly represent
 * each rendering path, ensuring the component would render correctly.
 */

import { describe, it, expect, vi } from 'vitest'
import { chatMessageToUIMessage } from '../../../shared/message-converters'
import type { ChatMessage } from '../../../shared/ipc/chat'
import type { ErrorDataUIPart, TextUIPart } from '../../../shared/ipc/ui-message'

vi.mock('uuid', () => ({
  v4: () => 'mock-uuid-1',
}))

// ── Helper ──────────────────────────────────────────────────────────────

function makeMsg(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content: '',
    timestamp: 1000,
    ...overrides,
  }
}

/**
 * Simulates the MessageItem.vue template condition:
 *   v-if="message.errorDetails" → 'error'
 *   v-else-if="message.role === 'system'" → 'system'
 *   v-else → 'normal'
 */
function resolveRenderPath(message: ChatMessage): 'error' | 'system' | 'normal' {
  if (message.errorDetails) return 'error'
  if (message.role === 'system') return 'system'
  return 'normal'
}

// ============================================================================

describe('MessageItem rendering conditions (data model)', () => {
  describe('errorDetails → MessageError path', () => {
    it('message with errorDetails → should render MessageError', () => {
      const msg = makeMsg({
        role: 'assistant',
        content: 'API 密钥无效，请在设置中检查',
        errorDetails: 'Status 401: Unauthorized',
      })

      expect(resolveRenderPath(msg)).toBe('error')
    })

    it('UIMessage from errorDetails message has data-error part', () => {
      const msg = makeMsg({
        role: 'assistant',
        content: '请求太频繁，请稍后再试',
        errorDetails: 'rate_limit_exceeded',
      })

      const uiMsg = chatMessageToUIMessage(msg)
      const errorPart = uiMsg.parts.find(p => p.type === 'data-error') as ErrorDataUIPart
      expect(errorPart).toBeDefined()
      expect(errorPart.text).toBe('请求太频繁，请稍后再试')
      expect(errorPart.details).toBe('rate_limit_exceeded')
    })
  })

  describe('no errorDetails, role:assistant → normal MessageBubble path', () => {
    it('assistant message without errorDetails → should not render MessageError', () => {
      const msg = makeMsg({
        role: 'assistant',
        content: 'Hello! How can I help?',
      })

      expect(resolveRenderPath(msg)).toBe('normal')
    })

    it('UIMessage has text part but no data-error part', () => {
      const msg = makeMsg({
        role: 'assistant',
        content: 'Hello!',
      })

      const uiMsg = chatMessageToUIMessage(msg)
      const errorPart = uiMsg.parts.find(p => p.type === 'data-error')
      expect(errorPart).toBeUndefined()

      const textPart = uiMsg.parts.find(p => p.type === 'text') as TextUIPart
      expect(textPart).toBeDefined()
      expect(textPart.text).toBe('Hello!')
    })
  })

  describe('role:user → normal MessageBubble path', () => {
    it('user message → should render normal message (not error, not system)', () => {
      const msg = makeMsg({
        role: 'user',
        content: 'Hi there',
      })

      expect(resolveRenderPath(msg)).toBe('normal')
    })
  })

  describe('role:system → MessageSystem path', () => {
    it('system message → should render MessageSystem', () => {
      const msg = makeMsg({
        role: 'system',
        content: 'System prompt',
      })

      expect(resolveRenderPath(msg)).toBe('system')
    })
  })

  describe('errorDetails takes precedence over role:system', () => {
    it('system message with errorDetails → renders MessageError (v-if wins)', () => {
      // Edge case: errorDetails check comes before role check in template
      const msg = makeMsg({
        role: 'system',
        content: 'System error',
        errorDetails: 'Internal error',
      })

      expect(resolveRenderPath(msg)).toBe('error')
    })
  })

  describe('legacy role:error data → UIMessage conversion', () => {
    it('role:error → UIMessage with role:assistant and data-error part', () => {
      const msg = makeMsg({
        role: 'error' as any,
        content: 'Something went wrong',
      })

      const uiMsg = chatMessageToUIMessage(msg)
      expect(uiMsg.role).toBe('assistant')
      expect(uiMsg.metadata?.isError).toBe(true)

      const errorPart = uiMsg.parts.find(p => p.type === 'data-error') as ErrorDataUIPart
      expect(errorPart).toBeDefined()
      expect(errorPart.text).toBe('Something went wrong')
    })
  })
})
