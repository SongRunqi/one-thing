/**
 * Plugin Event API
 *
 * Wraps EventBus + StreamChannel to provide a clean API for plugins.
 * Auto-tracks all subscriptions for cleanup on plugin unload.
 *
 * Plugins receive a PluginEventAPI instance via init(input, events).
 * When the plugin is unloaded, dispose() removes all subscriptions.
 */

import type { SessionEvent, SessionEventEnvelope, GlobalEvent, GlobalEventEnvelope, StreamChunk } from '../../shared/events/index.js'
import type { SessionCommand } from '../../shared/events/session-commands.js'
import type { EventBus } from './event-bus.js'
import type { StreamChannel } from './stream-channel.js'
import type { Unsubscribe, ObserveHandler, TypedObserveHandler, InterceptHandler, EmitResult } from './types.js'

/**
 * The API surface exposed to plugins for event-driven integration.
 */
export interface PluginEventAPI {
  // ── Session-scoped observation ─────────────────

  /** Observe a specific event type across all sessions */
  on<T extends SessionEvent['type']>(
    eventType: T,
    handler: TypedObserveHandler<T>
  ): Unsubscribe

  /** Observe all events across all sessions */
  onAny(handler: ObserveHandler): Unsubscribe

  /** Intercept events before they're committed (can modify or suppress) */
  intercept(handler: InterceptHandler): Unsubscribe

  // ── Global events ─────────────────────────────

  /** Observe a global event type */
  onGlobal<T extends GlobalEvent['type']>(
    eventType: T,
    handler: (envelope: GlobalEventEnvelope & { event: Extract<GlobalEvent, { type: T }> }) => void
  ): Unsubscribe

  // ── Stream chunks ─────────────────────────────

  /** Observe stream chunks for a specific session */
  onStream(sessionId: string, handler: (chunk: StreamChunk) => void): Unsubscribe

  // ── Replay ────────────────────────────────────

  /** Replay committed events for a session from a sequence number */
  replay(sessionId: string, fromSequence?: number): SessionEventEnvelope[]

  // ── Emit ──────────────────────────────────────

  /** Emit a session event (goes through intercept pipeline) */
  emit(sessionId: string, event: SessionEvent): Promise<EmitResult>

  /** Emit a session command */
  command(sessionId: string, command: SessionCommand): Promise<EmitResult>

  /** Emit a global event */
  emitGlobal(event: GlobalEvent): GlobalEventEnvelope
}

/**
 * Implementation of PluginEventAPI that wraps EventBus + StreamChannel.
 * Tracks all subscriptions for automatic cleanup.
 */
export class PluginEventAPIImpl implements PluginEventAPI {
  private unsubs: Unsubscribe[] = []

  constructor(
    private eventBus: EventBus,
    private streamChannel: StreamChannel,
    private pluginId: string
  ) {}

  // ── Session-scoped ────────────────────────────

  on<T extends SessionEvent['type']>(
    eventType: T,
    handler: TypedObserveHandler<T>
  ): Unsubscribe {
    const unsub = this.eventBus.onAnySession(eventType, handler)
    this.unsubs.push(unsub)
    return unsub
  }

  onAny(handler: ObserveHandler): Unsubscribe {
    const unsub = this.eventBus.onAnySessionAny(handler)
    this.unsubs.push(unsub)
    return unsub
  }

  intercept(handler: InterceptHandler): Unsubscribe {
    const unsub = this.eventBus.intercept(handler)
    this.unsubs.push(unsub)
    return unsub
  }

  // ── Global ────────────────────────────────────

  onGlobal<T extends GlobalEvent['type']>(
    eventType: T,
    handler: (envelope: GlobalEventEnvelope & { event: Extract<GlobalEvent, { type: T }> }) => void
  ): Unsubscribe {
    const unsub = this.eventBus.onGlobal(eventType, handler)
    this.unsubs.push(unsub)
    return unsub
  }

  // ── Stream ────────────────────────────────────

  onStream(sessionId: string, handler: (chunk: StreamChunk) => void): Unsubscribe {
    const unsub = this.streamChannel.subscribe(sessionId, handler)
    this.unsubs.push(unsub)
    return unsub
  }

  // ── Replay ────────────────────────────────────

  replay(sessionId: string, fromSequence = 0): SessionEventEnvelope[] {
    return this.eventBus.replay(sessionId, fromSequence)
  }

  // ── Emit ──────────────────────────────────────

  async emit(sessionId: string, event: SessionEvent): Promise<EmitResult> {
    return this.eventBus.emit(sessionId, event)
  }

  async command(sessionId: string, command: SessionCommand): Promise<EmitResult> {
    // Commands are emitted as session events (they go through the intercept pipeline)
    return this.eventBus.emit(sessionId, command as unknown as SessionEvent)
  }

  emitGlobal(event: GlobalEvent): GlobalEventEnvelope {
    return this.eventBus.emitGlobal(event)
  }

  // ── Lifecycle ─────────────────────────────────

  /**
   * Dispose all subscriptions. Called when plugin is unloaded.
   */
  dispose(): void {
    for (const unsub of this.unsubs) {
      unsub()
    }
    this.unsubs = []
    console.log(`[PluginEventAPI] Disposed subscriptions for plugin: ${this.pluginId}`)
  }
}
