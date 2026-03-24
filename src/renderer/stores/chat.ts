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
import type { ChatMessage, MessageAttachment, Step, ContentPart } from '@/types'

// Stream chunk type from IPC
interface StreamChunk {
  type: 'text' | 'reasoning' | 'tool_call' | 'tool_result' | 'continuation' | 'replace'
    | 'tool_input_start' | 'tool_input_delta' | 'content_part'
  content: string
  messageId: string
  sessionId?: string
  reasoning?: string
  toolCall?: any
  replace?: boolean
  // For streaming tool input (AI SDK v6)
  toolCallId?: string
  toolName?: string
  argsTextDelta?: string
  // For content_part chunks (interleaved text and steps)
  contentPart?: ContentPart
}

// Stream complete data from IPC
interface StreamCompleteData {
  messageId?: string
  text?: string
  reasoning?: string
  sessionId?: string
  sessionName?: string
  aborted?: boolean
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  // Last turn's usage for correct context size calculation (not accumulated)
  lastTurnUsage?: {
    inputTokens: number
    outputTokens: number
  }
}

// Stream error data from IPC
interface StreamErrorData {
  messageId?: string
  sessionId?: string
  error: string
  errorDetails?: string
  preserved?: boolean
}

// Step data from IPC
interface StepData {
  sessionId: string
  messageId: string
  step: Step
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

  // Active streams (sessionId -> messageId)
  const activeStreams = ref<Map<string, string>>(new Map())

  /** Resolve messageId: use provided value or fallback to activeStreams lookup */
  function resolveMessageId(sessionId: string, messageId?: string): string {
    return (messageId && messageId !== '') ? messageId : (activeStreams.value.get(sessionId) || '')
  }

  // Scroll trigger per session — incremented on every handleStreamChunk call so MessageList
  // can watch a cheap O(1) counter instead of deep-watching all messages.
  const sessionScrollVersion = ref<Map<string, number>>(new Map())

  function getScrollVersion(sessionId: string): number {
    return sessionScrollVersion.value.get(sessionId) ?? 0
  }

  function bumpScrollVersion(sessionId: string) {
    sessionScrollVersion.value.set(sessionId, getScrollVersion(sessionId) + 1)
  }

  // ============ UI State (Per-session) ============

  // Session UI snapshots — index-based scroll position for virtual scrolling.
  // Saves the message array index instead of pixel values, so position is
  // independent of component rendering heights.
  interface SessionUISnapshot {
    firstVisibleIndex: number  // index in messages array visible at viewport top
    offsetWithinMessage: number // px of that message scrolled above viewport (sub-message precision)
    isFollowing: boolean
    navIndex: number
    hasNavigated: boolean
    messageInput: string
    quotedText: string
  }

  const sessionSnapshots = new Map<string, SessionUISnapshot>()

  function saveSnapshot(sessionId: string, snapshot: SessionUISnapshot) {
    sessionSnapshots.set(sessionId, snapshot)
  }

  function getSnapshot(sessionId: string): SessionUISnapshot | null {
    return sessionSnapshots.get(sessionId) ?? null
  }

  function deleteSnapshot(sessionId: string) {
    sessionSnapshots.delete(sessionId)
  }

  // Expanded tool calls per session
  const sessionExpandedToolCalls = ref<Map<string, Set<string>>>(new Map())

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
    }
  }

  /**
   * Check if a specific session is generating
   */
  function isSessionGenerating(sessionId: string): boolean {
    return sessionGenerating.value.get(sessionId) || activeStreams.value.has(sessionId)
  }

  // ============ UI State Functions ============

  /**
   * Check if a tool call is expanded (showing details)
   */
  function isToolCallExpanded(sessionId: string, toolCallId: string): boolean {
    return sessionExpandedToolCalls.value.get(sessionId)?.has(toolCallId) ?? false
  }

  /**
   * Toggle tool call expansion state
   */
  function toggleToolCall(sessionId: string, toolCallId: string): void {
    let set = sessionExpandedToolCalls.value.get(sessionId)
    if (!set) {
      set = new Set()
      sessionExpandedToolCalls.value.set(sessionId, set)
    }
    if (set.has(toolCallId)) {
      set.delete(toolCallId)
    } else {
      set.add(toolCallId)
    }
    // Trigger reactivity
    sessionExpandedToolCalls.value = new Map(sessionExpandedToolCalls.value)
  }

  /**
   * Collapse specified tool calls
   */
  function collapseAllToolCalls(sessionId: string, toolCallIds: string[]): void {
    const set = sessionExpandedToolCalls.value.get(sessionId)
    if (!set) return
    for (const id of toolCallIds) {
      set.delete(id)
    }
    sessionExpandedToolCalls.value = new Map(sessionExpandedToolCalls.value)
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
    // 诊断日志：显示所有 tool_input 相关的 chunk
    if (chunk.type === 'tool_input_start' || chunk.type === 'tool_input_delta') {
      console.log('[Chat Store] handleStreamChunk entry:', {
        type: chunk.type,
        sessionId: chunk.sessionId,
        messageId: chunk.messageId,
        toolCallId: chunk.toolCallId,
        hasArgsTextDelta: !!(chunk as any).argsTextDelta
      })
    }

    const sessionId = chunk.sessionId
    if (!sessionId) {
      console.warn('[Chat Store] Stream chunk missing sessionId')
      return
    }

    const messages = getSessionMessagesRef(sessionId)
    const resolvedMsgId = resolveMessageId(sessionId, chunk.messageId)
    const messageIndex = messages.findIndex(m => m.id === resolvedMsgId)
    if (messageIndex === -1) {
      console.warn('[Chat Store] Message not found for chunk:', resolvedMsgId)
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

        // Remove loading-memory or waiting indicator if present
        if (lastPart && (lastPart.type === 'waiting')) {
          parts.pop()
          lastPart = parts[parts.length - 1]
        }

        // Append to existing text part or create new one
        if (lastPart && lastPart.type === 'text') {
          // Mutate in-place — Vue Proxy detects .content change and updates only
          // the v-html binding for this part, without invalidating otherParts computed.
          lastPart.content += chunk.content
        } else if (lastPart && (lastPart.type === 'tool-call' || lastPart.type === 'data-steps')) {
          // Text arrives after a tool-call/step in the SAME turn (no continuation yet).
          // The AI model streams text and tool calls interleaved in one turn,
          // e.g. "文件末尾添加 Con" → [edit tool call] → "da 配置:".
          // Append to the last text part BEFORE the tool call to keep text contiguous.
          const lastTextPart = [...parts].reverse().find(p => p.type === 'text')
          if (lastTextPart) {
            lastTextPart.content += chunk.content
          } else {
            // No previous text part exists — insert text before the non-text part
            const insertIdx = parts.findIndex(p => p.type === 'tool-call' || p.type === 'data-steps')
            parts.splice(insertIdx >= 0 ? insertIdx : parts.length, 0, { type: 'text', content: chunk.content })
          }
        } else {
          // After continuation (waiting popped) or first text — create new part
          parts.push({ type: 'text', content: chunk.content })
        }
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

        // Remove loading-memory or waiting indicator if present
        if (lastPart && (lastPart.type === 'waiting')) {
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
    } else if (chunk.type === 'tool_input_start') {
      // Streaming tool input start - create a placeholder ToolCall with input-streaming status
      console.log('[Chat Store] tool_input_start:', chunk.toolCallId, chunk.toolName, 'message:', message.id)
      if (chunk.toolCallId && chunk.toolName) {
        if (!message.toolCalls) {
          message.toolCalls = []
        }
        // Check if we already have this tool call (shouldn't happen, but be safe)
        const existingIndex = message.toolCalls.findIndex(tc => tc.id === chunk.toolCallId)
        if (existingIndex === -1) {
          // Create a new streaming tool call placeholder
          message.toolCalls.push({
            id: chunk.toolCallId,
            toolId: chunk.toolName,
            toolName: chunk.toolName,
            arguments: {},
            status: 'input-streaming',
            timestamp: Date.now(),
            streamingArgs: '',
          })
        }

        // Update contentParts
        const parts = message.contentParts!
        let lastPart = parts[parts.length - 1]

        // Remove loading-memory or waiting indicator if present
        if (lastPart && (lastPart.type === 'waiting')) {
          parts.pop()
          lastPart = parts[parts.length - 1]
        }

        if (lastPart && lastPart.type === 'tool-call') {
          // Add to existing tool-call part if not already there
          const existingTcIndex = lastPart.toolCalls.findIndex(tc => tc.id === chunk.toolCallId)
          if (existingTcIndex === -1) {
            // Create new toolCalls array and new part object to trigger Vue reactivity
            const newToolCall = message.toolCalls[message.toolCalls.length - 1]
            const updatedPart = {
              ...lastPart,
              toolCalls: [...lastPart.toolCalls, newToolCall]
            }
            parts[parts.length - 1] = updatedPart
          }
        } else {
          parts.push({ type: 'tool-call', toolCalls: [message.toolCalls[message.toolCalls.length - 1]] })
        }
        message.contentParts = [...parts]
      }
    } else if (chunk.type === 'tool_input_delta') {
      // Streaming tool input delta - accumulate args text
      if (chunk.toolCallId && chunk.argsTextDelta && message.toolCalls) {
        const toolCallIndex = message.toolCalls.findIndex(tc => tc.id === chunk.toolCallId)
        if (toolCallIndex >= 0) {
          const toolCall = message.toolCalls[toolCallIndex]
          if (toolCall.status === 'input-streaming') {
            // Mutate in-place — the toolCall object is a reactive proxy shared by
            // message.toolCalls, contentParts toolCalls, and steps. A single field
            // assignment triggers only the bindings that read streamingArgs.
            toolCall.streamingArgs = (toolCall.streamingArgs || '') + chunk.argsTextDelta

            // Update the matching step's toolCall.streamingArgs if present
            if (message.steps) {
              const step = message.steps.find(s => s.toolCallId === chunk.toolCallId)
              if (step?.toolCall) {
                step.toolCall.streamingArgs = toolCall.streamingArgs
              }
            }
          }
        }
      }
    } else if (chunk.type === 'content_part' && chunk.contentPart) {
      // Handle content_part chunk from backend (for proper interleaving of text and steps)
      const parts = message.contentParts!
      const newPart = chunk.contentPart

      // Remove loading-memory or waiting indicator if present
      const lastPart = parts[parts.length - 1]
      if (lastPart && (lastPart.type === 'waiting')) {
        parts.pop()
      }

      if (newPart.type === 'data-steps') {
        // For data-steps, check if we already have a placeholder for this turn
        const turnIndex = (newPart as any).turnIndex
        const hasPlaceholder = parts.some(
          p => p.type === 'data-steps' && (p as any).turnIndex === turnIndex
        )
        if (!hasPlaceholder) {
          parts.push(newPart as any)
        }
      } else if (newPart.type === 'text') {
        // For text content_part, this is a finalized text block for the turn
        // We may already have streaming text, so we need to handle carefully
        // The streaming text chunks have already built up the text, so we can skip
        // adding duplicate text here - the content_part is mainly for data-steps ordering
      }

      message.contentParts = [...parts]
    }

    // Increment scroll trigger — lets MessageList scroll without a deep watcher.
    // No need to spread messages or call triggerRef: sessionMessages is ref() (not
    // shallowRef), so every mutation via the reactive proxy is tracked surgically.
    bumpScrollVersion(sessionId)
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

    console.log('[Chat Store] Stream complete:', sessionId)

    // Update message
    const messages = getSessionMessagesRef(sessionId)
    const resolvedMsgId = resolveMessageId(sessionId, data.messageId)
    const messageIndex = messages.findIndex(m => m.id === resolvedMsgId)
    if (messageIndex !== -1) {
      const message = messages[messageIndex]

      // Remove loading-memory or waiting indicator
      if (message.contentParts) {
        const lastPart = message.contentParts[message.contentParts.length - 1]
        if (lastPart && (lastPart.type === 'waiting')) {
          message.contentParts.pop()
        }

        // Save contentParts to backend
        if (message.contentParts.length > 0) {
          const plainContentParts = JSON.parse(JSON.stringify(message.contentParts))
          await window.electronAPI.updateContentParts(sessionId, resolvedMsgId, plainContentParts)
        }
      }

      // Mark message as not streaming and save usage
      message.isStreaming = false
      if (data.usage) {
        message.usage = data.usage
      }
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

    const messages = getSessionMessagesRef(sessionId)

    if (data.preserved) {
      // Message content is preserved in backend — just attach error details to the existing assistant message
      const resolvedMsgId = resolveMessageId(sessionId, data.messageId)
      if (resolvedMsgId) {
        const msg = messages.find(m => m.id === resolvedMsgId)
        if (msg) {
          msg.errorDetails = data.errorDetails
        }
      }
    } else {
      // No preserved content — replace streaming message with error message
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'error',
        content: data.error || 'Streaming error',
        timestamp: Date.now(),
        errorDetails: data.errorDetails,
      }
      messages.push(errorMessage)

      const resolvedMsgId = resolveMessageId(sessionId, data.messageId)
      if (resolvedMsgId) {
        const streamingIndex = messages.findIndex(m => m.id === resolvedMsgId)
        if (streamingIndex !== -1) {
          messages.splice(streamingIndex, 1)
        }
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
   * Find a step by ID in a nested step structure
   */
  function findStepById(steps: Step[], stepId: string): Step | null {
    return steps.find(s => s.id === stepId) ?? null
  }

  /**
   * Handle step added event
   */
  function handleStepAdded(data: StepData) {
    const { sessionId, messageId, step } = data

    const messages = getSessionMessagesRef(sessionId)
    const resolvedMsgId = resolveMessageId(sessionId, messageId)
    const message = messages.find(m => m.id === resolvedMsgId)
    if (!message) return

    // Initialize steps array if needed
    if (!message.steps) message.steps = []

    // Check if step already exists (avoid duplicates from streaming)
    const existingIndex = message.steps.findIndex(s => s.id === step.id || s.toolCallId === step.toolCallId)
    if (existingIndex >= 0) {
      // Update existing step
      message.steps[existingIndex] = { ...message.steps[existingIndex], ...step }
    } else {
      // Add new step
      message.steps.push(step)
    }
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
        // Remove loading-memory or waiting indicator if present
        if (lastPart && (lastPart.type === 'waiting')) {
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
    const resolvedMsgId = resolveMessageId(sessionId, messageId)
    const message = messages.find(m => m.id === resolvedMsgId)
    if (!message?.steps) return

    // First try top-level steps
    const stepIndex = message.steps.findIndex(s => s.id === stepId)
    if (stepIndex !== -1) {
      message.steps[stepIndex] = { ...message.steps[stepIndex], ...updates }
      message.steps = [...message.steps]
      setSessionMessages(sessionId, [...messages])
      bumpScrollVersion(sessionId)
      return
    }

  }

  /**
   * Handle skill activated event
   */
  function handleSkillActivated(data: SkillActivatedData) {
    const { sessionId, messageId, skillName } = data

    const messages = getSessionMessagesRef(sessionId)
    const resolvedMsgId = resolveMessageId(sessionId, messageId)
    const message = messages.find(m => m.id === resolvedMsgId)
    if (message) {
      message.skillUsed = skillName
      setSessionMessages(sessionId, [...messages])
    }
  }

  // ============ Actions ============

  /**
   * Load messages for a session from backend
   * Note: If this session has an active stream, we preserve the in-memory
   * streaming message to maintain UI state continuity during session switches
   */
  async function loadMessages(sessionId: string) {
    try {
      const response = await window.electronAPI.getSession(sessionId)
      if (response.success && response.session) {
        let messages = (response.session.messages || []).map(rebuildContentParts)

        // If this session has an active stream, preserve the in-memory streaming message
        // This prevents losing isStreaming, content, reasoning, steps etc. during session switch
        const activeStreamMessageId = activeStreams.value.get(sessionId)
        if (activeStreamMessageId) {
          const existingMessages = sessionMessages.value.get(sessionId) || []
          const streamingMessage = existingMessages.find(m => m.id === activeStreamMessageId)
          if (streamingMessage) {
            // Replace backend version with in-memory version to preserve full state
            const index = messages.findIndex(m => m.id === activeStreamMessageId)
            if (index !== -1) {
              messages[index] = streamingMessage
            } else {
              // Edge case: backend doesn't have this message yet, append it
              messages.push(streamingMessage)
            }
          }
        }

        setSessionMessages(sessionId, messages)
      }
    } catch (error) {
      console.error('[Chat Store] Failed to load messages:', error)
    }
  }

  /**
   * Set messages for a session directly (without IPC call)
   * Used when messages are already available (e.g., from switchSession response)
   * This avoids duplicate IPC calls
   */
  function setMessagesFromSession(sessionId: string, rawMessages: ChatMessage[]) {
    let messages = (rawMessages || []).map(rebuildContentParts)

    // If this session has an active stream, preserve the in-memory streaming message
    // This prevents losing isStreaming, content, reasoning, steps etc. during session switch
    const activeStreamMessageId = activeStreams.value.get(sessionId)
    if (activeStreamMessageId) {
      const existingMessages = sessionMessages.value.get(sessionId) || []
      const streamingMessage = existingMessages.find(m => m.id === activeStreamMessageId)
      if (streamingMessage) {
        // Replace backend version with in-memory version to preserve full state
        const index = messages.findIndex(m => m.id === activeStreamMessageId)
        if (index !== -1) {
          messages[index] = streamingMessage
        } else {
          // Edge case: backend doesn't have this message yet, append it
          messages.push(streamingMessage)
        }
      }
    }

    setSessionMessages(sessionId, messages)
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
    triggerRef(sessionLoading)

    try {
      // Call IPC (listeners already set up globally by IPC Hub)
      const response = await window.electronAPI.sendMessageStream(sessionId, content, attachments)
      sessionLoading.value.set(sessionId, false)
      triggerRef(sessionLoading)
      sessionGenerating.value.set(sessionId, true)
      triggerRef(sessionGenerating)
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
      const messageId = response.messageId || `assistant-${Date.now()}`
      const assistantMessage: ChatMessage = {
        id: messageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
        contentParts: [],
      }
      messages.push(assistantMessage)
      setSessionMessages(sessionId, [...messages])

      // Record active stream
      activeStreams.value.set(sessionId, messageId)
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
      const editMessageId = response.messageId || `assistant-${Date.now()}`
      const assistantMessage: ChatMessage = {
        id: editMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
        contentParts: [],
      }
      messages.push(assistantMessage)
      setSessionMessages(sessionId, [...messages])

      // Record active stream
      activeStreams.value.set(sessionId, editMessageId)
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
        // Mark current streaming message as not streaming and cancel running steps
        const currentMessageId = activeStreams.value.get(sessionId)
        if (currentMessageId) {
          const messages = getSessionMessagesRef(sessionId)
          const messageIndex = messages.findIndex(m => m.id === currentMessageId)
          if (messageIndex !== -1) {
            const message = messages[messageIndex]
            // Cancel all running steps
            let updatedSteps = message.steps
            if (updatedSteps) {
              updatedSteps = updatedSteps.map(step => {
                if (step.status === 'running') {
                  return {
                    ...step,
                    status: 'cancelled' as const,
                    toolCall: step.toolCall ? { ...step.toolCall, status: 'cancelled' as const } : undefined
                  }
                }
                return step
              })
            }
            messages[messageIndex] = { ...message, isStreaming: false, steps: updatedSteps }
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
    sessionSnapshots.delete(sessionId)
    triggerRef(sessionMessages)
  }

  /**
   * Add a local-only message (not saved to backend)
   * Used for system messages like /files command output
   */
  function addLocalMessage(sessionId: string, message: { role: 'system' | 'error'; content: string }) {
    const messages = getSessionMessagesRef(sessionId)
    const localMessage: ChatMessage = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      sessionId,  // Include sessionId for context isolation
      role: message.role,
      content: message.content,
      timestamp: Date.now(),
    }
    messages.push(localMessage)
    setSessionMessages(sessionId, [...messages])
  }

  /**
   * Add a message to Vue state (for immediate display after backend persistence)
   */
  function addMessageToState(sessionId: string, message: ChatMessage) {
    const messages = getSessionMessagesRef(sessionId)
    messages.push(message)
    setSessionMessages(sessionId, [...messages])
  }

  /**
   * Remove a message from Vue state by ID
   */
  function removeMessage(sessionId: string, messageId: string) {
    const messages = getSessionMessagesRef(sessionId)
    const index = messages.findIndex(m => m.id === messageId)
    if (index !== -1) {
      messages.splice(index, 1)
      setSessionMessages(sessionId, [...messages])
    }
  }

  /**
   * Handle a permission:request event from EventBus (via IPC Hub).
   *
   * Updates the matching tool call and step in the session's messages
   * to show the permission confirmation UI.
   */
  function handlePermissionRequest(data: {
    sessionId: string
    requestId: string
    messageId: string
    callId?: string
    permissionType: string
    title: string
    pattern?: string | string[]
    metadata: Record<string, unknown>
    /** Whether this channel can respond (true for targetChannel match) */
    canRespond: boolean
  }) {
    const messages = getSessionMessagesRef(data.sessionId)
    const message = messages.find(m => m.id === data.messageId)
    if (!message) {
      console.log('[Chat Store] Message not found for permission request, messageId:', data.messageId)
      return
    }

    // Find the tool call by callId or by matching command in metadata
    let toolCall = message.toolCalls?.find(tc => tc.id === data.callId)
    if (!toolCall && data.metadata.command) {
      toolCall = message.toolCalls?.find(tc =>
        tc.arguments?.command === data.metadata.command
      )
    }

    if (toolCall) {
      // Store permission ID and canRespond flag on tool call
      ;(toolCall as any).permissionId = data.requestId
      ;(toolCall as any).canRespond = data.canRespond
      toolCall.requiresConfirmation = true
      toolCall.status = 'pending'

      // Update corresponding step
      const step = message.steps?.find(s => s.toolCallId === toolCall!.id)
      if (step) {
        step.status = 'awaiting-confirmation'
        // Store metadata from permission request (contains diff for edit tool)
        if (data.metadata && (data.metadata.diff || data.metadata.filePath)) {
          step.result = JSON.stringify(data.metadata)
        }
        if (step.toolCall) {
          ;(step.toolCall as any).permissionId = data.requestId
          ;(step.toolCall as any).canRespond = data.canRespond
          step.toolCall.requiresConfirmation = true
          step.toolCall.status = 'pending'
        }
        // Force reactivity
        if (message.steps) {
          message.steps = [...message.steps]
        }
      }

      // Trigger reactivity for the session messages
      triggerRef(sessionMessages)

      console.log('[Chat Store] Updated tool call with permission request:', toolCall.id, 'canRespond:', data.canRespond)
    } else {
      console.log('[Chat Store] No matching tool call found for permission request')
    }
  }

  return {
    // Per-session state maps
    sessionMessages,
    sessionLoading,
    sessionGenerating,
    sessionError,
    sessionErrorDetails,
    activeStreams,

    // Getters
    getSessionState,
    isSessionGenerating,

    // UI State (per-session)
    isToolCallExpanded,
    toggleToolCall,
    collapseAllToolCalls,

    // Scroll trigger per session (incremented every handleStreamChunk for O(1) auto-scroll watcher)
    getScrollVersion,

    // Event handlers (called by IPC Hub)
    handleStreamChunk,
    handleStreamComplete,
    handleStreamError,
    handleStepAdded,
    handleStepUpdated,
    handleSkillActivated,
    handlePermissionRequest,

    // Actions
    loadMessages,
    setMessagesFromSession,
    sendMessage,
    editAndResend,
    regenerate,
    stopGeneration,
    updateSessionMessage,
    clearSessionError,
    clearSessionMessages,
    addLocalMessage,
    addMessageToState,
    removeMessage,

    // Session UI snapshots
    saveSnapshot,
    getSnapshot,
    deleteSnapshot,
  }
})
