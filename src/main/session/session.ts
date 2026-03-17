/**
 * Session
 *
 * A Session subscribes to EventBus and StreamChannel, reducing events
 * and chunks into a SessionState.
 *
 * Phase 1: The Session is passive — it only accumulates state for
 * validation purposes. It does NOT persist anything or drive the UI.
 * The existing store + IPC pipeline handles all that.
 *
 * Phase 2+: Session becomes the authoritative state owner. Events
 * drive persistence (checkpoints) and renderer sync.
 */

import type { SessionEventEnvelope, StreamChunk } from '../../shared/events/index.js'
import type { EventBus } from '../events/event-bus.js'
import type { StreamChannel } from '../events/stream-channel.js'
import type { Unsubscribe } from '../events/types.js'
import { type SessionState, createEmptySessionState } from './session-state.js'

export class Session {
  private _state: SessionState
  private unsubscribers: Unsubscribe[] = []

  constructor(sessionId: string) {
    this._state = createEmptySessionState(sessionId)
  }

  /** Read-only access to current state */
  get state(): Readonly<SessionState> {
    return this._state
  }

  /**
   * Attach this session to EventBus and StreamChannel.
   * Starts receiving events and chunks.
   */
  attach(eventBus: EventBus, streamChannel: StreamChannel): void {
    const sessionId = this._state.id

    // Subscribe to all events for this session
    const unsubEvents = eventBus.onAny(sessionId, (envelope) => {
      this.applyEvent(envelope)
    })
    this.unsubscribers.push(unsubEvents)

    // Subscribe to stream chunks for this session
    const unsubChunks = streamChannel.subscribe(sessionId, (chunk) => {
      this.applyChunk(chunk)
    })
    this.unsubscribers.push(unsubChunks)
  }

  /**
   * Detach from EventBus and StreamChannel.
   * Stops receiving events and chunks.
   */
  detach(): void {
    for (const unsub of this.unsubscribers) {
      unsub()
    }
    this.unsubscribers = []
  }

  /**
   * Apply a committed event to the session state.
   */
  applyEvent(envelope: SessionEventEnvelope): void {
    this._state.eventCount++
    const event = envelope.event

    switch (event.type) {
      case 'stream:start':
        this._state.activeMessageId = event.assistantMessageId
        this._state.isStreaming = true
        // Reset accumulators for new stream
        this._state.accumulatedContent = ''
        this._state.accumulatedReasoning = ''
        break

      case 'stream:complete':
        this._state.isStreaming = false
        if (event.data.sessionName) {
          this._state.name = event.data.sessionName
        }
        break

      case 'stream:error':
        this._state.isStreaming = false
        break

      case 'stream:aborted':
        this._state.isStreaming = false
        break

      case 'message:user-created':
        // Phase 1: just track event count, no state mutation needed
        break

      case 'message:assistant-created':
        this._state.activeMessageId = event.messageId
        break

      case 'tool:call':
      case 'tool:result':
      case 'tool:input-start':
      case 'step:added':
      case 'step:updated':
      case 'content:part':
      case 'content:continuation':
      case 'context:size-updated':
      case 'compact:started':
      case 'compact:completed':
      case 'stream:params-resolving':
      case 'skill:activated':
      case 'permission:request':
      case 'permission:timeout':
      case 'tool:executing':
      case 'tool:metadata':
      case 'session:renamed':
      case 'message:updated':
        // These events are tracked for replay but don't
        // update the validation-relevant state fields yet
        break
    }
  }

  /**
   * Apply a stream chunk to the session state.
   */
  applyChunk(chunk: StreamChunk): void {
    this._state.chunkCount++

    switch (chunk.type) {
      case 'text-delta':
        this._state.accumulatedContent += chunk.text
        break

      case 'reasoning-delta':
        this._state.accumulatedReasoning += chunk.reasoning
        break

      case 'tool-input-delta':
        // Phase 1: tool input deltas don't contribute to accumulated content
        break
    }
  }
}
