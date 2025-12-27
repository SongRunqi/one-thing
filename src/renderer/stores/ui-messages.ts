/**
 * UIMessage Store
 *
 * Manages UIMessage state for the frontend.
 * This store is compatible with AI SDK 5.x UIMessage format
 * and provides a migration path from the old ChatMessage format.
 */

import { defineStore } from 'pinia'
import { ref, computed, onUnmounted } from 'vue'
import type {
  UIMessage,
  UIMessagePart,
  UIMessageStreamData,
  TextUIPart,
  ReasoningUIPart,
  ToolUIPart,
  ToolUIState,
  ChatMessage,
} from '@/types'
import {
  chatMessageToUIMessage,
  uiMessageToChatMessage,
  chatMessagesToUIMessages,
  createAssistantUIMessage,
  upsertPart,
  updateToolPart,
  getMessageText,
  getMessageReasoning,
  getToolParts,
} from '../../shared/message-converters.js'

export const useUIMessagesStore = defineStore('ui-messages', () => {
  // Main state: UIMessage array
  const messages = ref<UIMessage[]>([])

  // Track active streams by session
  const activeStreams = ref<Map<string, {
    messageId: string
    textPartIndex?: number
    reasoningPartIndex?: number
  }>>(new Map())

  // Current session ID
  const currentSessionId = ref<string | null>(null)

  // Stream cleanup functions
  const streamCleanups = ref<(() => void)[]>([])

  // ============================================================================
  // Computed properties
  // ============================================================================

  const messageCount = computed(() => messages.value.length)

  const userMessages = computed(() =>
    messages.value.filter(m => m.role === 'user')
  )

  const assistantMessages = computed(() =>
    messages.value.filter(m => m.role === 'assistant')
  )

  // Check if any message is currently streaming
  const isStreaming = computed(() =>
    activeStreams.value.size > 0
  )

  // Check if current session is streaming
  const isCurrentSessionStreaming = computed(() =>
    currentSessionId.value ? activeStreams.value.has(currentSessionId.value) : false
  )

  // Convert to ChatMessage format for backward compatibility
  const chatMessages = computed(() =>
    messages.value.map(uiMessageToChatMessage)
  )

  // Get the last message
  const lastMessage = computed(() =>
    messages.value.length > 0 ? messages.value[messages.value.length - 1] : null
  )

  // ============================================================================
  // Message loading
  // ============================================================================

  /**
   * Load messages from ChatMessage array (convert to UIMessage)
   */
  function loadFromChatMessages(chatMsgs: ChatMessage[]) {
    messages.value = chatMessagesToUIMessages(chatMsgs)
  }

  /**
   * Load UIMessages directly
   */
  function loadMessages(uiMsgs: UIMessage[]) {
    messages.value = uiMsgs
  }

  /**
   * Clear all messages
   */
  function clearMessages() {
    messages.value = []
  }

  // ============================================================================
  // Message operations
  // ============================================================================

  /**
   * Add a user message
   */
  function addUserMessage(message: UIMessage) {
    messages.value = [...messages.value, message]
  }

  /**
   * Add an assistant message (usually empty, to be filled by streaming)
   */
  function addAssistantMessage(message: UIMessage) {
    messages.value = [...messages.value, message]
  }

  /**
   * Update a message by ID
   */
  function updateMessage(messageId: string, updates: Partial<UIMessage>) {
    const index = messages.value.findIndex(m => m.id === messageId)
    if (index === -1) return

    messages.value = [
      ...messages.value.slice(0, index),
      { ...messages.value[index], ...updates },
      ...messages.value.slice(index + 1),
    ]
  }

  /**
   * Delete a message by ID
   */
  function deleteMessage(messageId: string) {
    messages.value = messages.value.filter(m => m.id !== messageId)
  }

  /**
   * Delete messages from a specific ID onwards (for branch/edit)
   */
  function deleteMessagesFrom(messageId: string) {
    const index = messages.value.findIndex(m => m.id === messageId)
    if (index !== -1) {
      messages.value = messages.value.slice(0, index)
    }
  }

  // ============================================================================
  // Part operations
  // ============================================================================

  /**
   * Add or update a part in a message
   */
  function upsertMessagePart(
    messageId: string,
    part: UIMessagePart,
    partIndex?: number
  ) {
    const msgIndex = messages.value.findIndex(m => m.id === messageId)
    if (msgIndex === -1) return

    const updatedMessage = upsertPart(messages.value[msgIndex], part, partIndex)

    messages.value = [
      ...messages.value.slice(0, msgIndex),
      updatedMessage,
      ...messages.value.slice(msgIndex + 1),
    ]
  }

  /**
   * Update a tool part in a message
   */
  function updateMessageToolPart(
    messageId: string,
    toolCallId: string,
    updates: Partial<ToolUIPart>
  ) {
    const msgIndex = messages.value.findIndex(m => m.id === messageId)
    if (msgIndex === -1) return

    const updatedMessage = updateToolPart(messages.value[msgIndex], toolCallId, updates)

    messages.value = [
      ...messages.value.slice(0, msgIndex),
      updatedMessage,
      ...messages.value.slice(msgIndex + 1),
    ]
  }

  // ============================================================================
  // Streaming operations
  // ============================================================================

  /**
   * Start a stream for a message
   */
  function startStream(sessionId: string, messageId: string) {
    activeStreams.value.set(sessionId, { messageId })
  }

  /**
   * End a stream for a session
   */
  function endStream(sessionId: string) {
    activeStreams.value.delete(sessionId)
  }

  /**
   * Handle a UIMessage stream chunk
   */
  function handleUIMessageChunk(data: UIMessageStreamData) {
    const { sessionId, messageId, chunk } = data

    if (chunk.type === 'part') {
      // Get or create stream state
      let streamState = activeStreams.value.get(sessionId)
      if (!streamState) {
        streamState = { messageId }
        activeStreams.value.set(sessionId, streamState)
      }

      const part = chunk.part
      const partIndex = chunk.partIndex

      // Handle different part types
      if (part.type === 'text') {
        // If partIndex is provided, update that part; otherwise, find or create text part
        if (partIndex !== undefined) {
          streamState.textPartIndex = partIndex
          upsertMessagePart(messageId, part, partIndex)
        } else {
          // Accumulate text to existing text part or create new one
          const msg = messages.value.find(m => m.id === messageId)
          if (msg) {
            const existingTextIndex = msg.parts.findIndex(p => p.type === 'text')
            if (existingTextIndex !== -1) {
              const existingText = msg.parts[existingTextIndex] as TextUIPart
              const updatedPart: TextUIPart = {
                type: 'text',
                text: existingText.text + (part as TextUIPart).text,
                state: (part as TextUIPart).state,
              }
              upsertMessagePart(messageId, updatedPart, existingTextIndex)
            } else {
              upsertMessagePart(messageId, part)
            }
          }
        }
      } else if (part.type === 'reasoning') {
        // Similar handling for reasoning
        if (partIndex !== undefined) {
          streamState.reasoningPartIndex = partIndex
          upsertMessagePart(messageId, part, partIndex)
        } else {
          const msg = messages.value.find(m => m.id === messageId)
          if (msg) {
            const existingReasoningIndex = msg.parts.findIndex(p => p.type === 'reasoning')
            if (existingReasoningIndex !== -1) {
              const existingReasoning = msg.parts[existingReasoningIndex] as ReasoningUIPart
              const updatedPart: ReasoningUIPart = {
                type: 'reasoning',
                text: existingReasoning.text + (part as ReasoningUIPart).text,
                state: (part as ReasoningUIPart).state,
              }
              upsertMessagePart(messageId, updatedPart, existingReasoningIndex)
            } else {
              upsertMessagePart(messageId, part)
            }
          }
        }
      } else if (part.type.startsWith('tool-')) {
        // Tool parts are added/updated by toolCallId
        const toolPart = part as ToolUIPart
        const msg = messages.value.find(m => m.id === messageId)
        if (msg) {
          const existingToolIndex = msg.parts.findIndex(
            p => p.type.startsWith('tool-') && (p as ToolUIPart).toolCallId === toolPart.toolCallId
          )
          if (existingToolIndex !== -1) {
            upsertMessagePart(messageId, part, existingToolIndex)
          } else {
            upsertMessagePart(messageId, part)
          }
        }
      } else {
        // Other parts: just add/update at given index
        if (partIndex !== undefined) {
          upsertMessagePart(messageId, part, partIndex)
        } else {
          upsertMessagePart(messageId, part)
        }
      }
    } else if (chunk.type === 'finish') {
      // Stream finished
      endStream(sessionId)

      // Mark all streaming parts as done
      const msg = messages.value.find(m => m.id === messageId)
      if (msg) {
        const updatedParts = msg.parts.map(part => {
          if (part.type === 'text' && (part as TextUIPart).state === 'streaming') {
            return { ...part, state: 'done' } as TextUIPart
          }
          if (part.type === 'reasoning' && (part as ReasoningUIPart).state === 'streaming') {
            return { ...part, state: 'done' } as ReasoningUIPart
          }
          return part
        })
        updateMessage(messageId, { parts: updatedParts })
      }
    }
  }

  // ============================================================================
  // Session operations
  // ============================================================================

  /**
   * Set current session ID
   */
  function setCurrentSession(sessionId: string | null) {
    currentSessionId.value = sessionId
  }

  /**
   * Check if a session has an active stream
   */
  function isSessionStreaming(sessionId: string): boolean {
    return activeStreams.value.has(sessionId)
  }

  // ============================================================================
  // Stream listener setup
  // ============================================================================

  /**
   * Setup UIMessage stream listener
   */
  function setupStreamListener() {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const cleanup = window.electronAPI.onUIMessageStream(handleUIMessageChunk)
      streamCleanups.value.push(cleanup)
      return cleanup
    }
    return () => {}
  }

  /**
   * Cleanup all stream listeners
   */
  function cleanupStreamListeners() {
    for (const cleanup of streamCleanups.value) {
      cleanup()
    }
    streamCleanups.value = []
  }

  // ============================================================================
  // Utility functions
  // ============================================================================

  /**
   * Get text content from a message
   */
  function getTextContent(messageId: string): string {
    const msg = messages.value.find(m => m.id === messageId)
    return msg ? getMessageText(msg) : ''
  }

  /**
   * Get reasoning content from a message
   */
  function getReasoningContent(messageId: string): string {
    const msg = messages.value.find(m => m.id === messageId)
    return msg ? getMessageReasoning(msg) : ''
  }

  /**
   * Get all tool parts from a message
   */
  function getMessageToolParts(messageId: string): ToolUIPart[] {
    const msg = messages.value.find(m => m.id === messageId)
    return msg ? getToolParts(msg) : []
  }

  return {
    // State
    messages,
    currentSessionId,
    activeStreams,

    // Computed
    messageCount,
    userMessages,
    assistantMessages,
    isStreaming,
    isCurrentSessionStreaming,
    chatMessages,
    lastMessage,

    // Message operations
    loadFromChatMessages,
    loadMessages,
    clearMessages,
    addUserMessage,
    addAssistantMessage,
    updateMessage,
    deleteMessage,
    deleteMessagesFrom,

    // Part operations
    upsertMessagePart,
    updateMessageToolPart,

    // Streaming
    startStream,
    endStream,
    handleUIMessageChunk,

    // Session
    setCurrentSession,
    isSessionStreaming,

    // Listeners
    setupStreamListener,
    cleanupStreamListeners,

    // Utilities
    getTextContent,
    getReasoningContent,
    getMessageToolParts,
  }
})
