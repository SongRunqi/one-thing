/**
 * Event Envelopes
 *
 * Every event is wrapped in an envelope that adds:
 * - sessionId  — which session this event belongs to
 * - sequence   — monotonically increasing per-session counter (for replay)
 * - timestamp  — when the event was committed to the ring buffer
 *
 * The envelope is what gets stored and replayed — the inner event
 * is the domain payload.
 */

import type { SessionEvent } from './session-events.js'
import type { GlobalEvent } from './global-events.js'

export interface SessionEventEnvelope {
  sessionId: string
  sequence: number
  timestamp: number
  event: SessionEvent
}

export interface GlobalEventEnvelope {
  sequence: number
  timestamp: number
  event: GlobalEvent
}
