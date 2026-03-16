/**
 * Session Validation (Dev Only)
 *
 * Subscribes to `stream:complete` across all sessions and compares
 * the Session's event-accumulated state with the store.
 *
 * Since Phase 2, the event system (EventOnlyEmitter → EventBus/StreamChannel
 * → IPCBridge) is the primary data path. This validation ensures that
 * Session's event-accumulated content matches the store mutations made
 * by the emitter and stream-processor. Mismatches indicate bugs in
 * either the event accumulation or the store mutation logic.
 *
 * Gate: only runs when NODE_ENV !== 'production'.
 */

import * as store from '../store.js'
import type { EventBus } from '../events/event-bus.js'
import type { SessionManager } from './session-manager.js'
import type { Unsubscribe } from '../events/types.js'

const isDev = process.env.NODE_ENV !== 'production'

export function setupValidation(
  eventBus: EventBus,
  sessionManager: SessionManager
): Unsubscribe {
  if (!isDev) {
    return () => {} // No-op in production
  }

  return eventBus.onAnySession('stream:complete', (envelope) => {
    const sessionId = envelope.sessionId
    const session = sessionManager.get(sessionId)
    if (!session) {
      console.warn(`[Validation] Session ${sessionId} not found in SessionManager`)
      return
    }

    const state = session.state

    // Get the store's version of the assistant message
    const storeSession = store.getSession(sessionId)
    if (!storeSession) {
      console.warn(`[Validation] Session ${sessionId} not found in store`)
      return
    }

    const storeMessage = storeSession.messages.find(m => m.id === state.activeMessageId)
    if (!storeMessage) {
      console.warn(`[Validation] Message ${state.activeMessageId} not found in store for session ${sessionId}`)
      return
    }

    const storeContent = storeMessage.content || ''
    const eventContent = state.accumulatedContent

    // Compare content (allow minor whitespace differences)
    if (storeContent.trim() !== eventContent.trim()) {
      console.warn(
        `[Validation] Content MISMATCH for session ${sessionId}:\n` +
        `  Store length: ${storeContent.length}\n` +
        `  Event length: ${eventContent.length}\n` +
        `  Store preview: ${storeContent.slice(0, 100)}...\n` +
        `  Event preview: ${eventContent.slice(0, 100)}...`
      )
    } else {
      console.log(
        `[Validation] Session ${sessionId} state consistent ` +
        `(${state.eventCount} events, ${state.chunkCount} chunks, ${eventContent.length} chars)`
      )
    }
  })
}
