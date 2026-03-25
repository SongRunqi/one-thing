/**
 * Event-Only Emitter
 *
 * Phase 2 replacement for DualWriteEmitter. Same IPCEmitter interface, but:
 * - Store mutations are kept for methods with side effects (sendStepAdded,
 *   sendStepUpdated, sendSkillActivated)
 * - EventBus.emit() is called for all structured events
 * - StreamChannel.push() is called for text-delta, reasoning-delta,
 *   tool-input-delta
 * - NO sender.send() — IPCBridge handles all IPC translation
 *
 * Previously skipped events (compact, skill) now emit to EventBus.
 */

import * as store from '../store.js'
import type { SessionEvent } from '../../shared/events/index.js'
import type { StreamContext } from '../engine/stream/stream-processor.js'
import type { IPCEmitter } from '../engine/stream/ipc-emitter.js'
import { getEventBus, getStreamChannel } from './index.js'

/**
 * Create an event-only emitter that sends to EventBus/StreamChannel.
 * IPCBridge translates these events to renderer IPC.
 *
 * Drop-in replacement for createDualWriteEmitter(ctx).
 */
export function createEventOnlyEmitter(ctx: StreamContext): IPCEmitter {
  const sessionId = ctx.sessionId
  const assistantMessageId = ctx.assistantMessageId

  // Lazy-get singletons
  let eventBus: ReturnType<typeof getEventBus> | null = null
  let streamChannel: ReturnType<typeof getStreamChannel> | null = null

  function bus() {
    if (!eventBus) {
      try { eventBus = getEventBus() } catch { /* not initialized */ }
    }
    return eventBus
  }

  function stream() {
    if (!streamChannel) {
      try { streamChannel = getStreamChannel() } catch { /* not initialized */ }
    }
    return streamChannel
  }

  /** Fire-and-forget emit to EventBus */
  function emitSafe(event: SessionEvent): void {
    const b = bus()
    if (b) {
      b.emit(sessionId, event).catch(err => {
        console.error('[EventOnlyEmitter] EventBus emit error:', err)
      })
    }
  }

  return {
    // ── Stream Chunks → StreamChannel ───────────

    sendTextChunk(text) {
      const s = stream()
      if (s) {
        try { s.push(sessionId, { type: 'text-delta', text }) } catch (err) {
          console.error('[EventOnlyEmitter] StreamChannel error:', err)
        }
      }
    },

    sendReasoningChunk(reasoning) {
      const s = stream()
      if (s) {
        try { s.push(sessionId, { type: 'reasoning-delta', reasoning }) } catch (err) {
          console.error('[EventOnlyEmitter] StreamChannel error:', err)
        }
      }
    },

    sendToolInputDelta(toolCallId, argsTextDelta) {
      const s = stream()
      if (s) {
        try { s.push(sessionId, { type: 'tool-input-delta', toolCallId, argsTextDelta }) } catch (err) {
          console.error('[EventOnlyEmitter] StreamChannel error:', err)
        }
      }
    },

    // ── Tool lifecycle → EventBus ───────────────

    sendToolCall(toolCall) {
      emitSafe({ type: 'tool:call', toolCall })
    },

    sendToolResult(toolCall) {
      emitSafe({ type: 'tool:result', toolCall })
    },

    sendToolInputStart(toolCallId, toolName, toolCall) {
      emitSafe({ type: 'tool:input-start', toolCallId, toolName, toolCall })
    },

    // ── Content → EventBus ──────────────────────

    sendContentPart(part) {
      emitSafe({ type: 'content:part', part })
    },

    sendContinuation(turnIndex?) {
      emitSafe({ type: 'content:continuation', turnIndex })
    },

    // ── Step → Store + EventBus ─────────────────
    // Store mutations are kept here because these methods have side effects

    sendStepAdded(step) {
      store.addMessageStep(sessionId, assistantMessageId, step)
      emitSafe({ type: 'step:added', step })
    },

    sendStepUpdated(stepId, updates) {
      store.updateMessageStep(sessionId, assistantMessageId, stepId, updates)
      emitSafe({ type: 'step:updated', stepId, updates })
    },

    // ── Session → EventBus ──────────────────────

    sendStreamComplete(data) {
      emitSafe({ type: 'stream:complete', data })
    },

    sendStreamError(data) {
      emitSafe({ type: 'stream:error', data })
    },

    sendStreamAborted(reason) {
      emitSafe({ type: 'stream:aborted', reason })
    },

    // ── Context → EventBus ──────────────────────

    sendContextSizeUpdate(contextSize) {
      emitSafe({ type: 'context:size-updated', contextSize })
    },

    // ── Skill → Store + EventBus ────────────────
    // Store mutation kept (updateMessageSkill)

    sendSkillActivated(skillName) {
      store.updateMessageSkill(sessionId, assistantMessageId, skillName)
      emitSafe({ type: 'skill:activated', skillName })
    },
  }
}
