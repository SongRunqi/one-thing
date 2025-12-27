/**
 * Chat Store - Centralized state management for all chat sessions
 *
 * 架构说明:
 * - 所有状态按 sessionId 索引（Per-session 状态）
 * - 事件处理器由全局 IPC Hub 调用
 * - useChatSession composable 作为 per-session 视图
 */
import { defineStore } from 'pinia'
import { ref, computed, triggerRef } from 'vue'
import type { ChatMessage, MessageAttachment } from '@/types'

// Stream chunk type from IPC
interface StreamChunk {
  type: 'text' | 'reasoning' | 'tool_call' | 'tool_result' | 'continuation' | 'replace'
  content: string
  messageId: string
  sessionId?: string
  reasoning?: string
  toolCall?: any
  replace?: boolean
}

// Stream complete data from IPC
interface StreamCompleteData {
  messageId: string
  text: string
  reasoning?: string
  sessionId?: string
  sessionName?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

// Stream error data from IPC
interface StreamErrorData {
  messageId?: string
  sessionId?: string
  error: string
  errorDetails?: string
}

// Step data from IPC
interface StepData {
  sessionId: string
  messageId: string
  step: any
}

interface StepUpdateData {
  sessionId: string
  messageId: string
  stepId: string
  updates: any
}

// Skill activation data from IPC
interface SkillActivatedData {
  sessionId: string
  messageId: string
  skillName: string
}

export const useChatStore = defineStore('chat', () => {
  // ============ Per-session 状态 ============

  // Messages per session
  const sessionMessages = ref<Map<string, ChatMessage[]>>(new Map())

  // Loading state per session
  const sessionLoading = ref<Map<string, boolean>>(new Map())

  // Generating state per session
  const sessionGenerating = ref<Map<string, boolean>>(new Map())

  // Error state per session
  const sessionError = ref<Map<string, string | null>>(new Map())

  // Error details per session
  const sessionErrorDetails = ref<Map<string, string | null>>(new Map())

  // Token usage per session
  const sessionUsageMap = ref<Map<string, {
    totalInputTokens: number
    totalOutputTokens: number
    totalTokens: number
  }>>(new Map())

  // Active streams (sessionId -> messageId)
  const activeStreams = ref<Map<string, string>>(new Map())

  // ============ Getters ============

  /**
   * Get session state for a specific session
   * Returns reactive computed properties
   */
  function getSessionState(sessionId: string) {
    return {
      messages: computed(() => sessionMessages.value.get(sessionId) || []),
      isLoading: computed(() => sessionLoading.value.get(sessionId) || false),
      isGenerating: computed(() => sessionGenerating.value.get(sessionId) || false),
      error: computed(() => sessionError.value.get(sessionId) || null),
      errorDetails: computed(() => sessionErrorDetails.value.get(sessionId) || null),
      usage: computed(() => sessionUsageMap.value.get(sessionId) || null),
    }
  }

  /**
   * Get usage for a specific session
   */
  function getSessionUsage(sessionId: string) {
    return sessionUsageMap.value.get(sessionId) || null
  }

  /**
   * Check if a specific session is generating
   */
  function isSessionGenerating(sessionId: string): boolean {
    return sessionGenerating.value.get(sessionId) || activeStreams.value.has(sessionId)
  }

  // ============ Helper Functions ============

  /**
   * Rebuild contentParts for a message from content and/or toolCalls
   * This is needed when loading historical messages from storage
   */
  function rebuildContentParts(message: ChatMessage): ChatMessage {
    if (message.role !== 'assistant') return message
    if (message.contentParts && message.contentParts.length > 0) return message

    const parts: ChatMessage['contentParts'] = []

    if (message.content) {
      parts.push({ type: 'text', content: message.content })
    }

    if (message.toolCalls && message.toolCalls.length > 0) {
      parts.push({ type: 'tool-call', toolCalls: [...message.toolCalls] })
    }

    if (parts.length > 0) {
      return { ...message, contentParts: parts }
    }

    return message
  }

  /**
   * Update messages for a session and trigger reactivity
   */
  function setSessionMessages(sessionId: string, messages: ChatMessage[]) {
    sessionMessages.value.set(sessionId, messages)
    triggerRef(sessionMessages)
  }

  /**
   * Get messages for a session (mutable reference)
   */
  function getSessionMessagesRef(sessionId: string): ChatMessage[] {
    let messages = sessionMessages.value.get(sessionId)
    if (!messages) {
      messages = []
      sessionMessages.value.set(sessionId, messages)
    }
    return messages
  }

  // ============ Event Handlers (Called by IPC Hub) ============

  /**
   * Handle stream chunk event
   */
  function handleStreamChunk(chunk: StreamChunk) {
    const sessionId = chunk.sessionId
    if (!sessionId) {
      console.warn('[Chat Store] Stream chunk missing sessionId')
      return
    }

    const messages = getSessionMessagesRef(sessionId)
    const messageIndex = messages.findIndex(m => m.id === chunk.messageId)
    if (messageIndex === -1) {
      console.warn('[Chat Store] Message not found for chunk:', chunk.messageId)
      return
    }

    const message = messages[messageIndex]

    // Initialize contentParts if not exists
    if (!message.contentParts) {
      message.contentParts = []
    }

    if (chunk.type === 'text') {
      if (chunk.replace) {
        // Replace entire content
        message.content = chunk.content
        message.contentParts = chunk.content ? [{ type: 'text', content: chunk.content }] : []
      } else {
        // Append text
        message.content = (message.content || '') + chunk.content

        const parts = message.contentParts!
        let lastPart = parts[parts.length - 1]

        // Remove waiting indicator if present
        if (lastPart && lastPart.type === 'waiting') {
          parts.pop()
          lastPart = parts[parts.length - 1]
        }

        // Append to existing text part or create new one
        if (lastPart && lastPart.type === 'text') {
          lastPart.content += chunk.content
        } else {
          parts.push({ type: 'text', content: chunk.content })
        }
        message.contentParts = [...parts]
      }
    } else if (chunk.type === 'reasoning') {
      message.reasoning = (message.reasoning || '') + (chunk.reasoning || '')
    } else if (chunk.type === 'tool_call' || chunk.type === 'tool_result') {
      if (chunk.toolCall) {
        // Update toolCalls array
        if (!message.toolCalls) {
          message.toolCalls = []
        }
        const existingIndex = message.toolCalls.findIndex(tc => tc.id === chunk.toolCall.id)
        if (existingIndex >= 0) {
          message.toolCalls[existingIndex] = chunk.toolCall
        } else {
          message.toolCalls.push(chunk.toolCall)
        }

        // Update contentParts
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
        message.contentParts = [...parts]
      }
    } else if (chunk.type === 'continuation') {
      // AI continuing after tool execution
      const parts = message.contentParts!
      parts.push({ type: 'waiting' })
      message.contentParts = [...parts]
    } else if (chunk.type === 'replace') {
      // Replace entire message content
      message.content = chunk.content
      message.contentParts = chunk.content ? [{ type: 'text', content: chunk.content }] : []
    }

    // Trigger reactivity
    setSessionMessages(sessionId, [...messages])
  }

  /**
   * Handle stream complete event
   */
  async function handleStreamComplete(data: StreamCompleteData) {
    const sessionId = data.sessionId
    if (!sessionId) {
      console.warn('[Chat Store] Stream complete missing sessionId')
      return
    }

    console.log('[Chat Store] Stream complete:', sessionId, 'usage:', data.usage)

    // Update usage
    if (data.usage) {
      const currentUsage = sessionUsageMap.value.get(sessionId) || {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
      }
      sessionUsageMap.value.set(sessionId, {
        totalInputTokens: currentUsage.totalInputTokens + data.usage.inputTokens,
        totalOutputTokens: currentUsage.totalOutputTokens + data.usage.outputTokens,
        totalTokens: currentUsage.totalTokens + data.usage.totalTokens,
      })
      triggerRef(sessionUsageMap)
      console.log('[Chat Store] Updated usage for', sessionId, ':', sessionUsageMap.value.get(sessionId))
    }

    // Update message
    const messages = getSessionMessagesRef(sessionId)
    const messageIndex = messages.findIndex(m => m.id === data.messageId)
    if (messageIndex !== -1) {
      const message = messages[messageIndex]

      // Remove waiting indicator
      if (message.contentParts) {
        const lastPart = message.contentParts[message.contentParts.length - 1]
        if (lastPart && lastPart.type === 'waiting') {
          message.contentParts.pop()
        }

        // Save contentParts to backend
        if (message.contentParts.length > 0) {
          const plainContentParts = JSON.parse(JSON.stringify(message.contentParts))
          await window.electronAPI.updateContentParts(sessionId, data.messageId, plainContentParts)
        }
      }

      // Mark message as not streaming
      message.isStreaming = false
      setSessionMessages(sessionId, [...messages])
    }

    // Clear generating state
    sessionGenerating.value.set(sessionId, false)
    sessionLoading.value.set(sessionId, false)
    activeStreams.value.delete(sessionId)
    triggerRef(sessionGenerating)
    triggerRef(sessionLoading)
    triggerRef(activeStreams)

    // Update session name if provided
    if (data.sessionName) {
      try {
        const { useSessionsStore } = await import('./sessions')
        const sessionsStore = useSessionsStore()
        const sessionInStore = sessionsStore.sessions.find(s => s.id === sessionId)
        if (sessionInStore) {
          sessionInStore.name = data.sessionName
          sessionInStore.updatedAt = Date.now()
        }
      } catch (e) {
        console.error('[Chat Store] Failed to update session name:', e)
      }
    }
  }

  /**
   * Handle stream error event
   */
  function handleStreamError(data: StreamErrorData) {
    const sessionId = data.sessionId
    if (!sessionId) {
      console.warn('[Chat Store] Stream error missing sessionId')
      return
    }

    console.log('[Chat Store] Stream error:', sessionId, data.error)

    // Set error state
    sessionError.value.set(sessionId, data.error || 'Streaming error')
    sessionErrorDetails.value.set(sessionId, data.errorDetails || null)
    triggerRef(sessionError)
    triggerRef(sessionErrorDetails)

    // Add error message
    const messages = getSessionMessagesRef(sessionId)
    const errorMessage: ChatMessage = {
      id: `error-${Date.now()}`,
      role: 'error',
      content: data.error || 'Streaming error',
      timestamp: Date.now(),
      errorDetails: data.errorDetails,
    }
    messages.push(errorMessage)

    // Remove the streaming assistant message if it exists
    if (data.messageId) {
      const streamingIndex = messages.findIndex(m => m.id === data.messageId)
      if (streamingIndex !== -1) {
        messages.splice(streamingIndex, 1)
      }
    }

    setSessionMessages(sessionId, [...messages])

    // Clear generating state
    sessionGenerating.value.set(sessionId, false)
    sessionLoading.value.set(sessionId, false)
    activeStreams.value.delete(sessionId)
    triggerRef(sessionGenerating)
    triggerRef(sessionLoading)
    triggerRef(activeStreams)
  }

  /**
   * Handle step added event
   */
  function handleStepAdded(data: StepData) {
    const { sessionId, messageId, step } = data

    const messages = getSessionMessagesRef(sessionId)
    const message = messages.find(m => m.id === messageId)
    if (!message) return

    // Initialize steps array if needed
    if (!message.steps) message.steps = []
    message.steps.push(step)
    message.steps = [...message.steps]

    // Add steps placeholder to contentParts if needed
    if (message.contentParts) {
      const stepTurnIndex = step.turnIndex
      const parts = message.contentParts
      const hasPlaceholderForTurn = parts.some(
        p => p.type === 'data-steps' && (p as any).turnIndex === stepTurnIndex
      )

      if (!hasPlaceholderForTurn) {
        const lastPart = parts[parts.length - 1]
        if (lastPart && lastPart.type === 'waiting') {
          parts.pop()
        }
        parts.push({ type: 'data-steps', turnIndex: stepTurnIndex } as any)
        message.contentParts = [...parts]
      }
    }

    setSessionMessages(sessionId, [...messages])
  }

  /**
   * Handle step updated event
   */
  function handleStepUpdated(data: StepUpdateData) {
    const { sessionId, messageId, stepId, updates } = data

    const messages = getSessionMessagesRef(sessionId)
    const message = messages.find(m => m.id === messageId)
    if (!message?.steps) return

    const stepIndex = message.steps.findIndex(s => s.id === stepId)
    if (stepIndex !== -1) {
      message.steps[stepIndex] = { ...message.steps[stepIndex], ...updates }
      message.steps = [...message.steps]
      setSessionMessages(sessionId, [...messages])
    }
  }

  /**
   * Handle skill activated event
   */
  function handleSkillActivated(data: SkillActivatedData) {
    const { sessionId, messageId, skillName } = data

    const messages = getSessionMessagesRef(sessionId)
    const message = messages.find(m => m.id === messageId)
    if (message) {
      message.skillUsed = skillName
      setSessionMessages(sessionId, [...messages])
    }
  }

  // ============ Actions ============

  /**
   * Load messages for a session from backend
   */
  async function loadMessages(sessionId: string) {
    try {
      const response = await window.electronAPI.getSession(sessionId)
      if (response.success && response.session) {
        const messages = (response.session.messages || []).map(rebuildContentParts)
        setSessionMessages(sessionId, messages)
      }
    } catch (error) {
      console.error('[Chat Store] Failed to load messages:', error)
    }
  }

  /**
   * Load session usage from backend
   */
  async function loadSessionUsage(sessionId: string) {
    try {
      const response = await window.electronAPI.getSessionTokenUsage(sessionId)
      if (response.success && response.usage) {
        sessionUsageMap.value.set(sessionId, {
          totalInputTokens: response.usage.totalInputTokens,
          totalOutputTokens: response.usage.totalOutputTokens,
          totalTokens: response.usage.totalTokens,
        })
        triggerRef(sessionUsageMap)
      }
    } catch (error) {
      console.error('[Chat Store] Failed to load session usage:', error)
    }
  }

  /**
   * Send a message (streaming mode)
   */
  async function sendMessage(sessionId: string, content: string, attachments?: MessageAttachment[]) {
    // Clear error state
    sessionError.value.set(sessionId, null)
    sessionErrorDetails.value.set(sessionId, null)
    triggerRef(sessionError)
    triggerRef(sessionErrorDetails)

    // Create user message
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      attachments,
    }

    // Add to session messages
    const messages = getSessionMessagesRef(sessionId)
    messages.push(userMessage)
    setSessionMessages(sessionId, [...messages])

    // Set states
    sessionLoading.value.set(sessionId, true)
    sessionGenerating.value.set(sessionId, true)
    triggerRef(sessionLoading)
    triggerRef(sessionGenerating)

    try {
      // Call IPC (listeners already set up globally by IPC Hub)
      const response = await window.electronAPI.sendMessageStream(sessionId, content, attachments)

      if (!response.success) {
        sessionError.value.set(sessionId, response.error || 'Failed to send message')
        sessionErrorDetails.value.set(sessionId, response.errorDetails || null)
        triggerRef(sessionError)
        triggerRef(sessionErrorDetails)

        // Add error message
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'error',
          content: response.error || 'Failed to send message',
          timestamp: Date.now(),
          errorDetails: response.errorDetails,
        }
        messages.push(errorMessage)
        setSessionMessages(sessionId, [...messages])

        sessionLoading.value.set(sessionId, false)
        sessionGenerating.value.set(sessionId, false)
        triggerRef(sessionLoading)
        triggerRef(sessionGenerating)
        return false
      }

      // Replace temp user message with actual message from server
      if (response.userMessage) {
        const tempIndex = messages.findIndex(m => m.id === userMessage.id)
        if (tempIndex !== -1) {
          messages[tempIndex] = response.userMessage
        }
      }

      // Update session name immediately if it was renamed
      if (response.sessionName) {
        try {
          const { useSessionsStore } = await import('./sessions')
          const sessionsStore = useSessionsStore()
          const sessionInStore = sessionsStore.sessions.find(s => s.id === sessionId)
          if (sessionInStore) {
            sessionInStore.name = response.sessionName
            sessionInStore.updatedAt = Date.now()
          }
        } catch (e) {
          console.error('[Chat Store] Failed to update session name:', e)
        }
      }

      // Create streaming assistant message
      const assistantMessage: ChatMessage = {
        id: response.messageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
        contentParts: [],
      }
      messages.push(assistantMessage)
      setSessionMessages(sessionId, [...messages])

      // Record active stream
      activeStreams.value.set(sessionId, response.messageId)
      triggerRef(activeStreams)

      // Hide loading (message bubble shows its own streaming state)
      sessionLoading.value.set(sessionId, false)
      triggerRef(sessionLoading)

      return true
    } catch (error: any) {
      sessionError.value.set(sessionId, error.message || 'An error occurred')
      triggerRef(sessionError)

      // Remove temp user message
      const tempIndex = messages.findIndex(m => m.id === userMessage.id)
      if (tempIndex !== -1) {
        messages.splice(tempIndex, 1)
        setSessionMessages(sessionId, [...messages])
      }

      sessionLoading.value.set(sessionId, false)
      sessionGenerating.value.set(sessionId, false)
      triggerRef(sessionLoading)
      triggerRef(sessionGenerating)
      return false
    }
  }

  /**
   * Edit and resend a message
   */
  async function editAndResend(sessionId: string, messageId: string, newContent: string) {
    // Clear error state
    sessionError.value.set(sessionId, null)
    sessionErrorDetails.value.set(sessionId, null)
    triggerRef(sessionError)
    triggerRef(sessionErrorDetails)

    // Update message in UI immediately
    const messages = getSessionMessagesRef(sessionId)
    const messageIndex = messages.findIndex(m => m.id === messageId)
    if (messageIndex !== -1) {
      messages[messageIndex] = {
        ...messages[messageIndex],
        content: newContent,
        timestamp: Date.now(),
      }
      // Remove all messages after this one
      messages.splice(messageIndex + 1)
      setSessionMessages(sessionId, [...messages])
    }

    // Set states
    sessionLoading.value.set(sessionId, true)
    sessionGenerating.value.set(sessionId, true)
    triggerRef(sessionLoading)
    triggerRef(sessionGenerating)

    try {
      const response = await window.electronAPI.editAndResendStream(sessionId, messageId, newContent)

      if (!response.success) {
        sessionError.value.set(sessionId, response.error || 'Failed to edit and resend')
        sessionErrorDetails.value.set(sessionId, response.errorDetails || null)
        triggerRef(sessionError)
        triggerRef(sessionErrorDetails)

        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'error',
          content: response.error || 'Failed to edit and resend',
          timestamp: Date.now(),
          errorDetails: response.errorDetails,
        }
        messages.push(errorMessage)
        setSessionMessages(sessionId, [...messages])

        sessionLoading.value.set(sessionId, false)
        sessionGenerating.value.set(sessionId, false)
        triggerRef(sessionLoading)
        triggerRef(sessionGenerating)
        return false
      }

      // Create streaming assistant message
      const assistantMessage: ChatMessage = {
        id: response.messageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
        contentParts: [],
      }
      messages.push(assistantMessage)
      setSessionMessages(sessionId, [...messages])

      // Record active stream
      activeStreams.value.set(sessionId, response.messageId)
      triggerRef(activeStreams)

      // Hide loading
      sessionLoading.value.set(sessionId, false)
      triggerRef(sessionLoading)

      return true
    } catch (error: any) {
      sessionError.value.set(sessionId, error.message || 'An error occurred')
      triggerRef(sessionError)

      sessionLoading.value.set(sessionId, false)
      sessionGenerating.value.set(sessionId, false)
      triggerRef(sessionLoading)
      triggerRef(sessionGenerating)
      return false
    }
  }

  /**
   * Regenerate from a message
   */
  async function regenerate(sessionId: string, messageId: string) {
    const messages = getSessionMessagesRef(sessionId)
    const message = messages.find(m => m.id === messageId)
    if (!message) return false

    // If regenerating from an assistant message, find the preceding user message
    if (message.role === 'assistant') {
      const messageIndex = messages.findIndex(m => m.id === messageId)
      for (let i = messageIndex - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          return await editAndResend(sessionId, messages[i].id, messages[i].content)
        }
      }
      return false
    }

    // For user messages, just resend with same content
    return await editAndResend(sessionId, messageId, message.content)
  }

  /**
   * Stop generation for a session
   */
  async function stopGeneration(sessionId?: string) {
    try {
      const response = await window.electronAPI.abortStream(sessionId)
      if (response.success && sessionId) {
        // Mark current streaming message as not streaming
        const currentMessageId = activeStreams.value.get(sessionId)
        if (currentMessageId) {
          const messages = getSessionMessagesRef(sessionId)
          const messageIndex = messages.findIndex(m => m.id === currentMessageId)
          if (messageIndex !== -1) {
            messages[messageIndex] = { ...messages[messageIndex], isStreaming: false }
            setSessionMessages(sessionId, [...messages])
          }
        }

        // Clear states
        sessionGenerating.value.set(sessionId, false)
        activeStreams.value.delete(sessionId)
        triggerRef(sessionGenerating)
        triggerRef(activeStreams)
      }
      return response.success
    } catch (error) {
      console.error('[Chat Store] Failed to stop generation:', error)
      return false
    }
  }

  /**
   * Update a message in a session
   */
  function updateSessionMessage(sessionId: string, messageId: string, updates: Partial<ChatMessage>) {
    const messages = getSessionMessagesRef(sessionId)
    const messageIndex = messages.findIndex(m => m.id === messageId)
    if (messageIndex !== -1) {
      messages[messageIndex] = { ...messages[messageIndex], ...updates }
      setSessionMessages(sessionId, [...messages])
    }
  }

  /**
   * Clear error for a session
   */
  function clearSessionError(sessionId: string) {
    sessionError.value.set(sessionId, null)
    sessionErrorDetails.value.set(sessionId, null)
    triggerRef(sessionError)
    triggerRef(sessionErrorDetails)
  }

  /**
   * Clear all messages for a session
   */
  function clearSessionMessages(sessionId: string) {
    sessionMessages.value.set(sessionId, [])
    triggerRef(sessionMessages)
  }

  return {
    // Per-session state maps
    sessionMessages,
    sessionLoading,
    sessionGenerating,
    sessionError,
    sessionErrorDetails,
    sessionUsageMap,
    activeStreams,

    // Getters
    getSessionState,
    getSessionUsage,
    isSessionGenerating,

    // Event handlers (called by IPC Hub)
    handleStreamChunk,
    handleStreamComplete,
    handleStreamError,
    handleStepAdded,
    handleStepUpdated,
    handleSkillActivated,

    // Actions
    loadMessages,
    loadSessionUsage,
    sendMessage,
    editAndResend,
    regenerate,
    stopGeneration,
    updateSessionMessage,
    clearSessionError,
    clearSessionMessages,
  }
})
