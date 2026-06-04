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
import { perfMark, perfMeasure } from '@/utils/perf'
import type {
  ChatMessage,
  GetSessionMessagesPageResponse,
  GetSessionUserMarkersResponse,
  MessageAttachment,
  Step,
  ToolPartialResult,
  ToolResult,
  ContentPart,
  UserMessageMarker,
} from '@/types'
import {
  appendOrMergeReasoning,
  appendOrMergeText,
  appendReasoningIfMissing,
  appendToolCallPlaceholder,
  popTrailingTransient,
  pushImageLoading,
  pushDataStepsIfMissing,
  pushLoadingMemory,
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
  turnIndex?: number
  placement?: 'top' | 'inline'
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

interface ToolExecutionStartData {
  sessionId: string
  messageId: string
  toolCallId: string
  stepId: string
  toolName: string
  args: Record<string, unknown>
}

interface ToolExecutionUpdateData {
  sessionId: string
  messageId: string
  toolCallId: string
  stepId: string
  partialResult: ToolPartialResult
}

interface ToolExecutionEndData {
  sessionId: string
  messageId: string
  toolCallId: string
  stepId: string
  result?: ToolResult
  isError?: boolean
  error?: string
}

// Skill activation data from IPC
interface SkillActivatedData {
  sessionId: string
  messageId: string
  skillName: string
}

interface PermissionRequestData {
  sessionId: string
  requestId: string
  messageId: string
  callId?: string
  permissionType: string
  title: string
  pattern?: string | string[]
  metadata: Record<string, unknown>
  canRespond: boolean
}

export const useChatStore = defineStore('chat', () => {
  // ============ Per-session 状态 ============

  // Messages per session
  const sessionMessages = ref<Map<string, ChatMessage[]>>(new Map())

  interface SessionMessagePageState {
    nextCursor: string | null
    backwardsCursor: string | null
    hasMoreBefore: boolean
    hasMoreAfter: boolean
    totalCount: number
    isLoadingOlder: boolean
  }

  const sessionMessagePages = ref<Map<string, SessionMessagePageState>>(new Map())
  const sessionUserMarkers = ref<Map<string, UserMessageMarker[]>>(new Map())

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

  interface ComposerDraft {
    messageInput: string
    quotedText: string
    attachments: MessageAttachment[]
  }

  const composerDrafts = ref<Map<string, ComposerDraft>>(new Map())
  const pendingPermissionRequests = new Map<string, PermissionRequestData[]>()

  // Chunks can arrive before the assistant-created event during HMR/replay or
  // very tight event timing. Keep them until the target message exists.
  const pendingStreamChunks = new Map<string, Map<string, StreamChunk[]>>()

  function normalizeComposerDraft(draft: Partial<ComposerDraft>): ComposerDraft {
    return {
      messageInput: draft.messageInput ?? '',
      quotedText: draft.quotedText ?? '',
      attachments: draft.attachments ? [...draft.attachments] : [],
    }
  }

  function isEmptyComposerDraft(draft: ComposerDraft): boolean {
    return !draft.messageInput.trim() && !draft.quotedText.trim() && draft.attachments.length === 0
  }

  function setComposerDraft(sessionId: string, draft: Partial<ComposerDraft>) {
    if (!sessionId) return
    const normalized = normalizeComposerDraft(draft)
    if (isEmptyComposerDraft(normalized)) {
      composerDrafts.value.delete(sessionId)
    } else {
      composerDrafts.value.set(sessionId, normalized)
    }
    triggerRef(composerDrafts)
  }

  function getComposerDraft(sessionId: string): ComposerDraft | null {
    const draft = composerDrafts.value.get(sessionId)
    return draft ? normalizeComposerDraft(draft) : null
  }

  function clearComposerDraft(sessionId: string) {
    if (!composerDrafts.value.delete(sessionId)) return
    triggerRef(composerDrafts)
  }

  function isComposerDraftEmpty(sessionId: string): boolean {
    const draft = composerDrafts.value.get(sessionId)
    return !draft || isEmptyComposerDraft(draft)
  }

  /** Resolve messageId: use provided value or fallback to activeStreams lookup */
  function resolveMessageId(sessionId: string, messageId?: string): string {
    return (messageId && messageId !== '') ? messageId : (activeStreams.value.get(sessionId) || '')
  }

  function queuePendingStreamChunk(sessionId: string, messageId: string, chunk: StreamChunk) {
    let byMessage = pendingStreamChunks.get(sessionId)
    if (!byMessage) {
      byMessage = new Map()
      pendingStreamChunks.set(sessionId, byMessage)
    }
    const key = messageId || '__active__'
    const queued = byMessage.get(key) || []
    queued.push(chunk)
    byMessage.set(key, queued)
  }

  function flushPendingStreamChunks(sessionId: string, messageId: string) {
    const byMessage = pendingStreamChunks.get(sessionId)
    if (!byMessage) return

    const chunks = [
      ...(byMessage.get(messageId) || []),
      ...(byMessage.get('__active__') || []),
    ]
    byMessage.delete(messageId)
    byMessage.delete('__active__')
    if (byMessage.size === 0) pendingStreamChunks.delete(sessionId)

    for (const chunk of chunks) {
      handleStreamChunk({ ...chunk, messageId: chunk.messageId || messageId })
    }
  }

  function clearPendingStreamChunks(sessionId: string, messageId?: string) {
    if (!messageId) {
      pendingStreamChunks.delete(sessionId)
      return
    }

    const byMessage = pendingStreamChunks.get(sessionId)
    if (!byMessage) return
    byMessage.delete(messageId)
    byMessage.delete('__active__')
    if (byMessage.size === 0) pendingStreamChunks.delete(sessionId)
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

  const pendingScrollBump = new Set<string>()
  const scheduleFrame = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16)

  function bumpScrollVersion(sessionId: string) {
    if (pendingScrollBump.has(sessionId)) return
    pendingScrollBump.add(sessionId)
    scheduleFrame(() => {
      pendingScrollBump.delete(sessionId)
      sessionScrollVersion.value.set(sessionId, getScrollVersion(sessionId) + 1)
    })
  }

  const TOOL_INPUT_DELTA_SEPARATOR = '\u0000'
  const pendingToolInputDeltas = new Map<string, string>()
  let pendingToolInputFlushFrame: number | null = null

  function toolInputDeltaKey(sessionId: string, messageId: string, toolCallId: string): string {
    return [sessionId, messageId, toolCallId].join(TOOL_INPUT_DELTA_SEPARATOR)
  }

  function parseToolInputDeltaKey(key: string): { sessionId: string; messageId: string; toolCallId: string } {
    const [sessionId, messageId, toolCallId] = key.split(TOOL_INPUT_DELTA_SEPARATOR)
    return { sessionId, messageId, toolCallId }
  }

  function queueToolInputDelta(sessionId: string, messageId: string, toolCallId: string, delta: string) {
    const key = toolInputDeltaKey(sessionId, messageId, toolCallId)
    pendingToolInputDeltas.set(key, (pendingToolInputDeltas.get(key) || '') + delta)
    if (pendingToolInputFlushFrame !== null) return
    pendingToolInputFlushFrame = scheduleFrame(() => {
      pendingToolInputFlushFrame = null
      flushToolInputDeltas()
    }) as unknown as number
  }

  function flushToolInputDeltas(sessionId?: string, messageId?: string, toolCallId?: string) {
    if (pendingToolInputDeltas.size === 0) return

    const touchedSessions = new Set<string>()
    for (const [key, delta] of Array.from(pendingToolInputDeltas.entries())) {
      const parsed = parseToolInputDeltaKey(key)
      if (sessionId && parsed.sessionId !== sessionId) continue
      if (messageId && parsed.messageId !== messageId) continue
      if (toolCallId && parsed.toolCallId !== toolCallId) continue

      if (!delta) continue

      const messages = getSessionMessagesRef(parsed.sessionId)
      const message = messages.find(m => m.id === parsed.messageId)
      const toolCall = message?.toolCalls?.find(tc => tc.id === parsed.toolCallId)
      if (!message || !toolCall || toolCall.status !== 'input-streaming') continue

      pendingToolInputDeltas.delete(key)
      toolCall.streamingArgs = (toolCall.streamingArgs || '') + delta
      if (message.steps) {
        for (const step of message.steps) {
          if (step.toolCallId === parsed.toolCallId) {
            step.toolCall = toolCall
          }
        }
      }
      if (message.toolCalls) message.toolCalls = [...message.toolCalls]
      if (message.steps) message.steps = [...message.steps]
      if (message.contentParts) message.contentParts = [...message.contentParts]
      touchedSessions.add(parsed.sessionId)
    }

    for (const touchedSessionId of touchedSessions) {
      const messages = getSessionMessagesRef(touchedSessionId)
      setSessionMessages(touchedSessionId, [...messages])
      bumpScrollVersion(touchedSessionId)
    }
  }

  function clearToolInputDeltas(sessionId: string, messageId?: string) {
    for (const key of Array.from(pendingToolInputDeltas.keys())) {
      const parsed = parseToolInputDeltaKey(key)
      if (parsed.sessionId !== sessionId) continue
      if (messageId && parsed.messageId !== messageId) continue
      pendingToolInputDeltas.delete(key)
    }
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

  // Session UI snapshots. Tail is a semantic state; only detached sessions keep
  // an anchor. DOM indexes are local to the loaded window and are not global
  // conversation positions.
  interface SessionUISnapshot {
    mode: 'tail' | 'anchor'
    anchorMessageId?: string
    offsetWithinMessage?: number
    navMessageId?: string
    hasNavigated: boolean
    messageInput: string
    quotedText: string
    attachments?: MessageAttachment[]
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

  function cachePendingPermissionRequest(data: PermissionRequestData): void {
    const requests = pendingPermissionRequests.get(data.sessionId) || []
    const existingIndex = requests.findIndex(req => req.requestId === data.requestId)
    if (existingIndex >= 0) {
      requests[existingIndex] = data
    } else {
      requests.push(data)
    }
    pendingPermissionRequests.set(data.sessionId, requests)
  }

  function findToolCallForPermission(message: ChatMessage, data: PermissionRequestData) {
    let toolCall = message.toolCalls?.find(tc => tc.id === data.callId)
    if (!toolCall && data.metadata.command) {
      toolCall = message.toolCalls?.find(tc =>
        tc.arguments?.command === data.metadata.command
      )
    }
    return toolCall
  }

  function applyPermissionRequest(data: PermissionRequestData, cacheIfMissing = true): boolean {
    const messages = getSessionMessagesRef(data.sessionId)
    const message = messages.find(m => m.id === data.messageId)
    if (!message) {
      if (cacheIfMissing) {
        cachePendingPermissionRequest(data)
        console.log('[Chat Store] Cached permission request until message exists:', data.messageId)
      }
      return false
    }

    const toolCall = findToolCallForPermission(message, data)
    if (!toolCall) {
      if (cacheIfMissing) {
        cachePendingPermissionRequest(data)
        console.log('[Chat Store] Cached permission request until tool call exists:', data.callId)
      }
      return false
    }

    toolCall.permissionId = data.requestId
    toolCall.canRespond = data.canRespond
    toolCall.requiresConfirmation = true
    toolCall.status = 'pending'

    const step = message.steps?.find(s => s.toolCallId === toolCall.id)
    if (step) {
      step.status = 'awaiting-confirmation'
      if (data.metadata && (data.metadata.diff || data.metadata.path)) {
        step.result = JSON.stringify(data.metadata)
      }
      if (message.steps) {
        message.steps = [...message.steps]
      }
    }

    triggerRef(sessionMessages)
    console.log('[Chat Store] Updated tool call with permission request:', toolCall.id, 'canRespond:', data.canRespond)
    return true
  }

  function applyPendingPermissionRequests(sessionId: string, messageId: string): void {
    const requests = pendingPermissionRequests.get(sessionId)
    if (!requests?.length) return

    const remaining: PermissionRequestData[] = []
    for (const request of requests) {
      if (request.messageId !== messageId || !applyPermissionRequest(request, false)) {
        remaining.push(request)
      }
    }

    if (remaining.length > 0) {
      pendingPermissionRequests.set(sessionId, remaining)
    } else {
      pendingPermissionRequests.delete(sessionId)
    }
  }

  function setSessionPageState(
    sessionId: string,
    page: GetSessionMessagesPageResponse,
    isLoadingOlder = false,
  ) {
    sessionMessagePages.value.set(sessionId, {
      nextCursor: page.nextCursor ?? null,
      backwardsCursor: page.backwardsCursor ?? null,
      hasMoreBefore: !!page.hasMoreBefore,
      hasMoreAfter: !!page.hasMoreAfter,
      totalCount: page.totalCount ?? page.messages?.length ?? 0,
      isLoadingOlder,
    })
    triggerRef(sessionMessagePages)
  }

  function updateSessionPageState(sessionId: string, updates: Partial<SessionMessagePageState>) {
    const current = sessionMessagePages.value.get(sessionId)
    if (!current) return
    sessionMessagePages.value.set(sessionId, { ...current, ...updates })
    triggerRef(sessionMessagePages)
  }

  function getSessionPageState(sessionId: string): SessionMessagePageState | undefined {
    return sessionMessagePages.value.get(sessionId)
  }

  function mergeActiveStreamingMessage(sessionId: string, messages: ChatMessage[]): ChatMessage[] {
    const activeStreamMessageId = activeStreams.value.get(sessionId)
    if (!activeStreamMessageId) return messages

    const existingMessages = sessionMessages.value.get(sessionId) || []
    const streamingMessage = existingMessages.find(m => m.id === activeStreamMessageId)
    if (!streamingMessage) return messages

    const index = messages.findIndex(m => m.id === activeStreamMessageId)
    if (index !== -1) {
      messages[index] = streamingMessage
    } else {
      messages.push(streamingMessage)
    }
    return messages
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
    const debugToolInput = (import.meta as any).env?.VITE_DEBUG_TOOL_INPUT === 'true'
    if (debugToolInput && (chunk.type === 'tool_input_start' || chunk.type === 'tool_input_delta')) {
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
    if (!resolvedMsgId) {
      queuePendingStreamChunk(sessionId, '', chunk)
      return
    }

    const messageIndex = messages.findIndex(m => m.id === resolvedMsgId)
    if (messageIndex === -1) {
      queuePendingStreamChunk(sessionId, resolvedMsgId, chunk)
      return
    }

    perfMark('chunk-start')
    const message = messages[messageIndex]
    if (chunk.type !== 'tool_input_delta') {
      flushToolInputDeltas(sessionId, resolvedMsgId, chunk.toolCallId)
    }
    let shouldBumpScroll = true

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
        appendOrMergeText(parts, chunk.content, chunk.turnIndex)
        message.contentParts = [...parts]
      }
    } else if (chunk.type === 'reasoning') {
      const reasoning = chunk.reasoning || ''
      const placement = chunk.placement ?? (message.content ? 'inline' : 'top')
      if (placement === 'top') {
        message.reasoning = (message.reasoning || '') + reasoning
      } else if (reasoning) {
        appendOrMergeReasoning(parts, reasoning, chunk.turnIndex)
        message.contentParts = [...parts]
      }
    } else if (chunk.type === 'tool_call' || chunk.type === 'tool_result') {
      if (chunk.toolCall) {
        // Merge into the canonical entry in place so any step.toolCall
        // referencing the same id sees the update without manual mirror writes.
        const canonical = upsertMessageToolCall(message, chunk.toolCall)
        upsertToolCall(parts, canonical)
        message.contentParts = [...parts]
        applyPendingPermissionRequests(sessionId, message.id)
      }
    } else if (chunk.type === 'continuation') {
      pushWaiting(parts, chunk.turnIndex)
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
        applyPendingPermissionRequests(sessionId, message.id)
      }
    } else if (chunk.type === 'tool_input_delta') {
      // Streaming tool input can arrive in very small deltas. Batch the
      // expensive reactive writes to one frame, then flush before any final
      // tool event so the UI never misses the tail.
      if (chunk.toolCallId && chunk.argsTextDelta) {
        queueToolInputDelta(sessionId, resolvedMsgId, chunk.toolCallId, chunk.argsTextDelta)
      }
      shouldBumpScroll = false
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
      } else if (newPart.type === 'reasoning') {
        appendReasoningIfMissing(parts, newPart.content)
        message.contentParts = [...parts]
      } else if (newPart.type === 'image-loading') {
        pushImageLoading(parts, newPart.turnIndex, newPart.label)
        message.contentParts = [...parts]
      } else if (newPart.type === 'loading-memory') {
        pushLoadingMemory(parts)
        message.contentParts = [...parts]
      } else if (newPart.type === 'waiting') {
        pushWaiting(parts, newPart.turnIndex)
        message.contentParts = [...parts]
      }
    }

    perfMark('chunk-end')
    perfMeasure('handleStreamChunk', 'chunk-start', 'chunk-end')
    if (shouldBumpScroll) bumpScrollVersion(sessionId)
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
      flushPendingStreamChunks(sessionId, message.id)
      flushToolInputDeltas(sessionId, message.id)
      stopMessageStreaming(message, data.usage)
      setSessionMessages(sessionId, [...messages])
    } else {
      clearPendingStreamChunks(sessionId, resolvedMsgId)
      clearToolInputDeltas(sessionId, resolvedMsgId)
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
    clearPendingStreamChunks(sessionId)
    clearToolInputDeltas(sessionId)
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
    const resolvedMsgId = resolveMessageId(sessionId, data.messageId)
    if (resolvedMsgId) flushToolInputDeltas(sessionId, resolvedMsgId)

    if (data.preserved) {
      // Message content is preserved in backend — just attach error details and stop streaming
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
    clearPendingStreamChunks(sessionId)
    clearToolInputDeltas(sessionId)
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
    flushToolInputDeltas(sessionId, message.id, step.toolCallId)

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
    const linkedStep = message.steps.find(s => s.id === step.id || s.toolCallId === step.toolCallId)
    if (linkedStep?.toolCall?.requiresConfirmation) {
      linkedStep.status = 'awaiting-confirmation'
    }
    message.steps = [...message.steps]

    // Add steps placeholder to contentParts if needed
    if (message.contentParts && step.turnIndex !== undefined) {
      if (pushDataStepsIfMissing(message.contentParts, step.turnIndex)) {
        message.contentParts = [...message.contentParts]
      }
    }

    applyPendingPermissionRequests(sessionId, message.id)

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
    flushToolInputDeltas(sessionId, message.id, updates?.toolCallId)

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

  function findMessageStep(sessionId: string, messageId: string, stepId: string, toolCallId?: string): { messages: ChatMessage[]; message: ChatMessage; stepIndex: number } | null {
    const messages = getSessionMessagesRef(sessionId)
    const resolvedMsgId = resolveMessageId(sessionId, messageId)
    const message = messages.find(m => m.id === resolvedMsgId)
    if (!message?.steps) return null
    const stepIndex = message.steps.findIndex(s => s.id === stepId || (!!toolCallId && s.toolCallId === toolCallId))
    if (stepIndex < 0) return null
    return { messages, message, stepIndex }
  }

  function patchStep(sessionId: string, messageId: string, stepId: string, toolCallId: string | undefined, updates: Partial<Step>): void {
    const found = findMessageStep(sessionId, messageId, stepId, toolCallId)
    if (!found) return
    const { messages, message, stepIndex } = found
    message.steps![stepIndex] = { ...message.steps![stepIndex], ...updates }
    linkStepsToToolCalls(message)
    message.steps = [...message.steps!]
    setSessionMessages(sessionId, [...messages])
    bumpScrollVersion(sessionId)
  }

  function handleToolExecutionStart(data: ToolExecutionStartData) {
    patchStep(data.sessionId, data.messageId, data.stepId, data.toolCallId, { status: 'running' })
  }

  function handleToolExecutionUpdate(data: ToolExecutionUpdateData) {
    patchStep(data.sessionId, data.messageId, data.stepId, data.toolCallId, {
      status: 'running',
      partialResult: data.partialResult,
      partialResultIsPartial: true,
    })
  }

  function handleToolExecutionEnd(data: ToolExecutionEndData) {
    patchStep(data.sessionId, data.messageId, data.stepId, data.toolCallId, {
      partialResult: data.result,
      partialResultIsPartial: false,
      ...(data.isError ? { error: data.error } : {}),
    })
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

  async function loadInitialMessagePage(sessionId: string, limit = 16): Promise<boolean> {
    sessionLoading.value.set(sessionId, true)
    triggerRef(sessionLoading)
    const totalStart = performance.now()
    let ipcMs = 0
    let rebuildMs = 0
    let setStateMs = 0
    try {
      const ipcStart = performance.now()
      const response = await window.electronAPI.getSessionMessagesPage({
        sessionId,
        anchor: 'tail',
        limit,
      })
      ipcMs = performance.now() - ipcStart
      if (!response.success) {
        console.warn('[Chat Store] Failed to load message page:', response.error)
        setSessionMessages(sessionId, [])
        setSessionPageState(sessionId, response)
        return false
      }

      const rebuildStart = performance.now()
      const messages = mergeActiveStreamingMessage(
        sessionId,
        (response.messages || []).map(rebuildContentParts),
      )
      rebuildMs = performance.now() - rebuildStart
      const setStateStart = performance.now()
      setSessionMessages(sessionId, messages)
      setSessionPageState(sessionId, response)
      setStateMs = performance.now() - setStateStart
      console.info('[Perf][SessionPage][renderer]', {
        sessionId,
        totalMs: Math.round(performance.now() - totalStart),
        ipcMs: Math.round(ipcMs),
        rebuildMs: Math.round(rebuildMs),
        setStateMs: Math.round(setStateMs),
        messages: messages.length,
        hasMoreBefore: !!response.hasMoreBefore,
        totalCount: response.totalCount,
      })
      return true
    } catch (error) {
      console.error('[Chat Store] Failed to load initial message page:', error)
      setSessionMessages(sessionId, [])
      return false
    } finally {
      sessionLoading.value.set(sessionId, false)
      triggerRef(sessionLoading)
    }
  }

  async function loadOlderMessages(sessionId: string, limit = 16): Promise<boolean> {
    const state = sessionMessagePages.value.get(sessionId)
    if (!state?.hasMoreBefore || !state.nextCursor || state.isLoadingOlder) return false

    updateSessionPageState(sessionId, { isLoadingOlder: true })
    try {
      const response = await window.electronAPI.getSessionMessagesPage({
        sessionId,
        cursor: state.nextCursor,
        direction: 'older',
        limit,
      })
      if (!response.success) {
        console.warn('[Chat Store] Failed to load older messages:', response.error)
        return false
      }

      const existing = sessionMessages.value.get(sessionId) || []
      const existingIds = new Set(existing.map(message => message.id))
      const older = (response.messages || [])
        .map(rebuildContentParts)
        .filter(message => !existingIds.has(message.id))

      if (older.length > 0) {
        setSessionMessages(sessionId, [...older, ...existing])
      }
      setSessionPageState(sessionId, response)
      return older.length > 0
    } catch (error) {
      console.error('[Chat Store] Failed to load older messages:', error)
      return false
    } finally {
      updateSessionPageState(sessionId, { isLoadingOlder: false })
    }
  }

  async function loadMessagesAround(
    sessionId: string,
    messageId: string,
    before = 4,
    after = 16,
  ): Promise<boolean> {
    sessionLoading.value.set(sessionId, true)
    triggerRef(sessionLoading)
    try {
      const response = await window.electronAPI.getSessionMessagesPage({
        sessionId,
        anchor: { messageId, before, after },
      })
      if (!response.success) {
        console.warn('[Chat Store] Failed to load message anchor page:', response.error)
        return false
      }

      const messages = mergeActiveStreamingMessage(
        sessionId,
        (response.messages || []).map(rebuildContentParts),
      )
      setSessionMessages(sessionId, messages)
      setSessionPageState(sessionId, response)
      return true
    } catch (error) {
      console.error('[Chat Store] Failed to load message anchor page:', error)
      return false
    } finally {
      sessionLoading.value.set(sessionId, false)
      triggerRef(sessionLoading)
    }
  }


  async function loadUserMessageMarkers(sessionId: string): Promise<UserMessageMarker[]> {
    try {
      const response: GetSessionUserMarkersResponse = await window.electronAPI.getSessionUserMarkers(sessionId)
      const markers = response.success ? (response.markers || []) : []
      sessionUserMarkers.value.set(sessionId, markers)
      triggerRef(sessionUserMarkers)
      return markers
    } catch (error) {
      console.error('[Chat Store] Failed to load user message markers:', error)
      return []
    }
  }

  /**
   * Set messages for a session directly (without IPC call)
   * Used when messages are already available (e.g., from switchSession response)
   * This avoids duplicate IPC calls
   */
  function setMessagesFromSession(sessionId: string, rawMessages: ChatMessage[]) {
    const messages = (rawMessages || []).map(rebuildContentParts)
    setSessionMessages(sessionId, mergeActiveStreamingMessage(sessionId, messages))
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
      const merged = { ...messages[messageIndex], ...updates }
      // A message that just finished streaming must not keep a transient
      // waiting/loading indicator. This covers the case where a continuation's
      // early waiting was emitted on a turn message that then gets finalized
      // (e.g. when context compaction starts a fresh assistant message).
      if (updates.isStreaming === false && merged.contentParts) {
        const cleaned = [...merged.contentParts]
        if (removeTransientIndicators(cleaned)) merged.contentParts = cleaned
      }
      messages[messageIndex] = merged
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

  function setSessionLoading(sessionId: string, loading: boolean) {
    sessionLoading.value.set(sessionId, loading)
    triggerRef(sessionLoading)
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
    flushPendingStreamChunks(sessionId, message.id)
  }

  /**
   * Handle stream:start event — establish active assistant id as early as possible.
   */
  function handleStreamStarted(data: { sessionId: string; messageId: string }) {
    const { sessionId, messageId } = data
    if (!sessionId || !messageId) return

    activeStreams.value.set(sessionId, messageId)
    sessionGenerating.value.set(sessionId, true)
    triggerRef(activeStreams)
    triggerRef(sessionGenerating)
    flushPendingStreamChunks(sessionId, messageId)
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
    applyPermissionRequest(data)
  }

  return {
    // Per-session state maps
    sessionMessages,
    sessionMessagePages,
    sessionUserMarkers,
    sessionLoading,
    sessionGenerating,
    sessionError,
    sessionErrorDetails,
    activeStreams,
    composerDrafts,

    // Getters
    getSessionState,
    isSessionGenerating,
    getSessionPageState,

    // UI State (per-session)
    isToolCallExpanded,
    toggleToolCall,
    collapseAllToolCalls,

    // Scroll trigger per session (incremented every handleStreamChunk for O(1) auto-scroll watcher)
    getScrollVersion,

    // Event handlers (called by IPC Hub)
    handleStreamChunk,
    handleStreamStarted,
    handleStreamComplete,
    handleStreamError,
    handleStepAdded,
    handleStepUpdated,
    handleToolExecutionStart,
    handleToolExecutionUpdate,
    handleToolExecutionEnd,
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
    loadInitialMessagePage,
    loadOlderMessages,
    loadMessagesAround,
    loadUserMessageMarkers,
    setMessagesFromSession,
    setSessionLoading,
    sendMessage,
    steerMessage,
    queueFollowUpMessage,
    editAndResend,
    regenerate,
    stopGeneration,
    updateSessionMessage,
    clearSessionError,
    clearSessionMessages,
    setComposerDraft,
    getComposerDraft,
    clearComposerDraft,
    isComposerDraftEmpty,
    addLocalMessage,
    addMessageToState,
    removeMessage,

    // Session UI snapshots
    saveSnapshot,
    getSnapshot,
    deleteSnapshot,
  }
})
