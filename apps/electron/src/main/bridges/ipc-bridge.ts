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
 * - Delta coalescing (16ms ordered buffer), messageId injection, and
 *   flush-before-event ordering are delegated to the shared
 *   SessionStreamCoalescer (also used by the server SSE transport).
 */

import { IPC_CHANNELS } from '@shared/ipc.js'
import type { SessionEventEnvelope, StreamChunk } from '@shared/events/index.js'
import type { Unsubscribe } from '@onething/app/events/types.js'
import { getEventBus, getStreamChannel } from '@onething/app/events/index.js'
import { SessionStreamCoalescer } from '@onething/app/events/stream-coalescer.js'

export interface IPCBridgeSender {
  isDestroyed(): boolean
  send(channel: string, payload: unknown): void
  on(event: 'destroyed', listener: () => void): void
}

export class IPCBridge {
  private streamSubs = new Map<string, Unsubscribe>()
  private sender: IPCBridgeSender | null = null
  private unsubEventBus: Unsubscribe | null = null
  private unsubPluginNotifications: Unsubscribe | null = null
  private coalescer = new SessionStreamCoalescer(
    {
      sendChunk: (sessionId, chunk) => {
        this.safeSend(IPC_CHANNELS.SESSION_STREAM, { sessionId, chunk })
      },
    },
    { debugLabel: 'IPCBridge' },
  )

  /**
   * Bind to a renderer sender.
   * Subscribes to EventBus for all session events.
   * Auto-cleans up when sender is destroyed.
   */
  bind(sender: IPCBridgeSender): void {
    this.unbind() // clean up any previous binding

    this.sender = sender

    const eventBus = getEventBus()

    // Subscribe to all session events across all sessions
    this.unsubEventBus = eventBus.onAnySessionAny((envelope) => {
      this.handleSessionEvent(envelope)
    }, 'IPCBridge')

    // Global (non-session) plugin notifications.
    //
    // `api.ui.notify` and the runtime-failure circuit breaker both emitGlobal
    // 'plugin:notification'. The global bus had **no subscriber anywhere** —
    // outside core/events nothing calls `.onGlobal(`, so a plugin's only UI
    // touchpoint quietly went nowhere. This is that missing hop.
    this.unsubPluginNotifications = eventBus.onGlobal('plugin:notification', (envelope) => {
      this.safeSend(IPC_CHANNELS.PLUGINS_NOTIFICATION, envelope.event)
    })

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
    for (const [, unsubStream] of this.streamSubs) {
      unsubStream()
    }
    this.streamSubs.clear()
    this.coalescer.dispose()

    // Unsubscribe from EventBus
    if (this.unsubEventBus) {
      this.unsubEventBus()
      this.unsubEventBus = null
    }
    if (this.unsubPluginNotifications) {
      this.unsubPluginNotifications()
      this.unsubPluginNotifications = null
    }

    this.sender = null
    console.log('[IPCBridge] Unbound')
  }

  // ── Safe IPC send ──────────────────────────────

  /** Push a non-session event to the renderer (practice ticks, etc.). */
  sendToRenderer(channel: string, payload: unknown): void {
    this.safeSend(channel, payload)
  }

  private safeSend(channel: string, payload: unknown): void {
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

    // Flush pending deltas + track messageId before forwarding the event
    this.coalescer.handleEvent(envelope)

    // StreamChannel subscription lifecycle
    switch (event.type) {
      case 'stream:start':
        this.handleStreamStart(sessionId)
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

  private handleStreamStart(sessionId: string): void {
    // Clean up any existing subscription for this session first
    // (prevents double delivery if stream:start fires twice, e.g. rapid messages)
    this.streamSubs.get(sessionId)?.()

    // Subscribe to StreamChannel for this session
    const streamChannel = getStreamChannel()
    this.streamSubs.set(
      sessionId,
      streamChannel.subscribe(sessionId, (chunk: StreamChunk) => {
        this.coalescer.handleChunk(sessionId, chunk)
      }),
    )
  }

  private handleStreamEnd(sessionId: string): void {
    this.streamSubs.get(sessionId)?.()
    this.streamSubs.delete(sessionId)
  }
}
