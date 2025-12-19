import { defineStore } from 'pinia'
import { ref, computed, onUnmounted } from 'vue'
import type { ChatMessage } from '@/types'

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const errorDetails = ref<string | null>(null) // Original API error details

  // Stream cleanup functions
  const streamCleanups = ref<(() => void)[]>([])

  const messageCount = computed(() => messages.value.length)

  const userMessages = computed(() =>
    messages.value.filter(m => m.role === 'user')
  )

  const assistantMessages = computed(() =>
    messages.value.filter(m => m.role === 'assistant')
  )

  /**
   * Rebuild contentParts for a message that has toolCalls but no contentParts
   * This is needed when loading historical messages from storage
   * Returns a new message object to ensure Vue reactivity
   */
  function rebuildContentParts(message: ChatMessage): ChatMessage {
    if (message.role !== 'assistant') return message
    if (message.contentParts && message.contentParts.length > 0) return message
    if (!message.toolCalls || message.toolCalls.length === 0) return message

    // Rebuild contentParts: text first, then tool calls
    const parts: ChatMessage['contentParts'] = []

    // Add text part if there's content
    if (message.content) {
      parts.push({ type: 'text', content: message.content })
    }

    // Add tool-call part with all tool calls
    parts.push({ type: 'tool-call', toolCalls: [...message.toolCalls] })

    // Return new object to ensure Vue reactivity
    return { ...message, contentParts: parts }
  }

  function setMessages(newMessages: ChatMessage[]) {
    // Rebuild contentParts for messages with toolCalls, creating new objects
    const processedMessages = newMessages.map((msg, i) => {
      const processed = rebuildContentParts(msg)
      if (processed.contentParts && processed.contentParts.length > 0) {
        console.log(`[Chat Store] Message ${i} contentParts rebuilt:`, processed.contentParts.length, 'parts')
      }
      return processed
    })
    messages.value = processedMessages
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

  // Append content to a message (for streaming)
  function appendToMessage(messageId: string, field: 'content' | 'reasoning', delta: string) {
    const index = messages.value.findIndex((m) => m.id === messageId)
    if (index !== -1) {
      const currentValue = messages.value[index][field] || ''
      messages.value[index] = {
        ...messages.value[index],
        [field]: currentValue + delta,
      }
    }
  }

  // Clean up stream listeners
  function cleanupStreamListeners() {
    streamCleanups.value.forEach(cleanup => cleanup())
    streamCleanups.value = []
  }

  // Setup stream listeners for a specific message
  function setupStreamListeners(messageId: string) {
    cleanupStreamListeners()

    // Listen for reasoning deltas
    const cleanupReasoning = window.electronAPI.onStreamReasoningDelta((data) => {
      if (data.messageId === messageId) {
        appendToMessage(messageId, 'reasoning', data.delta)
      }
    })
    streamCleanups.value.push(cleanupReasoning)

    // Listen for text deltas
    const cleanupText = window.electronAPI.onStreamTextDelta((data) => {
      if (data.messageId === messageId) {
        // When we start receiving text, thinking is done
        updateMessage(messageId, { isThinking: false })
        appendToMessage(messageId, 'content', data.delta)
      }
    })
    streamCleanups.value.push(cleanupText)

    // Listen for completion
    const cleanupComplete = window.electronAPI.onStreamComplete((data) => {
      if (data.messageId === messageId) {
        updateMessage(messageId, {
          content: data.text,
          reasoning: data.reasoning,
          isStreaming: false,
          isThinking: false,
        })
        cleanupStreamListeners()
      }
    })
    streamCleanups.value.push(cleanupComplete)

    // Listen for errors
    const cleanupError = window.electronAPI.onStreamError((data) => {
      if (!data.messageId || data.messageId === messageId) {
        error.value = data.error
        errorDetails.value = data.errorDetails || null
        updateMessage(messageId, { isStreaming: false, isThinking: false })
        cleanupStreamListeners()
      }
    })
    streamCleanups.value.push(cleanupError)
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

        isLoading.value = false
        return false
      }

      // Replace temp user message with actual message from server
      if (response.userMessage) {
        console.log('[Frontend] Received user message from backend with id:', response.userMessage.id)
        const tempIndex = messages.value.findIndex((m) => m.id === tempUserMessage.id)
        console.log('[Frontend] Found temp message at index:', tempIndex)
        if (tempIndex !== -1) {
          messages.value[tempIndex] = response.userMessage
          console.log('[Frontend] Successfully replaced temp message')
        } else {
          console.log('[Frontend] WARNING: Could not find temp message to replace')
        }
      } else {
        console.log('[Frontend] WARNING: No userMessage in response')
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
    console.log('[Frontend] Created temp user message with id:', tempUserMessage.id)
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

        isLoading.value = false
        return false
      }

      assistantMessageId = response.messageId

      // Replace temp user message with actual message from server
      if (response.userMessage) {
        console.log('[Frontend] Received user message from backend with id:', response.userMessage.id)
        const tempIndex = messages.value.findIndex((m) => m.id === tempUserMessage.id)
        console.log('[Frontend] Found temp message at index:', tempIndex)
        if (tempIndex !== -1) {
          messages.value[tempIndex] = response.userMessage
          console.log('[Frontend] Successfully replaced temp message')
        } else {
          console.log('[Frontend] WARNING: Could not find temp message to replace')
        }
      } else {
        console.log('[Frontend] WARNING: No userMessage in response')
      }

      // Create empty assistant message for streaming
      const streamingMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
        contentParts: [],  // Initialize empty content parts
      }
      addMessage(streamingMessage)

      // Track if we have pending tool calls that haven't been followed by text yet
      let hasToolCallsInCurrentSegment = false

      // Hide the independent "Thinking..." indicator now that we have the message bubble
      // The message bubble will show its own thinking state
      isLoading.value = false

      // Set up event listeners for streaming
      unsubscribeChunk = window.electronAPI.onStreamChunk((chunk) => {
        console.log('[Frontend] Received stream chunk:', chunk)
        if (chunk.messageId === assistantMessageId) {
          const message = messages.value.find(m => m.id === assistantMessageId)
          if (!message) return

          // Initialize contentParts if not exists
          if (!message.contentParts) {
            message.contentParts = []
          }

          if (chunk.type === 'text') {
            console.log('[Frontend] Text chunk:', chunk.content)
            // Append text to message content (for backward compat)
            message.content += chunk.content

            // Also update contentParts for sequential display
            const parts = message.contentParts!
            let lastPart = parts[parts.length - 1]

            // Remove waiting indicator if present
            if (lastPart && lastPart.type === 'waiting') {
              parts.pop()
              lastPart = parts[parts.length - 1]
            }

            // If last part is text, append to it. Otherwise create new text part.
            if (lastPart && lastPart.type === 'text') {
              lastPart.content += chunk.content
            } else {
              // Create new text part (this happens after tool calls)
              parts.push({ type: 'text', content: chunk.content })
              hasToolCallsInCurrentSegment = false
            }
            // Force Vue reactivity by reassigning array
            message.contentParts = [...parts]
            console.log('[Frontend] Updated contentParts, count:', message.contentParts.length)
          } else if (chunk.type === 'reasoning') {
            console.log('[Frontend] Reasoning chunk:', chunk.reasoning)
            message.reasoning = (message.reasoning || '') + (chunk.reasoning || '')
            console.log('[Frontend] Updated reasoning length:', message.reasoning.length)
          } else if (chunk.type === 'tool_call' || chunk.type === 'tool_result') {
            console.log('[Frontend] Tool chunk:', chunk.type, chunk.toolCall)
            if (chunk.toolCall) {
              // Update toolCalls array (for backward compat)
              if (!message.toolCalls) {
                message.toolCalls = []
              }
              const existingIndex = message.toolCalls.findIndex(tc => tc.id === chunk.toolCall.id)
              if (existingIndex >= 0) {
                message.toolCalls[existingIndex] = chunk.toolCall
              } else {
                message.toolCalls.push(chunk.toolCall)
              }

              // Update contentParts for sequential display
              const parts = message.contentParts!
              let lastPart = parts[parts.length - 1]

              // Remove waiting indicator if present (tool call replaces waiting)
              if (lastPart && lastPart.type === 'waiting') {
                parts.pop()
                lastPart = parts[parts.length - 1]
              }

              // Check if we should add tool-call to existing tool-call part or create new one
              if (lastPart && lastPart.type === 'tool-call') {
                // Add to existing tool-call part
                const existingTcIndex = lastPart.toolCalls.findIndex(tc => tc.id === chunk.toolCall.id)
                if (existingTcIndex >= 0) {
                  lastPart.toolCalls[existingTcIndex] = chunk.toolCall
                } else {
                  lastPart.toolCalls.push(chunk.toolCall)
                }
              } else {
                // Create new tool-call part
                parts.push({ type: 'tool-call', toolCalls: [chunk.toolCall] })
              }
              hasToolCallsInCurrentSegment = true
              // Force Vue reactivity by reassigning array
              message.contentParts = [...parts]
              console.log('[Frontend] Updated contentParts with tool call, count:', message.contentParts.length)
            }
          } else if (chunk.type === 'continuation') {
            console.log('[Frontend] AI continuing after tool execution')
            // Mark that tool calls are complete, next text will be new part
            hasToolCallsInCurrentSegment = true
            // Add waiting indicator
            const parts = message.contentParts!
            parts.push({ type: 'waiting' })
            // Force Vue reactivity by reassigning array
            message.contentParts = [...parts]
          }
        } else {
          console.log('[Frontend] Chunk for different message:', chunk.messageId, 'expected:', assistantMessageId)
        }
      })

      // Note: We don't set up a separate complete listener here
      // because we handle it in the Promise below

      unsubscribeError = window.electronAPI.onStreamError((data) => {
        console.log('[Frontend] Received stream error:', data)
        if (data.messageId === assistantMessageId) {
          console.log('[Frontend] Stream error for current message:', data.error)
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
        } else {
          console.log('[Frontend] Error for different message:', data.messageId, 'expected:', assistantMessageId)
        }
      })

      // Return a promise that resolves when streaming is complete
      return new Promise((resolve) => {
        // We'll resolve this promise when we get the complete event
        const completeListener = window.electronAPI.onStreamComplete(async (data) => {
          console.log('[Frontend] Received stream complete:', data)
          if (data.messageId === assistantMessageId) {
            console.log('[Frontend] Stream complete for current message')

            // Remove any remaining waiting indicator from contentParts
            const message = messages.value.find(m => m.id === assistantMessageId)
            if (message?.contentParts) {
              const lastPart = message.contentParts[message.contentParts.length - 1]
              if (lastPart && lastPart.type === 'waiting') {
                message.contentParts.pop()
              }

              // Save contentParts to backend if there are any
              if (message.contentParts.length > 0) {
                console.log('[Frontend] Saving contentParts to backend:', message.contentParts.length, 'parts')
                // Deep clone to remove Vue reactive proxy (can't be cloned by IPC)
                const plainContentParts = JSON.parse(JSON.stringify(message.contentParts))
                await window.electronAPI.updateContentParts(sessionId, assistantMessageId!, plainContentParts)
              }
            }

            // Mark message as not streaming
            updateMessage(assistantMessageId!, { isStreaming: false })

            // Clean up listeners
            if (unsubscribeChunk) unsubscribeChunk()
            if (unsubscribeComplete) unsubscribeComplete()
            if (unsubscribeError) unsubscribeError()

            isLoading.value = false
            completeListener() // Clean up this listener
            resolve(data.sessionName || true)
          } else {
            console.log('[Frontend] Complete for different message:', data.messageId, 'expected:', assistantMessageId)
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

  // Stop the current streaming generation
  async function stopGeneration() {
    if (!isLoading.value) return false

    try {
      const response = await window.electronAPI.abortStream()
      return response.success
    } catch (err: any) {
      console.error('Failed to stop generation:', err)
      return false
    }
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

    // Clean up any existing listeners
    cleanupStreamListeners()

    let unsubscribeChunk: (() => void) | null = null
    let unsubscribeComplete: (() => void) | null = null
    let unsubscribeError: (() => void) | null = null
    let assistantMessageId: string | null = null

    try {
      const response = await window.electronAPI.editAndResendStream(sessionId, messageId, newContent)

      if (!response.success) {
        error.value = response.error || 'Failed to edit and resend message'
        errorDetails.value = response.errorDetails || null

        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'error',
          content: response.error || 'Failed to edit and resend message',
          timestamp: Date.now(),
          errorDetails: response.errorDetails,
        }
        addMessage(errorMessage)

        isLoading.value = false
        return false
      }

      assistantMessageId = response.messageId

      // Create streaming assistant message
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
        contentParts: [],
      }
      addMessage(assistantMessage)

      // Hide the global loading indicator - the message bubble shows its own streaming state
      isLoading.value = false

      let hasToolCallsInCurrentSegment = false

      // Set up chunk listener
      unsubscribeChunk = window.electronAPI.onStreamChunk((chunk) => {
        if (chunk.messageId === assistantMessageId) {
          const message = messages.value.find(m => m.id === assistantMessageId)
          if (!message) return

          if (chunk.type === 'text') {
            message.content += chunk.content

            // Update contentParts
            if (!message.contentParts) message.contentParts = []
            const parts = message.contentParts

            if (hasToolCallsInCurrentSegment || parts.length === 0 || parts[parts.length - 1].type !== 'text') {
              // Remove waiting indicator if present
              if (parts.length > 0 && parts[parts.length - 1].type === 'waiting') {
                parts.pop()
              }
              parts.push({ type: 'text', content: chunk.content })
              hasToolCallsInCurrentSegment = false
            } else {
              const lastPart = parts[parts.length - 1]
              if (lastPart.type === 'text') {
                lastPart.content += chunk.content
              }
            }
            message.contentParts = [...parts]
          } else if (chunk.type === 'reasoning') {
            message.reasoning = (message.reasoning || '') + chunk.reasoning
          } else if (chunk.type === 'tool_call' || chunk.type === 'tool_result') {
            if (chunk.toolCall) {
              if (!message.toolCalls) message.toolCalls = []
              const existingIndex = message.toolCalls.findIndex(tc => tc.id === chunk.toolCall.id)
              if (existingIndex >= 0) {
                message.toolCalls[existingIndex] = chunk.toolCall
              } else {
                message.toolCalls.push(chunk.toolCall)
              }

              const parts = message.contentParts!
              let lastPart = parts[parts.length - 1]

              if (lastPart && lastPart.type === 'waiting') {
                parts.pop()
                lastPart = parts[parts.length - 1]
              }

              if (lastPart && lastPart.type === 'tool-call') {
                const existingTcIndex = lastPart.toolCalls.findIndex(tc => tc.id === chunk.toolCall.id)
                if (existingTcIndex >= 0) {
                  lastPart.toolCalls[existingTcIndex] = chunk.toolCall
                } else {
                  lastPart.toolCalls.push(chunk.toolCall)
                }
              } else {
                parts.push({ type: 'tool-call', toolCalls: [chunk.toolCall] })
              }
              hasToolCallsInCurrentSegment = true
              message.contentParts = [...parts]
            }
          } else if (chunk.type === 'continuation') {
            hasToolCallsInCurrentSegment = true
            const parts = message.contentParts!
            parts.push({ type: 'waiting' })
            message.contentParts = [...parts]
          }
        }
      })

      // Set up error listener
      unsubscribeError = window.electronAPI.onStreamError((data) => {
        if (data.messageId === assistantMessageId) {
          error.value = data.error || 'Streaming error'
          errorDetails.value = data.errorDetails || null

          const errorMessage: ChatMessage = {
            id: `error-${Date.now()}`,
            role: 'error',
            content: data.error || 'Streaming error',
            timestamp: Date.now(),
            errorDetails: data.errorDetails,
          }
          addMessage(errorMessage)

          messages.value = messages.value.filter((m) => m.id !== assistantMessageId)

          if (unsubscribeChunk) unsubscribeChunk()
          if (unsubscribeComplete) unsubscribeComplete()
          if (unsubscribeError) unsubscribeError()

          isLoading.value = false
        }
      })

      // Return a promise that resolves when streaming is complete
      return new Promise((resolve) => {
        const completeListener = window.electronAPI.onStreamComplete(async (data) => {
          if (data.messageId === assistantMessageId) {
            const message = messages.value.find(m => m.id === assistantMessageId)
            if (message?.contentParts) {
              const lastPart = message.contentParts[message.contentParts.length - 1]
              if (lastPart && lastPart.type === 'waiting') {
                message.contentParts.pop()
              }

              if (message.contentParts.length > 0) {
                const plainContentParts = JSON.parse(JSON.stringify(message.contentParts))
                await window.electronAPI.updateContentParts(sessionId, assistantMessageId!, plainContentParts)
              }
            }

            updateMessage(assistantMessageId!, { isStreaming: false })

            if (unsubscribeChunk) unsubscribeChunk()
            if (unsubscribeComplete) unsubscribeComplete()
            if (unsubscribeError) unsubscribeError()

            isLoading.value = false
            completeListener()
            resolve(data.sessionName || true)
          }
        })
      })

    } catch (err: any) {
      error.value = err.message || 'An error occurred'
      messages.value = messages.value.filter((m) => m.id !== assistantMessageId)

      if (unsubscribeChunk) unsubscribeChunk()
      if (unsubscribeComplete) unsubscribeComplete()
      if (unsubscribeError) unsubscribeError()

      isLoading.value = false
      return false
    }
  }

  async function regenerate(sessionId: string, messageId: string) {
    const message = messages.value.find(m => m.id === messageId)
    if (!message) return
    return await editAndResend(sessionId, messageId, message.content)
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
    stopGeneration,
    editAndResend,
    regenerate,
    cleanupStreamListeners,
  }
})
