/**
 * Room (kind='room') message presentation — pure projection logic.
 * docs/design/multi-agent-collab-im.md §3 / §3.5 D / W3.
 *
 * Three jobs, all pure so they unit-test without a DOM:
 *
 *  1. `filterRoomMessages` drops the coordinator's machinery from the IM
 *     stream (activation drives, resolved pass turns). Hiding happens BEFORE
 *     the list renders — a row that renders nothing still owns a list slot and
 *     leaves a measurement hole in the scroller.
 *  2. `buildRoomMessageLayout` marks each surviving message as group head/tail
 *     (consecutive messages from one agent read as one utterance: avatar and
 *     signature only on the head, tight stacking inside) and decides where a
 *     time capsule is inserted.
 *  3. `formatRoomTimeCapsule` writes the capsule's label.
 *
 * The drive/pass predicates are the runtime's (`@onething/runtime/collab`),
 * never a renderer copy: the coordinator stamps those markers and owns their
 * definition. The collab package is dependency-free, so importing it into the
 * renderer bundle costs nothing but the bytes.
 */
import { isCollabDriveMessage, isCollabPassMessage, isCollabThinkingMessage } from '@onething/runtime/collab'

/** The structural slice of a ChatMessage this module reads. */
export interface RoomMessageLike {
  /** Only read to key a group by its head — never to decide layout. */
  id?: string
  role: string
  content?: string
  agentId?: string
  isStreaming?: boolean
  toolCalls?: readonly unknown[]
  source?: string
  origin?: { source?: string }
  timestamp?: number
}

/** Silence longer than this between two messages earns a time capsule. */
export const ROOM_TIME_CAPSULE_GAP_MS = 10 * 60 * 1000

/**
 * Four things never reach the room's stream:
 *
 *  1. Coordinator drives — the synthetic user message carrying an activation.
 *  2. **In-flight agent messages** (W11): an IM message arrives whole. Nobody
 *     watches a teammate's reply assemble itself letter by letter; while the
 *     reply is streaming the typing line is the only signal, and the moment
 *     the stream settles the message drops in complete. This also retires the
 *     pass-hold ellipsis in rooms — a member who elects to stay quiet now
 *     reads as "typing lit up, then nothing", the same as a person who typed
 *     and deleted it (§5). MessageItem keeps its hold branch for any other
 *     entry point; the room path simply stops reaching it.
 *  3. Resolved pass turns — nobody announces "I choose not to speak".
 *  4. Reasoning-only settled turns (no text, no tools) — silence without the
 *     pass sentinel; an empty bubble is not a message.
 *
 * Only settled messages are inspected for a pass verdict, so `content` is
 * still never read while a message streams: this projection stays keyed on a
 * boolean that flips twice per reply, not on every 16ms chunk. Rooms only —
 * work sessions and ordinary chats never run this filter, and a message that
 * stopped streaming without finishing (abort, error) is settled, so its
 * partial text appears like any other.
 */
export function isRoomHiddenMessage(message: RoomMessageLike): boolean {
  if (isCollabDriveMessage(message)) return true
  if (message.role !== 'assistant' || !message.agentId) return false
  if (message.isStreaming) return true
  if (isCollabPassMessage(message.content)) return true
  // Reasoning-only settled turns (no text, no tool calls) are de-facto
  // silence: the model thought and said nothing, without emitting the pass
  // sentinel. Before W15 these rendered invisibly; the bubble frame turned
  // them into empty boxes (真机实锤 2026-07-28). Tool-only turns still show —
  // board activity is real content.
  if (!(message.content ?? '').trim() && !(message.toolCalls?.length)) return true
  // W14b thinking records leave the chat entirely (2026-07-28 用户定向:
  // "我不需要看到他的思考过程,群聊天面只看他说了什么"). The record itself is
  // persisted untouched — a future agent execution page reads it there; the
  // room shows speech (say) only.
  if (isCollabThinkingMessage(message)) return true
  return false
}

/**
 * A settled W14b thinking record (§4.5): the turn's own message, which is no
 * longer speech. It still shows — as a collapsed hairline (CollabThinkingTrace)
 * — but it is not a bubble, carries no avatar or signature, breaks no group and
 * owns no reply/react affordance.
 *
 * Streaming ones stay hidden by the W11 rule above: the trace label counts
 * steps, and a row that renumbers itself every chunk is the flicker W11 removed.
 */
export function isRoomThinkingTrace(message: RoomMessageLike): boolean {
  if (message.role !== 'assistant' || !message.agentId) return false
  if (message.isStreaming) return false
  if (!isCollabThinkingMessage(message)) return false
  // An empty thinking record is silence, and isRoomHiddenMessage already drops
  // it — mirrored here so callers can ask this question on its own.
  return Boolean((message.content ?? '').trim()) || Boolean(message.toolCalls?.length)
}

/**
 * Returns the same array reference when nothing is hidden, so the list's props
 * identity survives a recompute. A live room rarely qualifies — a drive sits in
 * front of every agent turn, and W11 adds the in-flight reply — but the cost of
 * a fresh array is paid only when the projection actually recomputes, and the
 * predicate above deliberately depends on no per-chunk field. So the room list
 * re-renders on message boundaries, not on stream deltas: strictly less churn
 * than before W11, when the streaming bubble repainted every frame.
 */
export function filterRoomMessages<T extends RoomMessageLike>(messages: readonly T[]): readonly T[] {
  const visible = messages.filter(message => !isRoomHiddenMessage(message))
  return visible.length === messages.length ? messages : visible
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function clockLabel(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const DAY_MS = 24 * 60 * 60 * 1000

/** 今天 14:32 / 昨天 14:32 / 7月26日 14:32 / 2025年7月26日 14:32 */
export function formatRoomTimeCapsule(timestamp: number, now: number = Date.now()): string {
  const date = new Date(timestamp)
  const time = clockLabel(date)
  const today = startOfDay(now)
  const day = startOfDay(timestamp)
  if (day === today) return `今天 ${time}`
  if (day === startOfDay(today - DAY_MS)) return `昨天 ${time}`
  const dayMonth = `${date.getMonth() + 1}月${date.getDate()}日`
  if (date.getFullYear() === new Date(now).getFullYear()) return `${dayMonth} ${time}`
  return `${date.getFullYear()}年${dayMonth} ${time}`
}

/**
 * One agent's continuous burst, as ONE addressable thing (P1-2).
 *
 * `groupHeads`/`groupTails` only draw boundaries — enough to place an avatar,
 * not enough to fold a block: a collapse toggle has to name the group (a key
 * that survives re-renders and history paging) and know which rows go away.
 */
export interface RoomMessageGroup {
  /** Stable identity: the head message's id. Falls back to its row position. */
  key: string
  /** The head row — signature, avatar, and the collapse toggle live here. */
  head: number
  /** Last SPEECH row of the group (mirrors `groupTails`). */
  tail: number
  /** Every row index in the group, ascending: head, speech, traces included. */
  members: number[]
  /** Speech rows only — what a folded head advertises as "N 条消息". */
  messageCount: number
  /** Worth folding: agent speech, two or more messages under one signature. */
  collapsible: boolean
}

export interface RoomMessageLayout {
  /** index → capsule label, rendered as its own row BEFORE that message. */
  capsules: Map<number, string>
  /** Indices that open a group: they carry the avatar and the signature. */
  groupHeads: Set<number>
  /** Indices that close a group: they carry the turn gap and the footer. */
  groupTails: Set<number>
  /** Groups in stream order. */
  groups: RoomMessageGroup[]
  /** Every row index (traces included) → the key of the group owning it. */
  groupKeyByIndex: Map<number, string>
  groupsByKey: Map<string, RoomMessageGroup>
}

export const EMPTY_ROOM_LAYOUT: RoomMessageLayout = {
  capsules: new Map(),
  groupHeads: new Set(),
  groupTails: new Set(),
  groups: [],
  groupKeyByIndex: new Map(),
  groupsByKey: new Map(),
}

/** The group owning a row, or null (no room projection / index out of range). */
export function roomGroupAt(layout: RoomMessageLayout, index: number): RoomMessageGroup | null {
  const key = layout.groupKeyByIndex.get(index)
  return key === undefined ? null : layout.groupsByKey.get(key) ?? null
}

/** Two messages read as one continued utterance only from the same agent. */
function sameSpeaker(a: RoomMessageLike, b: RoomMessageLike): boolean {
  if (a.role !== 'assistant' || b.role !== 'assistant') return false
  return Boolean(a.agentId) && a.agentId === b.agentId
}

/**
 * Expects an already-filtered list (see `filterRoomMessages`): hidden
 * machinery must not break a group, so two replies from one agent that had a
 * drive between them merge.
 *
 * A time capsule always opens a new group — the break IS the point of the
 * capsule, and a signature-less bubble hanging under one would read as an
 * orphan.
 *
 * W14b: thinking traces are TRANSPARENT here. They are rows, but not messages:
 * they never take the avatar or the signature, they never end a group, and a
 * trace sitting between two utterances of one agent must not split that agent's
 * burst in two (it opens the very turn that produced them). So the walk runs
 * over the speech rows only and the traces simply fall through it.
 */
export function buildRoomMessageLayout(
  messages: readonly RoomMessageLike[],
  now: number = Date.now(),
): RoomMessageLayout {
  const capsules = new Map<number, string>()
  const groupHeads = new Set<number>()
  const groupTails = new Set<number>()

  const speech: number[] = []
  for (let index = 0; index < messages.length; index++) {
    if (!isRoomThinkingTrace(messages[index])) speech.push(index)
  }

  for (let position = 0; position < speech.length; position++) {
    const index = speech[position]
    const message = messages[index]
    const previous = position > 0 ? messages[speech[position - 1]] : null
    if (!previous) {
      groupHeads.add(index)
      continue
    }
    const timestamp = message.timestamp ?? 0
    const previousTimestamp = previous.timestamp ?? 0
    const brokenByTime =
      timestamp - previousTimestamp > ROOM_TIME_CAPSULE_GAP_MS ||
      startOfDay(timestamp) !== startOfDay(previousTimestamp)
    if (brokenByTime) capsules.set(index, formatRoomTimeCapsule(timestamp, now))
    if (brokenByTime || !sameSpeaker(previous, message)) groupHeads.add(index)
  }

  for (let position = 0; position < speech.length; position++) {
    const next = speech[position + 1]
    if (next === undefined || groupHeads.has(next)) groupTails.add(speech[position])
  }

  const { groups, groupKeyByIndex, groupsByKey } = buildRoomGroups(messages, speech, groupHeads)

  return { capsules, groupHeads, groupTails, groups, groupKeyByIndex, groupsByKey }
}

/**
 * Turns the head/tail boundaries into group objects (P1-2).
 *
 * Two rules worth stating:
 *
 *  - The key is the HEAD MESSAGE ID, never a row position: paging older history
 *    in shifts every index, and a collapse the user asked for must not slide
 *    onto somebody else's burst. Ids are absent only in tests / synthetic rows,
 *    where the positional fallback is stable enough.
 *  - A thinking trace (W14b) OPENS the turn that produced it, so it joins the
 *    group of the speech row BEHIND it, not the one in front. It sits above its
 *    own head, so folding a group hides it too — the fold shows the utterance's
 *    opening line and nothing else. A trailing trace with no speech behind it
 *    joins the last group instead.
 */
function buildRoomGroups(
  messages: readonly RoomMessageLike[],
  speech: readonly number[],
  groupHeads: ReadonlySet<number>,
): Pick<RoomMessageLayout, 'groups' | 'groupKeyByIndex' | 'groupsByKey'> {
  const groups: RoomMessageGroup[] = []
  const groupKeyByIndex = new Map<number, string>()
  const groupsByKey = new Map<string, RoomMessageGroup>()

  let current: RoomMessageGroup | null = null
  for (const index of speech) {
    if (!current || groupHeads.has(index)) {
      const message = messages[index]
      // A duplicate id (a resend mid-flight has been seen to double one) must
      // not make two bursts fold as one: the position disambiguates.
      const id = message?.id
      current = {
        key: id && !groupsByKey.has(id) ? id : `row-${index}`,
        head: index,
        tail: index,
        members: [index],
        messageCount: 1,
        // Decided once here so the UI never re-derives it: only an agent's own
        // burst folds, and a single row has nothing to hide.
        collapsible: message?.role === 'assistant' && Boolean(message?.agentId),
      }
      groups.push(current)
      groupsByKey.set(current.key, current)
    } else {
      current.members.push(index)
      current.tail = index
      current.messageCount++
    }
    groupKeyByIndex.set(index, current.key)
  }

  // Walk backwards so every trace sees the group it opens.
  let ahead: RoomMessageGroup | null = null
  for (let index = messages.length - 1; index >= 0; index--) {
    const key = groupKeyByIndex.get(index)
    if (key !== undefined) {
      ahead = groupsByKey.get(key) ?? ahead
      continue
    }
    const owner = ahead ?? groups[groups.length - 1]
    if (!owner) continue
    owner.members.push(index)
    groupKeyByIndex.set(index, owner.key)
  }

  for (const group of groups) {
    group.members.sort((a, b) => a - b)
    // Counted in MESSAGES, not rows: a lone utterance with a trace hanging off
    // it has nothing to fold that the trace's own hairline does not already
    // fold, and "1 条消息" is not a summary of anything.
    if (group.messageCount < 2) group.collapsible = false
  }

  return { groups, groupKeyByIndex, groupsByKey }
}
