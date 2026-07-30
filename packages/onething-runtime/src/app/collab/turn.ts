/**
 * One room turn, end to end (R2 split out of the coordinator).
 *
 * W18 moved a room turn into the agent's own EXECUTION session: the room is
 * still the subject (roster, projection material, gates, chain, cascade and
 * typing all read it) but no longer the host — the drive, the thinking and
 * every tool call land in `agent-exec-<agentId>`, and the only thing that
 * reaches the room is whatever `say` puts there.
 *
 * Everything scoped to that window lives here: waiting for the terminal event,
 * aborting it, the per-agent lock that keeps two rooms from putting two streams
 * on one execution session, the circuit breaker, and the harvest.
 *
 * The cascade (what a turn's utterances activate next) is INJECTED rather than
 * imported: the queue drives turns and turns feed the queue, and passing the
 * two entry points down as a parameter breaks that cycle without a
 * module-level host that has to be initialised in the right order.
 */
import { randomUUID } from 'node:crypto'
import {
  COLLAB_MESSAGE_SOURCE,
  COLLAB_USAGE_SOURCE_ROOM,
  collabAgentSessionId,
  createCollabTurnCircuitBreaker,
  decideCollabActivations,
  formatCollabActivationLabel,
  formatCollabTurnBreakerNote,
  isCollabHarvestMessage,
  isCollabPassMessage,
  isCollabSayMessage,
  isAgentPairDmRoom,
  isCollabThinkingMessage,
  isUserDmRoom,
  resolveCollabChainCap,
  resolveCollabTurnBreakerLimits,
  type CollabMentionLike,
} from '@onething/runtime/collab'
import type { ChatMessage, ChatSession } from '@shared/ipc.js'
import * as store from '../store.js'
import { getEventBus } from '../events/index.js'
import { getStreamEngineSafe } from '../engine/index.js'
import { isActiveAgent } from '@shared/ipc.js'
import { findAgent } from '../agents/index.js'
import { ensureCollabAgentSession } from './agent-session.js'
import { attachCollabMentions } from './mentions.js'
import { attachCollabReplyTo } from './reply-quote.js'
import { emitCollabTurnActive, observeCollabSayTyping } from './typing-observer.js'
import { isRoomOverBudget } from './budget.js'
import { issueCollabDriveToken } from './drive-guard.js'
import {
  advanceWatermark,
  maxChainFor,
  peekRoomRuntime,
  persistRoomState,
  postSystemLine,
  roomChannel,
  roomMembers,
  selfElected,
  type CollabActivationInput,
  type CollabActivationRecord,
  type CollabElectionRequest,
  type RoomRuntime,
} from './room-runtime.js'

/**
 * What a finished turn is allowed to set in motion (R2 拆环).
 *
 * A turn's utterances are messages like any other: they can name someone, and
 * they can move a quiet member to speak. Both doors belong to the queue, so the
 * queue hands them in rather than the turn reaching back for them.
 */
export interface CollabTurnCascade {
  enqueue(
    roomSessionId: string,
    runtime: RoomRuntime,
    activations: CollabActivationInput[],
    sourceMessageId: string | undefined,
  ): void
  electWillingSpeakers(request: CollabElectionRequest): Promise<string[]>
}

const TURN_START_TIMEOUT_MS = 20_000
const TURN_TOTAL_TIMEOUT_MS = 10 * 60_000
/** How long a queued activation waits for the engine to get a bound sender
 *  (desktop: window creation) before giving up this processing round. The
 *  record stays queued and is retried on the next queue kick. */
const ENGINE_BIND_WAIT_MS = 5 * 60_000
const ENGINE_BIND_POLL_MS = 1_000

/** Wait until the engine can actually deliver commands (desktop: window bound).
 *  Commands emitted with no bound sender are silently dropped by the engine —
 *  driving into the void would burn the activation (评审修订). */
export async function waitForEngineBound(): Promise<boolean> {
  const deadline = Date.now() + ENGINE_BIND_WAIT_MS
  for (;;) {
    // P2-6: five minutes of 1s polling used to outlive teardown entirely —
    // shutdown returned while this kept ticking against a coordinator whose
    // subscriptions were already gone.
    if (shuttingDown) return false
    const engine = getStreamEngineSafe()
    if (engine?.hasCommandTarget()) return true
    if (Date.now() >= deadline) return false
    await new Promise(resolve => setTimeout(resolve, ENGINE_BIND_POLL_MS))
  }
}

let shuttingDown = false

/** Teardown latch: the next poll of any engine-bind wait gives up immediately. */
export function setCollabTurnsShuttingDown(next: boolean): void {
  shuttingDown = next
}

/** Wait for the terminal event of the next stream on a session. */
export function waitForRoomTurn(
  sessionId: string,
  startTimeoutMs = TURN_START_TIMEOUT_MS,
  totalTimeoutMs = TURN_TOTAL_TIMEOUT_MS,
): Promise<'complete' | 'error' | 'aborted' | 'timeout'> {
  return new Promise(resolve => {
    const bus = getEventBus()
    let sawStart = false
    let settled = false
    const finish = (outcome: 'complete' | 'error' | 'aborted' | 'timeout') => {
      if (settled) return
      settled = true
      clearTimeout(startTimer)
      clearTimeout(totalTimer)
      unsubscribe()
      resolve(outcome)
    }
    const unsubscribe = bus.onAny(sessionId, envelope => {
      const type = envelope.event?.type
      if (type === 'stream:start') sawStart = true
      else if (type === 'stream:complete') finish('complete')
      else if (type === 'stream:error') finish('error')
      else if (type === 'stream:aborted') finish('aborted')
    }, 'collab-turn-wait')
    const startTimer = setTimeout(() => {
      if (!sawStart) finish('timeout')
    }, startTimeoutMs)
    const totalTimer = setTimeout(() => finish('timeout'), totalTimeoutMs)
  })
}

/**
 * Stop whatever stream this room's turn is riding — the single door for it.
 *
 * W18 moved the turn into the agent's execution session and left every "stop"
 * still pointing at the room session, where no stream has lived since: the
 * freeze switch was aborting a session with no controller, i.e. nothing. Abort
 * follows the turn now — the live execution session first, then the room itself
 * as the pre-W18 fallback (an old-shape room hosts its own stream, and aborting
 * a session with no controller is a harmless no-op).
 *
 * Work sessions are deliberately NOT touched: that is `freezeRoomWork`'s job,
 * and each caller composes the two according to what it means by "stop".
 */
export function abortRoomTurn(roomSessionId: string): void {
  const engine = getStreamEngineSafe()
  if (!engine) return
  const activeTurn = peekRoomRuntime(roomSessionId)?.activeTurn
  if (activeTurn) engine.abort(activeTurn.agentSessionId)
  engine.abort(roomSessionId)
}

/**
 * The stop button's door into a room (collab-team-v2 §5.1 入口①).
 *
 * `abortStream(roomId)` used to reach the engine, find no controller on the room
 * session (there has been none since W18) and report success having stopped
 * nothing. This answers the one question the generic abort path needs — "is
 * this a room whose turn I just stopped?" — and returns false for everything
 * else, so private chats and work sessions keep the ordinary path untouched.
 *
 * Work sessions are deliberately spared: stopping the conversation is not
 * stopping the work. Killing the room's floor plus every card in flight is the
 * freeze switch's meaning, and it has its own button.
 */
export function abortCollabRoomTurnForStop(sessionId: string): boolean {
  const session = store.getSession(sessionId)
  if (session?.kind !== 'room') return false
  const hadTurn = Boolean(peekRoomRuntime(sessionId)?.activeTurn)
  abortRoomTurn(sessionId)
  return hadTurn
}

/**
 * What a turn left behind (W14b 说话即行动, re-homed by W18).
 *
 * Since W18 a turn runs in the agent's own execution session, so its remains
 * are split across two transcripts and the split IS the point:
 *  - `says`        — what the agent actually SAID, one message per `say` call,
 *                    oldest first, harvested from the ROOM. This is the only
 *                    thing the room ever receives.
 *  - `turnMessage` — the turn's host message (thinking text + tool calls),
 *                    harvested from the AGENT EXECUTION session, where the
 *                    whole turn now lives.
 *  - `legacySpeech`— pre-W18 shape only: an unmarked assistant message the
 *                    agent left IN the room, back when the stream itself was
 *                    the utterance. Kept so an old-style turn still counts as
 *                    speech; nothing writes this shape any more.
 *
 * Worker harvest posts are skipped: they are written under the same agent's
 * name but by the coordinator, and a harvest that lands mid-turn must not be
 * mistaken for something this turn produced.
 *
 * Both scans stop at the first message older than the drive: everything else
 * belongs to an earlier turn, which is exactly the stale-reply trap the
 * pre-W14b `latestAssistantMessageSince` guarded against.
 */
interface CollabTurnHarvest {
  says: ChatMessage[]
  turnMessage?: ChatMessage
  legacySpeech?: ChatMessage
}

function harvestTurnMessages(
  roomSession: ChatSession,
  agentSession: ChatSession | undefined,
  agentId: string,
  sinceTs: number,
): CollabTurnHarvest {
  const says: ChatMessage[] = []
  let legacySpeech: ChatMessage | undefined
  for (let index = roomSession.messages.length - 1; index >= 0; index--) {
    const message = roomSession.messages[index]
    if (message.timestamp < sinceTs) break
    if (message.role !== 'assistant' || message.agentId !== agentId) continue
    if (isCollabSayMessage(message)) {
      says.unshift(message)
      continue
    }
    if (isCollabHarvestMessage(message)) continue
    // Neither a say nor a harvest post: only a pre-W18 in-room turn can be
    // this, and back then it WAS the utterance.
    if (!legacySpeech && !isCollabThinkingMessage(message)) legacySpeech = message
  }

  // `turnMessage` is the NEWEST assistant record of the window — the silence
  // branch reads it to tell "the turn ran and said nothing" from "never ran".
  let turnMessage: ChatMessage | undefined
  for (let index = (agentSession?.messages.length ?? 0) - 1; index >= 0; index--) {
    const message = agentSession!.messages[index]
    if (message.timestamp < sinceTs) break
    if (message.role !== 'assistant') continue
    turnMessage = message
    break
  }

  return { says, turnMessage, legacySpeech }
}

/** Union of the ids a turn addressed, in first-appearance order. `say` stamps
 *  its own mentions at write time (explicit ids ∪ prose scan), so this reads
 *  them back instead of re-resolving names the room may have since renamed. */
function unionTurnMentions(messages: readonly ChatMessage[]): CollabMentionLike[] {
  const seen = new Set<string>()
  const mentions: CollabMentionLike[] = []
  for (const message of messages) {
    for (const mention of message.mentions ?? []) {
      if (!mention?.agentId || seen.has(mention.agentId)) continue
      seen.add(mention.agentId)
      mentions.push({ agentId: mention.agentId, label: mention.label })
    }
  }
  return mentions
}

/** 'requeue-wait' = chain frozen, resumes on the next human message;
 *  'requeue-budget' = day budget spent, re-kicked when the day rolls over;
 *  'requeue-retry' = engine unbound past the wait window, re-kicked on a timer. */
export type DriveResult = 'done' | 'requeue-wait' | 'requeue-budget' | 'requeue-retry'

/**
 * One turn at a time per AGENT (W18).
 *
 * Each room owns a serial queue, but an agent that belongs to two rooms is now
 * driven through ONE execution session, and two rooms activating it at the same
 * moment would put two streams on that session — supersede-abort, a half-turn,
 * and a target-room pointer written by whichever drive got there last. The
 * queues stay per-room; this makes the agent itself the second serialization
 * axis. A room whose turn waits here is only waiting for the same agent to
 * finish speaking elsewhere, and turn timeouts bound that wait.
 */
const agentSessionLocks = new Map<string, Promise<void>>()

async function withAgentSessionLock<T>(
  agentSessionId: string,
  run: () => Promise<T>,
): Promise<T> {
  const previous = agentSessionLocks.get(agentSessionId) ?? Promise.resolve()
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  // The tail never rejects (it is only ever a chain of resolved gates), so a
  // failing turn cannot wedge the next one.
  const tail = previous.then(() => held)
  agentSessionLocks.set(agentSessionId, tail)
  await previous
  try {
    return await run()
  } finally {
    release()
    // P2-10: drop the key when nobody queued behind us. `agentSessionLocks` was
    // add-only — every agent that ever spoke kept an entry for the life of the
    // process. If the map still points at OUR tail, we were the last holder;
    // if a later turn has already replaced it, leave it alone, because that
    // entry is the gate the next turn is waiting on.
    if (agentSessionLocks.get(agentSessionId) === tail) {
      agentSessionLocks.delete(agentSessionId)
    }
  }
}

/**
 * 死房兜底(agent-im-dm.md P1):一条激活在驱动处被丢掉时,**私聊**要留一行
 * 用户看得见的系统行。
 *
 * 群房刻意零改动:群里一条激活被丢掉,还有别的成员、还有别的消息,而"每次丢弃
 * 都在群里贴一行"会把机械账目搬进对话面(W9.1 反对的正是这件事)。私聊没有第二
 * 个人可以指望,静默丢弃在用户那里等于"这间房坏了"。
 */
function postDmDeadEndLine(session: ChatSession, content: string): void {
  if (!isUserDmRoom(session.room)) return
  postSystemLine(session.id, content)
}

export async function driveActivation(
  roomSessionId: string,
  runtime: RoomRuntime,
  record: CollabActivationRecord,
  cascade: CollabTurnCascade,
): Promise<DriveResult> {
  const session = store.getSession(roomSessionId)
  if (!session || session.kind !== 'room' || session.room?.frozen) {
    // 冻结本身已经有可见反馈:总闸落下时 setCollabRoomFrozen 贴了「房间已全部
    // 暂停…」,冻结期间的用户消息由 ingress 侧的冻结系统行接住(queue.ts)。
    record.stage = 'failed'
    return 'done'
  }

  // Removed while queued → it does not get the floor (W6 / §3.5 C). Its
  // in-flight WORK session is deliberately left alone (the task is still
  // harvested), but the room roster is read fresh here, so a member removed a
  // moment ago never speaks again.
  if (!(session.room?.memberAgentIds ?? []).includes(record.agentId)) {
    record.stage = 'failed'
    // 私聊房的成员被换掉了(设置里改了名册),排在队里的那位已经不属于这间房。
    postDmDeadEndLine(session, '这间私聊的成员已经变了,刚才那句没有人接')
    return 'done'
  }

  // Chain gate re-check at DRIVE time (评审修订): queued fan-out from a
  // multi-mention reply must not overshoot the cap. Records stay queued;
  // a real user message resets the chain and the queue resumes.
  // task-event activations (delivery → review) are EXEMPT: the work pipeline
  // has its own bounds (per-task 打回 ≤2, concurrency caps) and freezing a
  // review mid-delivery stalls real work (真机实测修订).
  // 费用闸:一切激活(含 task-event)都花钱,超预算即等待(次日/调预算恢复)。
  if (await isRoomOverBudget(roomSessionId)) {
    // Its own outcome, not a plain wait: the caller arms the day-rollover kick
    // that makes the notice's 「明天自动恢复」 true (P2-4). A chain freeze needs
    // no timer — it resumes on the next human message, by design.
    return 'requeue-budget'
  }

  // 闸按激活原因分档,但只剩两档:'task-event' 豁免(Infinity,pre-W21 的
  // 短路),其余共用房间那一格的连续发言上限 —— 主动接话曾有一道固定的更严
  // 闸,已撤(见 resolveCollabChainCap)。
  const chainCap = resolveCollabChainCap(record.reason, maxChainFor(session))
  if (runtime.state.chainCount >= chainCap) {
    // A self-election that hits its tighter cap is DROPPED, not parked. It was
    // an impulse about one particular message ("我想接这句"), and parking it
    // means the impulse resurfaces stale right after the human reopens the room
    // — the very 重复发消息 feel W21 exists to remove. It also keeps the serial
    // queue moving: a parked head blocks the mentions and task-events behind it,
    // and a delivery review must never wait on somebody's small talk.
    // Mentions and task events are obligations: they still park and resume.
    if (record.reason === 'self-elected') {
      record.stage = 'failed'
      return 'done'
    }
    // Everything that reaches here parks at the FULL cap (mention/schedule),
    // so the 「我先按住了」 line still means what it always meant: the room is
    // held until the user speaks.
    if (!runtime.chainNoticePosted) {
      runtime.chainNoticePosted = true
      postSystemLine(
        roomSessionId,
        `他们连着聊了 ${maxChainFor(session)} 条,我先按住了——你说一句话,讨论就继续`,
      )
    }
    return 'requeue-wait'
  }

  // 查无此人,或者这个人已经退休(域模型 §3.2 的激活链一行):不给发言权。
  //
  // 这是每一条激活的必经之路(点名/主动接话/任务事件/日程),所以退休的收口就
  // 放在这里 —— 上游的候选面各自也筛(意愿判定、mention 解析),但那些是"不
  // 提名",这一行是"提名了也不给"。已退休的成员**留在 memberAgentIds 里**(数据
  // 不动,成员条照旧显示墓碑),只是永远沉默。
  const agent = findAgent(record.agentId)
  if (!agent || !isActiveAgent(agent)) {
    record.stage = 'failed'
    // 私聊里这条分支就是"这间房再也不会有人说话了",必须说出来(P1 死房兜底)。
    // 群房照旧只记账 —— 群里少一个人不等于群坏了。
    postDmDeadEndLine(
      session,
      agent
        ? `${agent.name} 已注销,这间私聊不会再有回复`
        : '这位同事已经不在了,这间私聊不会再有回复',
    )
    return 'done'
  }

  // Commands are dropped silently when no sender is bound (boot, pre-window).
  // Deliberately BEFORE the agent lock: waiting up to five minutes for a window
  // must not block the same agent's turn in another room.
  if (!(await waitForEngineBound())) {
    return 'requeue-retry'
  }

  // collab-team-v2 §1.1:每群每 agent 一条常驻会话。锁的 key 就是这个 id,所以
  // 串行粒度在这一行同时从 per-agent 变成 per(agent×群)——两个群同时激活同一个
  // agent 各驱各的会话,不再互等。
  const agentSessionId = collabAgentSessionId(record.agentId, roomSessionId)
  if (!agentSessionId) {
    record.stage = 'failed'
    return 'done'
  }

  return await withAgentSessionLock(agentSessionId, async () => {
    // Where this room's turn actually lives, for exactly as long as it lives
    // there (R0). Same window as the observers below — inside the agent lock,
    // torn down by the same finally — so `abortRoomTurn` can never point at a
    // session that has already handed the floor to another room.
    runtime.activeTurn = { agentSessionId, agentId: record.agentId }
    // collab-team-v2 §5.1 入口①: tell the ROOM its turn window is open, so the
    // renderer can draw a stop button. The room session emits no `stream:start`
    // of its own (the stream lives in the execution session), which is why the
    // button has never been drawable — and why this pulse must share the
    // activeTurn window exactly: the button is visible iff `abortRoomTurn` has
    // something to shoot at.
    emitCollabTurnActive(roomSessionId, record.agentId, true)
    // W19 真实 typing: the window is exactly the turn — opened under the agent
    // lock (so the light belongs to this room's turn, not to another room that
    // holds the same execution session) and closed by the finally, which also
    // forces the indicator off. Nothing outside this window emits typing any
    // more: queueing is not typing, thinking is not typing.
    const detachTyping = observeCollabSayTyping({
      sessionId: agentSessionId,
      roomSessionId,
      agentId: record.agentId,
    })
    // W22 回合断路器: same window, same teardown discipline, opposite job — the
    // typing observer reports what the turn is doing, this one stops it when
    // what it is doing has stopped making sense.
    const detachBreaker = observeCollabTurnCircuitBreaker({
      sessionId: agentSessionId,
      roomSessionId,
    })
    try {
      return await runActivationTurn({ roomSessionId, runtime, record, agent, agentSessionId, cascade })
    } finally {
      detachBreaker()
      detachTyping()
      runtime.activeTurn = undefined
      emitCollabTurnActive(roomSessionId, record.agentId, false)
    }
  })
}

/**
 * Watch one turn window's tool calls and abort the turn if it runs away (W22).
 *
 * Both caps are room settings (`budgets.maxTurnToolCalls` / `maxTurnSayCalls`,
 * 0 = 关闭) — the defaults sit where no real turn reaches them, and a room that
 * genuinely needs a longer turn raises or removes them in the settings form
 * instead of anyone editing a constant.
 *
 * The breaker is a STRUCTURAL floor, not a behaviour: nothing about it is
 * specific to which tool is looping (the one that caused 真机 事故 is gone), and
 * a turn that says its piece never comes near it. It exists because the only
 * other bound on a tool loop is `TURN_TOTAL_TIMEOUT_MS`, and ten minutes of
 * full-context requests is an expensive way to discover a turn is stuck.
 *
 * Abort goes through the engine's ordinary channel, so everything downstream
 * behaves as it does for a user-pressed stop: `waitForRoomTurn` settles on
 * `stream:aborted`, the partial transcript is harvested exactly as it will be
 * on boot replay, and any `say` that already landed still counts as speech.
 * The note is written into the EXECUTION session (where the turn lives and
 * where someone debugging it will look), never into the room — the room shows
 * utterances, and a breaker trip is machinery.
 */
function observeCollabTurnCircuitBreaker(options: {
  sessionId: string
  roomSessionId: string
}): () => void {
  const { sessionId, roomSessionId } = options
  // Caps are per-room settings (0 = 关闭), read at turn start like every other
  // room gate — a change made mid-turn belongs to the next turn, not this one.
  const budgets = store.getSession(roomSessionId)?.room?.budgets
  const limits = resolveCollabTurnBreakerLimits({
    maxToolCalls: budgets?.maxTurnToolCalls,
    maxSayCalls: budgets?.maxTurnSayCalls,
  })
  // Both caps off: don't subscribe at all. A breaker that cannot trip is a
  // listener on every event of the turn for nothing.
  if (!limits.enabled) return () => {}
  const breaker = createCollabTurnCircuitBreaker(limits)
  const unsubscribe = getEventBus().onAny(sessionId, envelope => {
    const trip = breaker.observe(
      (envelope as { event?: Parameters<typeof breaker.observe>[0] } | undefined)?.event,
    )
    if (!trip) return
    // Note first: the abort tears the stream down, and a record that lands
    // after it is a record nobody associates with the turn that earned it.
    postSystemLine(sessionId, formatCollabTurnBreakerNote(trip))
    getStreamEngineSafe()?.abort(sessionId)
  }, 'collab-turn-breaker')

  let detached = false
  return () => {
    if (detached) return
    detached = true
    unsubscribe()
  }
}

/**
 * The turn itself — W18: it runs in the AGENT's execution session.
 *
 * The room is still the subject (roster, projection material, gates, chain,
 * cascade, typing all read it) but no longer the host: the drive, the thinking
 * and every tool call land in `agentSessionId`, and the only thing that reaches
 * the room is whatever `say` puts there. Entered under the agent lock, so the
 * target-room pointer written here belongs to this turn for its whole duration.
 */
async function runActivationTurn(options: {
  roomSessionId: string
  runtime: RoomRuntime
  record: CollabActivationRecord
  agent: NonNullable<ReturnType<typeof findAgent>>
  agentSessionId: string
  cascade: CollabTurnCascade
}): Promise<DriveResult> {
  const { roomSessionId, runtime, record, agent, agentSessionId, cascade } = options
  // Re-read the room: waiting for the agent lock can take a whole turn in
  // another room, and a brake pulled meanwhile must be honoured here too (the
  // same gates the caller checked before queueing for the lock).
  const session = store.getSession(roomSessionId)
  if (!session || session.kind !== 'room' || session.room?.frozen) {
    record.stage = 'failed'
    return 'done'
  }
  if (!(session.room?.memberAgentIds ?? []).includes(record.agentId)) {
    record.stage = 'failed'
    postDmDeadEndLine(session, '这间私聊的成员已经变了,刚才那句没有人接')
    return 'done'
  }

  // Lazily created, and pointed at the room this drive is about: the prompt
  // builder takes its persona/roster/projection material from there, and a
  // `say` without an explicit room lands there.
  if (!ensureCollabAgentSession(record.agentId, roomSessionId)) {
    record.stage = 'failed'
    // 常驻会话都建不出来(agent 在等锁的这段时间里被删了)——私聊里同样不能静默。
    postDmDeadEndLine(session, `${agent.name} 的会话打不开,这一句没能送到`)
    return 'done'
  }

  // One stream per session: the queue is serial, but guard against an
  // externally-driven stream (steering resume etc.) racing the drive.
  //
  // collab-team-v2 §5.2: the same zombie hole the total-timeout branch below
  // fixed, one wait earlier. Giving up on the wait used to fall straight through
  // to `emitDrive`, which put a second stream on a session that still had a live
  // one — supersede-abort, a half turn, and a drive billed for nothing. The wait
  // ending is not the stream ending; only an abort makes it so.
  if (getStreamEngineSafe()?.getController(agentSessionId)) {
    if (await waitForRoomTurn(agentSessionId) === 'timeout') {
      getStreamEngineSafe()?.abort(agentSessionId)
    }
  }

  // The room still records who spoke last: `say` stamps its own agentId, but
  // the room's own attribution choke point (and any pre-W18 path) reads this.
  store.updateSessionAgent(roomSessionId, record.agentId)
  record.stage = 'driving'
  record.driveMessageId = randomUUID()
  persistRoomState(roomSessionId, runtime)

  const reasonLabel = formatCollabActivationLabel(record.reason, record.driveLabel)
  const driveStartTs = Date.now()

  /**
   * P1-4 (docs/design/todo2-fix-plan.md): a model the user pinned on THIS
   * execution session outranks the agent's binding.
   *
   * The drive used to stamp the binding as a command-level override
   * unconditionally, and `withAgentModelBinding` (app/engine/stream-engine.ts)
   * short-circuits on any command that already carries providerId — so picking
   * a model in the execution session's UI could never take effect. Dropping the
   * override lets the engine resolve the session's own configuration, and
   * `resolveAgentProfile` already drops the binding for a pinned session, so
   * nothing puts it back.
   */
  const modelPinned = store.getSession(agentSessionId)?.modelPinned === true

  /**
   * The drive round: the synthetic user message that carries the turn, plus
   * the model binding this agent brings. It bills, binds and hides as one unit
   * (COLLAB_MESSAGE_SOURCE ⇒ isCollabDriveMessage ⇒ never relayed into the room
   * projection anyone else reads, and never a message that opens a willingness
   * round of its own).
   *
   * The one place it is NOT hidden is this turn's own model input: the history
   * builder appends the CURRENT drive at the tail of the execution session's
   * projection (app/engine/stream/message-helpers.ts). Until 2026-07-30 it did
   * not, and the drive reached the model exactly never.
   */
  const emitDrive = async (content: string): Promise<void> => {
    await getEventBus().emit(agentSessionId, {
      type: 'command:send-message',
      // The room's connector: the turn runs elsewhere, but it answers the
      // room, and outbound routing/permission affinity follow the room.
      channel: roomChannel(roomSessionId),
      content,
      source: COLLAB_MESSAGE_SOURCE,
      origin: { transport: 'api', source: COLLAB_MESSAGE_SOURCE, receivedAt: Date.now() },
      // P2-8: the marker says what this is, the token proves who sent it. Only
      // the coordinator that minted it this process can put this value on a
      // command, so the engine's room/exec gate can stop trusting a string.
      ...(issueCollabDriveToken() ? { collabDriveToken: issueCollabDriveToken() } : {}),
      // W23: the drive is the idempotence ledger. Persisting WHICH room message
      // this activation answers turns the execution transcript into a record
      // that outlives the 50-entry cap on state.json's activations — boot
      // reconciliation reads it when its own records come up empty.
      //
      // Task-event activations have no room message behind them and leave the
      // field absent, which is exactly right — nothing to retire.
      ...(record.sourceMessageId ? { collabSourceMessageId: record.sourceMessageId } : {}),
      suppressTitleGeneration: true,
      // W13.3: bill this turn as room spend, not anonymous chat. Attribution
      // only — the budget gate below still sums by sessionId.
      usageSource: COLLAB_USAGE_SOURCE_ROOM,
      // 这里刻意 **没有** initialToolChoice。
      //
      // W22 曾把回合首调 named-force 成 say(「判定即承诺」:意愿判定说了要
      // 发言,那开口即 say)。2026-07-30 移除:真机的代价是无话可说的 agent
      // 没有"不说"的出口——被 @ 或被任务事件拉起来、看完上下文发现确实没自己
      // 的事,却必须调 say,于是群里多出一条「我这轮不说了 / 保持静默」的废话
      // 消息。行为由代码决定,而提示词全链路(roster 情况说明、say 工具描述)
      // 都说"可以沉默"——两者矛盾时收拾的是代码。
      //
      // 沉默路径不需要强制:不管是整轮什么都不调,还是写了正文没调 say,都走
      // 静默收尾分支(不计链、不级联、推水位)。W14d 的补救 nudge 已于
      // 2026-07-30 拆除——真机上它把一个想 pass 却把 pass 写成旁白的回合重新
      // 推上发言台,模型在补救轮里误以为上一条已送达的消息没发出去,又 say 了
      // 一遍,群里出现重复消息。代价是"写了完整回复却忘调 say"不再有结构补救,
      // 只能靠 drive 尾行的事实陈述。
      // W18b 的 stay_silent 空转事故也不会回归:那个工具已删除,沉默就是不调
      // 任何工具,没有可空转的落点(tool-surface.ts 自己就是这么论证的)。
      // Per-agent thinking preference (D1): binding stores an effort level
      // string; the command contract wants thinking:boolean + thinkingEffort.
      // All three are dropped for a pinned session (P1-4, see modelPinned).
      ...(modelPinned
        ? {}
        : {
            ...(agent.model?.providerId ? { providerId: agent.model.providerId } : {}),
            ...(agent.model?.modelId ? { model: agent.model.modelId } : {}),
            ...(agent.model?.thinking && agent.model?.providerId
              ? { thinking: true, thinkingEffort: agent.model.thinking }
              : {}),
          }),
    } as Parameters<ReturnType<typeof getEventBus>['emit']>[1])
  }

  // The drive is machinery (never relayed to other members, never rendered in
  // rooms), so it is the ONE legitimate place for a mechanical line — and since
  // 2026-07-30 it really does sit at the end of THIS turn's context, where
  // instruction-following is strongest (the history builder appends the current
  // drive to the execution session's projection; before that fix this sentence
  // was describing a message the model never received).
  //
  // W22 turned it from an instruction into a FACT, and a fact is what it stays
  // now that the forced opening call is gone (2026-07-30): the line states how
  // the channel works — 发言只能通过 say 送出 — and nothing more. It does not
  // tell the turn to speak (the judgement layer already decided this member
  // wants to) and it does not spell out a 不发言 exit either: 沉默 = 什么都不调,
  // which needs no instruction and no tool.
  // P2-7 先订阅后驱动: the bus delivers synchronously, so a stream that starts
  // and ends inside `emitDrive` would settle before a waiter created after it
  // existed — the turn would then sit out its full start timeout and get
  // aborted as a zombie it never was. The externally-driven branch above has
  // always built its waiter first; the drive here does the same.
  const turnEnded = waitForRoomTurn(agentSessionId)
  await emitDrive(
    `(${agent.name} · ${reasonLabel})\n(你的发言通过 say 工具送出,可多次;说完直接结束。)`,
  )

  record.stage = 'streaming'
  persistRoomState(roomSessionId, runtime)

  const outcome = await turnEnded
  if (outcome === 'timeout') {
    // Never leave a zombie stream: the wait gave up, but the request did not —
    // it keeps burning full-context round-trips against a turn nobody is
    // listening to any more, and the agent lock is about to be handed to the
    // next room. worker.ts:363 fixed the same hole on the work path; the room
    // path was left behind.
    getStreamEngineSafe()?.abort(agentSessionId)
  }

  // Harvest whatever persisted, regardless of outcome — an aborted partial IS
  // in the transcript and must count exactly like it will on boot replay
  // (live/replay chain alignment, 评审修订). Two transcripts since W18: the
  // room holds the says, the execution session holds the turn.
  //
  // 这里曾有 W14d 补救 nudge(写了正文没调 say → 同一激活内再驱一轮),
  // 2026-07-30 拆除:真机上它把想 pass 的回合重新推上发言台,模型在补救轮里
  // 误以为已送达的上一条消息没发出去,重发一遍造成群里重复消息。现在写了
  // 正文没调 say 与整轮沉默走同一条静默收尾分支。
  const room = store.getSession(roomSessionId)
  const harvested: CollabTurnHarvest = room
    ? harvestTurnMessages(room, store.getSession(agentSessionId), record.agentId, driveStartTs)
    : { says: [] }

  const after = store.getSession(roomSessionId)
  const { says, turnMessage } = harvested

  record.stage = outcome === 'complete' ? 'harvested' : 'failed'

  /**
   * Epoch fork (W14b, narrowed by W18). `say` messages are speech, full stop.
   * With none of them, the only thing that can still count as an utterance is
   * an unmarked assistant message the agent left IN THE ROOM — the pre-W18
   * shape, where the turn ran there and the stream itself was the utterance
   * (`[pass]` sentinel included). A turn record in the execution session is
   * never speech: nobody can read it, which is the whole point of W18.
   */
  const legacySpeech = says.length === 0
    && harvested.legacySpeech
    && !isCollabPassMessage(harvested.legacySpeech.content)
    ? harvested.legacySpeech
    : undefined
  const speech = says.length > 0 ? says : legacySpeech ? [legacySpeech] : []

  if (after && speech.length > 0) {
    // One chain unit per utterance: an agent that sends three short lines said
    // three things. The boot recompute counts the same messages one by one, so
    // live and replay reach the same number (W12 alignment).
    runtime.state.chainCount += speech.length

    let mentions: CollabMentionLike[]
    if (says.length > 0) {
      mentions = unionTurnMentions(says)
      // W13.2 stays as the FALLBACK it was demoted to: a say that named its
      // own replyTo is left alone (attachCollabReplyTo refuses a message that
      // already carries a snapshot), and only the FIRST utterance of the turn
      // is a candidate — by the second one the agent's own first line sits in
      // between, and quoting the trigger through it would read as a loop.
      attachCollabReplyTo(roomSessionId, says[0].id, record.sourceMessageId)
    } else {
      // W14a: the reply's own `@名字` become ids HERE — the one place where the
      // message is settled and the roster that produced it is still the current
      // one. The result feeds the cascade decision below, so the ids the
      // transcript keeps and the ids that activate members are the same list.
      mentions = attachCollabMentions(roomSessionId, speech[0].id, roomMembers(after))
      attachCollabReplyTo(roomSessionId, speech[0].id, record.sourceMessageId)
    }

    const lastSpoken = speech[speech.length - 1]
    advanceWatermark(runtime, lastSpoken)
    persistRoomState(roomSessionId, runtime)

    // Cascade follow-up activations only for cleanly completed turns.
    if (outcome === 'complete') {
      const decision = decideCollabActivations({
        authorKind: 'agent',
        authorAgentId: record.agentId,
        // The turn's utterances judged as one act: a member @-ed in the second
        // of three lines is addressed just as squarely as one named in the first.
        text: speech.map(message => message.content).join('\n'),
        // Empty means "the stamp resolved nothing" — which can also mean the
        // stamp never ran (message gone, room re-typed). Falling through to the
        // text scan then costs nothing and never loses an activation.
        ...(mentions.length > 0 ? { mentions } : {}),
        members: roomMembers(after),
        chainCount: runtime.state.chainCount,
        maxChain: maxChainFor(after),
        frozen: after.room?.frozen,
        // D6 免判(双成员 dm 房,IM P3):一对一里 agent 开口就是在对对面说话,
        // 所以合成一个 mention —— 与单成员房用的是同一套手法,于是 reason
        // 'mention'、链长闸、去重、驱动侧的冻结/退休/预算门全部照常。省掉的
        // 只有下面那次意愿判定,而在两个人的房里它的候选面本来就是空的。
        // 用户插话不走这里(那是 handleRoomUserMessage 的事,双成员房照旧判定)。
        ...(isAgentPairDmRoom(after.room) ? { dmPairPeer: true } : {}),
      })
      if (decision.blockedByChain && !runtime.chainNoticePosted) {
        runtime.chainNoticePosted = true
        postSystemLine(
          roomSessionId,
          `他们连着聊了 ${maxChainFor(after)} 条,我先按住了——你说一句话,讨论就继续`,
        )
      }
      cascade.enqueue(roomSessionId, runtime, decision.activations, lastSpoken.id)

      // What was said is a real message too, so the room judges it — but only
      // below the chain cap: an agent-authored message at the cap buys no
      // judgement calls (same gate the mention path hits via blockedByChain).
      // W21: what this round can produce is self-elected activations, so it is
      // the SELF-ELECT cap that decides whether to pay for the round at all —
      // no point spending one call per member for records the drive gate will
      // freeze. Mentions are unaffected: they were decided above, at the full
      // cap, before this line.
      if (runtime.state.chainCount < resolveCollabChainCap('self-elected', maxChainFor(after))) {
        const elected = await cascade.electWillingSpeakers({
          roomSessionId,
          session: after,
          exclude: new Set(decision.activations.map(activation => activation.agentId)),
          authorAgentId: record.agentId,
          targetMessageId: lastSpoken.id,
        })
        if (elected.length > 0) {
          cascade.enqueue(roomSessionId, runtime, selfElected(elected), lastSpoken.id)
        }
      }
    }
  } else if (after && (turnMessage || harvested.legacySpeech)) {
    // The turn ran and said nothing — a thinking record in the execution
    // session with no say beside it (W18/W14b), or a `[pass]` sentinel in an
    // older transcript. Silence is a legal state in an IM room: no chain, no
    // cascade, no line. The trigger IS consumed, so a restart never re-drives
    // it — and the watermark must name a ROOM message to do that, which the
    // turn record no longer is (it lives in another session entirely).
    //
    // P2-3: and it must be a ROOM message. The old fallback ended at
    // `turnMessage`, which since W18 lives in the execution session — a
    // watermark pointing at an id the room does not contain fails the id lookup
    // on the next boot and falls through to the timestamp path, where it
    // silently retires every room message older than that turn. When no room
    // anchor exists (a task-event activation has no source message at all, and
    // that is the normal path) the watermark simply does not move: dedup is
    // already two-level (the state record here, the `collabSourceMessageId`
    // stamp on the drive, W23), so nothing re-drives for want of a fake anchor.
    const consumed = (record.sourceMessageId
      ? after.messages.find(message => message.id === record.sourceMessageId)
      : undefined)
      ?? harvested.legacySpeech
    if (consumed) advanceWatermark(runtime, consumed)
    persistRoomState(roomSessionId, runtime)
    // 群里沉默是合法状态(别人还会说话,而且判定层本来就允许"这轮不说")。
    // 私聊里它是死路的最后一种形态:用户问了一句,回合跑完了,对话面上什么都
    // 没有。所以只在私聊贴一行事实——不解释、不催,只让"没有回应"变得可见。
    postDmDeadEndLine(after, `${agent.name} 这一轮没有说话`)
  } else {
    // Nothing persisted at all — surface the failure instead of a silent
    // fold line followed by nothing (评审修订).
    persistRoomState(roomSessionId, runtime)
    if (outcome !== 'complete') {
      const why = outcome === 'timeout' ? '响应超时' : outcome === 'aborted' ? '已被中止' : '模型调用失败'
      postSystemLine(roomSessionId, `${agent.name} 未能应答(${why})`)
    }
  }
  return 'done'
}
/** Drop every agent lock (process teardown / test reset). The chain each entry
 *  holds is only ever a chain of resolved gates, so nothing is left waiting. */
export function clearAgentSessionLocks(): void {
  agentSessionLocks.clear()
}

/** How many agents currently hold (or are queued behind) a turn lock. Exists
 *  so the self-cleaning invariant above is assertable — the map is otherwise
 *  invisible, which is exactly how it grew unbounded. */
export function agentSessionLockCount(): number {
  return agentSessionLocks.size
}

/** The lock itself, for the tests that pin its queueing and self-cleaning. */
export const withAgentSessionLockForTest = withAgentSessionLock
