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
  isCollabForcedSerialRoom,
  isCollabPlanRoom,
  isUserDmRoom,
  routeCollabRoomWake,
  synthesizeCollabSerialPlan,
  type CollabPlan,
} from '@onething/runtime/collab'
import { isActiveAgent, type ChatMessage, type ChatSession } from '@shared/ipc.js'
import * as store from '../store.js'
import { findAgent } from '../agents/index.js'
import { reactToCollabMessage } from './reactions.js'
import { broadcastCollabCoordinator, noteCollabSchedule } from './inspector.js'
import {
  discardCollabPlan,
  installCollabPlan,
  stepCollabPlan,
} from './plan-runner.js'
import { emitCollabTyping } from './typing-observer.js'
import { judgeWillingness } from './willingness-runner.js'
import { isRoomOverBudget, msUntilNextBudgetDay } from './budget.js'
import {
  advanceWatermark,
  bumpFloorEpoch,
  chainGateAllows,
  currentFloorEpoch,
  isAgentSpeaking,
  isSupersededByFloor,
  maxChainFor,
  maxConcurrentTurnsFor,
  persistRoomState,
  postSystemLine,
  releaseFloorHold,
  roomMembers,
  roomRuntime,
  scheduleRoomTimer,
  selfElected,
  type CollabActivationInput,
  type CollabActivationRecord,
  type CollabElectionRequest,
  type RoomRuntime,
} from './room-runtime.js'
import { abortRoomTurn, driveActivation, type CollabTurnCascade, type DriveResult } from './turn.js'
import { steerIntoLiveTurn } from './steer.js'

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

  // 这一轮判定的取消把手 + 它属于哪一代 floor。用户喊停时,协调器 abort 这个
  // controller,而回来的结果(如果抢在 abort 之前落地)由下面的世代号比对拦掉:
  // 它读的是一段已经被喊停的对话,既不该入队,也不该往消息上落表情。
  const runtime = roomRuntime(options.roomSessionId)
  const epoch = currentFloorEpoch(runtime)
  const round = {
    controller: new AbortController(),
    agentIds: candidates.map(candidate => candidate.id),
  }
  runtime.judgements.add(round)
  // 判定是整条链上最贵也最不可见的一步 —— 「刚才为什么没人理我」的答案就在这两条
  // 事件里(问了几个人、几个人接了话、以及**为什么**没接)。状态条 §4/§8。
  noteCollabSchedule(options.roomSessionId, { kind: 'judging', count: candidates.length })

  try {
    const outcomes = await judgeWillingness(
      options.roomSessionId,
      candidates,
      recentRoomMessages(store.getSession(options.roomSessionId) ?? options.session),
      { signal: round.controller.signal },
    )
    const live = store.getSession(options.roomSessionId)
    if (live?.kind !== 'room' || live.room?.frozen) return []
    if (currentFloorEpoch(runtime) !== epoch) return []

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

    const willing = outcomes.filter(outcome => outcome.respond).map(outcome => outcome.agentId)
    // 「都没接话」有五种成因,而它们在这一行之前长得一模一样(状态条 §8)。
    // 分布带上去之后,面板才说得出「都没接话(2 超时 · 1 说不)」——
    // 满屋子 `no` 是这群人真没话说,满屋子 `timeout`/`unresolved` 是链断了。
    const breakdown: Record<string, number> = {}
    for (const outcome of outcomes) {
      breakdown[outcome.outcome] = (breakdown[outcome.outcome] ?? 0) + 1
    }
    noteCollabSchedule(options.roomSessionId, {
      kind: 'judged',
      count: willing.length,
      total: candidates.length,
      outcomes: breakdown,
    })
    return willing
  } catch (error) {
    console.error('[collab] willingness round failed:', error)
    return []
  } finally {
    runtime.judgements.delete(round)
    broadcastCollabCoordinator(options.roomSessionId)
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
  const matches = (record: CollabActivationRecord): boolean =>
    record.agentId === activation.agentId
    && record.reason === activation.reason
    && record.sourceMessageId === sourceMessageId
    && record.driveLabel === activation.driveLabel
  // 队里的,**以及已经起跑还没跑完的**。并行之后记录在起跑那一刻就出队,只看
  // 队列的话第二条会被判成"没排过队"——而它要说的正是第一条正在说的那句话。
  return runtime.queue.some(matches) || [...runtime.inFlight.values()].some(matches)
}

export interface EnqueueOptions {
  /**
   * 这批激活是不是"对话性"的(默认 true)。对话性激活盖 floor 世代号,于是用户
   * 喊停时它们一起作废;任务事件传 false —— 卡交付了要有人验收,那件事跟用户
   * 喊不喊停无关(停对话 ≠ 停干活,与 `abortCollabRoomTurnForStop` 同口径)。
   */
  conversational?: boolean
}

/**
 * 对话性激活的**按人折叠**(collab-agent-view.md P4)。
 *
 * 2026-08-01 事故的直接病根是「一个 @ = 一个必须兑现的回合」:Bram 在四分钟里
 * 排到 4 条激活(4 条不同的触发消息,所以旧的按 sourceMessageId 去重一条都拦不住),
 * 于是他连着说了四遍意思相同的话,每遍一次全上下文调用。
 *
 * 游标制下这条换算本来就不成立:回合读的是**未读区间**,不是某一条消息。三个人
 * 在三条消息里点了同一个人,他要读的还是那一段,一个回合就够。
 *
 * 所以已有一条**还在队里**的对话性记录时不再新增,只把它的锚点前移、理由取更强的
 * 那个(mention > self-elected)。刻意**只折叠队里的**:已经起跑的那条上下文早就
 * 构建完了,它看不见新消息 —— 折进去等于让这条消息永远没人应。
 */
const CONVERSATIONAL_REASONS = new Set(['mention', 'self-elected'])

function foldIntoQueued(
  runtime: RoomRuntime,
  activation: CollabActivationInput,
  sourceMessageId: string | undefined,
): boolean {
  if (!CONVERSATIONAL_REASONS.has(activation.reason)) return false
  const existing = runtime.queue.find(record =>
    record.agentId === activation.agentId
    && CONVERSATIONAL_REASONS.has(record.reason)
    && !record.driveLabel)
  if (!existing) return false
  // 锚点前移:回合的引用/水位挂在它上面,指最新那条比指最旧那条准。
  if (sourceMessageId) existing.sourceMessageId = sourceMessageId
  // 被点名比自选发言强 —— 合并之后这一轮的理由该是那个更强的。
  if (activation.reason === 'mention') existing.reason = 'mention'
  return true
}

export function enqueue(
  roomSessionId: string,
  runtime: RoomRuntime,
  activations: CollabActivationInput[],
  sourceMessageId: string | undefined,
  options: EnqueueOptions = {},
): void {
  const epoch = options.conversational === false ? undefined : currentFloorEpoch(runtime)
  let queued = 0
  for (const activation of activations) {
    if (isAlreadyQueued(runtime, activation, sourceMessageId)) continue
    if (foldIntoQueued(runtime, activation, sourceMessageId)) {
      queued += 1
      continue
    }
    queued += 1
    const record: CollabActivationRecord = {
      id: randomUUID(),
      agentId: activation.agentId,
      reason: activation.reason,
      stage: 'queued',
      sourceMessageId,
      ...(epoch !== undefined ? { epoch } : {}),
      ...(activation.driveLabel ? { driveLabel: activation.driveLabel } : {}),
      // 编排身份要跟着记录走 —— 批推进、旧编排识别、turn.ts 的级联门全读它。
      // (这一行漏过一次:构造函数逐字段抄,而抄漏了不报错,只是编排永远推不动。)
      ...(activation.planId ? { planId: activation.planId } : {}),
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

/**
 * 一条激活跑完之后的收尾:回队 or 出队,以及三种"回队"各自要armed 的重试。
 * 返回 true 表示这一轮之后**不要再发新牌**(全房性质的闸被撞上了)。
 */
function settleActivation(
  roomSessionId: string,
  runtime: RoomRuntime,
  record: CollabActivationRecord,
  result: DriveResult,
): boolean {
  if (result === 'requeue-wait') {
    // 链闸冻结,等人类开口。放回队首:它还欠一次发言。
    runtime.queue.unshift(record)
    return true
  }
  if (result === 'requeue-budget') {
    runtime.queue.unshift(record)
    // P2-4: the notice says 「明天自动恢复」; this is what makes it true.
    // One kick per room (the key dedupes), a minute past the rollover so a
    // clock that is a hair early cannot re-read the same spent day.
    scheduleRoomTimer(
      msUntilNextBudgetDay() + 60_000,
      () => void processQueue(roomSessionId),
      `budget-day:${roomSessionId}`,
    )
    return true
  }
  if (result === 'requeue-retry') {
    runtime.queue.unshift(record)
    scheduleRoomTimer(
      60_000,
      () => void processQueue(roomSessionId),
      `engine-bind:${roomSessionId}`,
    )
    return true
  }
  persistRoomState(roomSessionId, runtime)
  return false
}

/**
 * 房间的调度泵 —— **并行**(2026-08-01,用户决定)。
 *
 * 此前这里是一个严格串行的 while:`await driveActivation` 跑完一整轮(模型调用
 * + 工具 + say + 收尾,20–40 秒)才轮到下一条。代价是真机上看得见的:队里排了
 * 三个人时,「@ 谁」和「谁在说」在屏幕上错位一到两轮 —— 用户看到的是"我 @ 了
 * Atlas,结果 Iris 在说话",而 Iris 应的是 100 秒前那条 @Iris。
 *
 * 现在泵只负责**发牌**:能起就起,不等它结束;循环停在 `Promise.race` 上,任何
 * 一条跑完就回来看看能不能再起一条。三条纪律:
 *
 *  - **同一个人不并行说两句**(`isAgentSpeaking`)。它下面还有 agent 锁兜底,
 *    但让一条注定要在锁上干等的激活占掉一个并发位是纯浪费 —— 跳过它,先发给
 *    别人,它留在队里等自己那轮结束。
 *  - **全房性质的闸撞上就停发**(链冻结/预算/引擎没绑)。已经在跑的照常跑完,
 *    但这一轮不再发新牌:那三种状态都是"整间房都不该说话",而不是"这一条不行"。
 *  - **上限 `COLLAB_MAX_CONCURRENT_TURNS`**,理由见那个常量。
 *
 * 换来的代价是明说的:同时起跑的两条回合读到的是同一份房间快照,谁都看不见对方
 * 那句话,所以"两个人说出意思几乎一样的话"会比串行时更容易发生。真正的解法是
 * 抢麦判定(qm-collab-learnings P0-2:一次调用决定这轮谁说、说几个),不是把
 * 并发再关回去。
 */
export async function processQueue(roomSessionId: string): Promise<void> {
  const runtime = roomRuntime(roomSessionId)
  if (runtime.pumping) return
  runtime.pumping = true
  /** 这一轮泵里已经在跑的回合,key 是激活记录 id。记录本身挂在 runtime 上
   *  (入队去重要看得见它们),这里只留 promise。 */
  const tasks = new Map<string, Promise<void>>()
  /** 全房闸被撞上 —— 不再发新牌,但在跑的跑完。 */
  let parked = false
  /**
   * 这一批派出去的记录 id,以及它们里面有没有**干净跑完**的。
   *
   * 两处都只认**编排自己那一批**(审查 #17/#5):此前用的是"这一轮泵里发过牌没有",
   * 而那个标志由任何激活写 —— 一条与编排无关的任务事件跑完,就能把编排推进一批,
   * 甚至在编排那一批全军覆没时替它顶上"这批跑过了"。
   */
  const waveRecords = new Set<string>()
  const waveCompleted = new Set<string>()

  const start = (record: CollabActivationRecord): void => {
    runtime.inFlight.set(record.id, record)
    // 发牌与收牌都动状态条(队列少一条、在跑多一条)。这两处不记日志 ——
    // 「谁开始说了」的可读版本是回合收尾那两条(说了 N 句 / 没说话)。
    broadcastCollabCoordinator(roomSessionId)
    const task = (async () => {
      let result: DriveResult = 'done'
      try {
        result = await driveActivation(roomSessionId, runtime, record, CASCADE)
        // `turnOutcomeClean` 由回合自己写(turn.ts):它区分得开"跑完了(说了话或
        // 选择沉默)"与"超时/中止/模型失败"—— 而 `DriveResult` 对后者也返回 'done',
        // 拿它当判据的话一次网络抖动会被记成"这一批没人开口"(审查 #11)。
        if (result === 'done' && record.turnClean) waveCompleted.add(record.id)
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
      if (settleActivation(roomSessionId, runtime, record, result)) parked = true
    })().finally(() => {
      runtime.inFlight.delete(record.id)
      // 链闸那一格的释放点(A1)。与 inFlight 同生共死 —— 占用视图读的就是这
      // 两张表,少放一次就等于把一格永久锁死。
      releaseFloorHold(runtime, record.id)
      tasks.delete(record.id)
      // 活动窗口(C4 §1):这一发就是占用视图**清空**的那一发 —— 回合窗关掉时
      // 这条记录还在 `inFlight` 里,所以停止按钮要等到这里才该熄。按秒节流会让
      // 它在一场已经结束的对话上多亮一秒。
      broadcastCollabCoordinator(roomSessionId, { activity: true })
    })
    tasks.set(record.id, task)
  }

  try {
    for (;;) {
      // 上限现取:房间中途调小了,下一次发牌就该按新的来(与其它闸同一纪律)。
      const concurrency = maxConcurrentTurnsFor(store.getSession(roomSessionId))
      // 发牌:从队首往后扫,跳过"这个人已经在说"的,直到发满或没得发。
      while (!parked && tasks.size < concurrency) {
        const index = runtime.queue.findIndex(candidate =>
          !isAgentSpeaking(runtime, candidate.agentId))
        if (index < 0) break
        const [record] = runtime.queue.splice(index, 1)
        // 喊停之前排的队,在这里作废 —— 在它花掉一次全上下文模型调用之前。
        if (isSupersededByFloor(runtime, record)) {
          record.stage = 'superseded'
          persistRoomState(roomSessionId, runtime)
          continue
        }
        if (record.planId && record.planId === runtime.state.plan?.id) {
          waveRecords.add(record.id)
        }
        start(record)
      }
      if (tasks.size === 0) {
        // 房间安静了 —— **这才是一批跑完的时刻**,也是编排唯一的推进口。
        //
        // 接力时代推进写在回合收尾里(一棒 = 一个回合),而一个 wave 可以有 N 个
        // 回合:"这一批完了没有"只有这里知道。留在回合那边的话,同一批的兄弟
        // 回合会互相误判成"另一根棒子"。
        // 这一批一个编排记录都没发出去 = 刚才跑的与编排无关,不该推进它。
        if (parked || waveRecords.size === 0) break
        const step = stepCollabPlan({
          roomSessionId,
          runtime,
          waveCompleted: waveCompleted.size > 0,
        })
        if (step.activations.length === 0) {
          // 续排(2026-08-02 用户改定):编排**干净走完**(exhausted)且这趟有人
          // 开过口,再问一次协调器"要不要继续"。其余停法(静默圈/圈数闸/链闸/
          // 被顶掉/全军覆没)都不续 —— 每一种都有自己的收尾语义,续排只接"走完了"。
          if (step.stop !== 'exhausted' || !step.spokeEver) break
          const cont = await resolveCollabPlanContinuation(roomSessionId, runtime)
          waveRecords.clear()
          waveCompleted.clear()
          if (cont.activations.length > 0) {
            enqueue(roomSessionId, runtime, cont.activations, undefined)
          } else if (cont.emptyAnswer) {
            // 编排器说"没人该说"不是终审(2026-08-02 用户定):它定的是次序与
            // 批次,"是否响应"回落每位同事自己的意图判断。真机抓到的死锁正是
            // 它答「等待大家反馈」却一个人都不排 —— "等"不是它有的动作,反馈
            // 只能由排出来或自荐出来的发言产生。没人自荐才是真的收工。
            await electContinuationSpeakers(roomSessionId, runtime)
            if (runtime.queue.length === 0) break
          } else if (runtime.queue.length === 0) {
            // 要不到编排(超时/失败/被顶掉)= 停,旧行为。但不能直接走人:
            // await 期间可能有新消息把自己的编排入了队(它的 processQueue 踢在
            // pumping 上弹回来了),牌面得再看一眼。
            break
          }
          continue
        }
        waveRecords.clear()
        waveCompleted.clear()
        enqueue(roomSessionId, runtime, step.activations, undefined)
        continue
      }
      // 任意一条跑完就回来重新看牌面 —— 它可能刚好解锁了队里那个同名的人。
      await Promise.race([...tasks.values()])
    }
  } finally {
    runtime.pumping = false
  }
}

/**
 * 拿这一轮的编排:强制顺序本地合成,其余问协调器。
 *
 * **`planner.js` 是动态引入的**,与 `turn.ts` 引 `digest-runner` 同一条理由 ——
 * 它的静态图里挂着整个 provider 栈(settings 仓库 → stores/paths),静态引它就
 * 等于把那条依赖带给每一个 import 这个文件的协调器测试。而那批测试正是靠
 * partial-mock 隔离 provider 的:17 个文件把 `willingness-runner.js` 当作唯一
 * 的隔离缝,新开一条静态边会让它们在收集阶段就炸。
 *
 * 引不进来(测试环境、打包意外)= 拿不到编排 = 降级到 N 路判定,与今天同行为。
 */
async function resolveCollabPlan(
  roomSessionId: string,
  session: ChatSession,
  mentionedAgentIds: readonly string[],
  runtime: RoomRuntime,
  options: { continuation?: boolean } = {},
): Promise<CollabPlan | null> {
  // 用户把模式钉死成顺序 —— 不问协调器,按次序表合成。强制顺序因此不是另一套
  // 机制,而是"一份所有批次都只有一个人的编排"。(续排不走这条:它在入口就被
  // auto 门挡了,这里的合成只属于"应答一条用户消息"。)
  if (isCollabForcedSerialRoom(session.room)) {
    const synthesized = synthesizeCollabSerialPlan({
      speakOrder: session.room?.speakOrder,
      members: roomMembers(session),
      mentionedAgentIds,
    })
    return synthesized.waves.length > 0 ? synthesized : null
  }

  // 取消把手先挂上 —— 用户喊停时路由 abort 分支会掐它。结果层面 epoch 比对
  // 已经拦得住一份过期编排,这把手省下的是钱:一次没人要的调用不必跑满死线。
  const controller = new AbortController()
  runtime.planAbort = controller
  try {
    const { requestCollabPlan } = await import('./planner.js')
    const outcome = await requestCollabPlan({
      roomSessionId,
      mentionedAgentIds,
      chainCount: runtime.state.chainCount,
      ...(options.continuation ? { continuation: true } : {}),
      signal: controller.signal,
    })
    if (outcome.plan) return outcome.plan
    noteCollabSchedule(roomSessionId, {
      kind: 'plan-failed',
      detail: outcome.failure ?? 'error',
    })
    return null
  } catch (error) {
    console.error('[collab] plan resolve failed:', error)
    noteCollabSchedule(roomSessionId, { kind: 'plan-failed', detail: 'error' })
    return null
  } finally {
    // 只摘自己那把:期间另一条消息可能已经挂上了它自己的 controller。
    if (runtime.planAbort === controller) delete runtime.planAbort
  }
}

/**
 * 续排:编排干净走完之后问协调器"这场对话要不要继续"(2026-08-02 用户改定,
 * 取代"走完就停,等人说话")。返回下一份编排的第一批;空 = 收工。
 *
 * 与用户消息那条编排路同一套纪律,差异都有账:
 *  - **ticket 在入口就取**(第一个 await 之前):真实用户消息永远压过续排 ——
 *    它在我们任何一次 await 期间到达都会再增 ticket,回来比对不过,这趟续排
 *    整个作废,由那条消息自己的编排接管。反过来(预算 await 之后才取)会出现
 *    续排偷走用户消息的应答权的交错。
 *  - 同样先过预算闸:续排是一次真金白银的调用,超预算的房不该在深夜自己烧钱。
 *  - **要不到编排不降级**到 N 路判定:降级是为"用户消息必须有人应"服务的,
 *    续排失败的正确形态就是旧行为 —— 停下。
 *  - **只限 auto 房**:强制顺序不问协调器;它的一趟以静默圈/圈数闸收尾,单人房
 *    守卫的 exhausted 若续排,会变成一个人对自己无限接龙。
 *
 * 失控入口的账:续排只在**有人开过口**的 exhausted 后发生,而每句发言都计入
 * `chainCount` —— 链长闸是所有续排轮次共同的总闸,到即停(stepCollabPlan 的
 * chain 分支,那里贴行说明)。静默循环则被 `spokeEver` 门挡在第一轮。
 */
async function resolveCollabPlanContinuation(
  roomSessionId: string,
  runtime: RoomRuntime,
): Promise<{
  activations: CollabActivationInput[]
  /**
   * 编排器**答了,且答的是空**("这轮无人发言")。调用方据此回落意愿判定 ——
   * 与"要不到"(超时/失败/被顶掉/闸)必须分开:后者停下就是旧行为,前者是
   * 一个要被每人自判复核的意见。
   */
  emptyAnswer?: boolean
}> {
  const none = { activations: [] as CollabActivationInput[] }
  const session = store.getSession(roomSessionId)
  if (session?.kind !== 'room' || !session.room) return none
  if (session.room.frozen) return none
  if (!isCollabPlanRoom(session.room) || isCollabForcedSerialRoom(session.room)) return none
  // 世代号与 ticket 都在第一次 await 之前捕获(四审 A-1 同一条纪律)。
  const epoch = currentFloorEpoch(runtime)
  const ticket = ++runtime.planTicket
  if (await isRoomOverBudget(roomSessionId)) {
    noteCollabSchedule(roomSessionId, { kind: 'blocked', detail: 'budget' })
    return none
  }
  const plan = await resolveCollabPlan(roomSessionId, session, [], runtime, { continuation: true })
  if (runtime.planTicket !== ticket || currentFloorEpoch(runtime) !== epoch) return none
  if (!plan) return none
  // 空 waves 走 installCollabPlan 的沉默分支:清掉旧编排 + 状态条记一笔
  // 「编排:这轮无人发言(理由)」—— 意见要留痕,即使随后被意愿判定复核。
  return {
    activations: installCollabPlan(roomSessionId, runtime, plan, epoch),
    ...(plan.waves.length === 0 ? { emptyAnswer: true } : {}),
  }
}

/**
 * 编排器答"没人该说"之后的**每人自判**(2026-08-02 用户定)。
 *
 * 走既有的意愿判定路(冷却过滤、预算闸、世代号比对、状态条 judging/judged 全在
 * `electWillingSpeakers` 里),刚说过话的人天然被冷却筛掉 —— 上一批的发言者不会
 * 立刻自荐,自荐的是"还没表过态、看了新内容想接"的那几位。自荐回合收尾后走
 * 正常级联,对话由此自然延续或自然停下。
 */
async function electContinuationSpeakers(
  roomSessionId: string,
  runtime: RoomRuntime,
): Promise<void> {
  const session = store.getSession(roomSessionId)
  if (session?.kind !== 'room' || !session.room) return
  // 与回合级联同一道闸(turn.ts):链已到自荐上限时,一次判定的钱都不花 ——
  // 判出来的自荐也会被驱动门冻住,白买 N 次调用。**预筛**,不预占。
  if (!chainGateAllows(runtime, session, 'self-elected')) return
  const targetMessageId = session.messages.at(-1)?.id
  const elected = await electWillingSpeakers({
    roomSessionId,
    session,
    exclude: new Set(),
    ...(targetMessageId ? { targetMessageId } : {}),
  })
  if (elected.length > 0) {
    enqueue(roomSessionId, runtime, selfElected(elected), targetMessageId)
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

/**
 * 预算闸放开后的重入口:水位之后最新的一条真实用户消息重新走一遍入口。
 *
 * 与 `reconcileRoom` 的 lastUser 判据同源。刻意**现查**而不是让定时器捕获被挡的
 * 那条消息:期间用户可能又说了话(它们同样被预算闸挡下),该应答的永远是最新的
 * 那条 —— 而它的编排窗口读的是未读并集,前面被挡的几条都在里面。
 */
function reprocessLatestPendingUserMessage(roomSessionId: string): void {
  const session = store.getSession(roomSessionId)
  if (!session || session.kind !== 'room') return
  const runtime = roomRuntime(roomSessionId)
  const watermark = runtime.state.lastProcessedMessageId
  const watermarkIndex = watermark
    ? session.messages.findIndex(message => message.id === watermark)
    : -1
  const lastUser = [...session.messages.slice(watermarkIndex + 1)].reverse().find(message =>
    message.role === 'user' && !isCollabDriveMessage(message))
  if (lastUser) void handleRoomUserMessage(roomSessionId, lastUser)
}

export async function handleRoomUserMessage(roomSessionId: string, message: ChatMessage): Promise<void> {
  const session = store.getSession(roomSessionId)
  if (!session || session.kind !== 'room') return
  if (isCollabDriveMessage(message)) return
  if (message.role === 'system') return

  const runtime = roomRuntime(roomSessionId)

  // 入口世代号(四审 A-1):这个函数里每一次 await(steer 并入、预算读取、编排
  // 调用)期间都可能发生喊停或清空。比对入口这一刻的世代号,是唯一能覆盖全部
  // 后续写入的门 —— 捕获必须在第一次 await 之前。
  const entryEpoch = currentFloorEpoch(runtime)

  // 中途来消息的路由(qm-collab-learnings §1.3)。这一步只决定"拿正在跑的那个
  // 回合怎么办";谁该应答这条消息,仍然是下面那条既有的决策路径的活。
  const route = routeCollabRoomWake({
    text: message.content ?? '',
    mentionedAgentIds: (message.mentions ?? []).map(mention => mention.agentId),
    hasPayload: (message.attachments?.length ?? 0) > 0,
    liveTurns: [...runtime.activeTurns.values()].map(turn => ({
      agentId: turn.agentId,
      ...(turn.reason ? { reason: turn.reason } : {}),
    })),
  })

  // drop 在链闸重置**之前**返回,一个副作用都不留:一条空白消息不是人类输入,
  // 它没有带来任何新信息,不该把一间已经说到链长上限的房间放开。
  if (route === 'drop') return

  // 「刚才」的起点:每一段调度都从一条人类消息开始,没有它,后面那串事件读起来
  // 就没有由头(状态条 §4)。
  noteCollabSchedule(roomSessionId, { kind: 'received' })

  // 链闸解冻的**人类那一路**:一条真实的人类消息(§6.2 的 resets 那一条)。
  //
  // 不是"唯一真源"(那句话在 2026-08-03 之前就已经不准确了):跨房 dm 注入
  // (dm-tool.ts)与 wake poke(wake-followup.ts)同样清零 —— 它们的由头来自
  // 另一间房的一个回合,对这间房而言同样是新的外部输入。那两处除了就地清零,
  // 还在落库的那条消息上打 `collabChainReset` 标记,于是 boot 重算认得出同一个
  // 边界(chain.ts);这一条不用打标,因为人类消息本身就是重算认的边界。
  //
  // 曾经还有第三处 —— coordinator 里一个 `steering:consumed` 订阅。它从 W18
  // 起就是死的(那个事件发在执行会话上,而订阅带着 `isRoom` 门),而现在它连
  // 冗余的价值都没有:房间的用户消息全部经由 ingress 走到这里,steer 注入的
  // 那条也不例外 —— 它就是这个函数正在处理的这一条。
  runtime.state.chainCount = 0
  runtime.chainNoticePosted = false

  if (route === 'abort') {
    // 用户喊停。四件事一起做,缺一件都留下一个还会开口(或还在扣钱)的角落:
    // 在跑的回合中止、在飞的判定作废、在飞的编排调用掐断(结果本来会被 epoch
    // 作废,但不掐它会跑满死线照常计费)、队里的对话性激活换代作废(任务事件
    // 豁免 —— 停对话不是停干活)。
    bumpFloorEpoch(runtime)
    for (const round of runtime.judgements) round.controller.abort()
    runtime.judgements.clear()
    runtime.planAbort?.abort()
    abortRoomTurn(roomSessionId)
    noteCollabSchedule(roomSessionId, { kind: 'stopped' })
    advanceWatermark(runtime, message)
    persistRoomState(roomSessionId, runtime)
    // 队列自己会在下一次泵动时把过期记录丢掉;这里踢一脚,免得它们停在队首等一个
    // 永远不会到来的触发。
    if (runtime.queue.length > 0) void processQueue(roomSessionId)
    return
  }

  if (route === 'steer') {
    // 并进当前回合。成功 = 这条消息已经交给正在说话的那位了,不再另买判定、
    // 也不另起一轮;失败(迟到/引擎没绑)= 退回 engage,继续往下走。
    const steered = await steerIntoLiveTurn(runtime, message)
    if (steered) {
      advanceWatermark(runtime, message)
      persistRoomState(roomSessionId, runtime)
      // 链闸刚被这条人类输入解冻,而一个 'requeue-wait' 的队首正停在那里等的就是
      // 这件事。不踢这一脚,它会一直停到下一条**不走 steer** 的用户消息为止。
      if (runtime.queue.length > 0) void processQueue(roomSessionId)
      return
    }
    // steer 失败回退(四审 A-1):失败的一种成因恰是清空/喊停把正在跑的回合杀了
    // —— 那不是"退回 engage 重新应答"的理由,这条消息属于被清掉的那个世界。
    // 不加这道门,清空自己触发的回退会让成员在空房里应答一条已删除的消息。
    if (currentFloorEpoch(runtime) !== entryEpoch) return
  }

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

  // 编排模式(collab-coordinator-plan.md §5):不买 N 路意愿判定,问协调器要一份
  // waves,装上,发第一批。推进在调度泵那侧 —— 一批全部落地才发下一批。
  //
  // **缺省不走这条**:`responseMode` 未配 = 并行,显式 `auto` / `serial` 才进来
  // (collab-coordinator-plan.md §5bis 一 —— 机制与默认翻转不放同一个改动)。
  // 降级也回到并行那条老路:编排读不懂/超时/发不出去时,行为与今天一模一样。
  if (isCollabPlanRoom(session.room)) {
    if (session.room?.frozen) {
      // 编排模式下每条用户消息都必然要一份编排,所以冻结必须开口。
      // `blockedByFrozen` 只在真的写了 @ 时为真,照它走的话,一条没写 @ 的消息
      // 进到一间暂停的房里会得到纯粹的沉默 —— 与 D6 私聊要贴那一行同一条理由。
      if (!runtime.frozenNoticePosted) {
        runtime.frozenNoticePosted = true
        postSystemLine(roomSessionId, '房间已暂停,现在没有人会接话——恢复后再说一声')
      }
      noteCollabSchedule(roomSessionId, { kind: 'blocked', detail: 'frozen' })
      advanceWatermark(runtime, message)
      persistRoomState(roomSessionId, runtime)
      return
    }

    // 预算闸要在**花钱之前**过(审查 #18)。判定那一路早就有这一条
    // (「Gates come first — a frozen or over-budget room spends nothing」),
    // 而编排是一次真金白银的调用,漏掉它等于超预算的房间每条消息还在扣钱。
    //
    // 水位**不动**(2026-08-02 三审):并行那条路超预算是 requeue + 次日踢一脚,
    // 预算回滚后照样应答;这里若把消息消费掉,预算通知里那句「明天自动恢复」
    // 对这条消息就是假的 —— 恢复了,它也永远没人应。同一恢复语义:留着,
    // 次日重新走一遍入口。
    if (await isRoomOverBudget(roomSessionId)) {
      persistRoomState(roomSessionId, runtime)
      noteCollabSchedule(roomSessionId, { kind: 'blocked', detail: 'budget' })
      // key 与 settleActivation 那把刻意分开:两边都可能armed(队里有 park 的
      // 记录 + 一条被挡的编排消息),而 key 去重是"先到者赢" —— 共 key 会让
      // 后到的那件事在次日被静默漏掉。
      scheduleRoomTimer(
        msUntilNextBudgetDay() + 60_000,
        () => reprocessLatestPendingUserMessage(roomSessionId),
        `budget-day:plan:${roomSessionId}`,
      )
      return
    }

    // **函数入口**的世代号(四审 A-1 收紧) —— 此前在这里现取,而上面那次预算
    // await 期间的清空/喊停会让这里读到**新**世代号,装载比对必然通过,整份编排
    // 照常开跑在一间刚清空的房里。入口捕获把预算窗口也罩进来。
    const epoch = entryEpoch
    // 同一间房只允许一次编排在飞:`handleRoomUserMessage` 是并发的,两条消息
    // 各自 await 一份编排,回来时后者覆盖前者的 `state.plan`,而前者已经发出去
    // 的那一批没人认领 —— 第一批实际跑的是两份编排的并集(审查 #2)。
    const ticket = ++runtime.planTicket

    const mentioned = decision.activations.map(activation => activation.agentId)
    const plan = await resolveCollabPlan(roomSessionId, session, mentioned, runtime)

    // 回来之后才作废旧编排 —— 作废与装上必须是**同一拍**,中间不能再有 await。
    if (runtime.planTicket !== ticket || currentFloorEpoch(runtime) !== epoch) {
      // 这一趟已经被更晚的那条消息(或一次喊停)顶掉了。什么都不装,什么都不作废:
      // 顶掉它的那一方自己会安排。
      return
    }
    discardCollabPlan(roomSessionId, runtime)
    for (const record of runtime.queue) {
      if (record.reason === 'relay') record.stage = 'superseded'
    }
    runtime.queue = runtime.queue.filter(entry => entry.reason !== 'relay')

    if (plan) {
      const first = installCollabPlan(roomSessionId, runtime, plan, epoch)
      if (first.length > 0) {
        enqueue(roomSessionId, runtime, first, message.id)
        return
      }
      // 「这轮谁都不该说」是编排器的**意见**,不再是终审(2026-08-02 用户定):
      // 它定的是次序与批次,"是否响应"归每位同事自己的意图判断。不消费消息、
      // 往下落到意愿判定老路 —— 无人自荐时那里自会收尾(消费 + 沉默合法),
      // 状态条上「编排:这轮无人发言」与随后的「判定 N 人」两笔都留痕。
    }
    // 编排要不到 → 降级到 N 路意愿判定(下面那条老路),行为与今天一模一样。
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

  // 崩溃时正在跑的那一批记录会被标成 failed 而不重排(它们的 drive 已经落盘,
  // 重驱是双花),于是那份编排永远等不到自己的批跑完 —— 它会静静躺在 state 里,
  // 让 `turn.ts` 的级联门以为"有编排在飞",把这间房的 @ 级联永久关死(审查 #19)。
  //
  // 恢复不了就**丢掉**:一份跑不动的编排比没有编排糟。用户的下一条消息会重新
  // 要一份,而那才是它该有的样子。
  if (runtime.state.plan) {
    const stillQueued = runtime.state.activations.some(
      record => record.stage === 'queued' && record.planId === runtime.state.plan?.id,
    )
    if (!stillQueued) delete runtime.state.plan
  }

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