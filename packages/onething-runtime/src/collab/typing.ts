/**
 * W19 真实 typing — the pure half (docs/design/multi-agent-collab-im.md §4 W19).
 *
 * 用户点题:"这种模式下,typing 应该可以改为真正的了吧"。
 *
 * Before W19 the indicator was a simulation: the queue lit it the moment an
 * activation was enqueued, so it burned through the whole thinking phase and
 * said nothing about whether words were actually being produced. Since W14b an
 * utterance IS a `say` tool call, and the streamed-tool-arguments plumbing
 * gives that call a physical duration — **the window in which `say`'s arguments
 * stream is the window in which the agent is literally typing**. That is the
 * signal this tracker turns into `collab:typing` pulses:
 *
 *   tool:input-start(say)          → true   (the first line starts arriving)
 *   tool:input-end(that call)      → false  (that line is complete)
 *   …another say…                  → true / false again (IM 短句连发 = 多脉冲)
 *   thinking / board               → nothing at all (真人思考时你也看不到 typing)
 *
 * Deliberately NOT here:
 *  - **which room** — the arguments are still streaming when the light goes on,
 *    so a `room` argument cannot be read yet. The caller lights the session's
 *    bound room (see the observer). A `say` that explicitly aims at another room
 *    briefly lights the wrong one; accepted (W19 §2).
 *  - **timers / TTL** — the renderer already expires stale trues after 60s.
 *
 * Providers that do not stream tool arguments at all emit no input-start, so
 * their turns simply stay quiet: a missing signal degrades to the old silence,
 * never to a stuck light.
 */
import { COLLAB_SAY_TOOL_NAME, type CollabTurnToolCallLike } from './say.js'

/** Structural view of the session events the tracker reads — the fields of
 *  `tool:input-start` / `tool:input-end` / stream terminals it actually needs. */
export interface CollabTypingSignal {
  type?: string
  toolCallId?: string
  /** `tool:input-start` carries the resolved display name here. */
  toolName?: string
  toolCall?: (CollabTurnToolCallLike & { id?: string }) | undefined
}

export interface CollabTypingTracker {
  /**
   * Feed one session event. Returns the value to emit, or `null` when this
   * event changes nothing — a second concurrent `say` does not re-light an
   * already-lit indicator, and finishing one of two does not put it out.
   */
  observe(signal: CollabTypingSignal | null | undefined): boolean | null
  /** Window closed (turn settled, observer detached). Returns `false` when the
   *  light is still on — the 兜底 that guarantees no name stays stuck typing. */
  finish(): boolean | null
  /** Is the indicator currently lit? (test/introspection) */
  readonly lit: boolean
}

/** Every shape a tool name can take across the event/persisted forms. */
function toolNameOf(signal: CollabTypingSignal): string | undefined {
  return signal.toolName
    || signal.toolCall?.toolName
    || signal.toolCall?.toolId
    || signal.toolCall?.name
    || undefined
}

function toolCallIdOf(signal: CollabTypingSignal): string | undefined {
  return signal.toolCallId || signal.toolCall?.id || undefined
}

/** Stream terminals extinguish unconditionally: no stream, nobody typing. A
 *  turn that dies mid-arguments never sends input-end, and without this the
 *  light would ride to the end of the activation window. */
const TERMINAL_TYPES = new Set(['stream:complete', 'stream:error', 'stream:aborted'])

export function createCollabTypingTracker(): CollabTypingTracker {
  /** Say calls whose arguments are still streaming, by toolCallId. A Set (not a
   *  boolean) because providers may stream two tool calls at once — the light
   *  belongs to the union of them, and flickering between the two would read as
   *  a stutter rather than as two messages. */
  const streaming = new Set<string>()
  let lit = false

  return {
    get lit() {
      return lit
    },

    observe(signal) {
      if (!signal?.type) return null

      if (signal.type === 'tool:input-start') {
        if (toolNameOf(signal) !== COLLAB_SAY_TOOL_NAME) return null
        const toolCallId = toolCallIdOf(signal)
        if (!toolCallId) return null
        streaming.add(toolCallId)
        if (lit) return null
        lit = true
        return true
      }

      // Arguments complete — the authoritative receive moment (input-end) or,
      // for a provider that skips it, the execution that necessarily follows.
      if (signal.type === 'tool:input-end' || signal.type === 'tool:execution-start') {
        const toolCallId = toolCallIdOf(signal)
        if (!toolCallId || !streaming.delete(toolCallId)) return null
        if (streaming.size > 0 || !lit) return null
        lit = false
        return false
      }

      if (TERMINAL_TYPES.has(signal.type)) {
        streaming.clear()
        if (!lit) return null
        lit = false
        return false
      }

      return null
    },

    finish() {
      streaming.clear()
      if (!lit) return null
      lit = false
      return false
    },
  }
}
