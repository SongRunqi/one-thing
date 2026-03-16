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

export function initializeIPCHub() {
  if (initialized) {
    console.log('[IPC Hub] Already initialized, skipping')
    return
  }
  initialized = true

  // ── Unified event channel ─────────────────────
  // All structured events (steps, tools, stream lifecycle, etc.)
  window.electronAPI.onSessionEvent((envelope: SessionEventEnvelope) => {
    const store = useChatStore()
    const { sessionId, event } = envelope

    switch (event.type) {
      // Stream lifecycle
      case 'stream:complete':
        store.handleStreamComplete({ sessionId, ...event.data })
        break

      case 'stream:error':
        store.handleStreamError({ sessionId, ...event.data })
        break

      case 'stream:aborted':
        store.handleStreamComplete({ sessionId, aborted: true })
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

      // Content events → mapped to stream chunk format
      case 'content:part':
        store.handleStreamChunk({ type: 'content_part', sessionId, messageId: '', content: '', contentPart: event.part })
        break

      case 'content:continuation':
        store.handleStreamChunk({ type: 'continuation', sessionId, messageId: '', content: '' })
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

      // Context events
      case 'context:size-updated':
        store.handleContextSizeUpdated({ sessionId, contextSize: event.contextSize })
        break

      case 'compact:started':
        store.handleContextCompactStarted({ sessionId })
        break

      case 'compact:completed':
        store.handleContextCompactCompleted({ sessionId, ...event.data })
        break

      // stream:start, message:* — no store action needed
      // (store creates messages via sendMessage action, not via events)
    }
  })

  // ── Unified stream channel ────────────────────
  // High-frequency chunks: text-delta, reasoning-delta, tool-input-delta
  window.electronAPI.onSessionStream(({ sessionId, chunk }: { sessionId: string; chunk: any }) => {
    const store = useChatStore()

    switch (chunk.type) {
      case 'text-delta':
        store.handleStreamChunk({ type: 'text', sessionId, messageId: '', content: chunk.text })
        break

      case 'reasoning-delta':
        store.handleStreamChunk({ type: 'reasoning', sessionId, messageId: '', content: '', reasoning: chunk.reasoning })
        break

      case 'tool-input-delta':
        store.handleStreamChunk({
          type: 'tool_input_delta', sessionId, messageId: '', content: '',
          toolCallId: chunk.toolCallId, argsTextDelta: chunk.argsTextDelta,
        })
        break
    }
  })

  console.log('[IPC Hub] Unified listeners registered (session:event + session:stream)')
}
