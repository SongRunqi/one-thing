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
import type {
  ChatMessage,
  MessageAttachment,
  Step,
  UIMessage,
  UIMessagePart,
  UIMessageStreamData,
  TextUIPart,
  ReasoningUIPart,
  ToolUIPart,
} from '@/types'
import {
  upsertPart,
  updateToolPart,
  getMessageText,
  getMessageReasoning,
  getToolParts,
  chatMessageToUIMessage,
} from '../../shared/message-converters.js'

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

  // Token usage per session
  const sessionUsageMap = ref<Map<string, {
    totalInputTokens: number
    totalOutputTokens: number
    totalTokens: number
    lastInputTokens: number
    contextSize: number  // Current context window size (input + output)
  }>>(new Map())

  // Active streams (sessionId -> messageId)
  const activeStreams = ref<Map<string, string>>(new Map())

  // Context compacting state per session
  const sessionCompacting = ref<Map<string, boolean>>(new Map())

  // UIMessage per session (unified message format, AI SDK 5.x)
  const sessionUIMessages = ref<Map<string, UIMessage[]>>(new Map())

  // Per-session stream state for UIMessage part tracking
  const uiStreamState = ref<Map<string, {
    messageId: string
    textPartIndex?: number
    reasoningPartIndex?: number
  }>>(new Map())

  // ============ UI State (Persisted across re-renders) ============

  // Expanded agent panels (step IDs of agent steps that are expanded)
  const expandedAgentPanels = ref<Set<string>>(new Set())

  // Expanded tool calls within agent panels (tool call IDs that show details)
  const expandedToolCalls = ref<Set<string>>(new Set())

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

  /**
   * Check if a specific session is compacting context
   */
  function isSessionCompacting(sessionId: string): boolean {
    return sessionCompacting.value.get(sessionId) || false
  }

  /**
   * Set compacting state for a session
   */
  function setSessionCompacting(sessionId: string, isCompacting: boolean): void {
    sessionCompacting.value.set(sessionId, isCompacting)
    triggerRef(sessionCompacting)
  }

  // ============ UI State Functions ============

  /**
   * Check if an agent panel is expanded
   */
  function isAgentPanelExpanded(stepId: string): boolean {
    return expandedAgentPanels.value.has(stepId)
  }

  /**
   * Toggle agent panel expansion state
   */
  function toggleAgentPanel(stepId: string): void {
    const newSet = new Set(expandedAgentPanels.value)
    if (newSet.has(stepId)) {
      newSet.delete(stepId)
    } else {
      newSet.add(stepId)
    }
    expandedAgentPanels.value = newSet
  }

  /**
   * Set agent panel expansion state explicitly
   */
  function setAgentPanelExpanded(stepId: string, expanded: boolean): void {
    const newSet = new Set(expandedAgentPanels.value)
    if (expanded) {
      newSet.add(stepId)
    } else {
      newSet.delete(stepId)
    }
    expandedAgentPanels.value = newSet
  }

  /**
   * Check if a tool call is expanded (showing details)
   */
  function isToolCallExpanded(toolCallId: string): boolean {
    return expandedToolCalls.value.has(toolCallId)
  }

  /**
   * Toggle tool call expansion state
   */
  function toggleToolCall(toolCallId: string): void {
    const newSet = new Set(expandedToolCalls.value)
    if (newSet.has(toolCallId)) {
      newSet.delete(toolCallId)
    } else {
      newSet.add(toolCallId)
    }
    expandedToolCalls.value = newSet
  }

  /**
   * Collapse all tool calls within an agent panel
   */
  function collapseAllToolCalls(toolCallIds: string[]): void {
    const newSet = new Set(expandedToolCalls.value)
    for (const id of toolCallIds) {
      newSet.delete(id)
    }
    expandedToolCalls.value = newSet
  }

  // ============ Helper Functions ============

  /**
   * Update messages for a session and trigger reactivity
   */
  function setSessionMessages(sessionId: string, messages: ChatMessage[]) {
    sessionMessages.value.set(sessionId, messages)
    triggerRef(sessionMessages)
    // Sync to UIMessages for UI rendering
    const uiMessages = messages.map(chatMessageToUIMessage)
    sessionUIMessages.value.set(sessionId, uiMessages)
    triggerRef(sessionUIMessages)
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
   * Handle UIMessage stream finish event (replaces legacy handleStreamComplete)
   */
  async function handleStreamFinish(data: UIMessageStreamData) {
    if (data.chunk.type !== 'finish') return
    const { sessionId, messageId, chunk } = data
    const finishChunk = chunk

    console.log('[Chat Store] Stream finish:', sessionId, 'usage:', finishChunk.usage)

    // Update usage
    if (finishChunk.usage) {
      const currentUsage = sessionUsageMap.value.get(sessionId) || {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        lastInputTokens: 0,
        contextSize: 0,
      }
      // Use lastTurnUsage for context size (not accumulated)
      const lastTurn = finishChunk.lastTurnUsage || finishChunk.usage
      sessionUsageMap.value.set(sessionId, {
        totalInputTokens: currentUsage.totalInputTokens + finishChunk.usage.inputTokens,
        totalOutputTokens: currentUsage.totalOutputTokens + finishChunk.usage.outputTokens,
        totalTokens: currentUsage.totalTokens + finishChunk.usage.totalTokens,
        lastInputTokens: lastTurn.inputTokens,
        contextSize: lastTurn.inputTokens,
      })
      triggerRef(sessionUsageMap)
    }

    // Update message
    const messages = getSessionMessagesRef(sessionId)
    const messageIndex = messages.findIndex(m => m.id === messageId)
    if (messageIndex !== -1) {
      const message = messages[messageIndex]

      // Remove loading-memory or waiting indicator
      if (message.contentParts) {
        const lastPart = message.contentParts[message.contentParts.length - 1]
        if (lastPart && (lastPart.type === 'waiting' || lastPart.type === 'loading-memory')) {
          message.contentParts.pop()
        }

        // Save contentParts to backend
        if (message.contentParts.length > 0) {
          const plainContentParts = JSON.parse(JSON.stringify(message.contentParts))
          await window.electronAPI.updateContentParts(sessionId, messageId, plainContentParts)
        }
      }

      // Mark message as not streaming and save usage
      message.isStreaming = false
      if (finishChunk.usage) {
        message.usage = finishChunk.usage
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
    if (finishChunk.sessionName) {
      try {
        const { useSessionsStore } = await import('./sessions')
        const sessionsStore = useSessionsStore()
        const sessionInStore = sessionsStore.sessions.find(s => s.id === sessionId)
        if (sessionInStore) {
          sessionInStore.name = finishChunk.sessionName
          sessionInStore.updatedAt = Date.now()
        }
      } catch (e) {
        console.error('[Chat Store] Failed to update session name:', e)
      }
    }
  }

  /**
   * Handle UIMessage stream error event (replaces legacy handleStreamError)
   */
  function handleStreamErrorFromUIMessage(data: UIMessageStreamData) {
    if (data.chunk.type !== 'error') return
    const { sessionId, messageId, chunk } = data
    const errorChunk = chunk

    console.log('[Chat Store] Stream error:', sessionId, errorChunk.error)

    // Set error state
    sessionError.value.set(sessionId, errorChunk.error || 'Streaming error')
    sessionErrorDetails.value.set(sessionId, errorChunk.errorDetails || null)
    triggerRef(sessionError)
    triggerRef(sessionErrorDetails)

    // Add error message
    const messages = getSessionMessagesRef(sessionId)
    const errorMessage: ChatMessage = {
      id: `error-${Date.now()}`,
      role: 'assistant',
      content: errorChunk.error || 'Streaming error',
      timestamp: Date.now(),
      errorDetails: errorChunk.errorDetails,
      errorCategory: errorChunk.errorCategory,
      retryable: errorChunk.retryable,
    }
    messages.push(errorMessage)

    // Remove the streaming assistant message if it exists
    if (messageId) {
      const streamingIndex = messages.findIndex(m => m.id === messageId)
      if (streamingIndex !== -1) {
        messages.splice(streamingIndex, 1)
      }
    }

    setSessionMessages(sessionId, [...messages])

    // Also update UIMessages: remove streaming assistant and add error UIMessage
    if (messageId) {
      removeUIMessage(sessionId, messageId)
    }
    addUIMessage(sessionId, chatMessageToUIMessage(errorMessage))

    // Clear generating state
    sessionGenerating.value.set(sessionId, false)
    sessionLoading.value.set(sessionId, false)
    activeStreams.value.delete(sessionId)
    triggerRef(sessionGenerating)
    triggerRef(sessionLoading)
    triggerRef(activeStreams)
  }

  // ============ UIMessage State Management (merged from UIMessagesStore, Phase 3 REQ-005) ============

  /**
   * Get UIMessages for a session (mutable reference)
   */
  function getSessionUIMessagesRef(sessionId: string): UIMessage[] {
    let msgs = sessionUIMessages.value.get(sessionId)
    if (!msgs) {
      msgs = []
      sessionUIMessages.value.set(sessionId, msgs)
    }
    return msgs
  }

  /**
   * Set UIMessages for a session and trigger reactivity
   */
  function setSessionUIMessages(sessionId: string, msgs: UIMessage[]) {
    sessionUIMessages.value.set(sessionId, msgs)
    triggerRef(sessionUIMessages)
  }

  /**
   * Load UIMessages for a session directly
   */
  function loadUIMessages(sessionId: string, msgs: UIMessage[]) {
    setSessionUIMessages(sessionId, msgs)
  }

  /**
   * Clear UIMessages for a session
   */
  function clearSessionUIMessages(sessionId: string) {
    sessionUIMessages.value.set(sessionId, [])
    triggerRef(sessionUIMessages)
  }

  /**
   * Add a UIMessage to a session
   */
  function addUIMessage(sessionId: string, message: UIMessage) {
    const msgs = getSessionUIMessagesRef(sessionId)
    msgs.push(message)
    setSessionUIMessages(sessionId, [...msgs])
  }

  /**
   * Update a UIMessage by ID within a session
   */
  function removeUIMessage(sessionId: string, messageId: string) {
    const msgs = getSessionUIMessagesRef(sessionId)
    const index = msgs.findIndex(m => m.id === messageId)
    if (index === -1) return
    msgs.splice(index, 1)
    setSessionUIMessages(sessionId, [...msgs])
  }

  function updateUIMessage(sessionId: string, messageId: string, updates: Partial<UIMessage>) {
    const msgs = getSessionUIMessagesRef(sessionId)
    const index = msgs.findIndex(m => m.id === messageId)
    if (index === -1) return
    msgs[index] = { ...msgs[index], ...updates }
    setSessionUIMessages(sessionId, [...msgs])
  }

  /**
   * Upsert a part in a UIMessage within a session
   */
  function upsertUIMessagePart(sessionId: string, messageId: string, part: UIMessagePart, partIndex?: number) {
    const msgs = getSessionUIMessagesRef(sessionId)
    const msgIndex = msgs.findIndex(m => m.id === messageId)
    if (msgIndex === -1) return
    msgs[msgIndex] = upsertPart(msgs[msgIndex], part, partIndex)
    setSessionUIMessages(sessionId, [...msgs])
  }

  /**
   * Update a tool part in a UIMessage within a session
   */
  function updateUIMessageToolPart(sessionId: string, messageId: string, toolCallId: string, updates: Partial<ToolUIPart>) {
    const msgs = getSessionUIMessagesRef(sessionId)
    const msgIndex = msgs.findIndex(m => m.id === messageId)
    if (msgIndex === -1) return
    msgs[msgIndex] = updateToolPart(msgs[msgIndex], toolCallId, updates)
    setSessionUIMessages(sessionId, [...msgs])
  }

  /**
   * Handle a UIMessage stream chunk (merged from UIMessagesStore)
   */
  function handleUIMessageChunk(data: UIMessageStreamData) {
    const { sessionId, messageId, chunk } = data

    if (chunk.type === 'part') {
      // Get or create stream state
      let streamState = uiStreamState.value.get(sessionId)
      if (!streamState) {
        streamState = { messageId }
        uiStreamState.value.set(sessionId, streamState)
      }

      const part = chunk.part
      const partIndex = chunk.partIndex
      const msgs = getSessionUIMessagesRef(sessionId)
      const msg = msgs.find(m => m.id === messageId)

      if (part.type === 'text') {
        if (partIndex !== undefined) {
          streamState.textPartIndex = partIndex
          upsertUIMessagePart(sessionId, messageId, part, partIndex)
        } else if (msg) {
          const existingTextIndex = msg.parts.findIndex(p => p.type === 'text')
          if (existingTextIndex !== -1) {
            const existingText = msg.parts[existingTextIndex] as TextUIPart
            const updatedPart: TextUIPart = {
              type: 'text',
              text: existingText.text + (part as TextUIPart).text,
              state: (part as TextUIPart).state,
            }
            upsertUIMessagePart(sessionId, messageId, updatedPart, existingTextIndex)
          } else {
            upsertUIMessagePart(sessionId, messageId, part)
          }
        }
      } else if (part.type === 'reasoning') {
        if (partIndex !== undefined) {
          streamState.reasoningPartIndex = partIndex
          upsertUIMessagePart(sessionId, messageId, part, partIndex)
        } else if (msg) {
          const existingReasoningIndex = msg.parts.findIndex(p => p.type === 'reasoning')
          if (existingReasoningIndex !== -1) {
            const existingReasoning = msg.parts[existingReasoningIndex] as ReasoningUIPart
            const updatedPart: ReasoningUIPart = {
              type: 'reasoning',
              text: existingReasoning.text + (part as ReasoningUIPart).text,
              state: (part as ReasoningUIPart).state,
            }
            upsertUIMessagePart(sessionId, messageId, updatedPart, existingReasoningIndex)
          } else {
            upsertUIMessagePart(sessionId, messageId, part)
          }
        }
      } else if (part.type.startsWith('tool-')) {
        const toolPart = part as ToolUIPart
        if (msg) {
          const existingToolIndex = msg.parts.findIndex(
            p => p.type.startsWith('tool-') && (p as ToolUIPart).toolCallId === toolPart.toolCallId
          )
          if (existingToolIndex !== -1) {
            upsertUIMessagePart(sessionId, messageId, part, existingToolIndex)
          } else {
            upsertUIMessagePart(sessionId, messageId, part)
          }
        }
      } else {
        if (partIndex !== undefined) {
          upsertUIMessagePart(sessionId, messageId, part, partIndex)
        } else {
          upsertUIMessagePart(sessionId, messageId, part)
        }
      }
    } else if (chunk.type === 'finish') {
      // Stream finished — clean up UI stream state and finalize parts
      uiStreamState.value.delete(sessionId)

      const msgs = getSessionUIMessagesRef(sessionId)
      const msg = msgs.find(m => m.id === messageId)
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
        // Store usage on UIMessage metadata
        const updatedMetadata = chunk.usage
          ? { timestamp: Date.now(), ...msg.metadata, usage: chunk.usage }
          : msg.metadata
        updateUIMessage(sessionId, messageId, { parts: updatedParts, metadata: updatedMetadata })
      }
    }
  }

  /**
   * Get UIMessages for a session (reactive computed)
   */
  function getSessionUIMessages(sessionId: string) {
    return computed(() => sessionUIMessages.value.get(sessionId) || [])
  }

  /**
   * Find a step by ID in a nested step structure
   */
  function findStepById(steps: Step[], stepId: string): Step | null {
    for (const step of steps) {
      if (step.id === stepId) return step
      // Search in child steps recursively
      if (step.childSteps?.length) {
        const found = findStepById(step.childSteps, stepId)
        if (found) return found
      }
    }
    return null
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

    // Check if this is a child step (has parentStepId)
    if (step.parentStepId) {
      // Find parent step INDEX (not reference) to replace entire object for Vue reactivity
      const parentIndex = message.steps.findIndex(s => s.id === step.parentStepId)
      if (parentIndex >= 0) {
        const parentStep = message.steps[parentIndex]
        const existingChildSteps = parentStep.childSteps || []

        // Check for duplicates in childSteps
        const existingChildIndex = existingChildSteps.findIndex(
          s => s.id === step.id || s.toolCallId === step.toolCallId
        )

        let newChildSteps: Step[]
        if (existingChildIndex >= 0) {
          // Update existing child step
          newChildSteps = [...existingChildSteps]
          newChildSteps[existingChildIndex] = { ...existingChildSteps[existingChildIndex], ...step }
        } else {
          // Add new child step
          newChildSteps = [...existingChildSteps, step]
        }

        // Replace entire parent step object to trigger Vue reactivity
        message.steps[parentIndex] = {
          ...parentStep,
          childSteps: newChildSteps,
        }
        message.steps = [...message.steps]
        setSessionMessages(sessionId, [...messages])
        return
      }
      // If parent not found, fall through to add as top-level step
    }

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
        if (lastPart && (lastPart.type === 'waiting' || lastPart.type === 'loading-memory')) {
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

    // First try top-level steps
    const stepIndex = message.steps.findIndex(s => s.id === stepId)
    if (stepIndex !== -1) {
      message.steps[stepIndex] = { ...message.steps[stepIndex], ...updates }
      message.steps = [...message.steps]
      setSessionMessages(sessionId, [...messages])
      return
    }

    // If not found in top-level, search in nested childSteps
    // Need to find parent step and replace it entirely for Vue reactivity
    const parentIndex = message.steps.findIndex(s =>
      s.childSteps?.some(c => c.id === stepId)
    )
    if (parentIndex >= 0) {
      const parentStep = message.steps[parentIndex]
      const childIndex = parentStep.childSteps!.findIndex(c => c.id === stepId)
      if (childIndex >= 0) {
        // Create new childSteps array with updated child
        const newChildSteps = [...parentStep.childSteps!]
        newChildSteps[childIndex] = { ...newChildSteps[childIndex], ...updates }

        // Replace parent step object to trigger Vue reactivity
        message.steps[parentIndex] = {
          ...parentStep,
          childSteps: newChildSteps,
        }
        message.steps = [...message.steps]
        setSessionMessages(sessionId, [...messages])
      }
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
   * Note: If this session has an active stream, we preserve the in-memory
   * streaming message to maintain UI state continuity during session switches
   */
  async function loadMessages(sessionId: string) {
    try {
      const response = await window.electronAPI.getSession(sessionId)
      if (response.success && response.session) {
        const messages = response.session.messages || []

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
    const messages = rawMessages || []

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
          lastInputTokens: response.usage.lastInputTokens || 0,
          contextSize: response.usage.contextSize || 0,
        })
        triggerRef(sessionUsageMap)
      }
    } catch (error) {
      console.error('[Chat Store] Failed to load session usage:', error)
    }
  }

  /**
   * Handle context size update from backend (real-time during tool loops)
   */
  function handleContextSizeUpdated(data: { sessionId: string; contextSize: number }) {
    const { sessionId, contextSize } = data
    const currentUsage = sessionUsageMap.value.get(sessionId)
    if (currentUsage) {
      // Update existing usage entry
      sessionUsageMap.value.set(sessionId, {
        ...currentUsage,
        contextSize,
      })
    } else {
      // Initialize usage entry if it doesn't exist yet
      // This handles the case where the IPC event arrives before loadSessionUsage completes
      sessionUsageMap.value.set(sessionId, {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        lastInputTokens: 0,
        contextSize,
      })
    }
    triggerRef(sessionUsageMap)
  }

  /**
   * Handle context compact started from backend
   */
  function handleContextCompactStarted(data: { sessionId: string }) {
    const { sessionId } = data
    console.log(`[ChatStore] Context compacting started for session: ${sessionId}`)
    setSessionCompacting(sessionId, true)
  }

  /**
   * Handle context compact completed from backend
   */
  async function handleContextCompactCompleted(data: { sessionId: string; success: boolean; error?: string; summary?: string }) {
    const { sessionId, success, error } = data
    console.log(`[ChatStore] Context compacting completed for session: ${sessionId}, success: ${success}`)
    setSessionCompacting(sessionId, false)

    if (success) {
      // Reload messages to get the persisted compact system message
      // This ensures UI shows the message at the correct position
      await loadMessages(sessionId)
      console.log(`[ChatStore] Reloaded messages after compacting for session: ${sessionId}`)
    } else if (error) {
      console.warn(`[ChatStore] Context compacting failed: ${error}`)
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

    // Add to session messages (legacy)
    const messages = getSessionMessagesRef(sessionId)
    messages.push(userMessage)
    setSessionMessages(sessionId, [...messages])

    // Add to UIMessages (the actual data source for UI components)
    addUIMessage(sessionId, chatMessageToUIMessage(userMessage))

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
          role: 'assistant',
          content: response.error || 'Failed to send message',
          timestamp: Date.now(),
          errorDetails: response.errorDetails,
          errorCategory: response.errorCategory,
          retryable: response.retryable,
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
        // Also update in UIMessages
        updateUIMessage(sessionId, userMessage.id, chatMessageToUIMessage(response.userMessage))
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

      // Also create UIMessage for the assistant (so streaming chunks can update it)
      addUIMessage(sessionId, {
        id: messageId,
        role: 'assistant',
        parts: [],
        metadata: { timestamp: Date.now() },
      })

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

      // Sync UIMessages: keep only up to and including this message
      const uiMsgs = getSessionUIMessagesRef(sessionId)
      const uiIndex = uiMsgs.findIndex(m => m.id === messageId)
      if (uiIndex !== -1) {
        setSessionUIMessages(sessionId, uiMsgs.slice(0, uiIndex + 1))
      }
    }

    // Reload session usage after truncation (backend subtracts deleted messages' tokens)
    await loadSessionUsage(sessionId)

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
          role: 'assistant',
          content: response.error || 'Failed to edit and resend',
          timestamp: Date.now(),
          errorDetails: response.errorDetails,
          errorCategory: response.errorCategory,
          retryable: response.retryable,
        }
        messages.push(errorMessage)
        setSessionMessages(sessionId, [...messages])
        addUIMessage(sessionId, chatMessageToUIMessage(errorMessage))

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

      // Also create UIMessage for the assistant (so streaming chunks can update it)
      addUIMessage(sessionId, {
        id: editMessageId,
        role: 'assistant',
        parts: [],
        metadata: { timestamp: Date.now() },
      })

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
    triggerRef(sessionMessages)
  }

  /**
   * Add a local-only message (not saved to backend)
   * Used for system messages like /files command output
   */
  function addLocalMessage(sessionId: string, message: { role: 'system' | 'assistant'; content: string; errorDetails?: string }) {
    const messages = getSessionMessagesRef(sessionId)
    const localMessage: ChatMessage = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      sessionId,  // Include sessionId for context isolation
      role: message.role,
      content: message.content,
      timestamp: Date.now(),
      errorDetails: message.errorDetails,
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
    isSessionCompacting,

    // UI State (for AgentExecutionPanel)
    expandedAgentPanels,
    expandedToolCalls,
    isAgentPanelExpanded,
    toggleAgentPanel,
    setAgentPanelExpanded,
    isToolCallExpanded,
    toggleToolCall,
    collapseAllToolCalls,

    // Event handlers (called by IPC Hub)
    handleStreamFinish,
    handleStreamErrorFromUIMessage,
    handleUIMessageChunk,
    handleStepAdded,
    handleStepUpdated,
    handleSkillActivated,
    handleContextSizeUpdated,
    handleContextCompactStarted,
    handleContextCompactCompleted,

    // UIMessage state (merged from UIMessagesStore, Phase 3 REQ-005)
    sessionUIMessages,
    getSessionUIMessages,
    loadUIMessages,
    clearSessionUIMessages,
    addUIMessage,
    updateUIMessage,
    upsertUIMessagePart,
    updateUIMessageToolPart,

    // Actions
    loadMessages,
    setMessagesFromSession,
    loadSessionUsage,
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
  }
})
