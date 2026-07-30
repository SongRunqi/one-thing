/**
 * 说话即行动 — the say tool's pure half (W14b,
 * docs/design/multi-agent-collab-im.md §4.5「核心转变:思考与发言分离」).
 *
 * 用户原话:"agent 应该具有发消息的能力,而不是调用大模型直接返回结果的能力
 * ——那是他的思考过程,不是他要说的话。"
 *
 * So a room turn is no longer speech. The LLM turn is THINKING; speech is an
 * explicit action (a `say` tool call), and the room transcript grows two kinds
 * of assistant message that this module tells apart:
 *
 *  - `COLLAB_SAY_SOURCE`  — a real utterance, written by the say executor.
 *  - `COLLAB_TURN_SOURCE` — the turn's own host message (thinking text + board
 *    calls). Stamped at the store choke point when the engine creates it, so
 *    the marker exists from birth (a crash mid-turn can never leave a thinking
 *    record looking like speech, and the room UI never flashes a full bubble
 *    that collapses a tick later).
 *
 * Three epochs coexist, and the rule is a MARKER, never a migration:
 *
 *  | message                          | 投影/意愿窗口 | 链长 | 房间渲染      |
 *  | say (COLLAB_SAY_SOURCE)          | ✓ 进         | 计   | 正常气泡      |
 *  | thinking (COLLAB_TURN_SOURCE)    | ✗ 排除       | 不计 | 折叠痕迹行    |
 *  | 旧转录 (neither marker)          | ✓ 进         | 计   | 正常气泡      |
 *
 * A transcript written before W14b carries neither marker and keeps behaving
 * exactly as it did — the stream WAS the speech back then, and rewriting
 * history to say otherwise would be a lie about what the room showed.
 */
import { sanitizeCollabInlineMarkup } from './inline-tags.js'
import { buildCollabMentions, mergeCollabMentions, normalizeCollabMentions } from './mentions.js'
import { truncateAtCodePoint } from './truncate.js'
import type { CollabAgentLike, CollabMentionLike } from './types.js'

/**
 * The say/thinking markers and their predicates live in `classify.ts` since R3
 * — one place reads a marker off `source`/`origin.source`, and one place gains
 * a new arm when a seventh kind appears. Re-exported so every import site here
 * and in the app layer keeps working unchanged.
 */
export {
  COLLAB_SAY_SOURCE,
  COLLAB_TURN_SOURCE,
  isCollabSayMessage,
  isCollabThinkingMessage,
} from './classify.js'

/** Longest utterance a single say call may carry. Beyond this it is not a chat
 *  message any more — the board (task description / report) is where long-form
 *  content belongs. */
export const COLLAB_SAY_MAX_CHARS = 4000


/**
 * The trace row's label (§3.6 痕迹级): one line of 11px muted ink. The step
 * count is the tool calls the turn made — the only part of a thinking record
 * that is worth advertising before it is unfolded.
 */
export function formatCollabThinkingTraceLabel(stepCount: number): string {
  const steps = Number.isFinite(stepCount) && stepCount > 0 ? Math.floor(stepCount) : 0
  return steps > 0 ? `思考过程 · ${steps} 步` : '思考过程'
}

/**
 * Why a say call did not deliver. These are the FIRST真实送达失败语义 the room
 * has ever had (§4.5 消息送达态): the gates used to swallow an activation
 * before the agent ever ran, so nobody was there to be told. Now the agent
 * itself is holding the phone when the call fails, and the wording says so
 * plainly — 未送达, not "error".
 */
export const COLLAB_SAY_REFUSED_NO_ROOM =
  'say 只能在群聊里(或群聊派生的工作会话里)使用——这个会话没有关联的群聊,没有人会收到消息。'
export const COLLAB_SAY_REFUSED_FROZEN =
  '发言未送达:这个群聊已被暂停(总闸),现在没有人能收到消息。等群聊恢复后再说。'
export const COLLAB_SAY_REFUSED_BUDGET =
  '发言未送达:这个群聊今天的预算已经用完,消息发不出去。明天自动恢复,或者由用户调整房间预算。'
export const COLLAB_SAY_REFUSED_EMPTY =
  '没发出去:content 是空的,没有内容可发。'
export const COLLAB_SAY_REFUSED_NOT_MEMBER =
  '发言未送达:你已经不在这个群聊的成员名单里了。'

/**
 * W18: the `room` parameter named something that is not a room this agent can
 * speak into. Distinct from NO_ROOM, which means the session has no room at
 * all — here the caller aimed and missed, and the fix is a different id.
 */
export const COLLAB_SAY_REFUSED_UNKNOWN_ROOM =
  '发言未送达:room 参数指向的不是一个群聊(或者你不在那个群里)。不带 room 就是发到你当前这一轮的群里。'

/**
 * Which room does this `say` land in? (W18 §4.6「say(room)」)
 *
 * Three sources, in order, and each says something different:
 *
 *  1. `requestedRoomSessionId` — the agent aimed explicitly. Kept as the first
 *     priority because it is the door multi-room activation walks through later
 *     (today an agent is driven for one room at a time, so it is rarely used —
 *     but a turn that names its target must never be second-guessed).
 *  2. `linkedRoomSessionId` — the room this session is currently bound to: the
 *     target room the drive pointed the AGENT EXECUTION session at, or the
 *     parent room of a WORK session. This is the everyday path.
 *  3. the session itself, when it IS a room — pre-W18 shape, where the turn ran
 *     inside the room. Kept so an old-style drive still speaks.
 *
 * Returns null when there is no room to speak into at all.
 */
export function resolveCollabSayRoomSessionId(options: {
  kind?: string
  sessionId: string
  requestedRoomSessionId?: string
  linkedRoomSessionId?: string
}): string | null {
  const requested = options.requestedRoomSessionId?.trim()
  if (requested) return requested
  const linked = options.linkedRoomSessionId?.trim()
  if (linked) return linked
  if (options.kind === 'room' && options.sessionId) return options.sessionId
  return null
}

/** Success line handed back to the caller — it names the id so a follow-up say
 *  can quote it with replyTo. */
export function formatCollabSayReceipt(messageId: string): string {
  return `已发进群里(消息 id: ${messageId})。可以继续调用 say 再说一条,或者就此打住。`
}

/** The tool a room turn speaks through — the name persisted tool calls carry. */
export const COLLAB_SAY_TOOL_NAME = 'say'

/**
 * 沉默 = 什么都不调 (2026-07-30) — why there is no `stay_silent`, and no forced
 * opening call either.
 *
 * W18b gave the room turn a second tool so that a FORCED opening call would
 * still leave silence reachable ("required" + a do-nothing tool). It backfired
 * within hours: 真机 counted 77 `stay_silent` calls across four turns of one
 * agent. The tool's result told the turn to stop, the model would not end a
 * round with an empty response, so it called the only inert tool it had —
 * again, and again, each round a full-context request, until the wall clock
 * cut it off. W22 then kept the forcing and dropped the tool, naming `say` as
 * the opening call ("判定即承诺":判定层已经决定要发言,开口即 say).
 *
 * That trade is now reversed: the forcing itself is gone (`app/collab/turn.ts`).
 * 判定即承诺 asked the judgement layer to be right about EVERY activation, and
 * @ 和任务事件从来不经过判定——一个被点名却确实没自己的事的 agent 只剩一条
 * 出路:调 say 说一句「我这轮不说了」。真机里这就是它做的。废话消息比空转回合
 * 贵:群里所有人都要读它。
 *
 * 现在两头都空着,而这恰好是安全的形状:沉默不是一个工具、不是一个参数,而是
 * "什么都不调"——没有惰性工具可以循环,也没有必须开口的义务。
 *
 * 曾经还有第三个机制:W14d 补救 nudge(写了正文没调 say → 同一激活内引用那段
 * 未发正文再驱一轮)。2026-07-30 拆除:真机上它把一个想 pass 却把 pass 写成
 * 旁白的回合重新推上发言台,模型在补救轮里误以为已送达的上一条消息没发出去,
 * 又 say 了一遍,群里出现重复消息。"写了完整回复却忘调 say"从此不再有结构
 * 补救,只靠 drive 尾行陈述通道规则;沉默与失手在收尾处不再区分。
 */

/** Structural view of a persisted tool call (circuit breaker / typing signal).
 *  Real transcripts carry `toolName`/`toolId`; `name` is the flattened shape
 *  the projection uses. */
export interface CollabTurnToolCallLike {
  name?: string
  toolName?: string
  toolId?: string
}

/**
 * Resolve the say call's `mentions` (agent ids) into the W14a record shape.
 *
 * Two sources, one list:
 *  1. the explicit ids the tool call carried — whitelisted against the room
 *     roster (an agent does not get to address a member of another room, or a
 *     made-up id) and re-labelled from the roster, exactly like the ingress
 *     gate does for a human's picker (防冒名: the caller never names anyone).
 *  2. the `@名字` it wrote in prose — the same name-scan fallback W14a keeps
 *     for bare typing, so an agent that just writes 「@小李 你看一下」 without
 *     filling the parameter still addresses a real member.
 *
 * Per-label authority (mergeCollabMentions): an explicitly named id owns its
 * label, so picking one of two 重名 members never also drags in the other.
 */
export function resolveCollabSayMentions(options: {
  content: string
  mentionAgentIds?: unknown
  members: readonly CollabAgentLike[]
}): CollabMentionLike[] {
  const ids = Array.isArray(options.mentionAgentIds) ? options.mentionAgentIds : []
  const explicit = normalizeCollabMentions(
    ids.map(id => ({ agentId: typeof id === 'string' ? id : '', label: '' })),
    { members: options.members },
  )
  const parsed = buildCollabMentions(options.content, options.members)
  return mergeCollabMentions(explicit, parsed)
}

/**
 * Normalize the utterance itself. Returns null when there is nothing to say —
 * an empty message must fail loudly at the tool boundary rather than land in
 * the room as a blank bubble.
 *
 * 转义在截断之后(collab-team-v2 §6.1 防线一)。顺序是刻意的:先截断,被拦腰
 * 砍断的那半个标签就走不出白名单校验,于是作为字面文本被转义掉;反过来先转义
 * 再截断,砍点可能落在 `&lt;` 中间,留下一个半截实体。转义可以把内容撑过
 * COLLAB_SAY_MAX_CHARS —— 上限管的是模型说了多少话,不是编码后有多少字节。
 */
export function normalizeCollabSayContent(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return null
  return sanitizeCollabInlineMarkup(truncateAtCodePoint(text, COLLAB_SAY_MAX_CHARS))
}
