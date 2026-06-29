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
 * - Text/reasoning/tool-input deltas are coalesced in a 16ms ordered buffer
 *   (per session) before being sent via session:stream. This reduces
 *   IPC call frequency while preserving cross-type stream ordering.
 * - Flush-before-complete: all pending stream buffers are flushed before
 *   the session:event for stream:complete is sent, ensuring no tokens are lost.
 */

import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { ReasoningPlacement, SessionEventEnvelope, StreamChunk } from '../../shared/events/index.js'
import type { Unsubscribe } from '../events/types.js'
import { getEventBus, getStreamChannel } from '../events/index.js'

export interface IPCBridgeSender {
  isDestroyed(): boolean
  send(channel: string, payload: unknown): void
  on(event: 'destroyed', listener: () => void): void
}

function shouldDebugStream(): boolean {
  return process.env.ONETHING_DEBUG_STREAM === '1' || process.env.ONETHING_DEBUG_CODEX_STREAM === '1'
}

function logTime(): string {
  return new Date().toISOString()
}

function streamChunkText(chunk: BufferedStreamChunk): string {
  if (chunk.type === 'text-delta') return chunk.text
  if (chunk.type === 'reasoning-delta') return chunk.reasoning
  if (chunk.type === 'tool-input-delta') return chunk.argsTextDelta
  return ''
}

function previewText(value: string, maxLength = 240): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

const debugLastSendAt = new Map<string, number>()

function debugGapMs(key: string, now = Date.now()): number | undefined {
  const previous = debugLastSendAt.get(key)
  debugLastSendAt.set(key, now)
  return previous === undefined ? undefined : now - previous
}

type BufferedStreamChunk =
  | { type: 'text-delta'; text: string; turnIndex?: number; voiceSpeakText?: string }
  | { type: 'reasoning-delta'; reasoning: string; turnIndex?: number; placement?: ReasoningPlacement }
  | { type: 'tool-input-delta'; toolCallId: string; argsTextDelta: string }

/** Accumulates high-frequency stream chunks between 16ms flush intervals. */
interface StreamBuffer {
  chunks: BufferedStreamChunk[]
  timer: ReturnType<typeof setTimeout> | null
}

export function createStreamBuffer(): StreamBuffer {
  return { chunks: [], timer: null }
}

export function appendStreamBufferChunk(buffer: StreamBuffer, chunk: StreamChunk): boolean {
  const last = buffer.chunks[buffer.chunks.length - 1]

  if (chunk.type === 'text-delta') {
    if (last?.type === 'text-delta' && last.turnIndex === chunk.turnIndex) {
      last.text += chunk.text
      if (chunk.voiceSpeakText !== undefined || last.voiceSpeakText !== undefined) {
        last.voiceSpeakText = `${last.voiceSpeakText ?? ''}${chunk.voiceSpeakText ?? ''}`
      }
    } else {
      buffer.chunks.push({
        type: 'text-delta',
        text: chunk.text,
        ...(chunk.turnIndex !== undefined ? { turnIndex: chunk.turnIndex } : {}),
        ...(chunk.voiceSpeakText !== undefined ? { voiceSpeakText: chunk.voiceSpeakText } : {}),
      })
    }
    return true
  }

  if (chunk.type === 'reasoning-delta') {
    if (last?.type === 'reasoning-delta' && last.turnIndex === chunk.turnIndex && last.placement === chunk.placement) {
      last.reasoning += chunk.reasoning
    } else {
      buffer.chunks.push({
        type: 'reasoning-delta',
        reasoning: chunk.reasoning,
        ...(chunk.turnIndex !== undefined ? { turnIndex: chunk.turnIndex } : {}),
        ...(chunk.placement ? { placement: chunk.placement } : {}),
      })
    }
    return true
  }

  if (chunk.type === 'tool-input-delta') {
    if (last?.type === 'tool-input-delta' && last.toolCallId === chunk.toolCallId) {
      last.argsTextDelta += chunk.argsTextDelta
    } else {
      buffer.chunks.push({
        type: 'tool-input-delta',
        toolCallId: chunk.toolCallId,
        argsTextDelta: chunk.argsTextDelta,
      })
    }
    return true
  }

  return false
}

export function drainStreamBuffer(buffer: StreamBuffer): BufferedStreamChunk[] {
  const chunks = buffer.chunks
  buffer.chunks = []
  return chunks
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
  private sender: IPCBridgeSender | null = null
  private unsubEventBus: Unsubscribe | null = null

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
    const existing = this.sessions.get(sessionId)

    if (existing && event.type !== 'stream:start') {
      this.flushBuffer(sessionId, existing)
    }

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
    // Clean up any existing subscription for this session first
    // (prevents double delivery if stream:start fires twice, e.g. rapid messages)
    const existing = this.sessions.get(sessionId)
    if (existing) {
      this.flushBuffer(sessionId, existing)
      existing.unsubStream()
      this.sessions.delete(sessionId)
    }

    // Subscribe to StreamChannel for this session
    const streamChannel = getStreamChannel()
    const unsubStream = streamChannel.subscribe(sessionId, (chunk) => {
      this.handleStreamChunk(sessionId, chunk)
    })

    this.sessions.set(sessionId, {
      messageId,
      unsubStream,
      buffer: createStreamBuffer(),
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

    for (const chunk of drainStreamBuffer(buf)) {
      if (shouldDebugStream()) {
        const text = streamChunkText(chunk)
        const key = `${sessionId}:${state.messageId}:${chunk.type}`
        console.log('[IPCBridge] send session:stream', {
          time: logTime(),
          gapMs: debugGapMs(key),
          sessionId,
          messageId: state.messageId,
          type: chunk.type,
          chars: text.length,
          text: previewText(text),
        })
      }
      this.safeSend(IPC_CHANNELS.SESSION_STREAM, {
        sessionId,
        chunk: { ...chunk, messageId: state.messageId },
      })
    }
  }

  // ── StreamChannel chunk handling ───────────────

  private handleStreamChunk(sessionId: string, chunk: StreamChunk): void {
    const state = this.sessions.get(sessionId)

    // For non-buffered chunk types, send immediately
    if (!state || (chunk.type !== 'text-delta' && chunk.type !== 'reasoning-delta' && chunk.type !== 'tool-input-delta')) {
      this.safeSend(IPC_CHANNELS.SESSION_STREAM, {
        sessionId,
        chunk: state ? { ...chunk, messageId: (chunk as any).messageId || state.messageId } : chunk,
      })
      return
    }

    const buf = state.buffer
    appendStreamBufferChunk(buf, chunk)

    // Schedule flush if not already pending
    if (buf.timer === null) {
      buf.timer = setTimeout(() => this.flushBuffer(sessionId, state), 16)
    }
  }
}
