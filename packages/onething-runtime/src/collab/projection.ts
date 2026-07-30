import { renderCollabMentionText } from './mentions.js'
import { isCollabPassMessage } from './pass.js'
import { isCollabThinkingMessage } from './say.js'
import { appendCollabReactionSummary } from './reactions.js'
import { COLLAB_SYSTEM_SPEAKER_LABEL, isCollabProjectedSystemLine } from './system-lines.js'
import { resolveCollabSpeakerLabel } from './roster.js'
import {
  isCollabDriveMessage,
  type CollabAgentLike,
  type CollabMessageLike,
  type CollabReplyToLike,
} from './types.js'

export interface ProjectedRoomMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ProjectRoomHistoryOptions {
  messages: readonly CollabMessageLike[]
  /** The agent being activated — its own past messages stay `assistant`. */
  selfAgentId: string
  /** Known agents (room members and any historical speakers). */
  agents: readonly CollabAgentLike[]
  /** Label for the human user's messages. Default: 用户 */
  userLabel?: string
  /**
   * Names for speakers the roster no longer holds (P2-16). The app layer passes
   * the global agent lookup; without it a departed member's line is signed
   * 「前成员」 rather than with a raw id.
   */
  resolveAgentName?: (agentId: string) => string | undefined
}

const TOOL_TEXT_LIMIT = 200

function brief(value: unknown): string {
  if (value === undefined || value === null) return ''
  const text = typeof value === 'string' ? value : safeStringify(value)
  return text.length > TOOL_TEXT_LIMIT ? `${text.slice(0, TOOL_TEXT_LIMIT)}…` : text
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/** Flatten a tool call into prose so it survives the role conversion (D3 rule 2). */
export function formatCollabFlattenedToolCall(call: { name?: string; arguments?: unknown; result?: unknown }): string {
  const name = call.name || 'tool'
  const args = brief(call.arguments)
  const result = brief(call.result)
  return `〔调用 ${name}(${args})${result ? ` → ${result}` : ''}〕`
}

/**
 * The IM quote line that precedes a reply's own text (§3.5 A):
 *
 *     > 阿明: 被引摘录…
 *     用户: 回复正文
 *
 * Models read this convention natively, and because the snapshot travels ON the
 * message the quoted context reaches them even when the original has already
 * scrolled out of the projection window. Returns '' when the snapshot carries
 * no text — an empty quote line is worse than none.
 */
export function formatCollabReplyQuote(replyTo: CollabReplyToLike | undefined): string {
  const excerpt = (replyTo?.excerpt ?? '').trim()
  if (!excerpt) return ''
  const author = (replyTo?.authorLabel ?? '').trim() || '成员'
  return `> ${author}: ${excerpt}`
}

/**
 * A speech block dressed with its IM metadata: the quote line on top (§3.5 A)
 * and the reaction tally on the tail (§3.5 B, `名字: 内容 (👍×2)`) — the room's
 * ambient feedback, which is otherwise invisible to a model that only ever
 * reads text. Self messages never get the tally: an agent must not read its
 * OWN past output with words it did not write appended to it.
 */
function withImMetadata(message: CollabMessageLike, block: string): string {
  const withReactions = appendCollabReactionSummary(block, message.reactions)
  const quote = formatCollabReplyQuote(message.replyTo)
  return quote ? `${quote}\n${withReactions}` : withReactions
}

/**
 * 消息信封(collab-team-v2 §6.2)。
 *
 * `名字: 内容` 这个约定在一条消息只有一行时够用,多行就开始漏:正文里任何
 * 一行长得像 `别人: …` 都会被读成新的一条发言,而多行正文在群里是常态。信封
 * 把边界变成结构。
 *
 * 三条刻意的取舍:
 *
 *  - **只包别人的消息**。自身消息一字不差地原样进上下文(W14b:agent 读自己的
 *    历史输出必须与它当初写的一模一样),对称性让位于这条。
 *  - **片段序列,不加 `<messages>` 外壳**。合并 pass 会把相邻同侧块用 `\n\n`
 *    接起来,外壳在那一步会嵌套错;一串平铺的片段拼接起来仍然是一串平铺的片段。
 *  - **标签短**。每条消息的固定开销 × 全量投影,是这套系统里少数按条计费的
 *    东西。属性只有 from,值来自代码(roster 里的名字)不来自模型。
 *
 * 安全性由落库转义兜底:正文里的 `<` 在写进转录时就已经变成 `&lt;`
 * (`sanitizeCollabInlineMarkup`),所以没有人能在自己的发言里伪造
 * `</msg><msg from="用户">`。信封可信,靠的是那道防线,不是这里的字符串拼接。
 */
export const COLLAB_ENVELOPE_TAG = 'msg'

export function wrapCollabMessageEnvelope(from: string, body: string): string {
  // 名字来自 roster 而非模型,但引号仍然要转义 —— 一个叫「小"李"」的 agent
  // 不该把信封撑破。
  const speaker = from.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  return `<${COLLAB_ENVELOPE_TAG} from="${speaker}">${body}</${COLLAB_ENVELOPE_TAG}>`
}

// IM-relay style「名字: 内容」(v3) — titles live in the room note, not on every
// line; the bracketed script style read as a simulation transcript. The label
// rule itself is shared with the willingness window (P2-16), so a departed
// member is signed the same way in both.

/**
 * A projected row, as the merge pass needs to see it. Both projections produce
 * rows of this shape — the pure one below and the ChatMessage-level adapter in
 * app/engine/stream/message-helpers.ts.
 */
export interface CollabProjectedRowLike {
  role: string
  content: string
  agentId?: string
  attachments?: unknown[]
}

export interface MergeCollabProjectedRowsOptions<TRow> {
  /** Rows dropped downstream: adjacency looks straight through them. */
  isTransparent?: (row: TRow) => boolean
  /** Rows carrying structure a text merge would silently discard. */
  hasStructuralPayload?: (row: TRow) => boolean
}

/**
 * Merge adjacent same-side blocks — the ONE implementation (R4, 债3 + P2-13).
 *
 * Alternation-strict providers reject two consecutive turns on the same side,
 * so the projection has always merged consecutive user blocks. It did so twice,
 * inline, in two walks that were only ever "kept in sync by agreement" — and
 * they shared a blind spot: nobody merged the ASSISTANT side. Since W14b an
 * agent says things with `say`, one message per call, so a member that sends
 * three lines in one turn produces three adjacent assistant rows in its own
 * projection, and the request 400s.
 *
 * As a post-pass rather than an inline push, because that is what makes it one
 * function instead of two: the walks disagree about what a row IS (a plain
 * `{role, content}` versus a whole ChatMessage), and they agree completely
 * about what adjacency means.
 *
 * Never merges a row that carries structure (tool calls and their companions):
 * dropping those to concatenate text is how orphan tool_results are made, and
 * the 400 this fixes is not worth trading for that one.
 */
export function mergeCollabProjectedRows<TRow extends CollabProjectedRowLike>(
  rows: readonly TRow[],
  options: MergeCollabProjectedRowsOptions<TRow> = {},
): TRow[] {
  const isTransparent = options.isTransparent
    ?? ((row: TRow) => row.role !== 'user' && row.role !== 'assistant')
  const hasStructuralPayload = options.hasStructuralPayload ?? (() => false)

  const merged: TRow[] = []
  /** Where the last mergeable row sits in `merged`; -1 before the first one. */
  let targetIndex = -1

  for (const row of rows) {
    if (isTransparent(row)) {
      merged.push(row)
      continue
    }
    const target = targetIndex >= 0 ? merged[targetIndex] : undefined
    const mergeable = target
      && !hasStructuralPayload(row)
      && target.role === row.role
      && (row.role === 'user' || target.agentId === row.agentId)
    if (target && mergeable) {
      // Clone: a self message is pushed as the ORIGINAL stored object, and
      // rewriting its content in place would edit the transcript itself.
      merged[targetIndex] = {
        ...target,
        content: `${target.content}\n\n${row.content}`,
        ...(row.attachments?.length
          ? { attachments: [...(target.attachments ?? []), ...row.attachments] }
          : {}),
      }
      continue
    }
    merged.push(row)
    targetIndex = merged.length - 1
  }

  return merged
}

/**
 * Project a room transcript into the activated agent's view (D3, five classes):
 *  1. self assistant messages          → assistant, content kept AS-IS (structural
 *     preservation of own tool calls is the ADAPTER's job — this pure view only
 *     carries text)
 *  2. other agents' assistant messages → signed user-side text; tool calls flattened; tool companions never emitted
 *  3. real user messages               → signed user-side text
 *  4. coordinator drive messages       → excluded (collapseSupersededGoalDrives rationale)
 *  5. MARKED collab system lines       → signed user-side text「系统: …」(W9.1):
 *     task lifecycle and membership changes are FACTS about the room, and an
 *     agent that cannot see them can only believe what other agents claim.
 *     Unmarked system lines (budget / chain gate / queue / permission
 *     reminders) stay display-only — machine bookkeeping, not room facts.
 * Pass turns and W14b thinking records are excluded. Consecutive user-side blocks are merged for
 * alternation-strict providers. Display-only roles (error/unmarked system) are skipped.
 *
 * W14a: every relayed block has its `@名字` repainted from the message's
 * mentions[] against the CURRENT roster, so a renamed member is addressed by
 * the name it goes by now. Self messages are exempt — they stay structural
 * (the agent reads its own words exactly as it wrote them).
 *
 * NOTE: the production projection is projectRoomMessagesForModel in
 * app/engine/stream/message-helpers.ts, which applies these SAME rules at the
 * ChatMessage level (keeping self messages structural and merging attachments).
 * Behavioral changes to the five classes must land in both — this module is the
 * tested spec.
 *
 * The boundary of "both" (2026-07-30): this spec's input is a ROOM message list
 * and class 4 above is final for it — a drive never enters a room projection.
 * The adapter has one job this spec cannot have, because it takes a SESSION: an
 * `kind === 'agent'` execution session is projected as "the room's projection +
 * this round's own drive appended at the tail". That is not an exception to class
 * 4 (the drive is not a room message and never becomes one); it is the adapter
 * assembling the model input of a turn that runs outside the room. Nothing to
 * mirror here — a spec over room messages has no execution session to read.
 */
export function projectRoomHistory(options: ProjectRoomHistoryOptions): ProjectedRoomMessage[] {
  const userLabel = options.userLabel ?? '用户'
  const projected: ProjectedRoomMessage[] = []

  // Adjacency is decided once, after the walk (mergeCollabProjectedRows) —
  // pushing is just pushing now.
  const pushUserBlock = (block: string) => {
    projected.push({ role: 'user', content: block })
  }

  for (const message of options.messages) {
    if (isCollabProjectedSystemLine(message)) {
      // 系统行也进信封:它和别人的发言一样是"别人说的话",边界问题一模一样
      // (一条受阻说明可以很长、可以带换行)。
      if (message.content) {
        pushUserBlock(wrapCollabMessageEnvelope(COLLAB_SYSTEM_SPEAKER_LABEL, message.content))
      }
      continue
    }
    if (message.role !== 'user' && message.role !== 'assistant') continue
    if (isCollabDriveMessage(message)) continue

    if (message.role === 'assistant') {
      if (isCollabPassMessage(message.content)) continue
      // W14b: a thinking record is not speech — it never enters ANYONE's
      // projection, its own author included. What the agent actually said is
      // in its say messages, which are right here beside it; replaying the
      // thinking too would make the room read as if everything was said twice.
      if (isCollabThinkingMessage(message)) continue

      if (message.agentId === options.selfAgentId) {
        // Own messages stay structural downstream — text only here.
        if (message.content) projected.push({ role: 'assistant', content: message.content })
        continue
      }

      const flattened = (message.toolCalls ?? []).map(formatCollabFlattenedToolCall)
      const spoken = renderCollabMentionText(message.content, message.mentions, options.agents)
      const body = [spoken, ...flattened].filter(Boolean).join('\n')
      if (!body) continue
      const label = resolveCollabSpeakerLabel(message.agentId, options.agents, options.resolveAgentName)
      // 说话人搬进信封的 from 属性,正文里不再重复一遍名字(§6.2:标签短)。
      pushUserBlock(wrapCollabMessageEnvelope(label, withImMetadata(message, body)))
      continue
    }

    // Real user message
    if (!message.content) continue
    pushUserBlock(wrapCollabMessageEnvelope(userLabel, withImMetadata(
      message,
      renderCollabMentionText(message.content, message.mentions, options.agents),
    )))
  }

  return mergeCollabProjectedRows(projected)
}
