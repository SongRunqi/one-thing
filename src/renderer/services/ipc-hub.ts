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
import type { SessionEventEnvelope } from '../../shared/events/index.js'

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

      // Message lifecycle events (event-driven message creation)
      case 'message:user-created':
        refreshGatewaySessionList(sessionId)
        store.handleMessageCreated({ sessionId, message: (event as any).message })
        break

      case 'message:created':
        store.handleMessageCreated({ sessionId, message: (event as any).message })
        break

      case 'message:assistant-created':
        store.handleAssistantCreated({ sessionId, message: (event as any).message })
        break

      case 'message:updated':
        store.updateSessionMessage(sessionId, (event as any).messageId, (event as any).updates)
        break

      case 'message:deleted':
        store.handleMessageDeleted({ sessionId, messageId: (event as any).messageId })
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

function refreshGatewaySessionList(sessionId: string): void {
  if (!sessionId.startsWith('gateway:')) return

  import('@/stores/sessions').then(({ useSessionsStore }) => {
    const sessionsStore = useSessionsStore()
    if (sessionsStore.getSessionItem(sessionId)) return
    void sessionsStore.loadSessions()
  }).catch(error => {
    console.error('[IPC Hub] Failed to refresh gateway session list:', error)
  })
}
