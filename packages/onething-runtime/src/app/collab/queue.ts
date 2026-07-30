/**
 * The room's activation queue (R2 split out of the coordinator).
 *
 * Everything that decides WHO speaks and in WHAT ORDER: the willingness round
 * (§2.2), the per-room serial queue (one stream per session — supersede-abort
 * must never fire on a room), the user-message entry point, and boot
 * reconciliation.
 *
 * Turns themselves live in `turn.ts`; this module hands each drive the two
 * cascade doors (enqueue / elect) so a finished turn can feed the queue without
 * the two modules importing each other.
 */
import { randomUUID } from 'node:crypto'
import {
  collabAgentSessionIdsForScan,
  collectConsumedSourceIds,
  computeCollabChainCount,
  decideCollabActivations,
  filterCollabSelfElectCandidates,
  isCollabDriveMessage,
  isUserDmRoom,
} from '@onething/runtime/collab'
import { isActiveAgent, type ChatMessage, type ChatSession } from '@shared/ipc.js'
import * as store from '../store.js'
import { findAgent } from '../agents/index.js'
import { reactToCollabMessage } from './reactions.js'
import { emitCollabTyping } from './typing-observer.js'
import { judgeWillingness } from './willingness-runner.js'
import { isRoomOverBudget, msUntilNextBudgetDay } from './budget.js'
import {
  advanceWatermark,
  maxChainFor,
  persistRoomState,
  postSystemLine,
  roomMembers,
  roomRuntime,
  scheduleRoomTimer,
  selfElected,
  type CollabActivationInput,
  type CollabActivationRecord,
  type CollabElectionRequest,
  type RoomRuntime,
} from './room-runtime.js'
import { driveActivation, type CollabTurnCascade, type DriveResult } from './turn.js'

/** Transcript tail handed to the willingness round; the pure logic windows it
 *  down to ≤8 projected lines (drives/pass/system dropped along the way). */
const WILLINGNESS_HISTORY_SCAN = 40

function recentRoomMessages(session: ChatSession): ChatMessage[] {
  return session.messages.slice(-WILLINGNESS_HISTORY_SCAN)
}

/**
 * The willingness round (§2.2): every member that was NOT short-circuited by
 * an @ gets one cheap judgement call, and the volunteers queue up.
 *
 * The same call also carries the silent members' emoji (§3.5 B). Those land
 * here, on the message that PROMPTED the round — the reaction is an answer to
 * that message, and it costs nothing extra because the judgement was already
 * paid for. Reactions are written add-only (never a retraction) and broadcast
 * as `message:updated`, which the coordinator does not listen to, so a reaction
 * cannot open a round of its own.
 *
 * Gates come first — a frozen or over-budget room spends nothing — and are
 * re-checked after the round, because the calls take seconds during which the
 * user may have pulled the room's brake.
 */
export async function electWillingSpeakers(options: CollabElectionRequest): Promise<string[]> {
  const room = options.session.room
  if (!room || room.frozen) return []

  const liveSession = store.getSession(options.roomSessionId) ?? options.session
  // W21 rule 1: whoever's own line is still inside the last K_cd visible
  // messages does not get to self-elect — and does not get judged either, so
  // the brake costs nothing instead of one call per member per turn. Mentions
  // never reach here (they short-circuited in decideCollabActivations) and
  // task events are queued by the work pipeline, so 点名 always wins.
  const candidates = filterCollabSelfElectCandidates(
    roomMembers(options.session).filter(member =>
      !options.exclude.has(member.id) && member.id !== options.authorAgentId),
    recentRoomMessages(liveSession),
  )
  if (candidates.length === 0) return []
  if (await isRoomOverBudget(options.roomSessionId)) return []

  try {
    const outcomes = await judgeWillingness(
      options.roomSessionId,
      candidates,
      recentRoomMessages(store.getSession(options.roomSessionId) ?? options.session),
    )
    const live = store.getSession(options.roomSessionId)
    if (live?.kind !== 'room' || live.room?.frozen) return []

    if (options.targetMessageId) {
      for (const outcome of outcomes) {
        if (outcome.respond || !outcome.react) continue
        reactToCollabMessage(
          options.roomSessionId,
          options.targetMessageId,
          outcome.react,
          { type: 'agent', agentId: outcome.agentId },
          { toggle: false },
        )
      }
    }

    return outcomes.filter(outcome => outcome.respond).map(outcome => outcome.agentId)
  } catch (error) {
    console.error('[collab] willingness round failed:', error)
    return []
  }
}

/**
 * The two doors a finished turn may open (R2 拆环). Declared as a value so the
 * turn module never has to import this one back.
 */
const CASCADE: CollabTurnCascade = {
  enqueue: (roomSessionId, runtime, activations, sourceMessageId) =>
    enqueue(roomSessionId, runtime, activations, sourceMessageId),
  electWillingSpeakers: request => electWillingSpeakers(request),
}

/**
 * One (agent, 触发消息, 理由) 只排一次队 (todo2 P0-2 顺手加固, 2026-07-30).
 *
 * 同一个 agent 因为同一条房间消息、以同一个理由被激活两次,第二次没有任何新
 * 信息,只会让它对着同一条消息再说一遍话——而一遍队的成本是一次全上下文模型
 * 调用。上游本来就散着几处去重(水位、驱动上的 `collabSourceMessageId` 戳、
 * state 里的 activation 记录);这里把它变成入队处的结构保证。
 *
 * 两处刻意的收窄,都是为了不吞掉真实激活:
 *  - **只在有 sourceMessageId 时去重**。任务事件按构造没有房间消息(卡被指派、
 *    卡要验收),两张不同的卡落在同一个 agent 头上是两件事,不是重复。
 *  - **只看还在队里的记录**(队首那条正在跑,`processQueue` 跑完才 shift),
 *    不看 `state.activations` 的历史:同一条消息隔一会儿再把人拉起来是合法的
 *    (用户重新提起、链解冻后回落),历史去重会把它永久拒之门外。
 */
function isAlreadyQueued(
  runtime: RoomRuntime,
  activation: CollabActivationInput,
  sourceMessageId: string | undefined,
): boolean {
  if (!sourceMessageId) return false
  return runtime.queue.some(record =>
    record.agentId === activation.agentId
    && record.reason === activation.reason
    && record.sourceMessageId === sourceMessageId
    && record.driveLabel === activation.driveLabel)
}

export function enqueue(
  roomSessionId: string,
  runtime: RoomRuntime,
  activations: CollabActivationInput[],
  sourceMessageId: string | undefined,
): void {
  let queued = 0
  for (const activation of activations) {
    if (isAlreadyQueued(runtime, activation, sourceMessageId)) continue
    queued += 1
    const record: CollabActivationRecord = {
      id: randomUUID(),
      agentId: activation.agentId,
      reason: activation.reason,
      stage: 'queued',
      sourceMessageId,
      ...(activation.driveLabel ? { driveLabel: activation.driveLabel } : {}),
    }
    runtime.queue.push(record)
    runtime.state.activations.push(record)
    // W19: queueing emits NOTHING. "About to speak" was the simulation — the
    // real indicator is lit by the `say` arguments actually streaming, and a
    // member that queues, thinks and stays silent must never have shown a
    // typing line at all.
  }
  if (queued > 0) persistRoomState(roomSessionId, runtime)
  // Still kick the pump even when everything was a duplicate: a queue that is
  // sitting on a chain-frozen or budget-blocked head may now be free to move.
  void processQueue(roomSessionId)
}

export async function processQueue(roomSessionId: string): Promise<void> {
  const runtime = roomRuntime(roomSessionId)
  if (runtime.running) return
  runtime.running = true
  try {
    while (runtime.queue.length > 0) {
      const record = runtime.queue[0]
      let result: DriveResult = 'done'
      try {
        result = await driveActivation(roomSessionId, runtime, record, CASCADE)
      } catch (error) {
        record.stage = 'failed'
        console.error('[collab] activation failed:', error)
      } finally {
        // 兜底 only (W19 §3). The observer inside the turn window already put
        // the light out; this catches an activation that never reached the
        // window at all (engine unbound, agent gone, lock queue) and any stale
        // `true` a previous shape of this room left behind.
        emitCollabTyping(roomSessionId, record.agentId, false)
      }
      if (result === 'requeue-wait') break // chain frozen — resumes on human input
      if (result === 'requeue-budget') {
        // P2-4: the notice says 「明天自动恢复」; this is what makes it true.
        // One kick per room (the key dedupes), a minute past the rollover so a
        // clock that is a hair early cannot re-read the same spent day.
        scheduleRoomTimer(
          msUntilNextBudgetDay() + 60_000,
          () => void processQueue(roomSessionId),
          `budget-day:${roomSessionId}`,
        )
        break
      }
      if (result === 'requeue-retry') {
        scheduleRoomTimer(
          60_000,
          () => void processQueue(roomSessionId),
          `engine-bind:${roomSessionId}`,
        )
        break
      }
      runtime.queue.shift()
      persistRoomState(roomSessionId, runtime)
    }
  } finally {
    runtime.running = false
  }
}

/**
 * 死房兜底(agent-im-dm.md P1 验收核心)。
 *
 * 私聊里"用户说了一句、然后什么都没发生"是最坏的一种失败:群里没人应答是合法
 * 状态(§2.1 沉默是合法的),而一对一没有第二个人可以指望——用户只会认为这间房
 * 坏了。所以每一条会让激活消失的路径都要在房里留一行**用户看得见**的系统行。
 *
 * 这一行管的是"唯一那位成员已经不能应答了":墓碑(退休)与查无此人(硬删/
 * 数据损坏)。群房刻意不加——群里少一个人还有别人,而且群房的沉默语义不能动。
 */
function postDmDeadRoomLine(session: ChatSession): void {
  if (!isUserDmRoom(session.room)) return
  const agentId = session.room?.memberAgentIds?.[0]
  const agent = agentId ? findAgent(agentId) : null
  if (agent && isActiveAgent(agent)) return
  postSystemLine(
    session.id,
    agent
      ? `${agent.name} 已注销,这间私聊不会再有回复`
      : '这位同事已经不在了,这间私聊不会再有回复',
  )
}

export async function handleRoomUserMessage(roomSessionId: string, message: ChatMessage): Promise<void> {
  const session = store.getSession(roomSessionId)
  if (!session || session.kind !== 'room') return
  if (isCollabDriveMessage(message)) return
  if (message.role === 'system') return

  const runtime = roomRuntime(roomSessionId)
  runtime.state.chainCount = 0
  runtime.chainNoticePosted = false

  // D6 免判:单成员 dm 房里用户的每句话等价于 @ 了唯一那位成员。判定省掉的只有
  // 意愿判定那次模型调用 —— 合成的 mention 之后走的是**同一条**入队/驱动路径,
  // 冻结门、预算闸、断路器、退休门(turn.ts)全部照常。
  const dmSoleMemberRoom = isUserDmRoom(session.room)

  const decision = decideCollabActivations({
    authorKind: 'user',
    text: message.content,
    // W14a: the ingress gate already resolved these (picker ids ∪ name scan).
    // Pre-W14a transcripts carry no field and take the name fallback inside.
    ...(Array.isArray(message.mentions) ? { mentions: message.mentions } : {}),
    members: roomMembers(session),
    chainCount: 0,
    maxChain: maxChainFor(session),
    frozen: session.room?.frozen,
    ...(dmSoleMemberRoom ? { dmSoleMember: true } : {}),
  })

  // P2-17: a freeze that ate an @ says so — once per freeze, latched exactly
  // like the chain notice. Writing 「@小李 看一下」 into a paused room and
  // getting nothing back at all reads as a broken room, not a paused one.
  if (decision.blockedByFrozen && !runtime.frozenNoticePosted) {
    runtime.frozenNoticePosted = true
    // 私聊里"@ 暂时无人应答"读着别扭(没有别人),而这一行的职责是让暂停可见。
    // 群房那句一字不动。
    postSystemLine(
      roomSessionId,
      dmSoleMemberRoom
        ? '这间私聊已暂停,TA 暂时不会回复——恢复后再说一声'
        : '房间已暂停,@ 暂时无人应答——恢复后再说一声',
    )
  }

  // Watermark does NOT advance for an activated message: it moves at harvest,
  // so a crash before the reply leaves this message recoverable (§6.3).
  persistRoomState(roomSessionId, runtime)
  if (decision.activations.length > 0) {
    enqueue(roomSessionId, runtime, decision.activations, message.id)
  } else if (runtime.queue.length > 0) {
    // The human input reset the chain — a chain-frozen queue resumes even
    // when this message itself activates nobody (评审修订).
    void processQueue(roomSessionId)
  }

  // D6:私聊到此为止,不买意愿判定 —— 房里只有唯一那位成员,而它要么已经在上面
  // 入队了(免判),要么根本不能应答。继续往下走的话候选面为空、判定本就一次也
  // 不会发生,提前收尾只是把这件事说明白,顺手把死房那条兜底贴上。
  if (dmSoleMemberRoom) {
    if (decision.activations.length === 0 && !decision.blockedByFrozen) {
      // 唯一成员退休/查无此人:免判合成不出 mention,激活为空。明说,别静默。
      postDmDeadRoomLine(session)
      advanceWatermark(runtime, message)
      persistRoomState(roomSessionId, runtime)
    }
    return
  }

  // Everyone not @-ed decides for themselves (§2.1). This awaits one small
  // call per member; the mention path above already went to the queue.
  const elected = await electWillingSpeakers({
    roomSessionId,
    session,
    exclude: new Set(decision.activations.map(activation => activation.agentId)),
    targetMessageId: message.id,
  })
  if (elected.length > 0) {
    enqueue(roomSessionId, runtime, selfElected(elected), message.id)
    return
  }

  if (decision.activations.length === 0) {
    // Nobody took the floor. Silence is a legal state in an IM room — no
    // system line, no hint (v2: the PM-less dead-end hint is gone with the
    // default responder). Nothing to recover later: consume the message.
    advanceWatermark(runtime, message)
    persistRoomState(roomSessionId, runtime)
  }
}

/**
 * W23 slow path: which room messages the durable TRANSCRIPTS prove were driven.
 *
 * Read only when the state records already missed, and only at boot. Every
 * member's execution session is where its drives live since W18; the room
 * itself is scanned too so a pre-W18 room (drives inline) goes through the same
 * door — those drives carry no stamp, so it costs one pass and finds nothing,
 * which is the honest answer for a transcript that predates the field.
 */
function collectRoomConsumedSourceIds(session: ChatSession): Set<string> {
  const consumed = collectConsumedSourceIds(session.messages)
  for (const agentId of session.room?.memberAgentIds ?? []) {
    // collab-team-v2 §1.4 迁移:新旧两种执行会话 id 都要扫。旧会话里躺着升级前
    // 落盘的 drive 戳记,漏掉它们,升级后的第一次 boot 会把已经应答过的消息
    // 当成新消息,整屋子重放一遍。
    for (const execSessionId of collabAgentSessionIdsForScan(agentId, session.id)) {
      const execSession = store.getSession(execSessionId)
      if (!execSession) continue
      for (const id of collectConsumedSourceIds(execSession.messages)) consumed.add(id)
    }
  }
  return consumed
}

/** Boot reconciliation (§6.3): 'driving'/'streaming' records from a previous
 *  process are marked failed (their drive already persisted — re-driving would
 *  double-bill and duplicate the reply); 'queued' records are RE-QUEUED (their
 *  drive never persisted); the chain count is recomputed from the durable
 *  transcript; the newest unprocessed real user message is re-decided unless
 *  an activation record already references it.
 *
 *  W23 makes that last test two-level. The fast path is unchanged (state
 *  records). The slow path exists because the fast path is LOSSY by design:
 *  `persistRoomState` keeps only the last 50 activations, and the watermark
 *  never advances for an activation that ended in failure — so a busy room
 *  reaches a state where the record naming a message is gone while the
 *  watermark still sits behind it, and the replay drives it a second time. The
 *  transcript has no such cap, so it gets the last word. */
export function reconcileRoom(session: ChatSession): void {
  const runtime = roomRuntime(session.id)

  for (const record of runtime.state.activations) {
    if (record.stage === 'driving' || record.stage === 'streaming') {
      record.stage = 'failed'
    } else if (record.stage === 'queued') {
      runtime.queue.push(record)
    }
  }

  runtime.state.chainCount = computeCollabChainCount(session.messages)

  const watermark = runtime.state.lastProcessedMessageId
  let watermarkIndex = watermark
    ? session.messages.findIndex(message => message.id === watermark)
    : -1
  if (watermark && watermarkIndex < 0 && runtime.state.lastProcessedAt) {
    // Watermark message was deleted — fall back to its timestamp so we never
    // treat the whole transcript as unprocessed (评审修订).
    for (let index = session.messages.length - 1; index >= 0; index--) {
      if (session.messages[index].timestamp <= runtime.state.lastProcessedAt) {
        watermarkIndex = index
        break
      }
    }
  }
  const unprocessed = session.messages.slice(watermarkIndex + 1)
  const lastUser = [...unprocessed].reverse().find(message =>
    message.role === 'user' && !isCollabDriveMessage(message))
  // Level 1 (fast): our own records. Level 2 (slow, boot-only): a persisted
  // drive stamped with this message id — proof the activation reached the
  // model, whatever became of the record. A level-2 hit is a CONSUMED message,
  // so the watermark moves past it and the next boot pays nothing.
  const activatedByState = lastUser
    ? runtime.state.activations.some(record => record.sourceMessageId === lastUser.id)
    : false
  const activatedByTranscript = lastUser && !activatedByState
    ? collectRoomConsumedSourceIds(session).has(lastUser.id)
    : false
  if (lastUser && activatedByTranscript) advanceWatermark(runtime, lastUser)

  persistRoomState(session.id, runtime)

  if (lastUser && !activatedByState && !activatedByTranscript) {
    void handleRoomUserMessage(session.id, lastUser)
  } else if (runtime.queue.length > 0) {
    // Re-queued records: kick the queue; driveActivation itself waits for the
    // engine to get a bound sender before emitting anything.
    void processQueue(session.id)
  }
}