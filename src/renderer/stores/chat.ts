import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ChatMessage } from '@/types'

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const errorDetails = ref<string | null>(null) // Original API error details

  const messageCount = computed(() => messages.value.length)

  const userMessages = computed(() =>
    messages.value.filter(m => m.role === 'user')
  )

  const assistantMessages = computed(() =>
    messages.value.filter(m => m.role === 'assistant')
  )

  function setMessages(newMessages: ChatMessage[]) {
    messages.value = newMessages
  }

  function addMessage(message: ChatMessage) {
    messages.value.push(message)
  }

  function clearMessages() {
    messages.value = []
  }

  function updateMessage(messageId: string, updates: Partial<ChatMessage>) {
    const index = messages.value.findIndex((m) => m.id === messageId)
    if (index !== -1) {
      messages.value[index] = { ...messages.value[index], ...updates }
    }
  }

  async function sendMessage(sessionId: string, content: string) {
    error.value = null
    errorDetails.value = null

    // Create and show user message immediately (before API call)
    const tempUserMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    addMessage(tempUserMessage)

    // Set loading state after user message is shown
    isLoading.value = true

    try {
      const response = await window.electronAPI.sendMessage(sessionId, content)

      if (!response.success) {
        error.value = response.error || 'Failed to send message'
        errorDetails.value = response.errorDetails || null

        // Add error as a display-only message in the chat (not saved to backend)
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'error',
          content: response.error || 'Failed to send message',
          timestamp: Date.now(),
          errorDetails: response.errorDetails,
        }
        addMessage(errorMessage)

        return false
      }

      // Replace temp user message with actual message from server
      if (response.userMessage) {
        const tempIndex = messages.value.findIndex((m) => m.id === tempUserMessage.id)
        if (tempIndex !== -1) {
          messages.value[tempIndex] = response.userMessage
        }
      }

      // Add assistant message with streaming flag for typewriter effect
      if (response.assistantMessage) {
        const streamingMessage = { ...response.assistantMessage, isStreaming: true }
        addMessage(streamingMessage)

        // After typewriter animation, mark as not streaming
        setTimeout(() => {
          updateMessage(response.assistantMessage!.id, { isStreaming: false })
        }, Math.min(response.assistantMessage.content.length * 10, 3000))
      }

      return true
    } catch (err: any) {
      error.value = err.message || 'An error occurred'
      // Remove the temp user message on error
      messages.value = messages.value.filter((m) => m.id !== tempUserMessage.id)
      return false
    } finally {
      isLoading.value = false
    }
  }

  function clearError() {
    error.value = null
    errorDetails.value = null
  }

  async function editAndResend(sessionId: string, messageId: string, newContent: string) {
    error.value = null
    errorDetails.value = null
    isLoading.value = true

    try {
      const response = await window.electronAPI.editAndResend(sessionId, messageId, newContent)

      if (!response.success) {
        error.value = response.error || 'Failed to edit and resend message'
        errorDetails.value = response.errorDetails || null

        // Add error as a display-only message
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'error',
          content: response.error || 'Failed to edit and resend message',
          timestamp: Date.now(),
          errorDetails: response.errorDetails,
        }
        addMessage(errorMessage)

        return false
      }

      // Reload the chat history to reflect the changes
      const historyResponse = await window.electronAPI.getChatHistory(sessionId)
      if (historyResponse.success && historyResponse.messages) {
        setMessages(historyResponse.messages)
      }

      // Add streaming effect to the new assistant message
      if (response.assistantMessage) {
        const lastMessage = messages.value[messages.value.length - 1]
        if (lastMessage && lastMessage.role === 'assistant') {
          updateMessage(lastMessage.id, { isStreaming: true })
          setTimeout(() => {
            updateMessage(lastMessage.id, { isStreaming: false })
          }, Math.min(lastMessage.content.length * 10, 3000))
        }
      }

      return true
    } catch (err: any) {
      error.value = err.message || 'An error occurred'
      return false
    } finally {
      isLoading.value = false
    }
  }

  return {
    messages,
    isLoading,
    error,
    errorDetails,
    messageCount,
    userMessages,
    assistantMessages,
    setMessages,
    addMessage,
    updateMessage,
    clearMessages,
    clearError,
    sendMessage,
    editAndResend,
  }
})
