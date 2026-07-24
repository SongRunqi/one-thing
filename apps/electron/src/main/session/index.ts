/**
 * Session Layer — Singleton Access
 *
 * Provides a singleton SessionManager that's initialized alongside
 * the event system.
 */

import { getEventBus, getStreamChannel } from '../events/index.js'
import { setupValidation } from './validation.js'
import type { Unsubscribe } from '../events/types.js'
import {
  Session,
  SessionManager,
  createEmptySessionState,
  getCoreSessionManager,
  initializeCoreSessionLayer,
  isCoreSessionLayerInitialized,
  shutdownCoreSessionLayer,
  type SessionState,
} from '@onething/core/session'

let validationUnsub: Unsubscribe | null = null

/**
 * Get the singleton SessionManager instance.
 * Throws if called before initializeSessionLayer().
 */
export function getSessionManager(): SessionManager {
  try {
    return getCoreSessionManager()
  } catch {
    throw new Error('[Session] SessionManager not initialized. Call initializeSessionLayer() first.')
  }
}

/**
 * Initialize the session layer. Called after initializeEventSystem().
 */
export function initializeSessionLayer(): void {
  if (isCoreSessionLayerInitialized()) {
    console.warn('[Session] Already initialized, skipping')
    return
  }

  const eventBus = getEventBus()
  const streamChannel = getStreamChannel()

  const sessionManager = initializeCoreSessionLayer(eventBus, streamChannel)
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
  shutdownCoreSessionLayer()

  console.log('[Session] Shut down')
}

// Re-export for direct use
export {
  Session,
  SessionManager,
  createEmptySessionState,
}
export type { SessionState }
