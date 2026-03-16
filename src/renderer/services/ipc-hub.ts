/**
 * Global IPC Event Hub
 *
 * Registers IPC listeners at app startup to ensure:
 * 1. Listeners are registered before any IPC calls (no race conditions)
 * 2. All events route to central store (single source of truth)
 * 3. No per-message listener setup/teardown needed
 *
 * Phase 4b: Steps, skills, context events use unified session:event channel.
 * Stream chunks, complete, error still use legacy individual channels.
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

  // ── Unified event channel (Phase 4b) ──────────
  // Handles: step:added, step:updated, skill:activated, context:*, compact:*
  window.electronAPI.onSessionEvent((envelope: SessionEventEnvelope) => {
    const store = useChatStore()
    const { sessionId, event } = envelope

    switch (event.type) {
      case 'step:added':
        store.handleStepAdded({ sessionId, messageId: '', step: event.step })
        break

      case 'step:updated':
        store.handleStepUpdated({ sessionId, messageId: '', stepId: event.stepId, updates: event.updates })
        break

      case 'skill:activated':
        store.handleSkillActivated({ sessionId, messageId: '', skillName: event.skillName })
        break

      case 'context:size-updated':
        store.handleContextSizeUpdated({ sessionId, contextSize: event.contextSize })
        break

      case 'compact:started':
        store.handleContextCompactStarted({ sessionId })
        break

      case 'compact:completed':
        store.handleContextCompactCompleted({ sessionId, ...event.data })
        break

      // Other events (stream:start/complete/error, tool:*, content:*):
      // Handled by legacy channels below until Phase 4c
    }
  })

  // ── Legacy channels (stream data) ─────────────
  // These remain because they carry messageId in payload,
  // which the store handlers depend on for message lookup.

  window.electronAPI.onStreamChunk((chunk) => {
    if (chunk.type === 'tool_input_start' || chunk.type === 'tool_input_delta') {
      console.log('[IPC Hub] Received streaming tool input:', chunk.type, chunk.toolCallId, chunk.toolName || chunk.argsTextDelta?.substring(0, 30))
    }
    useChatStore().handleStreamChunk(chunk)
  })

  window.electronAPI.onStreamComplete((data) => {
    useChatStore().handleStreamComplete(data)
  })

  window.electronAPI.onStreamError((data) => {
    useChatStore().handleStreamError(data)
  })

  console.log('[IPC Hub] All listeners registered (unified + legacy)')
}
