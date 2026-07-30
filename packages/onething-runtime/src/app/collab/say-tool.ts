/**
 * App wiring of the `say` tool (W14b 说话即行动,
 * docs/design/multi-agent-collab-im.md §4.5).
 *
 * This is where an utterance becomes a room message. Everything that decides
 * whether the words land is collected HERE, on purpose:
 *
 *  - **which room** — a room session speaks into itself; a work session speaks
 *    into the room that spawned it (the worker's real "说一句" channel, §4.5).
 *  - **the gates** — frozen / over-budget / no longer a member. Before W14b the
 *    gates killed an activation before the agent ever ran, so nobody was there
 *    to be told; now the agent is holding the phone when the call fails and it
 *    gets told in words. That is the first genuine 送达失败 the room has.
 *  - **identity** — mentions are whitelisted against the roster and re-labelled
 *    from it (W14a 防冒名), replyTo is resolved to a snapshot of a message that
 *    actually exists (a fabricated id is ignored, never fabricated back).
 *  - **idempotence** — the same utterance twice inside one turn is ONE room
 *    message (todo2 P0-2, see below).
 *
 * The message is persisted with `source: COLLAB_SAY_SOURCE` and broadcast on
 * the same `message:user-created` channel the coordinator's own posts use, so
 * the room UI and the SSE mirror need no new event.
 */
import { randomUUID } from 'node:crypto'
import {
  COLLAB_REPLY_USER_LABEL,
  COLLAB_SAY_REFUSED_BUDGET,
  COLLAB_SAY_REFUSED_EMPTY,
  COLLAB_SAY_REFUSED_FROZEN,
  COLLAB_SAY_REFUSED_NOT_MEMBER,
  COLLAB_SAY_REFUSED_NO_ROOM,
  COLLAB_SAY_REFUSED_UNKNOWN_ROOM,
  COLLAB_SAY_SOURCE,
  buildCollabReplyToSnapshot,
  normalizeCollabSayContent,
  resolveCollabSayMentions,
  resolveCollabSayRoomSessionId,
  type CollabAgentLike,
} from '@onething/runtime/collab'
import { createSayTool, type SayToolResult } from '@onething/runtime/tools'
import { isActiveAgent, type ChatMessage } from '@shared/ipc.js'
import * as store from '../store.js'
import { getEventBus } from '../events/index.js'
import { findAgent } from '../agents/index.js'
import { isRoomOverBudget } from './coordinator.js'

interface SayContext {
  roomSessionId: string
  agentId: string
}

/**
 * Where does this utterance go? (W18 §4.6「say(room)」)
 *
 * Three sources in a fixed order, spelled out in the pure rule
 * (`resolveCollabSayRoomSessionId`):
 *  1. the `room` argument — an explicit aim is never second-guessed;
 *  2. the room the session is bound to — the drive's target room on an AGENT
 *     EXECUTION session (the everyday W18 path), or the parent room on a WORK
 *     session (the worker's channel into the group);
 *  3. the session itself when it IS a room (pre-W18 in-room turns).
 *
 * Only the room lookup happens here; membership and the gates are enforced
 * below against whichever room this returns, so an explicit `room` buys no
 * privilege — an agent that is not a member of it is refused exactly like one
 * that was just shown the door.
 */
function resolveSayContext(sessionId: string, requestedRoom?: string): SayContext | null {
  const session = store.getSession(sessionId)
  if (!session || !session.agentId) return null
  const roomSessionId = resolveCollabSayRoomSessionId({
    kind: session.kind,
    sessionId: session.id,
    ...(requestedRoom ? { requestedRoomSessionId: requestedRoom } : {}),
    ...(session.kind === 'work' || session.kind === 'agent'
      ? { linkedRoomSessionId: session.collab?.roomSessionId }
      : {}),
  })
  if (!roomSessionId) return null
  return { roomSessionId, agentId: session.agentId }
}

/**
 * Typing is NOT this executor's business (W19).
 *
 * W13.1 used to bracket a work-session utterance with typing(true/false) here,
 * because a worker had no activation queue holding the indicator for it. Both
 * halves of that arrangement are gone: the queue no longer simulates typing at
 * all, and the real signal is the `say` call's arguments streaming — which is
 * over by the time this function runs. Both room turns and work turns now get
 * their indicator from `observeCollabSayTyping`, so a bracket here would only
 * add a zero-width flicker after the light already went out.
 */

/** say 里的 @ 能落在谁身上:退休的成员不算(域模型 §3.2)。 */
function roomMembers(roomSessionId: string): CollabAgentLike[] {
  const room = store.getSession(roomSessionId)?.room
  const members: CollabAgentLike[] = []
  for (const id of room?.memberAgentIds ?? []) {
    const agent = findAgent(id)
    if (!agent || !isActiveAgent(agent)) continue
    members.push({
      id: agent.id,
      name: agent.name,
      title: agent.title,
      avatar: agent.avatar,
      avatarImage: agent.avatarImage,
    })
  }
  return members
}

function authorLabelOf(message: ChatMessage): string {
  if (message.role === 'user') return COLLAB_REPLY_USER_LABEL
  if (!message.agentId) return ''
  const agent = findAgent(message.agentId)
  return agent ? agent.name : message.agentId
}

/**
 * Resolve an explicit `replyTo` id into the snapshot shape the room stores.
 * A quote is a COPY (W7), so the words survive edits and pagination. An id
 * that names nothing is silently dropped: the utterance itself is still worth
 * delivering, and refusing it over a bad quote id would cost the room a message.
 */
function buildReplyToSnapshot(
  roomSessionId: string,
  replyToMessageId: string | undefined,
): ChatMessage['replyTo'] | undefined {
  if (!replyToMessageId) return undefined
  const messages = (store.getSession(roomSessionId)?.messages ?? []) as ChatMessage[]
  const target = messages.find(message => message.id === replyToMessageId)
  if (!target) return undefined
  return buildCollabReplyToSnapshot({
    messageId: target.id,
    authorLabel: authorLabelOf(target),
    content: target.content,
  }) ?? undefined
}

/**
 * 同一句话只进群一次 (todo2 P0-2, 2026-07-30).
 *
 * 真机形状:一个回合里群里出现两条一字不差的消息。此前 say 是无条件写入——每次
 * 调用 randomUUID() 新建一条,唯一的护栏是 doom-loop 检测(阈值 4),重复两次
 * 完全落在护栏之下。诱因不止一个(被强制首调 say 之后又"正式作答"一遍、provider
 * 重放、当年的 W14d nudge 误触发再驱一轮——前者与后者均已拆除),所以这里不猜
 * 诱因,而是把"同一句话只落一条"变成结构保证。
 *
 * 指纹 = (目标房间, 发言 agent, 归一化正文, 已解析的 mentions, replyTo)。
 * mentions/replyTo 不同就是不同的消息:同样一句「好」回给两个人是两次真实发言。
 * 命中时不落库、不发事件,直接返回上一次的 messageId ——**成功语义**,因为那句话
 * 确实在群里;返回同一个 id 还让后续 replyTo 能正确引用它。
 *
 * 5 秒时间窗而不是永久缓存:群聊里"过一会儿再说一遍同样的话"是合法的(催一下、
 * 重复结论),而同一回合内的重复几乎都发生在毫秒到秒级。每次查询顺手清掉过期
 * 条目,Map 因此不随进程寿命增长。
 */
const SAY_IDEMPOTENCE_WINDOW_MS = 5_000

const recentSays = new Map<string, { messageId: string; at: number }>()

function sayFingerprint(input: {
  roomSessionId: string
  agentId: string
  content: string
  mentionAgentIds: readonly string[]
  replyToMessageId?: string
}): string {
  // JSON rather than a delimiter join: one of the parts is free-form prose, and
  // any separator prose could also contain would let two different tuples
  // collide into one fingerprint — i.e. silently eat a real second message.
  return JSON.stringify([
    input.roomSessionId,
    input.agentId,
    input.content,
    input.mentionAgentIds,
    input.replyToMessageId ?? '',
  ])
}

/** Drop expired entries, then answer "was this exact utterance just delivered?" */
function lookupRecentSay(fingerprint: string, now: number): string | undefined {
  for (const [key, entry] of recentSays) {
    if (now - entry.at >= SAY_IDEMPOTENCE_WINDOW_MS) recentSays.delete(key)
  }
  return recentSays.get(fingerprint)?.messageId
}

/** Forget the window (test setup / teardown). It is otherwise invisible, which
 *  is exactly how a cache like this grows a second personality. */
export function clearCollabSayIdempotence(): void {
  recentSays.clear()
}

/**
 * The executor. Ordering is the contract: content first (an empty call is a
 * mistake, not a delivery failure), then the gates that mean "your words did
 * not reach anyone", then the duplicate check, then the write.
 */
export async function speakIntoCollabRoom(input: {
  sessionId: string
  content: string
  mentions?: string[]
  replyTo?: string
  room?: string
}): Promise<SayToolResult> {
  const context = resolveSayContext(input.sessionId, input.room)
  if (!context) return { ok: false, error: COLLAB_SAY_REFUSED_NO_ROOM }

  const content = normalizeCollabSayContent(input.content)
  if (!content) return { ok: false, error: COLLAB_SAY_REFUSED_EMPTY }

  const room = store.getSession(context.roomSessionId)
  if (room?.kind !== 'room' || !room.room) {
    // An explicit `room` that names nothing is a different mistake from having
    // no room at all, and the agent can act on the difference.
    return { ok: false, error: input.room ? COLLAB_SAY_REFUSED_UNKNOWN_ROOM : COLLAB_SAY_REFUSED_NO_ROOM }
  }
  if (room.room.frozen) return { ok: false, error: COLLAB_SAY_REFUSED_FROZEN }
  // Removed mid-turn (W6 / §3.5 C): the roster is read fresh here, exactly
  // like the drive-time guard, so a member that was just shown the door cannot
  // finish its sentence into the room.
  if (!(room.room.memberAgentIds ?? []).includes(context.agentId)) {
    return { ok: false, error: COLLAB_SAY_REFUSED_NOT_MEMBER }
  }
  if (await isRoomOverBudget(context.roomSessionId)) {
    return { ok: false, error: COLLAB_SAY_REFUSED_BUDGET }
  }

  const mentions = resolveCollabSayMentions({
    content,
    mentionAgentIds: input.mentions,
    members: roomMembers(context.roomSessionId),
  })
  const replyTo = buildReplyToSnapshot(context.roomSessionId, input.replyTo)

  // After the gates, before the write: the fingerprint is built from the SETTLED
  // shape (resolved mentions, resolved quote), so two calls that differ only in
  // a mention id that resolved to nothing are correctly one utterance.
  const fingerprint = sayFingerprint({
    roomSessionId: context.roomSessionId,
    agentId: context.agentId,
    content,
    mentionAgentIds: mentions.map(mention => mention.agentId),
    ...(replyTo?.messageId ? { replyToMessageId: replyTo.messageId } : {}),
  })
  const now = Date.now()
  const alreadySaid = lookupRecentSay(fingerprint, now)
  if (alreadySaid) {
    // Nothing persisted, nothing broadcast — and the caller is told it worked,
    // because it did: those words are in the room, under this id.
    return { ok: true, messageId: alreadySaid }
  }

  const message: ChatMessage = {
    id: randomUUID(),
    role: 'assistant',
    agentId: context.agentId,
    content,
    timestamp: now,
    source: COLLAB_SAY_SOURCE,
    // An EMPTY mentions array is a real answer ("mentions nobody"), so the key
    // is omitted rather than stored empty — that is what keeps the name-scan
    // fallback available for old transcripts (W14a).
    ...(mentions.length > 0 ? { mentions } : {}),
    ...(replyTo ? { replyTo } : {}),
  }
  recentSays.set(fingerprint, { messageId: message.id, at: now })
  store.addMessage(context.roomSessionId, message)
  void getEventBus().emit(context.roomSessionId, {
    type: 'message:user-created',
    message,
  } as Parameters<ReturnType<typeof getEventBus>['emit']>[1])

  return { ok: true, messageId: message.id }
}

export const SayTool = createSayTool({
  speak: speakIntoCollabRoom,
})
