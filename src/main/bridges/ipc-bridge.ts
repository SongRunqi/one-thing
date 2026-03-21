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
 * - Text/reasoning/tool-input deltas are coalesced in a 16ms buffer
 *   (per session) before being sent via session:stream. This reduces
 *   IPC call frequency from ~50+/frame to ≤3/frame (~60fps).
 * - Flush-before-complete: all pending stream buffers are flushed before
 *   the session:event for stream:complete is sent, ensuring no tokens are lost.
 */

import type { WebContents } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { SessionEventEnvelope, StreamChunk } from '../../shared/events/index.js'
import type { Unsubscribe } from '../events/types.js'
import { getEventBus, getStreamChannel } from '../events/index.js'

/** Accumulates high-frequency stream chunks between 16ms flush intervals. */
interface StreamBuffer {
  text: string
  reasoning: string
  toolInputs: Map<string, string>  // toolCallId → accumulated argsTextDelta
  timer: ReturnType<typeof setTimeout> | null
}

/**
 * Per-session state tracked by the IPCBridge while a stream is active.
 */
interface BridgeSessionState {
  messageId: string
  unsubStream: Unsubscribe
  buffer: StreamBuffer
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
      buffer: { text: '', reasoning: '', toolInputs: new Map(), timer: null },
    })
  }

  private handleStreamEnd(sessionId: string): void {
    const state = this.sessions.get(sessionId)
    if (state) {
      this.flushBuffer(sessionId, state)
      state.unsubStream()
    }
    this.sessions.delete(sessionId)
  }

  // ── Buffer flush ───────────────────────────────

  private flushBuffer(sessionId: string, state: BridgeSessionState): void {
    const buf = state.buffer
    if (buf.timer !== null) {
      clearTimeout(buf.timer)
      buf.timer = null
    }

    if (buf.text) {
      this.safeSend(IPC_CHANNELS.SESSION_STREAM, {
        sessionId,
        chunk: { type: 'text-delta', text: buf.text },
      })
      buf.text = ''
    }

    if (buf.reasoning) {
      this.safeSend(IPC_CHANNELS.SESSION_STREAM, {
        sessionId,
        chunk: { type: 'reasoning-delta', reasoning: buf.reasoning },
      })
      buf.reasoning = ''
    }

    for (const [toolCallId, argsTextDelta] of buf.toolInputs) {
      this.safeSend(IPC_CHANNELS.SESSION_STREAM, {
        sessionId,
        chunk: { type: 'tool-input-delta', toolCallId, argsTextDelta },
      })
    }
    buf.toolInputs.clear()
  }

  // ── StreamChannel chunk handling ───────────────

  private handleStreamChunk(sessionId: string, chunk: StreamChunk): void {
    const state = this.sessions.get(sessionId)

    // For non-buffered chunk types, send immediately
    if (!state || (chunk.type !== 'text-delta' && chunk.type !== 'reasoning-delta' && chunk.type !== 'tool-input-delta')) {
      this.safeSend(IPC_CHANNELS.SESSION_STREAM, { sessionId, chunk })
      return
    }

    // Accumulate into buffer
    const buf = state.buffer
    if (chunk.type === 'text-delta') {
      buf.text += chunk.text
    } else if (chunk.type === 'reasoning-delta') {
      buf.reasoning += chunk.reasoning
    } else if (chunk.type === 'tool-input-delta') {
      const prev = buf.toolInputs.get(chunk.toolCallId) ?? ''
      buf.toolInputs.set(chunk.toolCallId, prev + chunk.argsTextDelta)
    }

    // Schedule flush if not already pending
    if (buf.timer === null) {
      buf.timer = setTimeout(() => this.flushBuffer(sessionId, state), 16)
    }
  }
}
