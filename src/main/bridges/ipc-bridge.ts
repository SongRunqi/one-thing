/**
 * IPC Bridge
 *
 * Subscribes to EventBus and StreamChannel, translating events to
 * unified IPC channels for the renderer:
 * - `session:event` — all SessionEvent envelopes
 * - `session:stream` — all StreamChunk data
 *
 * Key behaviors:
 * - `safeSend()` guards against window-close (sender.isDestroyed())
 * - Text/reasoning deltas are coalesced in a 16ms buffer in StreamChannel,
 *   but sent as raw chunks via session:stream (renderer handles display)
 * - Flush-before-complete: all pending stream buffers are flushed before
 *   the session:event for stream:complete is sent
 */

import type { WebContents } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { SessionEventEnvelope, StreamChunk } from '../../shared/events/index.js'
import type { Unsubscribe } from '../events/types.js'
import { getEventBus, getStreamChannel } from '../events/index.js'

/**
 * Per-session state tracked by the IPCBridge while a stream is active.
 */
interface BridgeSessionState {
  messageId: string
  unsubStream: Unsubscribe
}

export class IPCBridge {
  private sessions = new Map<string, BridgeSessionState>()
  private sender: WebContents | null = null
  private unsubEventBus: Unsubscribe | null = null

  /**
   * Bind to a BrowserWindow's WebContents.
   * Subscribes to EventBus for all session events.
   * Auto-cleans up when sender is destroyed.
   */
  bind(sender: WebContents): void {
    this.unbind() // clean up any previous binding

    this.sender = sender

    const eventBus = getEventBus()

    // Subscribe to all session events across all sessions
    this.unsubEventBus = eventBus.onAnySessionAny((envelope) => {
      this.handleSessionEvent(envelope)
    }, 'IPCBridge')

    // Auto-cleanup when the BrowserWindow is destroyed
    sender.on('destroyed', () => {
      this.unbind()
    })

    console.log('[IPCBridge] Bound to WebContents')
  }

  /**
   * Dispose all subscriptions and clean up session state.
   */
  unbind(): void {
    // Clean up all active sessions
    for (const [, state] of this.sessions) {
      state.unsubStream()
    }
    this.sessions.clear()

    // Unsubscribe from EventBus
    if (this.unsubEventBus) {
      this.unsubEventBus()
      this.unsubEventBus = null
    }

    this.sender = null
    console.log('[IPCBridge] Unbound')
  }

  // ── Safe IPC send ──────────────────────────────

  private safeSend(channel: string, payload: any): void {
    if (!this.sender || this.sender.isDestroyed()) {
      return
    }
    try {
      this.sender.send(channel, payload)
    } catch (err) {
      console.warn('[IPCBridge] Send failed (window likely closed):', err)
    }
  }

  // ── Event handling ─────────────────────────────

  private handleSessionEvent(envelope: SessionEventEnvelope): void {
    const { sessionId, event } = envelope

    // Session lifecycle management
    switch (event.type) {
      case 'stream:start':
        this.handleStreamStart(sessionId, event.assistantMessageId)
        break

      case 'stream:complete':
      case 'stream:error':
      case 'stream:aborted':
        this.handleStreamEnd(sessionId)
        break
    }

    // Send raw envelope via unified channel
    this.safeSend(IPC_CHANNELS.SESSION_EVENT, envelope)
  }

  // ── Stream lifecycle ───────────────────────────

  private handleStreamStart(sessionId: string, messageId: string): void {
    // Subscribe to StreamChannel for this session
    const streamChannel = getStreamChannel()
    const unsubStream = streamChannel.subscribe(sessionId, (chunk) => {
      this.handleStreamChunk(sessionId, chunk)
    })

    this.sessions.set(sessionId, {
      messageId,
      unsubStream,
    })
  }

  private handleStreamEnd(sessionId: string): void {
    const state = this.sessions.get(sessionId)
    if (state) {
      state.unsubStream()
    }
    this.sessions.delete(sessionId)
  }

  // ── StreamChannel chunk handling ───────────────

  private handleStreamChunk(sessionId: string, chunk: StreamChunk): void {
    // Send raw chunk via unified channel
    this.safeSend(IPC_CHANNELS.SESSION_STREAM, { sessionId, chunk })
  }
}
