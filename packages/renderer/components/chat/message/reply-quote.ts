/**
 * Quote-reply snapshots — the renderer's view of the rule (W7,
 * docs/design/multi-agent-collab-im.md §3.5 A).
 *
 * The rule itself lives in `@onething/runtime/collab` since W13.2, because the
 * coordinator now builds the same snapshot when it hangs a quote on an agent's
 * reply after the fact. Two builders would mean two truncation rules and two
 * author fallbacks in one transcript; this module is the renderer-typed face of
 * the single one.
 */
import {
  COLLAB_REPLY_EXCERPT_MAX_CHARS,
  COLLAB_REPLY_UNKNOWN_AUTHOR_LABEL,
  COLLAB_REPLY_USER_LABEL,
  buildCollabReplyToSnapshot,
  condenseCollabReplyExcerpt,
} from '@onething/runtime/collab'
import type { ChatMessageReplyTo } from '@/types'

/** §3.5 A: the excerpt is the first 120 chars of the quoted message. */
export const REPLY_EXCERPT_MAX_CHARS = COLLAB_REPLY_EXCERPT_MAX_CHARS

/** The label a quoted human message gets — the same signature the room
 *  projection uses for the user, so UI and model read one name. */
export const REPLY_USER_LABEL = COLLAB_REPLY_USER_LABEL

/** Fallback for an agent whose roster entry is missing. */
export const REPLY_UNKNOWN_AUTHOR_LABEL = COLLAB_REPLY_UNKNOWN_AUTHOR_LABEL

/**
 * Flatten to one line: the quote block and the model-side「> 作者: 摘录」line
 * are both single-line, so newlines and runs of whitespace collapse once.
 */
export function condenseReplyExcerpt(
  content: string,
  maxChars: number = REPLY_EXCERPT_MAX_CHARS,
): string {
  return condenseCollabReplyExcerpt(content, maxChars)
}

export interface BuildReplyToSnapshotOptions {
  messageId: string
  /** Signature at quote time; blank falls back to 成员. */
  authorLabel?: string
  /** The quoted message's text. */
  content: string
}

/**
 * Build the snapshot that rides on the outgoing message. Returns null when
 * there is nothing worth quoting (no id, or a message with no text at all —
 * an empty quote block is noise, not context).
 */
export function buildReplyToSnapshot(
  options: BuildReplyToSnapshotOptions,
): ChatMessageReplyTo | null {
  return buildCollabReplyToSnapshot(options)
}
