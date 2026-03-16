/**
 * Stream Channel
 *
 * High-frequency chunk delivery for text-delta, reasoning-delta, and
 * tool-input-delta. These chunks are too voluminous for the EventBus
 * ring buffer (hundreds per second), so they get their own lightweight
 * pub/sub channel.
 *
 * Design:
 * - Subscribers are scoped to a sessionId
 * - push() fans out synchronously (no async overhead)
 * - destroySession() cleans up all subscribers for a session
 * - No persistence, no replay — chunks are ephemeral
 */

import type { StreamChunk } from '../../shared/events/index.js'
import type { StreamChunkHandler, Unsubscribe } from './types.js'

export class StreamChannel {
  private subscribers = new Map<string, Set<StreamChunkHandler>>()

  /**
   * Push a chunk to all subscribers of a session.
   * Synchronous fan-out — handlers should be fast.
   */
  push(sessionId: string, chunk: StreamChunk): void {
    const handlers = this.subscribers.get(sessionId)
    if (!handlers || handlers.size === 0) return

    for (const handler of handlers) {
      try {
        handler(chunk)
      } catch (err) {
        console.error(`[StreamChannel] Handler error for session ${sessionId}:`, err)
      }
    }
  }

  /**
   * Subscribe to chunks for a specific session.
   * Returns an unsubscribe function.
   */
  subscribe(sessionId: string, handler: StreamChunkHandler): Unsubscribe {
    let handlers = this.subscribers.get(sessionId)
    if (!handlers) {
      handlers = new Set()
      this.subscribers.set(sessionId, handlers)
    }
    handlers.add(handler)

    return () => {
      handlers!.delete(handler)
      if (handlers!.size === 0) {
        this.subscribers.delete(sessionId)
      }
    }
  }

  /**
   * Remove all subscribers for a session.
   */
  destroySession(sessionId: string): void {
    this.subscribers.delete(sessionId)
  }

  /**
   * Shut down: remove all subscribers for all sessions.
   */
  shutdown(): void {
    this.subscribers.clear()
  }
}
