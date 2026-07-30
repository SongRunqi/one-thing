import { platformApi } from '@/platform'
/**
 * Global IPC Event Hub
 *
 * Registers IPC listeners at app startup to ensure:
 * 1. Listeners are registered before any IPC calls (no race conditions)
 * 2. All events route to central store (single source of truth)
 * 3. No per-message listener setup/teardown needed
 *
 * Phase 4c: All events use unified session:event + session:stream channels.
 * Legacy individual channels fully removed.
 */

import { useChatStore } from '@/stores/chat'
import type { SessionEventEnvelope } from '@shared/events/index.js'

let initialized = false

function shouldDebugStream(): boolean {
  try {
    return localStorage.getItem('onething:debug-stream') === '1'
  } catch {
    return false
  }
}

function logTime(): string {
  return new Date().toISOString()
}

function previewText(value: unknown, maxLength = 240): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

const debugLastChunkAt = new Map<string, number>()

function debugGapMs(key: string, now = Date.now()): number | undefined {
  const previous = debugLastChunkAt.get(key)
  debugLastChunkAt.set(key, now)
  return previous === undefined ? undefined : now - previous
}

export function initializeIPCHub() {
  if (initialized) {
    console.log('[IPC Hub] Already initialized, skipping')
    return
  }
  initialized = true

  // ── Unified event channel ─────────────────────
  // All structured events (steps, tools, stream lifecycle, etc.)
  platformApi.onSessionEvent((envelope: SessionEventEnvelope) => {
    const store = useChatStore()
    const { sessionId, event } = envelope

    switch (event.type) {
      // Stream lifecycle
      case 'stream:complete':
        if (shouldDebugStream()) {
          console.log('[IPC Hub] session:event stream:complete', { sessionId, event })
        }
        store.handleStreamComplete({ sessionId, ...event.data })
        break

      case 'stream:error':
        if (shouldDebugStream()) {
          console.log('[IPC Hub] session:event stream:error', { sessionId, event })
        }
        store.handleStreamError({ sessionId, ...event.data })
        break

      case 'stream:aborted':
        store.handleStreamComplete({ sessionId, aborted: true })
        break

      case 'stream:start':
        if (shouldDebugStream()) {
          console.log('[IPC Hub] session:event stream:start', {
            time: logTime(),
            sessionId,
            messageId: event.messageId || event.assistantMessageId,
          })
        }
        store.handleStreamStarted({ sessionId, messageId: event.messageId || event.assistantMessageId })
        break

      // Tool events → mapped to stream chunk format for store compatibility
      case 'tool:call':
        store.handleStreamChunk({ type: 'tool_call', sessionId, messageId: '', content: '', toolCall: event.toolCall })
        break

      case 'tool:result':
        store.handleStreamChunk({ type: 'tool_result', sessionId, messageId: '', content: '', toolCall: event.toolCall })
        break

      case 'tool:input-start':
        store.handleStreamChunk({
          type: 'tool_input_start', sessionId, messageId: '', content: '',
          toolCallId: event.toolCallId, toolName: event.toolName, toolCall: event.toolCall,
        })
        break

      case 'tool:input-end':
        store.handleStreamChunk({
          type: 'tool_input_end', sessionId, messageId: '', content: '',
          toolCallId: event.toolCallId, toolCall: event.toolCall,
        })
        break

      case 'tool:execution-start':
        store.handleToolExecutionStart({ sessionId, messageId: '', ...event })
        break

      case 'tool:execution-update':
        store.handleToolExecutionUpdate({ sessionId, messageId: '', ...event })
        break

      case 'tool:execution-end':
        store.handleToolExecutionEnd({ sessionId, messageId: '', ...event })
        break

      // Content events → mapped to stream chunk format
      case 'content:part':
        store.handleStreamChunk({ type: 'content_part', sessionId, messageId: '', content: '', contentPart: event.part })
        break

      case 'content:continuation':
        store.handleStreamChunk({ type: 'continuation', sessionId, messageId: '', content: '', turnIndex: event.turnIndex })
        break

      // Step events
      case 'step:added':
        store.handleStepAdded({ sessionId, messageId: '', step: event.step })
        break

      case 'step:updated':
        store.handleStepUpdated({ sessionId, messageId: '', stepId: event.stepId, updates: event.updates })
        break

      // Skill events
      case 'skill:activated':
        store.handleSkillActivated({ sessionId, messageId: '', skillName: event.skillName })
        break

      // Permission events
      case 'permission:request':
        store.handlePermissionRequest({
          sessionId,
          requestId: event.requestId,
          messageId: event.messageId,
          callId: event.toolCallId,
          permissionType: event.permissionType,
          title: event.title,
          pattern: event.pattern,
          metadata: event.metadata,
          canRespond: event.targetChannel === 'ipc',
        })
        break

      case 'permission:queued':
        store.handlePermissionQueued({
          sessionId,
          requestId: event.requestId,
          messageId: event.messageId,
          toolCallId: event.toolCallId,
        })
        break

      case 'permission:settled':
        store.handlePermissionSettled({
          sessionId,
          requestId: event.requestId,
          toolCallIds: event.toolCallIds,
          decision: event.decision,
        })
        break

      // Message lifecycle events (event-driven message creation)
      case 'message:user-created':
        refreshSessionListIfUnknown(sessionId)
        noteReadWatermark(sessionId, (event as any).message)
        store.handleMessageCreated({ sessionId, message: (event as any).message })
        break

      case 'message:created':
        noteReadWatermark(sessionId, (event as any).message)
        store.handleMessageCreated({ sessionId, message: (event as any).message })
        break

      case 'message:assistant-created':
        noteReadWatermark(sessionId, (event as any).message)
        store.handleAssistantCreated({ sessionId, message: (event as any).message })
        break

      case 'message:updated':
        store.updateSessionMessage(sessionId, (event as any).messageId, (event as any).updates)
        break

      case 'message:deleted':
        store.handleMessageDeleted({ sessionId, messageId: (event as any).messageId })
        break

      // Steering lifecycle: track which persisted steer messages are still
      // pending in the queue (retractable before the next loop turn).
      case 'steering:queued':
        store.handleSteeringQueued({ sessionId, messageId: (event as any).messageId })
        break

      case 'steering:consumed':
        store.handleSteeringConsumed({ sessionId, messageIds: (event as any).messageIds })
        break

      case 'steering:retracted':
        store.handleSteeringConsumed({ sessionId, messageIds: [(event as any).messageId] })
        break

      case 'messages:replaced':
        store.handleMessagesReplaced({ sessionId, messages: (event as any).messages })
        break

      case 'session:renamed':
        store.handleSessionRenamed({ sessionId, name: (event as any).name })
        break

      case 'request:snapshot':
        console.log('[IPCHub] request:snapshot', sessionId, (event as any).snapshot?.turn)
        store.handleRequestSnapshot({ sessionId, snapshot: (event as any).snapshot })
        break

      case 'context:size-updated':
        // Per-turn input-token usage. Inspector's Context tab uses
        // contextSize as "last turn input" against the model's window.
        import('@/stores/sessions').then(({ useSessionsStore }) => {
          useSessionsStore().updateSessionTokenStats(sessionId, {
            contextSize: (event as any).contextSize,
            lastInputTokens: (event as any).contextSize,
          })
        })
        break

      case 'session:variables-updated':
        import('@/stores/sessions').then(({ useSessionsStore }) => {
          useSessionsStore().updateSessionVariables(sessionId, {
            workingDirectory: (event as any).workingDirectory,
            workingDirectoryRoots: (event as any).workingDirectoryRoots,
            variables: (event as any).variables,
          })
        })
        break

      case 'session:goal-updated':
        import('@/stores/sessions').then(({ useSessionsStore }) => {
          useSessionsStore().updateSessionGoal(
            sessionId,
            (event as any).goal ?? null,
            (event as any).goals,
          )
        })
        break
    }
  })

  // ── Unified stream channel ────────────────────
  // High-frequency chunks: text-delta, reasoning-delta, tool-input-delta
  // Already batched by IPCBridge (16ms coalescing), so route directly to store.
  platformApi.onSessionStream(({ sessionId, chunk }: { sessionId: string; chunk: any }) => {
    const store = useChatStore()
    if (shouldDebugStream()) {
      const text = typeof chunk.text === 'string'
        ? chunk.text
        : typeof chunk.reasoning === 'string'
          ? chunk.reasoning
          : typeof chunk.argsTextDelta === 'string'
            ? chunk.argsTextDelta
            : ''
      console.log('[IPC Hub] session:stream chunk', {
        time: logTime(),
        gapMs: debugGapMs(`${sessionId}:${chunk.messageId}:${chunk.type}`),
        sessionId,
        messageId: chunk.messageId,
        type: chunk.type,
        chars: text.length,
        text: previewText(text),
      })
    }

    switch (chunk.type) {
      case 'text-delta':
        store.handleStreamChunk({ type: 'text', sessionId, messageId: chunk.messageId || '', content: chunk.text, turnIndex: chunk.turnIndex })
        break

      case 'reasoning-delta':
        store.handleStreamChunk({ type: 'reasoning', sessionId, messageId: chunk.messageId || '', content: '', reasoning: chunk.reasoning, turnIndex: chunk.turnIndex, placement: chunk.placement })
        break

      case 'tool-input-delta':
        store.handleStreamChunk({ type: 'tool_input_delta', sessionId, messageId: chunk.messageId || '', content: '', toolCallId: chunk.toolCallId, argsTextDelta: chunk.argsTextDelta })
        break
    }
  })

  console.log('[IPC Hub] Unified listeners registered (session:event + session:stream)')
}

/**
 * 已读水位的唯一喂料口(docs/design/agent-im-dm.md P4)。
 *
 * 判定按**消息的 role**,不按事件名 —— 房间里 agent 的 say 走的正是
 * `message:user-created` 这条通道(`app/collab/say-tool.ts` 头注释),事件名在这里
 * 什么也证明不了。
 * - `user`      自己说的话(含网关那头的自己):推进水位,不是未读源;
 * - `assistant` 对方说话:未读源;
 * - `system`    预算/断路器/冻结这类机械台账(`postSystemLine`):既不是人说话,
 *               也不该让联系人行冒红点,一律不计。
 *
 * 只吃 message:* 落库事件,不碰流式 chunk —— 徽标因此不会在生成过程中闪。
 */
function noteReadWatermark(sessionId: string, message: unknown): void {
  const role = (message as { role?: string } | undefined)?.role
  if (role !== 'user' && role !== 'assistant') return
  const raw = (message as { timestamp?: number } | undefined)?.timestamp
  const at = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : Date.now()
  import('@/stores/sessions').then(({ useSessionsStore }) => {
    const sessionsStore = useSessionsStore()
    if (role === 'user') sessionsStore.markSessionRead(sessionId, at)
    else sessionsStore.noteInboundActivity(sessionId, at)
  }).catch(error => {
    console.error('[IPC Hub] Failed to update read watermark:', error)
  })
}

/**
 * Sessions created in the main process (gateway conversations, the radio DJ's
 * curation sessions, any future internal drives) never pass through the
 * renderer's own create flow — the first the renderer hears of them is a
 * message event for an id it does not know. Reload the list then, or the
 * session stays invisible until an app restart.
 */
function refreshSessionListIfUnknown(sessionId: string): void {
  import('@/stores/sessions').then(({ useSessionsStore }) => {
    const sessionsStore = useSessionsStore()
    if (sessionsStore.getSessionItem(sessionId)) return
    void sessionsStore.loadSessions()
  }).catch(error => {
    console.error('[IPC Hub] Failed to refresh session list:', error)
  })
}
