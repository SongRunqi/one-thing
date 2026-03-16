/**
 * IPC Bridge
 *
 * Subscribes to EventBus and StreamChannel, translating events back to
 * existing IPC channel formats for the renderer. This is the **single exit
 * point** for all renderer IPC — no other code should call sender.send()
 * for streaming events.
 *
 * Key behaviors:
 * - `safeSend()` guards against window-close (sender.isDestroyed())
 * - Text/reasoning deltas are coalesced in a 16ms buffer before sending
 * - Tool-input-delta is sent immediately (infrequent)
 * - Flush-before-complete: all pending buffers are flushed before
 *   sending stream:complete or stream:error to the renderer
 */

import type { WebContents } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { SessionEventEnvelope, StreamChunk } from '../../shared/events/index.js'
import type { Unsubscribe } from './types.js'
import type { EventBus } from './event-bus.js'
import type { StreamChannel } from './stream-channel.js'
import { getEventBus, getStreamChannel } from './index.js'

const COALESCE_MS = 16

/**
 * Per-session state tracked by the IPCBridge while a stream is active.
 */
interface BridgeSessionState {
  messageId: string
  textBuffer: string
  reasoningBuffer: string
  flushTimer: ReturnType<typeof setTimeout> | null
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
    })

    // Auto-cleanup when the BrowserWindow is destroyed
    sender.on('destroyed', () => {
      this.unbind()
    })

    console.log('[IPCBridge] Bound to WebContents')
  }

  /**
   * Dispose all subscriptions and flush all pending buffers.
   */
  unbind(): void {
    // Flush all active session buffers
    for (const [sessionId, state] of this.sessions) {
      this.flushBuffers(sessionId, state)
      if (state.unsubStream) {
        state.unsubStream()
      }
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

  /**
   * Send an IPC message, guarding against destroyed WebContents.
   * This is the single point where sender.send() is called.
   */
  private safeSend(channel: string, payload: any): void {
    if (!this.sender || this.sender.isDestroyed()) {
      return
    }
    try {
      this.sender.send(channel, payload)
    } catch (err) {
      // WebContents may have been destroyed between check and send
      console.warn('[IPCBridge] Send failed (window likely closed):', err)
    }
  }

  // ── Event handling ─────────────────────────────

  private handleSessionEvent(envelope: SessionEventEnvelope): void {
    const { sessionId, event } = envelope

    switch (event.type) {
      case 'stream:start':
        this.handleStreamStart(sessionId, event.assistantMessageId)
        break

      case 'stream:complete':
        this.handleStreamComplete(sessionId, event.data)
        break

      case 'stream:error':
        this.handleStreamError(sessionId, event.data)
        break

      case 'stream:aborted':
        this.handleStreamAborted(sessionId, event.reason)
        break

      case 'tool:call':
        this.safeSend(IPC_CHANNELS.STREAM_CHUNK, {
          type: 'tool_call',
          content: '',
          messageId: this.getMessageId(sessionId),
          sessionId,
          toolCall: event.toolCall,
        })
        break

      case 'tool:result':
        this.safeSend(IPC_CHANNELS.STREAM_CHUNK, {
          type: 'tool_result',
          content: '',
          messageId: this.getMessageId(sessionId),
          sessionId,
          toolCall: event.toolCall,
        })
        break

      case 'tool:input-start':
        this.safeSend(IPC_CHANNELS.STREAM_CHUNK, {
          type: 'tool_input_start',
          content: '',
          messageId: this.getMessageId(sessionId),
          sessionId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          toolCall: event.toolCall,
        })
        break

      case 'content:part':
        this.safeSend(IPC_CHANNELS.STREAM_CHUNK, {
          type: 'content_part',
          content: '',
          messageId: this.getMessageId(sessionId),
          sessionId,
          contentPart: event.part,
        })
        break

      case 'content:continuation':
        this.safeSend(IPC_CHANNELS.STREAM_CHUNK, {
          type: 'continuation',
          content: '',
          messageId: this.getMessageId(sessionId),
          sessionId,
        })
        break

      case 'step:added':
        this.safeSend(IPC_CHANNELS.STEP_ADDED, {
          sessionId,
          messageId: this.getMessageId(sessionId),
          step: event.step,
        })
        break

      case 'step:updated':
        this.safeSend(IPC_CHANNELS.STEP_UPDATED, {
          sessionId,
          messageId: this.getMessageId(sessionId),
          stepId: event.stepId,
          updates: event.updates,
        })
        break

      case 'context:size-updated':
        this.safeSend(IPC_CHANNELS.CONTEXT_SIZE_UPDATED, {
          sessionId,
          contextSize: event.contextSize,
        })
        break

      case 'compact:started':
        this.safeSend(IPC_CHANNELS.CONTEXT_COMPACT_STARTED, {
          sessionId,
        })
        break

      case 'compact:completed':
        this.safeSend(IPC_CHANNELS.CONTEXT_COMPACT_COMPLETED, {
          sessionId,
          ...event.data,
        })
        break

      case 'skill:activated':
        this.safeSend(IPC_CHANNELS.SKILL_ACTIVATED, {
          sessionId,
          messageId: this.getMessageId(sessionId),
          skillName: event.skillName,
        })
        break

      // message:user-created and message:assistant-created are handled by Session,
      // not translated to IPC (the renderer tracks these via its own stores)
      case 'message:user-created':
      case 'message:assistant-created':
        break
    }
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
      textBuffer: '',
      reasoningBuffer: '',
      flushTimer: null,
      unsubStream,
    })
  }

  private handleStreamComplete(sessionId: string, data: any): void {
    const state = this.sessions.get(sessionId)
    if (state) {
      // Flush-before-complete: send any pending text/reasoning
      this.flushBuffers(sessionId, state)
      state.unsubStream()
    }

    this.safeSend(IPC_CHANNELS.STREAM_COMPLETE, {
      messageId: this.getMessageId(sessionId),
      sessionId,
      ...data,
    })

    this.sessions.delete(sessionId)
  }

  private handleStreamAborted(sessionId: string, reason?: string): void {
    const state = this.sessions.get(sessionId)
    if (state) {
      this.flushBuffers(sessionId, state)
      state.unsubStream()
    }

    // Renderer still expects STREAM_COMPLETE with aborted flag
    this.safeSend(IPC_CHANNELS.STREAM_COMPLETE, {
      messageId: this.getMessageId(sessionId),
      sessionId,
      aborted: true,
      ...(reason && { reason }),
    })

    this.sessions.delete(sessionId)
  }

  private handleStreamError(sessionId: string, data: any): void {
    const state = this.sessions.get(sessionId)
    if (state) {
      // Flush-before-error: send any pending text/reasoning
      this.flushBuffers(sessionId, state)
      state.unsubStream()
    }

    this.safeSend(IPC_CHANNELS.STREAM_ERROR, {
      messageId: this.getMessageId(sessionId),
      sessionId,
      ...data,
    })

    this.sessions.delete(sessionId)
  }

  // ── StreamChannel chunk handling ───────────────

  private handleStreamChunk(sessionId: string, chunk: StreamChunk): void {
    const state = this.sessions.get(sessionId)
    if (!state) return

    switch (chunk.type) {
      case 'text-delta':
        state.textBuffer += chunk.text
        this.scheduleFlush(sessionId, state)
        break

      case 'reasoning-delta':
        state.reasoningBuffer += chunk.reasoning
        this.scheduleFlush(sessionId, state)
        break

      case 'tool-input-delta':
        // Send immediately — tool input deltas are infrequent
        this.safeSend(IPC_CHANNELS.STREAM_CHUNK, {
          type: 'tool_input_delta',
          content: '',
          messageId: state.messageId,
          sessionId,
          toolCallId: chunk.toolCallId,
          argsTextDelta: chunk.argsTextDelta,
        })
        break
    }
  }

  // ── Coalescing ─────────────────────────────────

  private scheduleFlush(sessionId: string, state: BridgeSessionState): void {
    if (state.flushTimer !== null) return
    state.flushTimer = setTimeout(() => {
      this.flushBuffers(sessionId, state)
    }, COALESCE_MS)
  }

  private flushBuffers(sessionId: string, state: BridgeSessionState): void {
    if (state.flushTimer !== null) {
      clearTimeout(state.flushTimer)
      state.flushTimer = null
    }

    if (state.textBuffer) {
      this.safeSend(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'text',
        content: state.textBuffer,
        messageId: state.messageId,
        sessionId,
      })
      state.textBuffer = ''
    }

    if (state.reasoningBuffer) {
      this.safeSend(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'reasoning',
        content: '',
        messageId: state.messageId,
        sessionId,
        reasoning: state.reasoningBuffer,
      })
      state.reasoningBuffer = ''
    }
  }

  // ── Helpers ────────────────────────────────────

  private getMessageId(sessionId: string): string {
    return this.sessions.get(sessionId)?.messageId ?? ''
  }
}
