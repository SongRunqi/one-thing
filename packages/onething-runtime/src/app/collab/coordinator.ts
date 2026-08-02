/**
 * RoomCoordinator — docs/design/multi-agent-collab.md D4/§6.
 *
 * The ONLY driver of room-session streams. User messages land via the ingress
 * gate (persist-only, message:user-created on the bus); this module owns the
 * wiring and the room's configuration doors, while the work itself lives in the
 * three modules it composes (R2):
 *
 *   room-runtime.ts  runtime state, the durable state file, room primitives
 *   budget.ts        the 费用闸 over the room's session set
 *   turn.ts          one turn end to end: drive, wait, abort, harvest
 *   queue.ts         who speaks and in what order: willingness, queue, reconcile
 *
 * What is left here: process lifecycle (init / shutdown / boot reconciliation),
 * the event subscriptions, and the four settings doors the UI and the CLI call
 * (freeze, budgets, team config, board actions).
 */
import {
  COLLAB_SYSTEM_SOURCE_MEMBERSHIP,
  buildCollabMembershipLines,
  collabAgentSessionId,
  isAgentPairDmRoom,
  isCollabDriveMessage,
  isUserDmRoom,
  type CollabBoard,
  type CollabBoardAction,
} from '@onething/runtime/collab'
import { randomUUID } from 'node:crypto'
import {
  isActiveAgent,
  type ChatMessage,
  type CollabRoomBudgetsPatch,
  type CollabRoomUpdatePatch,
  type PermissionMode,
} from '@shared/ipc.js'
import * as store from '../store.js'
import { getEventBus } from '../events/index.js'
import { findAgent } from '../agents/index.js'
import {
  applyBoardAction,
  clearCollabBoard,
  forgetCollabBoardRoom,
  shutdownCollabBoardBroadcasts,
} from './board-store.js'
import { emitCollabTyping } from './typing-observer.js'
import { isRoomOverBudget } from './budget.js'
import {
  broadcastCollabCoordinator,
  buildCollabCoordinatorState,
  forgetCollabInspector,
  shutdownCollabInspector,
} from './inspector.js'
import { configureCollabDriveGuard } from './drive-guard.js'
import { resetCollabSeenCursor } from './agent-session.js'
import { forgetCollabDigests } from './digest-store.js'
import { clearCollabWakeFollowups } from './wake-followup.js'
import {
  bumpFloorEpoch,
  clearRoomRuntimes,
  clearRoomTimers,
  currentFloorEpoch,
  deleteRoomRuntime,
  isRoom,
  removeCollabRoomDirectory,
  isAgentSpeaking,
  peekRoomRuntime,
  persistRoomState,
  postSystemLine,
  postTaskSystemLine,
  roomChannel,
  roomRuntime,
  type RoomRuntime,
} from './room-runtime.js'
import {
  abortRoomTurn,
  clearAgentSessionLocks,
  setCollabTurnsShuttingDown,
  waitForEngineBound,
  waitForRoomTurn,
} from './turn.js'
import {
  enqueue,
  handleRoomUserMessage,
  processQueue,
  reconcileRoom,
} from './queue.js'
import {
  forgetCollabRoomWork,
  freezeRoomWork,
  initializeCollabWorkers,
  reconcileRoomBoard,
  resumeRoomWork,
  shutdownCollabWorkers,
} from './worker.js'

/**
 * Re-exported so the app's public collab surface (and the say executor, the
 * settings panel, the room IPC handlers) keeps one import site even though the
 * implementations moved out (R2).
 */
export {
  getCollabRoomSpend,
  isRoomOverBudget,
  readCollabRoomSpentTodayUSD,
} from './budget.js'
export { abortRoomTurn } from './turn.js'

/**
 * 协调器状态条的冷启动读取(docs/design/collab-coordinator-inspector.md §5)。
 *
 * 实时更新走 `collab:coordinator-changed` 会话事件;这一扇门只服务"面板刚打开"。
 */
export function getCollabCoordinatorState(roomSessionId: string) {
  return buildCollabCoordinatorState(roomSessionId)
}

let initialized = false
let disposers: Array<() => void> = []

export function initializeCollabCoordinator(): void {
  if (initialized) return
  initialized = true
  setCollabTurnsShuttingDown(false)
  // P2-8: one token per process, minted before anything can drive. It is what
  // turns 'collab' from a claim into a credential (see drive-guard.ts).
  configureCollabDriveGuard(randomUUID())

  initializeCollabWorkers({
    postSystemLine,
    postTaskSystemLine,
    enqueueRoomActivation(roomSessionId, agentId, reason, driveLabel) {
      const runtime = roomRuntime(roomSessionId)
      // conversational: false —— 工作流的汇报不盖 floor 世代号。用户喊停停的是
      // 对话,不是在飞的卡:一张交付了的卡仍然要有人验收。
      enqueue(roomSessionId, runtime, [{ agentId, reason, driveLabel }], undefined, {
        conversational: false,
      })
    },
    waitForEngineBound,
    waitForTurn: waitForRoomTurn,
    roomChannel,
    isRoomOverBudget,
  })

  const bus = getEventBus()
  disposers.push(
    bus.onAnySession('message:user-created', envelope => {
      const sessionId = envelope.sessionId
      const message = (envelope.event as { message?: ChatMessage }).message
      if (!message || message.role !== 'user') return
      if (isCollabDriveMessage(message)) return
      if (!isRoom(sessionId)) return
      void handleRoomUserMessage(sessionId, message)
    }, 'collab-coordinator'),
    // 这里曾经还有第二个订阅:`steering:consumed` → 链闸清零。它从 W18 起就是
    // 死的 —— 回合搬进执行会话之后,那个事件发在 kind='agent' 的会话上,而订阅
    // 第一行就是 `if (!isRoom(sessionId)) return`。房间从来没有收到过它。
    //
    // 没有把它接对,而是删掉:接对之后它做的每一件事,`handleRoomUserMessage`
    // 在收到那条用户消息的第一时间就已经做完了(链闸清零 + 踢队列),包括 steer
    // 注入的那一条 —— 注入的正是它正在处理的这条消息。留着就是两处做同一件事,
    // 而这类重复的下场在这个仓库里已经有过案底(R3 的六份 source 判定)。
  )

  // A deleted room takes its runtime, its board machinery and its directory
  // with it (P2-10). The store notifies; it does not know what collab is.
  disposers.push(store.onSessionsDeleted(sessionIds => {
    for (const sessionId of sessionIds) disposeCollabRoom(sessionId)
  }))

  // Boot reconciliation over every known room (transcript watermark + board).
  try {
    for (const meta of store.getSessionsList() as Array<{ id: string; kind?: string }>) {
      if (meta.kind !== 'room') continue
      const session = store.getSession(meta.id)
      if (session?.kind === 'room') {
        reconcileRoom(session)
        reconcileRoomBoard(session.id)
      }
    }
  } catch (error) {
    console.error('[collab] boot reconciliation failed:', error)
  }
}

export function shutdownCollabCoordinator(): void {
  // Latch first: an engine-bind wait can be five minutes into its poll loop,
  // and it must not outlive the subscriptions it was going to drive into.
  setCollabTurnsShuttingDown(true)
  // Nothing may drive a room once there is no coordinator to have sent it.
  configureCollabDriveGuard(null)
  shutdownCollabWorkers()
  shutdownCollabBoardBroadcasts()
  shutdownCollabInspector()
  for (const dispose of disposers) {
    try { dispose() } catch { /* noop */ }
  }
  disposers = []
  clearRoomTimers()
  // 还在等对方读完的跨房唤醒(collab-send-channel-and-wake.md §3.2):订阅与
  // 120s 定时器都得跟着收摊,否则它会在协调器已经不存在之后往房间里发一条 poke。
  clearCollabWakeFollowups()
  clearRoomRuntimes()
  clearAgentSessionLocks()
  initialized = false
}

/**
 * Everything a room owned outside its session file (P2-10).
 *
 * Runs AFTER the delete, so the session is already gone and its kind cannot be
 * checked — which is fine and deliberate: every step is a no-op for an id that
 * never had collab state, and guessing from a name would be worse than doing
 * nothing four times. The three Maps that leaked (`rooms`, the board write
 * queue, the worker's pending list) and the `<store>/collab/<roomId>/`
 * directory all go here.
 */
function disposeCollabRoom(roomSessionId: string): void {
  abortRoomTurn(roomSessionId)
  forgetCollabRoomWork(roomSessionId)
  forgetCollabBoardRoom(roomSessionId)
  forgetCollabInspector(roomSessionId)
  deleteRoomRuntime(roomSessionId)
  removeCollabRoomDirectory(roomSessionId)
}

export interface CollabRoomClearHistoryResult {
  success: boolean
  error?: string
  /** 清掉的房间消息条数(= 留档文件里的那一份)。 */
  clearedMessageCount?: number
  /** 一并清空的成员执行会话数。 */
  clearedSessionCount?: number
  /** 连带清空的成员间私聊房数(仅当 includeMemberDms)。 */
  clearedDmRoomCount?: number
  /** 一并清掉的看板卡片数。 */
  clearedTaskCount?: number
}

/**
 * 清场:与「喊停」同款,只是这一趟要清得更干净(队列整个丢掉,而不是让它自然
 * 过期)。**幂等**——清空的等待循环每一圈都跑一遍它,好把等待期间新冒出来的
 * 回合和激活一并按住。
 */
function stopRoomFloor(roomSessionId: string, runtime: RoomRuntime): void {
  for (const round of runtime.judgements) round.controller.abort()
  runtime.judgements.clear()
  runtime.planAbort?.abort()
  abortRoomTurn(roomSessionId)
  for (const record of runtime.queue) record.stage = 'superseded'
  runtime.queue.length = 0
  // 看板执行也是"在跑的东西"(2026-08-02):卡片这一趟要被清掉,留一条还在跑的
  // 工作台会话等于让一个没有卡的执行接着往下做,收尾时还会往刚清空的房里贴行。
  forgetCollabRoomWork(roomSessionId)
  // **不清 inFlight**(四审 A-2):它是静默等待的眼睛 —— 这里清掉它,下面那个
  // "inFlight 空了没"的判据就被自己清成永真,所有已出队、还卡在预算读取/引擎
  // 绑定/agent 锁上的激活对清空隐形。这些记录由各自泵任务的 finally 摘除;
  // 世代号已换,它们走到 emitDrive 前的最后一道门会自行退场(turn.ts)。
  delete runtime.state.plan
}

/**
 * 清空这间房的对话记忆(docs/design/collab-room-clear-and-mention-all.md B)。
 *
 * 「对话记忆」散在七处,漏一处就留一个幽灵:房间转录、每位成员执行会话的转录
 * 与已读游标、`state.json`、`digests.json`、`board.json` + `activity.jsonl`、
 * 进程内运行时、渲染层。**次序是强制的**:先停(否则在飞回合的收尾会往刚清空
 * 的会话里写 harvest)、后删、再播。
 *
 * 看板一并清(2026-08-02 真机:清完消息,卡片还挂在那儿)。留着它不是"保守",
 * 是自相矛盾 —— `getCollabSelfTaskFacts` 会把 doing/blocked 卡片当既成事实注入
 * 提示词,于是清空后的第一个回合里,同事张口就在谈一段谁都读不到的工作。
 *
 * 刻意不动:房间配置、成员本体、`budgetSpentUSD` / `budgetNoticeDay`
 * (钱花了就是花了,预算闸照常),以及成员之间的私聊房。
 */
export async function clearCollabRoomHistory(
  roomSessionId: string,
  options: { includeMemberDms?: boolean } = {},
): Promise<CollabRoomClearHistoryResult> {
  const session = store.getSession(roomSessionId)
  if (!session || session.kind !== 'room' || !session.room) {
    return { success: false, error: 'Not a room session' }
  }

  // ① 先停。世代号只 +1 一次(它是"用户喊停了这一段"的记号,不是计数器);
  //    清场本身要反复跑,因为等待期间可能还有回合从 agent 锁上醒过来。
  const runtime = roomRuntime(roomSessionId)
  bumpFloorEpoch(runtime)
  for (let attempt = 0; attempt < QUIESCE_ATTEMPTS; attempt++) {
    stopRoomFloor(roomSessionId, runtime)
    if (runtime.activeTurns.size === 0 && runtime.inFlight.size === 0) break
    await new Promise(resolve => setTimeout(resolve, QUIESCE_INTERVAL_MS))
  }
  // 等待耗尽不再无声放行(四审 A-3):一个长工具回合能活过 3s,放行的下场是
  // "清空成功"之后房间又冒出消息。此刻**什么都还没删**,失败是干净的 —— 用户
  // 稍后重试即可,比一半旧一半新的房间体面得多。
  if (runtime.activeTurns.size > 0 || runtime.inFlight.size > 0) {
    return { success: false, error: '仍有回合在收尾,请稍后重试' }
  }

  // ② 再删。成员取「在册 ∪ 曾在册」:一位被移出的同事,它的执行会话里同样躺着
  //    这间房的历史,而它随时可能被拉回来 —— 那时旧记忆会原地复活。
  const memberAgentIds = [...new Set([
    ...(session.room.memberAgentIds ?? []),
    ...(session.room.formerMembers ?? []).map(entry => entry.agentId),
  ])]
  // 看板与它的审计轨**排在转录前面**:上面 abort 掉的执行会走一趟收尾,而收尾
  // 的第一句是「这张卡还在不在」——卡先没了,它就一行都贴不出来;反过来先清转录,
  // 那行说明会落进一间已经清空的房。
  const { clearedTaskCount } = await clearCollabBoard(roomSessionId)
  const room = await store.clearSessionMessages(roomSessionId)
  let clearedSessionCount = 0
  for (const agentId of memberAgentIds) {
    // **只清按房 scoped 的执行会话**(四审 A-4)。全局 legacy 会话
    // (`agent-exec-<agentId>`,team-v2 之前的形状)是该 agent **所有房间**共用的:
    // 清房 A 会抹掉它在房 B/C 的转录与 W23 幂等台账,旧房 boot 时已应答的消息
    // 会被整批重放。legacy 里的旧内容进不了新回合的上下文(投影与游标只读
    // scoped 会话),清它对记忆卫生零收益,只有跨房代价。
    const execSessionId = collabAgentSessionId(agentId, roomSessionId)
    if (!execSessionId || !store.getSession(execSessionId)) continue
    const cleared = await store.clearSessionMessages(execSessionId)
    if (!cleared.cleared) continue
    clearedSessionCount += 1
    resetCollabSeenCursor(execSessionId)
    broadcastClearedTranscript(execSessionId)
  }

  // state 回到默认形状,**唯独 floorEpoch 留着刚 bump 出来的那一代**:归零的话,
  // 一条在飞回合收尾时级联出来的激活会盖上 0 号世代、被判成"当前的",于是它开口
  // 说的第一句话落进一间刚被清空的房 —— 这正是上面 bump 要阻止的事。
  runtime.state = {
    version: 1,
    chainCount: 0,
    activations: [],
    floorEpoch: currentFloorEpoch(runtime),
  }
  runtime.chainNoticePosted = false
  persistRoomState(roomSessionId, runtime)
  forgetCollabDigests(roomSessionId)
  // 「刚才」清零。表项被删之后活房间会按需重建 —— 重建出来的正是一份空的。
  forgetCollabInspector(roomSessionId)

  // ③ 再播。
  broadcastClearedTranscript(roomSessionId)
  broadcastCollabCoordinator(roomSessionId)

  // ④ 连带成员间私聊房(可选,2026-08-02 真机诉求:狼人杀发牌记录全在私聊里,
  //    只清群房等于没清干净)。pair 房是**跨群共享**的(Iris⇄Bram 只有一间),
  //    所以这是显式选项而不是默认行为;递归调用自身走完全同一套停-删-播,
  //    `includeMemberDms: false` 封住递归(pair 房的成员对就是它自己)。
  let clearedDmRoomCount = 0
  let clearedDmTaskCount = 0
  if (options.includeMemberDms) {
    const memberSet = new Set(memberAgentIds)
    for (const meta of store.getSessionsList() as Array<{ id: string; kind?: string }>) {
      if (meta.kind !== 'room' || meta.id === roomSessionId) continue
      const candidate = store.getSession(meta.id)
      if (candidate?.kind !== 'room' || candidate.room?.dm !== true) continue
      const pair = candidate.room?.memberAgentIds ?? []
      if (pair.length !== 2 || !pair.every(agentId => memberSet.has(agentId))) continue
      const dmResult = await clearCollabRoomHistory(meta.id, { includeMemberDms: false })
      if (!dmResult.success) continue
      clearedDmRoomCount += 1
      clearedSessionCount += dmResult.clearedSessionCount ?? 0
      clearedDmTaskCount += dmResult.clearedTaskCount ?? 0
    }
  }

  return {
    success: true,
    clearedMessageCount: room.clearedCount,
    clearedSessionCount,
    clearedTaskCount: clearedTaskCount + clearedDmTaskCount,
    ...(options.includeMemberDms ? { clearedDmRoomCount } : {}),
  }
}

/** 清场后最多等多久(次数 × 间隔)让在飞回合落地。 */
const QUIESCE_ATTEMPTS = 60
const QUIESCE_INTERVAL_MS = 50

/**
 * 让渲染层把这条会话的消息列表整体换成空的。
 *
 * 复用 `messages:replaced`(编辑重发的截断走的就是它),而不是新造一个
 * 「已清空」事件:渲染层那侧已经有一条处理完备的路径(重建 contentParts、
 * 重置滚动锚点),新事件类型意味着把同一件事再实现一遍。
 */
function broadcastClearedTranscript(sessionId: string): void {
  void getEventBus().emit(sessionId, {
    type: 'messages:replaced',
    messages: [],
  } as Parameters<ReturnType<typeof getEventBus>['emit']>[1])
}

/** Room-wide pause switch (总闸): freezes activations AND all work streams. */
export function setCollabRoomFrozen(roomSessionId: string, frozen: boolean): boolean {
  const session = store.getSession(roomSessionId)
  if (!session || session.kind !== 'room' || !session.room) return false
  const updated = store.updateSessionCollab(roomSessionId, {
    room: { ...session.room, frozen },
  })
  if (!updated) return updated
  if (frozen) {
    const runtime = roomRuntime(roomSessionId)
    for (const record of runtime.queue) {
      // Everyone who was waiting to speak stops "typing" (§2.4).
      emitCollabTyping(roomSessionId, record.agentId, false)
      // …and is retired in the durable record too. The queue entries ARE the
      // state records (same objects), so a discarded activation that stays
      // 'queued' is one boot reconciliation away from coming back to life —
      // the room would resume a conversation the user explicitly stopped.
      record.stage = 'failed'
    }
    runtime.queue.length = 0
    persistRoomState(roomSessionId, runtime)
    abortRoomTurn(roomSessionId)
    freezeRoomWork(roomSessionId)
    postSystemLine(roomSessionId, '房间已全部暂停:进行中的执行已中止,恢复后可重新指派')
  } else {
    // A new pause gets to say its piece again (P2-17).
    roomRuntime(roomSessionId).frozenNoticePosted = false
    resumeRoomWork(roomSessionId)
  }
  // 暂停/恢复是状态条上最显眼的一格(常驻条直接换成「已暂停 · 恢复」),不推的话
  // 面板要等下一次调度才追上一个用户刚刚亲手拨过的开关。
  broadcastCollabCoordinator(roomSessionId)
  return updated
}

export interface CollabBoardActResult {
  success: boolean
  error?: string
  board?: CollabBoard
}

/**
 * The USER's board mutation door (W16). Same reducer, same per-room write
 * queue, same broadcast as the board tool — the only thing pinned here is the
 * actor: a human. That matters beyond bookkeeping, because W9b's halt cap and
 * the 打回 counter gate AGENT-driven retries only, so a user can always push a
 * card that the room has stopped touching by itself.
 *
 * The board comes back on BOTH paths: a rev conflict is the expected outcome
 * of two writers (agent + user) on one card, and the caller repaints from the
 * returned truth rather than guessing.
 */
export async function applyUserCollabBoardAction(
  roomSessionId: string,
  action: CollabBoardAction,
): Promise<CollabBoardActResult> {
  const session = store.getSession(roomSessionId)
  if (!session) return { success: false, error: 'Session not found' }
  if (session.kind !== 'room' || !session.room) return { success: false, error: 'Not a room session' }
  const outcome = await applyBoardAction(roomSessionId, action, { type: 'user' })
  // Reducer refusals (unknown id, rev conflict, illegal transition) travel
  // VERBATIM: their wording is the actionable part ("re-read the board…").
  if (outcome.error) return { success: false, error: outcome.error, board: outcome.board }
  return { success: true, board: outcome.board }
}

const PERMISSION_MODES: readonly PermissionMode[] = ['normal', 'auto-accept-edits', 'dangerously-allow-all']
const RESPONSE_MODES: ReadonlyArray<'auto' | 'parallel' | 'serial'> = ['auto', 'parallel', 'serial']

/**
 * Room settings patch (W6). Absent field = unchanged; pmAgentId null = clear.
 *
 * **就是** shared 的 `CollabRoomUpdatePatch`(线上请求减去它的地址)。不再另写一份
 * 结构相同的接口:IPC handler 现在整体透传 `{ roomSessionId, ...patch }`,两侧共用
 * 同一个类型之后,「shared 加了个字段、app 层忘了收」这类漂移在编译期就死了。
 */
export type CollabRoomConfigPatch = CollabRoomUpdatePatch

export interface CollabRoomConfigResult {
  success: boolean
  error?: string
}

/**
 * Team settings (W6): rename / roster / PM / permission mode in one atomic
 * validation pass, followed by the 群公告 lines the room (and the model) reads.
 *
 * Membership semantics (§3.5 C): a removed member keeps its in-flight work
 * session — the task is still harvested — but stops taking the floor. Nothing
 * caches the roster: willingness (roomMembers), mention decisions and the
 * drive-time guard all read store.getSession() fresh, so the next round after
 * this write already excludes them.
 */
export function setCollabRoomConfig(
  roomSessionId: string,
  patch: CollabRoomConfigPatch,
): CollabRoomConfigResult {
  const session = store.getSession(roomSessionId)
  if (!session || session.kind !== 'room' || !session.room) {
    return { success: false, error: 'Not a room session' }
  }

  const previousMembers = session.room.memberAgentIds ?? []
  let nextMembers = previousMembers
  if (patch.memberAgentIds !== undefined) {
    // 私聊房的名册**不可编辑**(agent-im-dm.md D1/D3:人数即形态)。改一个单成员
    // dm 房的成员就是把它悄悄变成群,而所有读它的分支(免判激活、union 工具面、
    // dm 版提示词)仍按私聊在跑 —— 形态与语义分家,最难查的那一类。
    //
    // 界面上这两处本来就是只读的,但那只是**界面**:daemon 与任何程序化调用都
    // 直接落到这个函数上,防线画在 UI 层等于没画。
    if (isUserDmRoom(session.room) || isAgentPairDmRoom(session.room)) {
      return {
        success: false,
        error: '私聊的成员不能改:这间房的成员就是私聊的双方。要和别人聊请另开一间私聊,要多人参与请建群。',
      }
    }
    const requested = Array.isArray(patch.memberAgentIds) ? patch.memberAgentIds : []
    const unique = [...new Set(requested.filter(id => typeof id === 'string' && id.length > 0))]
    if (unique.length === 0) {
      return { success: false, error: 'Room needs at least one member agent' }
    }
    for (const agentId of unique) {
      const agent = findAgent(agentId)
      if (!agent) {
        return { success: false, error: `Unknown agent: ${agentId}` }
      }
      // 退休的人不能被**拉进来**(域模型 §3.2);已经在房里的原样通过 —— 否则
      // 一间旧房只要有一个成员退休了,这间房的任何设置修改都会被整体拒掉,
      // 而"已在房的 retired 成员留在 memberAgentIds"正是本期的数据纪律。
      if (!isActiveAgent(agent) && !previousMembers.includes(agentId)) {
        return { success: false, error: `Agent is retired: ${agent.name}` }
      }
    }
    nextMembers = unique
  }

  const previousPm = session.room.pmAgentId || undefined
  let nextPm = previousPm
  if (patch.pmAgentId !== undefined) {
    nextPm = patch.pmAgentId || undefined
    if (nextPm && !nextMembers.includes(nextPm)) {
      return { success: false, error: 'PM must be a room member' }
    }
  }
  // PM dropped from the roster → the room simply has no PM (§3.5 C). Validation
  // guarantees this rather than leaving a dangling pmAgentId behind.
  if (nextPm && !nextMembers.includes(nextPm)) nextPm = undefined

  if (patch.permissionMode !== undefined && !PERMISSION_MODES.includes(patch.permissionMode)) {
    return { success: false, error: `Invalid permission mode: ${patch.permissionMode}` }
  }

  let nextName: string | undefined
  if (patch.name !== undefined) {
    nextName = patch.name.trim()
    if (!nextName) return { success: false, error: 'Room name cannot be empty' }
  }

  // 响应模式三件套(collab-speaking-order.md §2)。校验只管形状,**不校验 speakOrder
  // 里的 id 是否在册** —— 列表里留着一个已离房的人是合法数据(§3④:读时忽略,
  // 他被拉回来时次序还在),在这里拒掉等于逼用户每次改名册都回来清一遍列表。
  if (patch.responseMode !== undefined && !RESPONSE_MODES.includes(patch.responseMode)) {
    return { success: false, error: `Invalid response mode: ${patch.responseMode}` }
  }
  let nextSpeakOrder: string[] | undefined
  if (patch.speakOrder !== undefined) {
    if (!Array.isArray(patch.speakOrder)) {
      return { success: false, error: 'speakOrder must be an array' }
    }
    nextSpeakOrder = [...new Set(patch.speakOrder.filter(id => typeof id === 'string' && id.length > 0))]
  }
  if (
    patch.relayLoops !== undefined
    && (!Number.isFinite(patch.relayLoops) || patch.relayLoops < 0)
  ) {
    return { success: false, error: 'relayLoops must be a number >= 0' }
  }

  const previousResponseMode = session.room.responseMode
  const nextResponseMode = patch.responseMode ?? previousResponseMode
  const previousRelayLoops = session.room.relayLoops
  const nextRelayLoops = patch.relayLoops !== undefined
    ? Math.floor(patch.relayLoops)
    : previousRelayLoops
  const previousSpeakOrder = session.room.speakOrder ?? []
  const effectiveSpeakOrder = nextSpeakOrder ?? previousSpeakOrder
  // 名册相等是**集合**相等(换个顺序不算改),次序表相等是**序列**相等 —— 换个
  // 顺序正是这张表存在的全部意义。两处不能共用一个判据。
  const speakOrderChanged = nextSpeakOrder !== undefined
    && (nextSpeakOrder.length !== previousSpeakOrder.length
      || nextSpeakOrder.some((agentId, index) => previousSpeakOrder[index] !== agentId))
  const relayChanged = nextResponseMode !== previousResponseMode
    || nextRelayLoops !== previousRelayLoops
    || speakOrderChanged

  // Roster equality is SET equality: re-sending the same members in another
  // order is not a membership change and must not post a 群公告 (or rewrite
  // the room). Only joins and departures count.
  const membersChanged = nextMembers !== previousMembers
    && (nextMembers.length !== previousMembers.length
      || nextMembers.some(id => !previousMembers.includes(id)))
  const pmChanged = nextPm !== previousPm

  if (membersChanged || pmChanged || relayChanged) {
    const room = { ...session.room, memberAgentIds: [...nextMembers] }
    /**
     * 被移出的人留一条 `{agentId, removedAt}`(collab-history-search.md §3)。
     *
     * 历史检索的授权判据靠它回答「这位同事能看到这间房到什么时候」——当前成员
     * 全部可见,被移出的只到这一刻为止。**只追加不删除**:同一个人移出→拉回→
     * 再移出会留下多条,读时取最后一次(`collabRoomVisibleUntil`)。
     *
     * 写在这里而不是下面那个发系统行的分支里:`room` 这个对象只在这一处被组装
     * 与持久化,判据也只有 `membersChanged` 这一个。同一件事分两处判定 = 迟早
     * 分家 —— 这个仓库刚为同类问题付过两天代价。
     */
    if (membersChanged) {
      const removed = previousMembers.filter(id => !nextMembers.includes(id))
      if (removed.length > 0) {
        const removedAt = Date.now()
        room.formerMembers = [
          ...(session.room.formerMembers ?? []),
          ...removed.map(agentId => ({ agentId, removedAt })),
        ]
      }
    }
    if (nextPm) room.pmAgentId = nextPm
    else delete room.pmAgentId
    if (nextResponseMode) room.responseMode = nextResponseMode
    else delete room.responseMode
    if (effectiveSpeakOrder.length > 0) room.speakOrder = [...effectiveSpeakOrder]
    else delete room.speakOrder
    if (typeof nextRelayLoops === 'number') room.relayLoops = nextRelayLoops
    else delete room.relayLoops
    if (!store.updateSessionCollab(roomSessionId, { room })) {
      return { success: false, error: 'Failed to update room' }
    }
  }

  // 换了模式就是换了一趟:旧编排对新模式毫无意义(审查 #20)。不清的话,模式
  // 一旦切成 'parallel',`discardCollabPlan` 的唯一调用点(编排分支)就再也
  // 进不去,残留的 `state.plan` 会让 `turn.ts` 的级联门永久判成"有编排在飞",
  // 于是这间房的 @ 级联与意愿判定被静默关死。
  if (nextResponseMode !== previousResponseMode) {
    const runtime = roomRuntime(roomSessionId)
    delete runtime.state.plan
    // 队里那批还没起跑的旧编排激活一并清掉(2026-08-02 三审):plan 没了之后
    // 它们会以普通回合的语义跑掉 —— 一批"轮到发言"的人在用户刚切走顺序模式的
    // 那一刻开口,读起来就像设置没生效。已起跑的照常跑完,与喊停同一口径。
    for (const record of runtime.queue) {
      if (record.reason === 'relay') record.stage = 'superseded'
    }
    runtime.queue = runtime.queue.filter(entry => entry.reason !== 'relay')
    persistRoomState(roomSessionId, runtime)
  }
  if (patch.permissionMode !== undefined && patch.permissionMode !== session.permissionMode) {
    store.updateSessionPermissionMode(roomSessionId, patch.permissionMode)
  }
  if (nextName && nextName !== session.name) {
    store.renameSession(roomSessionId, nextName)
  }

  if (membersChanged || pmChanged) {
    const roster = [...new Set([...previousMembers, ...nextMembers])]
      .map(agentId => findAgent(agentId))
      .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent))
      .map(agent => ({ id: agent.id, name: agent.name, avatar: agent.avatar }))
    for (const line of buildCollabMembershipLines({
      previousMemberIds: previousMembers,
      nextMemberIds: nextMembers,
      previousPmAgentId: previousPm,
      nextPmAgentId: nextPm,
      agents: roster,
    })) {
      postSystemLine(roomSessionId, line, COLLAB_SYSTEM_SOURCE_MEMBERSHIP)
    }
    if (membersChanged) clearTypingForNonMembers(roomSessionId, nextMembers)
  }
  // 模式、次序表、名册都改状态条的样子(接力那一段整段出现或消失)。
  broadcastCollabCoordinator(roomSessionId)
  return { success: true }
}

/** A queued-but-removed member stops "typing" immediately; the record itself is
 *  dropped by the drive-time roster guard when the queue reaches it. The head
 *  of a running queue is skipped — it is mid-stream and may be mid-`say`.
 *  Since W19 a merely-queued member has no light to clear (nothing lights until
 *  its `say` streams), so this is 兜底 for stale trues, not the mechanism. */
function clearTypingForNonMembers(roomSessionId: string, members: readonly string[]): void {
  const runtime = peekRoomRuntime(roomSessionId)
  if (!runtime) return
  // 并行之后"正在说话的"是一组,判据因此从"队首"换成 activeTurns。
  for (const record of runtime.queue) {
    if (isAgentSpeaking(runtime, record.agentId)) continue
    if (!members.includes(record.agentId)) emitCollabTyping(roomSessionId, record.agentId, false)
  }
}

/** Soft reminder line for long-pending worker permission asks (D8 30min). */
export function postCollabSystemLine(roomSessionId: string, content: string): void {
  if (store.getSession(roomSessionId)?.kind !== 'room') return
  postSystemLine(roomSessionId, content)
}

/**
 * 预算可配置(用户要求):只改给定字段;0 = 关闭该闸。生效即时(缓存失效)。
 *
 * 参数类型直接吃 shared 的 `CollabRoomBudgetsPatch` —— 这里以前是一份手写的同形
 * 接口,而中转层同时也在逐字段手抄,于是 `maxConcurrentTurns` 悄悄丢了几个月。
 * 一份类型 + 整体透传,那种漏抄不再有藏身处。下面每个字段的取值校验照旧:形状
 * 由类型保证,**取值**由这里保证。
 */
export function setCollabRoomBudgets(
  roomSessionId: string,
  budgets: CollabRoomBudgetsPatch,
): boolean {
  const session = store.getSession(roomSessionId)
  if (!session || session.kind !== 'room' || !session.room) return false
  const next = { ...(session.room.budgets ?? {}) }
  if (budgets.dailyCostUSD !== undefined && Number.isFinite(budgets.dailyCostUSD) && budgets.dailyCostUSD >= 0) {
    next.dailyCostUSD = budgets.dailyCostUSD
  }
  if (budgets.maxChain !== undefined && Number.isFinite(budgets.maxChain) && budgets.maxChain >= 0) {
    next.maxChain = Math.floor(budgets.maxChain)
  }
  // 回合断路器上限 (W22): same 0 = 关闭 shape as the gates above. Takes effect on
  // the next turn — the breaker reads its caps when the turn window opens.
  if (
    budgets.maxTurnToolCalls !== undefined
    && Number.isFinite(budgets.maxTurnToolCalls)
    && budgets.maxTurnToolCalls >= 0
  ) {
    next.maxTurnToolCalls = Math.floor(budgets.maxTurnToolCalls)
  }
  if (
    budgets.maxTurnSayCalls !== undefined
    && Number.isFinite(budgets.maxTurnSayCalls)
    && budgets.maxTurnSayCalls >= 0
  ) {
    next.maxTurnSayCalls = Math.floor(budgets.maxTurnSayCalls)
  }
  // 同时发言上限(并行化)。0 = 不限,与本族其它闸同一套约定;下一次发牌现取。
  if (
    budgets.maxConcurrentTurns !== undefined
    && Number.isFinite(budgets.maxConcurrentTurns)
    && budgets.maxConcurrentTurns >= 0
  ) {
    next.maxConcurrentTurns = Math.floor(budgets.maxConcurrentTurns)
  }
  const updated = store.updateSessionCollab(roomSessionId, {
    room: { ...session.room, budgets: next },
  })
  if (updated) {
    const runtime = roomRuntime(roomSessionId)
    runtime.budgetCheckedAt = 0
    runtime.budgetNoticeDay = ''
    runtime.chainNoticePosted = false
    // 新额度可能解除封锁 — 立刻重试排队中的激活与任务。
    if (runtime.queue.length > 0) void processQueue(roomSessionId)
    broadcastCollabCoordinator(roomSessionId)
  }
  return updated
}