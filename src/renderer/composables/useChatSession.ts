/**
 * useChatSession - Simplified per-session state proxy
 *
 * Architecture notes:
 * - This is a per-session view of the chat store
 * - All state and event handling is centralized in the store
 * - IPC listeners are registered at app startup by the global IPC Hub
 * - This composable is only responsible for:
 *   1. Returning reactive state for a specific session
 *   2. Delegating actions to the store
 *   3. Triggering message loading when sessionId changes
 */

import { computed, watch, toValue, type MaybeRef } from 'vue'
import type { ChatMessage, MessageAttachment, UIMessage } from '@/types'
// Note: ChatMessage import kept for updateMessage() signature
import { useChatStore } from '@/stores/chat'

export function useChatSession(sessionIdRef: MaybeRef<string | undefined>) {
  const chatStore = useChatStore()
  const sessionId = computed(() => toValue(sessionIdRef))

  // Get reactive state from store
  const state = computed(() => {
    const sid = sessionId.value
    if (!sid) return null
    return chatStore.getSessionState(sid)
  })

  // Exposed state (computed from store)
  // UIMessage[] — the unified data source for all UI components
  const messages = computed<UIMessage[]>(() => {
    const sid = sessionId.value
    if (!sid) return []
    return chatStore.getSessionUIMessages(sid).value
  })

  const isLoading = computed(() => state.value?.isLoading.value || false)
  const isGenerating = computed(() => state.value?.isGenerating.value || false)
  const error = computed(() => state.value?.error.value || null)
  const errorDetails = computed(() => state.value?.errorDetails.value || null)

  // Computed helpers
  const messageCount = computed(() => messages.value.length)
  const userMessages = computed(() => messages.value.filter(m => m.role === 'user'))
  const assistantMessages = computed(() => messages.value.filter(m => m.role === 'assistant'))

  // Watch for session changes and load messages
  watch(sessionId, async (newSessionId, oldSessionId) => {
    if (newSessionId && newSessionId !== oldSessionId) {
      // Check if messages already loaded
      const existingMessages = chatStore.sessionMessages.get(newSessionId)
      if (!existingMessages || existingMessages.length === 0) {
        await chatStore.loadMessages(newSessionId)
      }
    }
  }, { immediate: true })

  // ============ Actions (delegate to store) ============

  /**
   * Send a message and start streaming response
   */
  async function sendMessage(content: string, attachments?: MessageAttachment[]) {
    const sid = sessionId.value
    if (!sid) return false
    return chatStore.sendMessage(sid, content, attachments)
  }

  /**
   * Edit a message and resend
   */
  async function editAndResend(messageId: string, newContent: string) {
    const sid = sessionId.value
    if (!sid) return false
    return chatStore.editAndResend(sid, messageId, newContent)
  }

  /**
   * Regenerate from a message
   */
  async function regenerate(messageId: string) {
    const sid = sessionId.value
    if (!sid) return false
    return chatStore.regenerate(sid, messageId)
  }

  /**
   * Stop the current generation
   */
  async function stopGeneration() {
    const sid = sessionId.value
    if (!sid) return false
    return chatStore.stopGeneration(sid)
  }

  /**
   * Clear error state
   */
  function clearError() {
    const sid = sessionId.value
    if (!sid) return
    chatStore.clearSessionError(sid)
  }

  /**
   * Update a message in local state
   */
  function updateMessage(messageId: string, updates: Partial<ChatMessage>) {
    const sid = sessionId.value
    if (!sid) return
    chatStore.updateSessionMessage(sid, messageId, updates)
  }

  /**
   * Reload messages from backend
   */
  async function loadMessages() {
    const sid = sessionId.value
    if (!sid) return
    await chatStore.loadMessages(sid)
  }

  return {
    // State (from store)
    messages,
    isLoading,
    isGenerating,
    error,
    errorDetails,

    // Computed helpers
    messageCount,
    userMessages,
    assistantMessages,

    // Actions (delegated to store)
    sendMessage,
    editAndResend,
    regenerate,
    stopGeneration,
    clearError,
    updateMessage,
    loadMessages,
  }
}
