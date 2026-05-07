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
import {
  appendOrMergeText,
  appendToolCallPlaceholder,
  popTrailingTransient,
  pushDataStepsIfMissing,
  pushWaiting,
  removeTransientIndicators,
  upsertToolCall,
} from './helpers/content-parts'
import {
  linkStepsToToolCalls,
  upsertMessageToolCall,
} from './helpers/tool-calls'

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

  function resolveStreamingMessage(messages: ChatMessage[], messageId?: string): ChatMessage | undefined {
    if (messageId) {
      const byId = messages.find(m => m.id === messageId)
      if (byId) return byId
    }
    return [...messages].reverse().find(m => m.role === 'assistant' && m.isStreaming) ||
      [...messages].reverse().find(m =>
        m.role === 'assistant' &&
        m.contentParts?.some(part => part.type === 'waiting' || part.type === 'loading-memory')
      )
  }

  function stopMessageStreaming(message: ChatMessage, usage?: StreamCompleteData['usage']) {
    if (message.contentParts && removeTransientIndicators(message.contentParts)) {
      message.contentParts = [...message.contentParts]
    }
    message.isStreaming = false
    if (usage) {
      message.usage = usage
    }
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

  // ============ Inspector — request snapshots ring buffer ============
  // Per-session list of the most recent outbound LLM requests (cap = 5).
  // Populated from the `request:snapshot` event emitted by tool-loop.
  // Used by ChatInspectorPanel's Request tab.
  const REQUEST_SNAPSHOT_CAP = 5
  const sessionRequestSnapshots = ref<Map<string, any[]>>(new Map())

  function getRequestSnapshots(sessionId: string): any[] {
    return sessionRequestSnapshots.value.get(sessionId) ?? []
  }

  function handleRequestSnapshot(data: { sessionId: string; snapshot: any }) {
    const list = sessionRequestSnapshots.value.get(data.sessionId) ?? []
    const next = [...list, data.snapshot]
    if (next.length > REQUEST_SNAPSHOT_CAP) next.splice(0, next.length - REQUEST_SNAPSHOT_CAP)
    sessionRequestSnapshots.value.set(data.sessionId, next)
  }

  function clearRequestSnapshots(sessionId: string) {
    sessionRequestSnapshots.value.delete(sessionId)
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

    // Reloaded messages have step.toolCall and message.toolCalls[i] as
    // independent JSON objects. Relink so mutations from later chunks /
    // user actions propagate to both consumers.
    linkStepsToToolCalls(message)

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

    const parts = message.contentParts

    if (chunk.type === 'text') {
      if (chunk.replace) {
        message.content = chunk.content
        message.contentParts = chunk.content ? [{ type: 'text', content: chunk.content }] : []
      } else {
        message.content = (message.content || '') + chunk.content
        appendOrMergeText(parts, chunk.content)
        message.contentParts = [...parts]
      }
    } else if (chunk.type === 'reasoning') {
      message.reasoning = (message.reasoning || '') + (chunk.reasoning || '')
    } else if (chunk.type === 'tool_call' || chunk.type === 'tool_result') {
      if (chunk.toolCall) {
        // Merge into the canonical entry in place so any step.toolCall
        // referencing the same id sees the update without manual mirror writes.
        const canonical = upsertMessageToolCall(message, chunk.toolCall)
        upsertToolCall(parts, canonical)
        message.contentParts = [...parts]
      }
    } else if (chunk.type === 'continuation') {
      pushWaiting(parts)
      message.contentParts = [...parts]
    } else if (chunk.type === 'replace') {
      message.content = chunk.content
      message.contentParts = chunk.content ? [{ type: 'text', content: chunk.content }] : []
    } else if (chunk.type === 'tool_input_start') {
      if (chunk.toolCallId && chunk.toolName) {
        if (!message.toolCalls) message.toolCalls = []
        let placeholder = message.toolCalls.find(tc => tc.id === chunk.toolCallId)
        if (!placeholder) {
          placeholder = {
            id: chunk.toolCallId,
            toolId: chunk.toolName,
            toolName: chunk.toolName,
            arguments: {},
            status: 'input-streaming',
            timestamp: Date.now(),
            streamingArgs: '',
          }
          message.toolCalls.push(placeholder)
        }
        appendToolCallPlaceholder(parts, placeholder)
        message.contentParts = [...parts]
      }
    } else if (chunk.type === 'tool_input_delta') {
      // Streaming tool input delta - accumulate args text in-place. The
      // toolCall is shared with step.toolCall (relinked by handleStepAdded /
      // rebuildContentParts), so a single field assignment is enough.
      if (chunk.toolCallId && chunk.argsTextDelta && message.toolCalls) {
        const toolCall = message.toolCalls.find(tc => tc.id === chunk.toolCallId)
        if (toolCall && toolCall.status === 'input-streaming') {
          toolCall.streamingArgs = (toolCall.streamingArgs || '') + chunk.argsTextDelta
        }
      }
    } else if (chunk.type === 'content_part' && chunk.contentPart) {
      const newPart = chunk.contentPart
      if (newPart.type === 'data-steps') {
        pushDataStepsIfMissing(parts, newPart.turnIndex)
        message.contentParts = [...parts]
      } else if (newPart.type === 'text') {
        // Finalized text block for the turn. Streaming text chunks have already
        // built up the text, so nothing to add here — the content_part exists
        // mainly to anchor data-steps ordering.
        popTrailingTransient(parts)
        message.contentParts = [...parts]
      }
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
    const message = resolveStreamingMessage(messages, resolvedMsgId)
    if (message) {
      stopMessageStreaming(message, data.usage)
      setSessionMessages(sessionId, [...messages])
    }

    // Fold the turn's usage into the session-level token stats so the
    // Inspector's Context tab shows session totals without a refetch.
    if (data.usage) {
      try {
        const { useSessionsStore } = await import('./sessions')
        const sessionsStore = useSessionsStore()
        const session = sessionsStore.sessions.find((s) => s.id === sessionId) as any
        if (session) {
          sessionsStore.updateSessionTokenStats(sessionId, {
            totalInputTokens: (session.totalInputTokens ?? 0) + (data.usage.inputTokens ?? 0),
            totalOutputTokens: (session.totalOutputTokens ?? 0) + (data.usage.outputTokens ?? 0),
            totalTokens: (session.totalTokens ?? 0) + (data.usage.totalTokens ?? 0),
          })
        }
      } catch (e) {
        console.warn('[Chat Store] Failed to fold usage into session stats:', e)
      }
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
      // Message content is preserved in backend — just attach error details and stop streaming
      const resolvedMsgId = resolveMessageId(sessionId, data.messageId)
      const msg = resolveStreamingMessage(messages, resolvedMsgId)
      if (msg) {
        msg.errorDetails = data.errorDetails
        stopMessageStreaming(msg)
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

    // Ensure no messages are stuck in streaming state
    for (const msg of messages) {
      if (msg.isStreaming) msg.isStreaming = false
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
    // Re-point step.toolCall at the canonical message.toolCalls entry so
    // mutations from the chunk reducer / MessageList handlers propagate to
    // both consumers without manual mirror writes.
    linkStepsToToolCalls(message)
    message.steps = [...message.steps]

    // Add steps placeholder to contentParts if needed
    if (message.contentParts && step.turnIndex !== undefined) {
      if (pushDataStepsIfMissing(message.contentParts, step.turnIndex)) {
        message.contentParts = [...message.contentParts]
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
      // Re-link in case the update payload included a fresh `toolCall` clone.
      linkStepsToToolCalls(message)
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
        const messages = (response.session.messages || []).map(rebuildContentParts)

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
    const messages = (rawMessages || []).map(rebuildContentParts)

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
  /**
   * Send a message — emits command, events drive all state updates
   */
  async function sendMessage(sessionId: string, content: string, attachments?: MessageAttachment[]) {
    sessionError.value.set(sessionId, null)
    sessionErrorDetails.value.set(sessionId, null)
    triggerRef(sessionError)
    triggerRef(sessionErrorDetails)
    sessionLoading.value.set(sessionId, true)
    triggerRef(sessionLoading)

    await window.electronAPI.emitCommand(sessionId, {
      type: 'command:send-message',
      content,
      attachments,
    })
    return true
  }

  /**
   * Inject guidance into the active tool loop.
   * The backend persists it as a user message and processes it before the next
   * LLM call, without aborting the current stream.
   */
  async function steerMessage(sessionId: string, content: string) {
    await window.electronAPI.emitCommand(sessionId, {
      type: 'command:inject-steering',
      content,
      source: 'user',
    })
    return true
  }

  /**
   * Queue a follow-up message for after the assistant would otherwise stop.
   */
  async function queueFollowUpMessage(sessionId: string, content: string) {
    await window.electronAPI.emitCommand(sessionId, {
      type: 'command:inject-followup',
      content,
      source: 'user',
    })
    return true
  }

  /**
   * Edit and resend a message — emits command
   */
  async function editAndResend(sessionId: string, messageId: string, newContent: string) {
    sessionError.value.set(sessionId, null)
    sessionErrorDetails.value.set(sessionId, null)
    triggerRef(sessionError)
    triggerRef(sessionErrorDetails)
    sessionLoading.value.set(sessionId, true)
    triggerRef(sessionLoading)

    await window.electronAPI.emitCommand(sessionId, {
      type: 'command:edit-and-resend',
      messageId,
      newContent,
    })
    return true
  }

  /**
   * Regenerate from a message — emits retry command
   */
  async function regenerate(sessionId: string, messageId: string) {
    const messages = getSessionMessagesRef(sessionId)
    const message = messages.find(m => m.id === messageId)
    if (!message) return false

    // If regenerating from an assistant message, use the assistant message ID directly
    const targetMessageId = message.role === 'assistant' ? messageId : undefined
    if (message.role === 'assistant') {
      sessionLoading.value.set(sessionId, true)
      triggerRef(sessionLoading)

      await window.electronAPI.emitCommand(sessionId, {
        type: 'command:retry-message',
        messageId,
      })
      return true
    }

    // For user messages, use edit-and-resend with same content
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
            // Cancel all running steps. Mutate step.toolCall.status in place
            // so the shared canonical message.toolCalls entry sees the change;
            // the outer step shallow-spread keeps the toolCall reference.
            let updatedSteps = message.steps
            if (updatedSteps) {
              updatedSteps = updatedSteps.map(step => {
                if (step.status === 'running') {
                  if (step.toolCall) step.toolCall.status = 'cancelled'
                  return { ...step, status: 'cancelled' as const }
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

  // ── Event-driven message handlers (called by IPC Hub) ──

  /**
   * Handle message:user-created event — add user message from main process
   */
  function handleMessageCreated(data: { sessionId: string; message: ChatMessage }) {
    const { sessionId, message } = data
    const messages = getSessionMessagesRef(sessionId)
    messages.push(rebuildContentParts(message))
    setSessionMessages(sessionId, [...messages])
    sessionLoading.value.set(sessionId, false)
    triggerRef(sessionLoading)
    bumpScrollVersion(sessionId)
  }

  /**
   * Handle message:assistant-created event — add streaming assistant message
   */
  function handleAssistantCreated(data: { sessionId: string; message: ChatMessage }) {
    const { sessionId, message } = data
    const messages = getSessionMessagesRef(sessionId)
    const assistantMessage: ChatMessage = {
      ...message,
      isStreaming: true,
      contentParts: message.contentParts || [],
    }
    messages.push(assistantMessage)
    setSessionMessages(sessionId, [...messages])

    activeStreams.value.set(sessionId, message.id)
    sessionGenerating.value.set(sessionId, true)
    sessionLoading.value.set(sessionId, false)
    triggerRef(activeStreams)
    triggerRef(sessionGenerating)
    triggerRef(sessionLoading)
    bumpScrollVersion(sessionId)
  }

  /**
   * Handle message:deleted event — remove message from UI
   */
  function handleMessageDeleted(data: { sessionId: string; messageId: string }) {
    removeMessage(data.sessionId, data.messageId)
  }

  /**
   * Handle messages:replaced event — replace entire message list (edit-and-resend truncation)
   */
  function handleMessagesReplaced(data: { sessionId: string; messages: ChatMessage[] }) {
    const { sessionId, messages } = data
    const rebuilt = messages.map(rebuildContentParts)
    setSessionMessages(sessionId, rebuilt)
    bumpScrollVersion(sessionId)
  }

  /**
   * Handle session:renamed event — update session name in sessions store
   */
  async function handleSessionRenamed(data: { sessionId: string; name: string }) {
    try {
      const { useSessionsStore } = await import('./sessions')
      const sessionsStore = useSessionsStore()
      const session = sessionsStore.sessions.find(s => s.id === data.sessionId)
      if (session) {
        session.name = data.name
        session.updatedAt = Date.now()
      }
    } catch (e) {
      console.error('[Chat Store] Failed to update session name:', e)
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
      toolCall.permissionId = data.requestId
      toolCall.canRespond = data.canRespond
      toolCall.requiresConfirmation = true
      toolCall.status = 'pending'

      // Update corresponding step (step-own fields only; the step.toolCall
      // mirror is the same reference as `toolCall` above).
      const step = message.steps?.find(s => s.toolCallId === toolCall!.id)
      if (step) {
        step.status = 'awaiting-confirmation'
        // Store metadata from permission request (contains diff for edit tool)
        if (data.metadata && (data.metadata.diff || data.metadata.filePath)) {
          step.result = JSON.stringify(data.metadata)
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
    handleMessageCreated,
    handleAssistantCreated,
    handleMessageDeleted,
    handleMessagesReplaced,
    handleSessionRenamed,
    handleRequestSnapshot,

    // Inspector — request snapshots ring buffer
    getRequestSnapshots,
    clearRequestSnapshots,

    // Actions
    loadMessages,
    setMessagesFromSession,
    sendMessage,
    steerMessage,
    queueFollowUpMessage,
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
