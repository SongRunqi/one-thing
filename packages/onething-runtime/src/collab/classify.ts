/**
 * What a room message IS — one classifier, one place (R3, 债4).
 *
 * A room transcript carries six different kinds of message under one shape,
 * and every one of them is told apart by a `source` marker that can arrive on
 * EITHER of two fields: `message.source` (what the writer stamped) or
 * `message.origin.source` (what the transport stamped). Every predicate used
 * to read both fields itself, six near-identical times, and the duplication
 * has already cost a real incident — the engine copies a drive's envelope onto
 * the message it creates, so a consumer that checked only one of the two
 * fields read a turn record as a drive.
 *
 * So the double-field read happens exactly once, here, and the predicates that
 * every caller already imports delegate to it. A seventh marker is a new arm of
 * this switch and nothing else.
 *
 * The kinds:
 *
 *  | kind              | what it is                                   | 投影 | 链长 |
 *  | drive             | the synthetic user message carrying a turn   |  ✗   |  ✗   |
 *  | say               | a real utterance (the `say` tool wrote it)   |  ✓   |  计  |
 *  | thinking          | the turn's host record: thinking + tools     |  ✗   |  ✗   |
 *  | harvest           | a report the coordinator posted for a worker |  ✓   |  ✗   |
 *  | task-line         | task lifecycle system line (projected)       |  ✓   |  ✗   |
 *  | membership-line   | 群公告 system line (projected)               |  ✓   |  ✗   |
 *  | operational-line  | budget / chain / freeze — machine bookkeeping|  ✗   |  ✗   |
 *  | plain             | pre-marker transcripts, and user messages    |  ✓   |  计  |
 *
 * `plain` is deliberately the fallback: a transcript written before a marker
 * existed keeps behaving exactly as it did when it was written. The rule is a
 * MARKER, never a migration.
 */
import type { CollabMessageLike } from './types.js'

/** The system-internal message source stamped on coordinator drives. */
export const COLLAB_MESSAGE_SOURCE = 'collab'

/**
 * Harvest posts: the delivery/progress reports the coordinator writes into the
 * room directly under a worker's name (assistant + agentId, no turn behind
 * them). Marked with their OWN source — deliberately not COLLAB_MESSAGE_SOURCE,
 * whose predicate claims every message carrying it as a drive.
 *
 * The marker exists so a boot replay can tell work-pipeline output apart from
 * real chat speech: chain accounting excludes these live (noteAgentSpoke is a
 * noop for them) and must reach the same number when recomputed (W12).
 */
export const COLLAB_HARVEST_SOURCE = 'collab-harvest'

/** Marker on an assistant message the `say` tool wrote — a real utterance. */
export const COLLAB_SAY_SOURCE = 'collab-say'

/**
 * Marker on the turn's host assistant message — the agent's thinking record,
 * not something it said. Stamped at creation (store choke point), so the marker
 * exists from birth: a crash mid-turn can never leave a thinking record looking
 * like speech, and the room UI never flashes a full bubble that collapses a
 * tick later.
 */
export const COLLAB_TURN_SOURCE = 'collab-turn'

/** Task lifecycle lines: started / delivered / halted / interrupted / review. */
export const COLLAB_SYSTEM_SOURCE_TASK = 'collab-task'
/** Membership change lines (W6): joined / left / role changed. */
export const COLLAB_SYSTEM_SOURCE_MEMBERSHIP = 'collab-membership'

/** Every system-line source that reaches the model. Extend here, nowhere else. */
export const COLLAB_PROJECTED_SYSTEM_SOURCES: readonly string[] = [
  COLLAB_SYSTEM_SOURCE_TASK,
  COLLAB_SYSTEM_SOURCE_MEMBERSHIP,
]

export type CollabRoomMessageKind =
  | 'drive'
  | 'say'
  | 'thinking'
  | 'harvest'
  | 'task-line'
  | 'membership-line'
  | 'operational-line'
  | 'plain'

type SourceMarked = Pick<CollabMessageLike, 'role' | 'source' | 'origin'>

/**
 * The double-field read, once. `origin.source` matters because the engine
 * copies a command's envelope onto the message it persists — a message can
 * therefore carry its marker on either field, and reading only one of them is
 * the bug this module exists to make impossible.
 */
function marked(message: SourceMarked, marker: string): boolean {
  return message.source === marker || message.origin?.source === marker
}

export function classifyCollabRoomMessage(message: SourceMarked): CollabRoomMessageKind {
  if (message.role === 'user') {
    return marked(message, COLLAB_MESSAGE_SOURCE) ? 'drive' : 'plain'
  }

  if (message.role === 'assistant') {
    // Precedence, not just order: a message carrying BOTH markers is thinking.
    // This used to live implicitly in each consumer's if-chain (chain.ts and
    // projection.ts both test thinking first) and is exactly the kind of rule
    // that goes missing when a seventh consumer appears — so the classifier
    // owns it. A mislabelled record must never count toward the chain or reach
    // the model; the reverse costs one utterance nobody wrote.
    if (marked(message, COLLAB_TURN_SOURCE)) return 'thinking'
    if (marked(message, COLLAB_SAY_SOURCE)) return 'say'
    if (marked(message, COLLAB_HARVEST_SOURCE)) return 'harvest'
    return 'plain'
  }

  if (message.role === 'system') {
    if (marked(message, COLLAB_SYSTEM_SOURCE_TASK)) return 'task-line'
    if (marked(message, COLLAB_SYSTEM_SOURCE_MEMBERSHIP)) return 'membership-line'
    // Budget, chain gate, freeze, permission reminders: the machine's own
    // bookkeeping, shown to the user and withheld from the model (W9.1).
    return 'operational-line'
  }

  return 'plain'
}

/** A coordinator drive: the synthetic user message that carries an activation. */
export function isCollabDriveMessage(message: SourceMarked): boolean {
  return classifyCollabRoomMessage(message) === 'drive'
}

/** A worker delivery/progress report posted by the coordinator, not spoken. */
export function isCollabHarvestMessage(message: SourceMarked): boolean {
  return classifyCollabRoomMessage(message) === 'harvest'
}

/** An utterance the `say` tool wrote — the only thing a room ever receives. */
export function isCollabSayMessage(message: SourceMarked): boolean {
  return classifyCollabRoomMessage(message) === 'say'
}

/**
 * The turn's own host message: thinking text and whatever tools it ran. Never
 * speech — excluded from the projection, the willingness window and the chain,
 * and rendered as a collapsed trace row.
 */
export function isCollabThinkingMessage(message: SourceMarked): boolean {
  return classifyCollabRoomMessage(message) === 'thinking'
}

/**
 * Is this a system line the model gets to read? Marked-source system messages
 * only — an unmarked system message (budget, chain gate, freeze, permission
 * reminder) is display-only, and a marked source on a non-system role is not a
 * system line at all.
 */
export function isCollabProjectedSystemLine(message: SourceMarked): boolean {
  const kind = classifyCollabRoomMessage(message)
  return kind === 'task-line' || kind === 'membership-line'
}
