/**
 * useChatSession - Simplified per-session state proxy
 *
 * 架构说明:
 * - 这是 chat store 的 per-session 视图
 * - 所有状态和事件处理都在 store 中集中管理
 * - IPC 监听器由全局 IPC Hub 在应用启动时注册
 * - 此 composable 只负责:
 *   1. 返回特定 session 的响应式状态
 *   2. 委托动作给 store
 *   3. 在 sessionId 变化时触发消息加载
 */

import { computed, watch, toValue, type MaybeRef } from 'vue'
import type { ChatMessage, MessageAttachment } from '@/types'
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
  const messages = computed(() => state.value?.messages.value || [])
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
