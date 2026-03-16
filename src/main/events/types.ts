/**
 * Event System Internal Types
 *
 * These types define the handler signatures used by EventBus and StreamChannel.
 * They are internal to the main process — renderer never sees these.
 */

import type { SessionEventEnvelope, GlobalEventEnvelope, SessionEvent, StreamChunk } from '../../shared/events/index.js'

/** Unsubscribe function returned by on/onAny/onGlobal */
export type Unsubscribe = () => void

/** Handler for observing committed events */
export type ObserveHandler = (envelope: SessionEventEnvelope) => void

/** Handler for observing events by type */
export type TypedObserveHandler<T extends SessionEvent['type']> = (
  envelope: SessionEventEnvelope & { event: Extract<SessionEvent, { type: T }> }
) => void

/** Handler for observing global events */
export type GlobalObserveHandler = (envelope: GlobalEventEnvelope) => void

/** Handler for stream chunks */
export type StreamChunkHandler = (chunk: StreamChunk) => void

/**
 * Intercept handler — can modify or suppress an event before it's committed.
 * Phase 1: no interceptors are registered, so this is a pass-through.
 */
export type InterceptHandler = (
  event: SessionEvent,
  sessionId: string
) => InterceptResult | Promise<InterceptResult>

export interface InterceptResult {
  /** If true, the event is suppressed (not committed or fanned out) */
  suppress?: boolean
  /** Optional replacement event. If provided, replaces the original. */
  replacement?: SessionEvent
}

export interface EmitResult {
  /** The envelope that was committed (or null if suppressed) */
  envelope: SessionEventEnvelope | null
}
