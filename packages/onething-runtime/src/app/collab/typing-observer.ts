/**
 * W19 真实 typing — the wiring half (docs/design/multi-agent-collab-im.md §4 W19).
 *
 * The pure tracker (`@onething/runtime/collab`) turns a stream of session events
 * into typing pulses; this file is the only place that knows where those events
 * come from and where the pulses go.
 *
 * **Where it listens**: the session where the turn actually runs — an agent
 * execution session (W18) or a work session. Per-session `onAny`, hung for the
 * duration of one turn window and torn down the moment the window closes. There
 * is deliberately no global observer: `tool:*` events fire on every chat in the
 * app, and a resident per-chunk listener would tax sessions that have nothing to
 * do with any room.
 *
 * **Where it points**: the room the session is bound to — the drive's target
 * room for an execution session, the parent room for a work session. Resolving
 * it here (rather than from the call's `room` argument) is what makes the light
 * come on while the arguments are still streaming; a `say` that explicitly names
 * a different room lights this one for the length of that call (W19 §2, accepted).
 */
import { createCollabTypingTracker, type CollabTypingSignal } from '@onething/runtime/collab'
import { getEventBus } from '../events/index.js'

/**
 * IM typing indicator (§2.4). Since W19 `true` means "this member's `say` call
 * is streaming its words right now"; `false` means that line is done — or that
 * the turn settled without one, the "typed and deleted" case the design wants
 * the room to see as a light that came on and went out.
 */
export function emitCollabTyping(roomSessionId: string, agentId: string, typing: boolean): void {
  void getEventBus().emit(roomSessionId, {
    type: 'collab:typing',
    agentId,
    typing,
  } as Parameters<ReturnType<typeof getEventBus>['emit']>[1])
}

/**
 * The room's turn window opened or closed (collab-team-v2 §5.1 入口①).
 *
 * Neighbour of `emitCollabTyping` and deliberately NOT the same signal. Typing
 * says "words are streaming right now" and flickers several times inside one
 * turn; this says "this room has a stream you can stop", once at each edge of
 * the window `abortRoomTurn` aims at. A stop button driven by the typing light
 * would disappear between two `say` calls, in the exact seconds a user who
 * wants to interrupt is reaching for it.
 */
export function emitCollabTurnActive(roomSessionId: string, agentId: string, active: boolean): void {
  void getEventBus().emit(roomSessionId, {
    type: 'collab:turn-active',
    agentId,
    active,
  } as Parameters<ReturnType<typeof getEventBus>['emit']>[1])
}

/**
 * Watch one turn window and mirror its `say` calls into the room as typing.
 *
 * Returns the detach function, which is also the 兜底: it unsubscribes AND
 * forces the indicator off if the window closed with the light still on (a
 * crash mid-arguments, an aborted stream, a provider that never sent input-end).
 * Call it in a `finally` — an early return that skips it leaks a bus handler.
 */
export function observeCollabSayTyping(options: {
  /** The session the turn runs in (agent execution session, or work session). */
  sessionId: string
  /** The room whose typing line lights up. */
  roomSessionId: string
  agentId: string
}): () => void {
  const { sessionId, roomSessionId, agentId } = options
  const tracker = createCollabTypingTracker()
  const unsubscribe = getEventBus().onAny(sessionId, envelope => {
    const signal = (envelope as { event?: CollabTypingSignal } | undefined)?.event
    const next = tracker.observe(signal)
    if (next !== null) emitCollabTyping(roomSessionId, agentId, next)
  }, 'collab-typing')

  let detached = false
  return () => {
    if (detached) return
    detached = true
    unsubscribe()
    const final = tracker.finish()
    if (final !== null) emitCollabTyping(roomSessionId, agentId, final)
  }
}
