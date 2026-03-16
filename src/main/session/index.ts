/**
 * Session Layer — Singleton Access
 *
 * Provides a singleton SessionManager that's initialized alongside
 * the event system.
 */

import { getEventBus, getStreamChannel } from '../events/index.js'
import { SessionManager } from './session-manager.js'
import { setupValidation } from './validation.js'
import type { Unsubscribe } from '../events/types.js'

let sessionManager: SessionManager | null = null
let validationUnsub: Unsubscribe | null = null

/**
 * Get the singleton SessionManager instance.
 * Throws if called before initializeSessionLayer().
 */
export function getSessionManager(): SessionManager {
  if (!sessionManager) {
    throw new Error('[Session] SessionManager not initialized. Call initializeSessionLayer() first.')
  }
  return sessionManager
}

/**
 * Initialize the session layer. Called after initializeEventSystem().
 */
export function initializeSessionLayer(): void {
  if (sessionManager) {
    console.warn('[Session] Already initialized, skipping')
    return
  }

  const eventBus = getEventBus()
  const streamChannel = getStreamChannel()

  sessionManager = new SessionManager(eventBus, streamChannel)
  validationUnsub = setupValidation(eventBus, sessionManager)

  console.log('[Session] SessionManager initialized with validation')
}

/**
 * Shut down the session layer.
 */
export function shutdownSessionLayer(): void {
  if (validationUnsub) {
    validationUnsub()
    validationUnsub = null
  }
  if (sessionManager) {
    sessionManager.shutdown()
    sessionManager = null
  }

  console.log('[Session] Shut down')
}

// Re-export for direct use
export { Session } from './session.js'
export { SessionManager } from './session-manager.js'
export type { SessionState } from './session-state.js'
