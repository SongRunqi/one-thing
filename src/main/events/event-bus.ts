/**
 * Event Bus
 *
 * The central event backbone for session events. Provides:
 *
 * 1. **Intercept phase** — registered interceptors can modify or suppress
 *    an event before it's committed. Phase 1 has no interceptors.
 *
 * 2. **Commit phase** — event gets a sequence number and timestamp,
 *    is wrapped in an envelope, and pushed to the session's ring buffer.
 *
 * 3. **Fan-out phase** — the envelope is delivered to:
 *    - Per-session typed handlers (on)
 *    - Per-session wildcard handlers (onAny — currently unused in Phase 1)
 *    - Global session-wildcard handlers (onAnySession)
 *
 * Also supports global (non-session) events via emitGlobal/onGlobal.
 *
 * All operations are synchronous except interceptors (which may be async).
 * The emit() method returns a Promise<EmitResult>.
 */

import type {
  SessionEvent,
  SessionEventEnvelope,
  GlobalEvent,
  GlobalEventEnvelope,
} from '../../shared/events/index.js'
import type {
  Unsubscribe,
  ObserveHandler,
  TypedObserveHandler,
  GlobalObserveHandler,
  InterceptHandler,
  EmitResult,
} from './types.js'
import { RingBuffer } from './ring-buffer.js'

export class EventBus {
  /** Per-session ring buffers */
  private buffers = new Map<string, RingBuffer>()

  /** Per-session sequence counters */
  private sequences = new Map<string, number>()

  /** Per-session, per-type handlers: Map<sessionId, Map<eventType, Set<handler>>> */
  private typedHandlers = new Map<string, Map<string, Set<ObserveHandler>>>()

  /** Per-session wildcard handlers: Map<sessionId, Set<handler>> */
  private wildcardHandlers = new Map<string, Set<ObserveHandler>>()

  /** Global session-wildcard handlers (all sessions, specific type): Map<eventType, Set<handler>> */
  private anySessionTypedHandlers = new Map<string, Set<ObserveHandler>>()

  /** Global session-wildcard handlers (all sessions, all types) */
  private anySessionWildcardHandlers = new Set<ObserveHandler>()

  /** Interceptors (Phase 1: empty) */
  private interceptors: InterceptHandler[] = []

  /** Global event handlers */
  private globalHandlers = new Map<string, Set<GlobalObserveHandler>>()
  private globalSequence = 0

  /** Default ring buffer capacity per session */
  private readonly bufferCapacity: number

  /** Handler → label mapping for logging */
  private handlerLabels = new WeakMap<(...args: any[]) => any, string>()

  /** High-frequency event types — skip detailed fan-out logging */
  private static HIGH_FREQ_TYPES = new Set([
    'content:part',
    'content:continuation',
    'step:updated',
    'tool:metadata',
  ])

  constructor(bufferCapacity = 1000) {
    this.bufferCapacity = bufferCapacity
  }

  // ── Emit (session events) ──────────────────────

  /**
   * Emit a session event through the intercept → commit → fan-out pipeline.
   */
  async emit(sessionId: string, event: SessionEvent): Promise<EmitResult> {
    // Phase 1: Intercept (pass-through if no interceptors)
    let finalEvent = event
    for (const interceptor of this.interceptors) {
      try {
        const result = await interceptor(finalEvent, sessionId)
        if (result.suppress) {
          return { envelope: null }
        }
        if (result.replacement) {
          finalEvent = result.replacement
        }
      } catch (err) {
        console.error('[EventBus] Interceptor error:', err)
        // On interceptor error, continue with original event
      }
    }

    // Phase 2: Commit
    const seq = (this.sequences.get(sessionId) ?? 0) + 1
    this.sequences.set(sessionId, seq)

    const envelope: SessionEventEnvelope = {
      sessionId,
      sequence: seq,
      timestamp: Date.now(),
      event: finalEvent,
    }

    let buffer = this.buffers.get(sessionId)
    if (!buffer) {
      buffer = new RingBuffer(this.bufferCapacity)
      this.buffers.set(sessionId, buffer)
    }
    buffer.push(envelope)

    // Logging: event produced
    if (!EventBus.HIGH_FREQ_TYPES.has(finalEvent.type)) {
      console.log(`[EventBus] emit session=${sessionId.slice(0, 8)} seq=${seq} type=${finalEvent.type}`)
    }

    // Phase 3: Fan-out
    this.fanOut(sessionId, envelope)

    return { envelope }
  }

  // ── Subscribe (per-session, typed) ─────────────

  /**
   * Subscribe to a specific event type for a specific session.
   * @param label Optional human-readable name for logging (e.g. 'StreamEngine')
   */
  on<T extends SessionEvent['type']>(
    sessionId: string,
    eventType: T,
    handler: TypedObserveHandler<T>,
    label?: string
  ): Unsubscribe {
    if (label) this.handlerLabels.set(handler, label)

    let sessionMap = this.typedHandlers.get(sessionId)
    if (!sessionMap) {
      sessionMap = new Map()
      this.typedHandlers.set(sessionId, sessionMap)
    }
    let handlers = sessionMap.get(eventType)
    if (!handlers) {
      handlers = new Set()
      sessionMap.set(eventType, handlers)
    }
    handlers.add(handler as ObserveHandler)

    console.log(`[EventBus] subscribe label=${label || 'anonymous'} type=${eventType} session=${sessionId.slice(0, 8)}`)

    return () => {
      console.log(`[EventBus] unsubscribe label=${label || 'anonymous'} type=${eventType} session=${sessionId.slice(0, 8)}`)
      handlers!.delete(handler as ObserveHandler)
      if (handlers!.size === 0) sessionMap!.delete(eventType)
      if (sessionMap!.size === 0) this.typedHandlers.delete(sessionId)
    }
  }

  // ── Subscribe (per-session, wildcard) ──────────

  /**
   * Subscribe to all event types for a specific session.
   * @param label Optional human-readable name for logging
   */
  onAny(sessionId: string, handler: ObserveHandler, label?: string): Unsubscribe {
    if (label) this.handlerLabels.set(handler, label)

    let handlers = this.wildcardHandlers.get(sessionId)
    if (!handlers) {
      handlers = new Set()
      this.wildcardHandlers.set(sessionId, handlers)
    }
    handlers.add(handler)

    console.log(`[EventBus] subscribe label=${label || 'anonymous'} scope=sessionAny session=${sessionId.slice(0, 8)}`)

    return () => {
      console.log(`[EventBus] unsubscribe label=${label || 'anonymous'} scope=sessionAny session=${sessionId.slice(0, 8)}`)
      handlers!.delete(handler)
      if (handlers!.size === 0) this.wildcardHandlers.delete(sessionId)
    }
  }

  // ── Subscribe (all sessions, typed) ────────────

  /**
   * Subscribe to a specific event type across ALL sessions.
   * Used by SessionManager to auto-vivify sessions on stream:start.
   * @param label Optional human-readable name for logging
   */
  onAnySession<T extends SessionEvent['type']>(
    eventType: T,
    handler: TypedObserveHandler<T>,
    label?: string
  ): Unsubscribe {
    if (label) this.handlerLabels.set(handler, label)

    let handlers = this.anySessionTypedHandlers.get(eventType)
    if (!handlers) {
      handlers = new Set()
      this.anySessionTypedHandlers.set(eventType, handlers)
    }
    handlers.add(handler as ObserveHandler)

    console.log(`[EventBus] subscribe label=${label || 'anonymous'} type=${eventType} scope=anySession`)

    return () => {
      console.log(`[EventBus] unsubscribe label=${label || 'anonymous'} type=${eventType} scope=anySession`)
      handlers!.delete(handler as ObserveHandler)
      if (handlers!.size === 0) this.anySessionTypedHandlers.delete(eventType)
    }
  }

  // ── Subscribe (all sessions, all types) ────────

  /**
   * Subscribe to ALL events across ALL sessions. Use sparingly.
   * @param label Optional human-readable name for logging
   */
  onAnySessionAny(handler: ObserveHandler, label?: string): Unsubscribe {
    if (label) this.handlerLabels.set(handler, label)

    this.anySessionWildcardHandlers.add(handler)

    console.log(`[EventBus] subscribe label=${label || 'anonymous'} scope=anySessionAny`)

    return () => {
      console.log(`[EventBus] unsubscribe label=${label || 'anonymous'} scope=anySessionAny`)
      this.anySessionWildcardHandlers.delete(handler)
    }
  }

  // ── Intercept ──────────────────────────────────

  /**
   * Register an interceptor. Phase 1: not used.
   */
  intercept(handler: InterceptHandler): Unsubscribe {
    this.interceptors.push(handler)
    return () => {
      const idx = this.interceptors.indexOf(handler)
      if (idx >= 0) this.interceptors.splice(idx, 1)
    }
  }

  // ── Replay ─────────────────────────────────────

  /**
   * Replay committed events for a session starting from a sequence number.
   */
  replay(sessionId: string, fromSequence: number): SessionEventEnvelope[] {
    const buffer = this.buffers.get(sessionId)
    if (!buffer) return []
    return buffer.replay(fromSequence)
  }

  // ── Destroy session ────────────────────────────

  /**
   * Clean up all state for a session: buffer, handlers, sequence.
   */
  destroySession(sessionId: string): void {
    this.buffers.get(sessionId)?.clear()
    this.buffers.delete(sessionId)
    this.sequences.delete(sessionId)
    this.typedHandlers.delete(sessionId)
    this.wildcardHandlers.delete(sessionId)
  }

  // ── Global events ─────────────────────────────

  /**
   * Emit a global (non-session) event.
   */
  emitGlobal(event: GlobalEvent): GlobalEventEnvelope {
    this.globalSequence++
    const envelope: GlobalEventEnvelope = {
      sequence: this.globalSequence,
      timestamp: Date.now(),
      event,
    }

    console.log(`[EventBus] emitGlobal seq=${this.globalSequence} type=${event.type}`)

    const handlers = this.globalHandlers.get(event.type)
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(envelope)
        } catch (err) {
          console.error('[EventBus] Global handler error:', err)
        }
      }
    }

    return envelope
  }

  /**
   * Subscribe to a specific global event type.
   */
  onGlobal<T extends GlobalEvent['type']>(
    eventType: T,
    handler: (envelope: GlobalEventEnvelope & { event: Extract<GlobalEvent, { type: T }> }) => void
  ): Unsubscribe {
    let handlers = this.globalHandlers.get(eventType)
    if (!handlers) {
      handlers = new Set()
      this.globalHandlers.set(eventType, handlers)
    }
    handlers.add(handler as GlobalObserveHandler)

    return () => {
      handlers!.delete(handler as GlobalObserveHandler)
      if (handlers!.size === 0) this.globalHandlers.delete(eventType)
    }
  }

  // ── Shutdown ──────────────────────────────────

  /**
   * Clear all state. Called on app quit.
   */
  shutdown(): void {
    this.buffers.clear()
    this.sequences.clear()
    this.typedHandlers.clear()
    this.wildcardHandlers.clear()
    this.anySessionTypedHandlers.clear()
    this.anySessionWildcardHandlers.clear()
    this.interceptors.length = 0
    this.globalHandlers.clear()
  }

  // ── Internal ──────────────────────────────────

  private fanOut(sessionId: string, envelope: SessionEventEnvelope): void {
    const eventType = envelope.event.type
    const isHighFreq = EventBus.HIGH_FREQ_TYPES.has(eventType)

    // 1. Per-session typed handlers
    const sessionMap = this.typedHandlers.get(sessionId)
    if (sessionMap) {
      const handlers = sessionMap.get(eventType)
      if (handlers) {
        for (const handler of handlers) {
          if (!isHighFreq) {
            const label = this.handlerLabels.get(handler) || 'anonymous'
            console.log(`[EventBus]   → ${label} (on)`)
          }
          try { handler(envelope) } catch (err) {
            console.error('[EventBus] Handler error:', err)
          }
        }
      }
    }

    // 2. Per-session wildcard handlers
    const wildcards = this.wildcardHandlers.get(sessionId)
    if (wildcards) {
      for (const handler of wildcards) {
        if (!isHighFreq) {
          const label = this.handlerLabels.get(handler) || 'anonymous'
          console.log(`[EventBus]   → ${label} (onAny)`)
        }
        try { handler(envelope) } catch (err) {
          console.error('[EventBus] Wildcard handler error:', err)
        }
      }
    }

    // 3. Global session-typed handlers (onAnySession)
    const anyTyped = this.anySessionTypedHandlers.get(eventType)
    if (anyTyped) {
      for (const handler of anyTyped) {
        if (!isHighFreq) {
          const label = this.handlerLabels.get(handler) || 'anonymous'
          console.log(`[EventBus]   → ${label} (onAnySession)`)
        }
        try { handler(envelope) } catch (err) {
          console.error('[EventBus] AnySession handler error:', err)
        }
      }
    }

    // 4. Global session-wildcard handlers (onAnySessionAny)
    for (const handler of this.anySessionWildcardHandlers) {
      if (!isHighFreq) {
        const label = this.handlerLabels.get(handler) || 'anonymous'
        console.log(`[EventBus]   → ${label} (onAnySessionAny)`)
      }
      try { handler(envelope) } catch (err) {
        console.error('[EventBus] AnySessionAny handler error:', err)
      }
    }
  }
}
