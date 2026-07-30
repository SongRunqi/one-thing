/**
 * Response willingness — docs/design/multi-agent-collab-im.md §2.
 *
 * The IM turn: there is no "default responder" any more. After every real
 * message each member decides FOR ITSELF whether it wants to speak, via one
 * cheap small-context call. This module is the pure half (prompt shape +
 * reply parser); the app layer runs the calls and queues the volunteers
 * (app/collab/willingness-runner.ts).
 *
 * Prompt discipline is the same red line as the room turn (roster.ts): the
 * persona is used VERBATIM, and the only things added to the system message
 * are FACTS — the existing room note, plus (PM only) one line stating it is
 * the room's lead. The JSON instruction lives in the USER message, where it
 * is the task at hand rather than a behavioral rule grafted onto a persona.
 */
import { isCollabProjectedRoomMessage } from './cooldown.js'
import { truncateAtCodePoint } from './truncate.js'
import { renderCollabMentionText } from './mentions.js'
import { formatCollabReplyQuote } from './projection.js'
import {
  COLLAB_REACTION_EMOJIS,
  appendCollabReactionSummary,
  normalizeCollabReactionEmoji,
  type CollabReactionEmoji,
} from './reactions.js'
import {
  buildCollabRoomSystemPrompt,
  resolveCollabSpeakerLabel,
  type BuildCollabRoomContextOptions,
} from './roster.js'
import { formatCollabProjectedSystemLine, isCollabProjectedSystemLine } from './system-lines.js'
import type { CollabAgentLike, CollabMessageLike } from './types.js'

/** How many recent messages the judgement window carries. */
export const COLLAB_WILLINGNESS_RECENT_LIMIT = 8
/** Per-message truncation inside the judgement window (cost engineering). */
export const COLLAB_WILLINGNESS_LINE_LIMIT = 200

/**
 * The one instruction, kept in the user message.
 *
 * `react` is the free half of the turn (§3.5 B): the judgement call is already
 * paid for, so a member that stays quiet can still leave the one gesture real
 * people leave — 没什么好说的但点个赞. It is offered ONLY as the silent path's
 * companion; a member that is about to speak has no use for it.
 */
export const COLLAB_WILLINGNESS_QUESTION =
  '最新这条消息之后,你会开口说话吗?只输出 JSON: {"respond": true|false, "react": "👍"|null}' +
  `(不说话时也可以只点个表情,可选:${COLLAB_REACTION_EMOJIS.join(' ')};不想点就填 null)`

/** The single factual line the room lead gets (replaces default-responder). */
export const COLLAB_WILLINGNESS_PM_FACT = '(你是本群的负责人。)'

export interface BuildWillingnessPromptOptions extends BuildCollabRoomContextOptions {
  /** The agent's own persona prompt (its systemPrompt field), used VERBATIM. */
  personaPrompt: string
  /** Room transcript tail; filtered and windowed here. */
  recent: readonly CollabMessageLike[]
  /** Room lead, if any — only affects the agent that IS the lead. */
  pmAgentId?: string
  /**
   * Names for speakers the room roster no longer holds (P2-16). The app layer
   * passes the global agent lookup; without it a departed member's line falls
   * back to 「前成员」 rather than to a raw id.
   */
  resolveAgentName?: (agentId: string) => string | undefined
}

export interface CollabWillingnessPrompt {
  system: string
  user: string
}


function condense(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim()
  return flat.length > COLLAB_WILLINGNESS_LINE_LIMIT
    ? `${truncateAtCodePoint(flat, COLLAB_WILLINGNESS_LINE_LIMIT)}…`
    : flat
}

/**
 * The judgement window: the same IM projection the room uses (`名字: 内容`),
 * one line per message, drives/pass/unmarked system lines excluded,
 * tail-windowed. Marked collab system lines (task lifecycle, membership) DO
 * enter as「系统: …」— same rule as the room projection (W9.1), because a
 * member deciding whether to speak must see the same facts it would answer
 * with (「任务受阻」is exactly the kind of line that should make the lead talk).
 */
export function buildWillingnessWindow(options: {
  recent: readonly CollabMessageLike[]
  members: readonly CollabAgentLike[]
  userLabel?: string
  limit?: number
  /** Names for speakers the roster no longer holds (P2-16). */
  resolveAgentName?: (agentId: string) => string | undefined
}): string[] {
  const userLabel = options.userLabel ?? '用户'
  const limit = options.limit ?? COLLAB_WILLINGNESS_RECENT_LIMIT
  const lines: string[] = []

  for (const message of options.recent) {
    // Drives, `[pass]`, thinking records (W14b: another member's unspoken
    // deliberation is not part of what the room said) and unmarked system
    // noise are dropped by the shared visibility口径 — the same one W21's
    // speech cooldown counts its window in.
    if (!isCollabProjectedRoomMessage(message)) continue
    if (isCollabProjectedSystemLine(message)) {
      const systemBody = condense(message.content ?? '')
      if (systemBody) lines.push(formatCollabProjectedSystemLine(systemBody))
      continue
    }
    // Same rename resolution the room projection applies (W14a): a member
    // deciding whether to speak must read the very names the room now uses —
    // "@新名字 你看一下" is only a signal if it says the reader's current name.
    const body = condense(renderCollabMentionText(message.content, message.mentions, options.members))
    if (!body) continue
    const label = message.role === 'user'
      ? userLabel
      : resolveCollabSpeakerLabel(message.agentId, options.members, options.resolveAgentName)
    // A quote rides INSIDE the entry, not as its own array slot: the window is
    // limited by MESSAGES, and a two-slot entry would silently shrink it. The
    // reaction tally rides on the tail of the same entry (§3.5 B) — "群里已经
    // 三个人点了赞" is exactly the signal that says nobody needs to say it again.
    const entry = appendCollabReactionSummary(`${label}: ${body}`, message.reactions)
    const quote = formatCollabReplyQuote(message.replyTo)
    lines.push(quote ? `${quote}\n${entry}` : entry)
  }

  return limit > 0 ? lines.slice(-limit) : lines
}

/**
 * The whole judgement prompt. system = persona verbatim + the factual room
 * note (+ the lead fact for the PM); user = the window + the JSON question.
 */
export function buildWillingnessPrompt(
  options: BuildWillingnessPromptOptions,
): CollabWillingnessPrompt {
  const roomSystem = buildCollabRoomSystemPrompt({
    self: options.self,
    members: options.members,
    roomName: options.roomName,
    userLabel: options.userLabel,
    personaPrompt: options.personaPrompt,
    // Same situation note as the room turn, in-flight cards included (W9.3).
    taskFacts: options.taskFacts,
  })
  const isLead = Boolean(options.pmAgentId) && options.pmAgentId === options.self.id
  const system = isLead ? `${roomSystem}\n\n${COLLAB_WILLINGNESS_PM_FACT}` : roomSystem

  const windowLines = buildWillingnessWindow({
    recent: options.recent,
    members: options.members,
    userLabel: options.userLabel,
    resolveAgentName: options.resolveAgentName,
  })
  const user = [windowLines.join('\n'), COLLAB_WILLINGNESS_QUESTION]
    .filter(part => part.length > 0)
    .join('\n\n')

  return { system, user }
}

function stripCodeFences(text: string): string {
  return text.replace(/```[^\n`]*\n?/g, '').replace(/```/g, '')
}

/**
 * A parsed judgement (§3.5 B extended the shape). `react` is only ever acted
 * on when `respond` is false — a member that is about to speak has said its
 * piece in words.
 */
export interface CollabWillingnessVerdict {
  respond: boolean
  /** Palette emoji, or null when none was offered / it was off-palette. */
  react: CollabReactionEmoji | null
}

const SILENT_VERDICT: CollabWillingnessVerdict = { respond: false, react: null }

/**
 * The emoji half of the reply. Off-palette values are DROPPED rather than
 * stored: the room's reaction vocabulary is a product decision, not something
 * a model gets to extend at runtime.
 *
 * Quoted forms are excluded from the bare alternative on purpose — that is what
 * makes an echoed instruction (`"react": "👍"|null`) fail to match at all
 * instead of parsing as a real 👍.
 */
function parseWillingnessReact(body: string): CollabReactionEmoji | null {
  const match = /['"]?react['"]?\s*[::=]\s*(?:"([^"]*)"|'([^']*)'|([^\s,}\]"']+))(?!\s*[|｜/])/i
    .exec(body)
  if (!match) return null
  return normalizeCollabReactionEmoji(match[1] ?? match[2] ?? match[3])
}

/**
 * Lenient parse of the judgement reply. Anything that is not a recognizable
 * "yes" is a NO — silence is the safe failure mode (a missed reply costs the
 * user one @; a spurious reply costs tokens and noise).
 *
 * The negative lookahead is deliberate: models that echo the instruction
 * (`{"respond": true|false}`) have not answered, and must not read as `true`.
 *
 * Backward compatible with the pre-W8 shape: a bare `{"respond": true}` (or a
 * bare `true`) parses exactly as before and simply carries no reaction.
 */
export function parseWillingnessReply(
  text: string | null | undefined,
): CollabWillingnessVerdict {
  if (!text) return SILENT_VERDICT
  const body = stripCodeFences(text)
  const react = parseWillingnessReact(body)

  const keyed = /['"]?respond['"]?\s*[::=]\s*['"]?(true|false)\b(?!\s*[|｜/])/i.exec(body)
  if (keyed) return { respond: keyed[1].toLowerCase() === 'true', react }

  const bare = body.replace(/[\s"'`「」。.,,!!]/g, '').toLowerCase()
  if (bare === 'true') return { respond: true, react }
  return { respond: false, react }
}
