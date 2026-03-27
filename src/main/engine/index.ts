/**
 * StreamEngine — Singleton Access & Lifecycle
 *
 * Provides singleton getter for the StreamEngine, plus init/shutdown
 * functions called from main/index.ts.
 */

import { getEventBus } from '../events/index.js'
import { StreamEngine } from './stream-engine.js'

let streamEngine: StreamEngine | null = null

/**
 * Get the singleton StreamEngine instance.
 * Throws if called before initializeStreamEngine().
 */
export function getStreamEngine(): StreamEngine {
  if (!streamEngine) {
    throw new Error('[StreamEngine] Not initialized. Call initializeStreamEngine() first.')
  }
  return streamEngine
}

/**
 * Get the StreamEngine if initialized, or null.
 * Safe to call during shutdown when engine may already be destroyed.
 */
export function getStreamEngineSafe(): StreamEngine | null {
  return streamEngine
}

/**
 * Initialize the StreamEngine. Called after initializeSessionLayer().
 */
export function initializeStreamEngine(): void {
  if (streamEngine) {
    console.warn('[StreamEngine] Already initialized, skipping')
    return
  }

  streamEngine = new StreamEngine()
  try {
    streamEngine.setEventBus(getEventBus())
  } catch {
    // EventBus may not be initialized yet in test scenarios
  }
  console.log('[StreamEngine] Initialized')
}

/**
 * Shut down the StreamEngine. Called from app.on('before-quit').
 */
export function shutdownStreamEngine(): void {
  if (streamEngine) {
    streamEngine.shutdown()
    streamEngine = null
  }
}

// Re-export for direct use
export { StreamEngine } from './stream-engine.js'
