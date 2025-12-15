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

      // Return session name if it was updated (for sidebar to update)
      return response.sessionName || true
    } catch (err: any) {
      error.value = err.message || 'An error occurred'
      // Remove the temp user message on error
      messages.value = messages.value.filter((m) => m.id !== tempUserMessage.id)
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function sendMessageStream(sessionId: string, content: string) {
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

    let assistantMessageId: string | null = null
    let unsubscribeChunk: (() => void) | null = null
    let unsubscribeComplete: (() => void) | null = null
    let unsubscribeError: (() => void) | null = null

    try {
      const response = await window.electronAPI.sendMessageStream(sessionId, content)

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

      assistantMessageId = response.messageId

      // Replace temp user message with actual message from server
      if (response.userMessage) {
        const tempIndex = messages.value.findIndex((m) => m.id === tempUserMessage.id)
        if (tempIndex !== -1) {
          messages.value[tempIndex] = response.userMessage
        }
      }

      // Create empty assistant message for streaming
      const streamingMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      }
      addMessage(streamingMessage)

      // Set up event listeners for streaming
      unsubscribeChunk = window.electronAPI.onStreamChunk((chunk) => {
        if (chunk.messageId === assistantMessageId) {
          if (chunk.type === 'text') {
            // Append text to message content
            const message = messages.value.find(m => m.id === assistantMessageId)
            if (message) {
              message.content += chunk.content
            }
          } else if (chunk.type === 'reasoning') {
            // Update reasoning
            updateMessage(assistantMessageId!, { reasoning: chunk.reasoning })
          }
        }
      })

      // Note: We don't set up a separate complete listener here
      // because we handle it in the Promise below

      unsubscribeError = window.electronAPI.onStreamError((data) => {
        if (data.messageId === assistantMessageId) {
          error.value = data.error || 'Streaming error'
          errorDetails.value = data.errorDetails || null

          // Add error as a display-only message
          const errorMessage: ChatMessage = {
            id: `error-${Date.now()}`,
            role: 'error',
            content: data.error || 'Streaming error',
            timestamp: Date.now(),
            errorDetails: data.errorDetails,
          }
          addMessage(errorMessage)

          // Remove the streaming assistant message
          messages.value = messages.value.filter((m) => m.id !== assistantMessageId)

          // Clean up listeners
          if (unsubscribeChunk) unsubscribeChunk()
          if (unsubscribeComplete) unsubscribeComplete()
          if (unsubscribeError) unsubscribeError()

          isLoading.value = false
          return false
        }
      })

      // Return a promise that resolves when streaming is complete
      return new Promise((resolve) => {
        // We'll resolve this promise when we get the complete event
        const completeListener = window.electronAPI.onStreamComplete((data) => {
          if (data.messageId === assistantMessageId) {
            // Mark message as not streaming
            updateMessage(assistantMessageId!, { isStreaming: false })

            // Clean up listeners
            if (unsubscribeChunk) unsubscribeChunk()
            if (unsubscribeComplete) unsubscribeComplete()
            if (unsubscribeError) unsubscribeError()

            isLoading.value = false
            completeListener() // Clean up this listener
            resolve(data.sessionName || true)
          }
        })
      })

    } catch (err: any) {
      error.value = err.message || 'An error occurred'
      // Remove the temp user message on error
      messages.value = messages.value.filter((m) => m.id !== tempUserMessage.id)

      // Clean up listeners if they were set up
      if (unsubscribeChunk) unsubscribeChunk()
      if (unsubscribeComplete) unsubscribeComplete()
      if (unsubscribeError) unsubscribeError()

      isLoading.value = false
      return false
    }
  }

  function clearError() {
    error.value = null
    errorDetails.value = null
  }

  async function editAndResend(sessionId: string, messageId: string, newContent: string) {
    error.value = null
    errorDetails.value = null

    // Immediately update the UI: update message content and truncate messages after it
    const messageIndex = messages.value.findIndex((m) => m.id === messageId)
    if (messageIndex !== -1) {
      // Update the message content
      messages.value[messageIndex] = {
        ...messages.value[messageIndex],
        content: newContent,
        timestamp: Date.now(),
      }
      // Remove all messages after this one (including old assistant response)
      messages.value = messages.value.slice(0, messageIndex + 1)
    }

    // Now show loading state
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

      // Add the new assistant message with streaming effect
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
    sendMessageStream,
    editAndResend,
  }
})
