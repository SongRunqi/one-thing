/**
 * Room runtime primitives — the vocabulary every other coordinator module
 * speaks (R2 split of the 1538-line coordinator).
 *
 * Two things live here, and they belong together because everything else in
 * `app/collab` needs both:
 *
 *  - the per-room RUNTIME: activation records, the durable state file
 *    (<store>/collab/<roomId>/state.json), the in-memory `rooms` map, and the
 *    watermark;
 *  - the room's own read/write PRIMITIVES: who is in it, what its caps are,
 *    which channel it answers on, and how a system line is posted into it.
 *
 * Watermark discipline (评审修订): lastProcessedMessageId advances only when a
 * message is actually CONSUMED — zero-activation messages advance immediately;
 * messages that spawned activations advance at harvest (watermark = reply id).
 * A crash between receipt and drive therefore leaves the mention recoverable;
 * duplicate re-drives are prevented by activation records carrying
 * sourceMessageId (a record past 'queued' means the drive was persisted).
 *
 * W23 gives that dedup a second, unbounded level. The records above are capped
 * at 50 and the watermark does not advance for a failed activation, so a busy
 * room can outlive the proof that a message was answered. Every drive is also a
 * persisted user message stamped with the room message it answers
 * (`collabSourceMessageId`), and transcripts have no cap — so when the records
 * miss, boot reconciliation asks the transcript instead of re-driving.
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { readJsonFile, writeJsonFile } from '@onething/core/storage'
import {
  COLLAB_DEFAULT_MAX_CHAIN,
  COLLAB_DM_PAIR_MAX_CHAIN,
  COLLAB_MESSAGE_SOURCE,
  COLLAB_SYSTEM_SOURCE_TASK,
  collabChainGateAllows,
  isAgentPairDmRoom,
  isCollabForcedSerialRoom,
  type CollabActivationReason,
  type CollabAgentLike,
} from '@onething/runtime/collab'
import { type ChatMessage, type ChatSession } from '@shared/ipc.js'
import * as store from '../store.js'
import { getEventBus } from '../events/index.js'
import { getStreamEngineSafe } from '../engine/index.js'
import { collabSessionRoomMembers } from './members.js'
import { getStorePath } from '../stores/paths.js'

/** One activation as the queue and the durable record both see it. */
export interface CollabActivationInput {
  agentId: string
  reason: CollabActivationReason
  driveLabel?: string
  /** 编排发出来的批次带上它的身份;其余激活不带。 */
  planId?: string
}

/** The willingness round's request shape — declared here so the turn module can
 *  ask for one without importing the queue that runs it (R2 拆环). */
export interface CollabElectionRequest {
  roomSessionId: string
  session: ChatSession
  /** Already activated deterministically (mentions) — they skip judgement. */
  exclude: ReadonlySet<string>
  /** The message's author never judges itself. */
  authorAgentId?: string
  /** The message this round is judging — where silent members' emoji land. */
  targetMessageId?: string
}

export interface CollabActivationRecord {
  id: string
  agentId: string
  reason: CollabActivationReason
  /** 这条激活属于哪一份编排(仅编排发出来的批次有)。 */
  planId?: string
  /**
   * 这个回合是不是**干净跑完**的(说了话或选择沉默都算干净;超时/中止/模型失败
   * 不算)。
   *
   * `DriveResult` 分不出这件事 —— 它对失败的回合同样返回 'done'。而编排的
   * 「这一批发生过没有」必须分得出:一次网络抖动被记成"大家都没话说",接龙就会
   * 在静默收尾那一格上提前停掉(审查 #11)。
   */
  turnClean?: boolean
  stage: 'queued' | 'driving' | 'streaming' | 'harvested' | 'failed' | 'superseded'
  driveMessageId?: string
  /** The room message that caused this activation (dedup on reconciliation). */
  sourceMessageId?: string
  /** Overrides the drive line's reason label — 'task-event' covers both a
   *  delivery review and a halted-card disposition, and the transcript must
   *  say which (W9.2). */
  driveLabel?: string
  /**
   * 这条激活属于哪一代 floor(路由表的 abort 分支,qm-collab-learnings §1.3)。
   *
   * 只盖在**对话性**激活上 —— @ 点名、自选发言,以及一个回合说完话后级联出来的
   * 那些。用户喊「停」时世代号 +1,盖着旧号的记录在轮到它之前就被丢掉:那是对
   * 一段用户已经喊停的对话的回答,让它开口正是喊停要阻止的事。
   *
   * **不盖 = 豁免**,而这正是它可选的原因:任务事件激活(卡交付了、卡受阻了)
   * 是工作流在汇报,不是对用户刚说的话的回答,喊停不该把它们一起吃掉。本字段
   * 存在之前写下的每一条记录同样豁免 —— 升级本来就该是这个行为。
   *
   * 注意它**不是**「用户一发消息就换代」:连发两条走的是 steer,不换代。
   */
  epoch?: number
}

export interface CollabRoomStateFile {
  version: 1
  lastProcessedMessageId?: string
  /** Timestamp fallback for the watermark (survives watermark-message deletion). */
  lastProcessedAt?: number
  chainCount: number
  activations: CollabActivationRecord[]
  /**
   * 房间 floor 的世代号。用户喊「停」时 +1(路由表 abort 分支)。
   *
   * 持久化,而不是只活在内存里:重启后从 0 起算的话,`reconcileRoom` 恢复出来的
   * 那批 queued 记录带着旧世代号,会被整批误判成过期、一条都不驱动 —— 一次重启
   * 就把房间里所有待应答的激活静默吃掉。缺字段(旧 state)读作 0。
   */
  floorEpoch?: number
  /**
   * 这间房当前在执行的编排(docs/design/collab-coordinator-plan.md)。
   *
   * 落盘的理由与接力计数一样:重启后 `reconcileRoom` 会把 queued 记录重新排队
   * 继续跑,而没有编排的话它跑完那一批就停在半路 —— 一趟接龙会在重启处断掉,
   * 且没有任何东西说明为什么。缺字段(旧 state / 并行模式)= 没有编排在跑。
   */
  plan?: CollabRoomPlanState
}

/** 一份正在执行的编排。`waves` 是有序批次:批内并行、批间串行。 */
export interface CollabRoomPlanState {
  /**
   * 这份编排的身份。
   *
   * 有了它,一条**属于旧编排**的在飞回合才认得出自己已经过期 —— 否则它收尾时
   * 写进去的 `waveSpoke` / @ 插批,落的是刚装上的**新**编排(审查 2026-08-02
   * 抓到的 #12)。仅靠"房里有没有编排"是分不出这件事的。
   */
  id: string
  waves: string[][]
  cycle: boolean
  /** 一句话理由,进状态条的「刚才」。 */
  why: string
  /** 正在跑(或即将发)的那一批。 */
  waveIndex: number
  /** 这一趟已经执行了几批。 */
  waveCount: number
  /** 连续几批没人开口 —— 「走满一整轮全静默就停」读它。 */
  passStreak: number
  /** 当前这一批有没有人真的开口。每发一批清零。 */
  waveSpoke: boolean
  /**
   * 这**整趟**编排有没有人开过口(不随批清零)。续排的准入门:一趟从头到尾
   * 全静默的编排,材料没有任何变化,再问一次协调器只会得到同一个答案 ——
   * 而链长闸只数说出的话,静默循环它一条都拦不住。可选:旧落盘 state 缺字段
   * 读作 false,代价只是那一趟不续排。
   */
  spokeEver?: boolean
  /**
   * 这份编排属于哪一代 floor。用户喊停时世代号 +1,旧编排在推进前被丢掉 ——
   * 与队里那些对话性激活同一套作废机制。
   */
  epoch: number
}

/** 一个正在跑的回合。key 是执行会话 id —— 停它的时候要打的就是那个。 */
export interface CollabLiveTurn {
  agentSessionId: string
  agentId: string
  reason?: CollabActivationReason
  /**
   * 回合窗口打开的时刻(协调器状态条的「跑了多久」)。
   *
   * 只有回合自己知道这件事 —— 状态条那侧宁可多这一个字段,也不要拿"收到快照的
   * 时刻"当起点:那样每刷新一次界面,一个跑了五分钟的回合就重新从 0 秒开始走。
   */
  startedAt: number
}

export interface RoomRuntime {
  state: CollabRoomStateFile
  queue: CollabActivationRecord[]
  /**
   * 泵是否已经在跑。**不是**"有人在说话" —— 并行化之后那件事看 `activeTurns`。
   *
   * 这个标志只保证同一间房不会有两个调度循环同时在发牌;循环本身是非阻塞的,
   * 它启动回合而不等回合结束。
   */
  pumping: boolean
  /**
   * 已经出队、正在跑(或正在 agent 锁上等)的激活,key = 记录 id。
   *
   * 串行时代不需要它:队首**跑完才 shift**,所以"在队里"和"没跑完"是同一件事,
   * 入队去重看一眼 `queue` 就够了。并行之后记录在**起跑那一刻**就离开队列,
   * 于是同一个 (agent, 消息, 理由) 会在第一条还在跑的时候被判成"没排过队"而
   * 再排一次 —— 一次全上下文模型调用换一句重复的话。
   */
  inFlight: Map<string, CollabActivationRecord>
  /**
   * 已经**过了链闸**的激活记录 id —— 链闸的预占账(架构审查 A1)。
   *
   * 为什么不能直接拿 `inFlight` 当预占:一批牌是在**任何一条走到闸前**就全部
   * 发完的(发牌循环到第一个 await 才让出执行权),于是每条在闸前都能看见另外
   * N-1 条兄弟记录。把它们全算成占用,一批 N 条撞上一道剩 k 格的闸时**一条都
   * 过不去** —— 把超发换成静音,比原来的病更糟。
   *
   * 所以占用的登记点就是**过闸那一刻**(`chainGateAllows`),释放点是调度泵那
   * 条 task 的 finally(与 `inFlight` 同生共死)。于是"占着发言权"与"拿到过
   * 发言权"是同一件事,同批发牌恰好放行 k 条。
   *
   * 只活在内存里:激活记录本身要落盘(state.json),而一格占用没有跨重启的
   * 意义 —— 重启后没有任何回合在跑。
   */
  floorHolds: Set<string>
  chainNoticePosted: boolean
  /** The 「房间已暂停」 line was already said this freeze (P2-17). Reset when
   *  the room is unfrozen, so the next pause gets to say it again. */
  frozenNoticePosted: boolean
  budgetCheckedAt: number
  budgetSpentUSD: number
  /** 正在进行的账本读取(并行去重,见 budget.ts 里那段注释)。 */
  budgetRead?: Promise<number>
  budgetNoticeDay: string
  /**
   * 此刻正在跑的回合,**可以有多个**(并行化)。key = 执行会话 id。
   *
   * W18 把流搬出了房间会话,所以任何"停下这间房"的动作都得先知道回合到底跑在
   * 哪里;并行之后那不再是一个答案而是一组。每条在进入 agent 锁时登记、由同一个
   * finally 摘除 —— 永远不比回合活得久。
   *
   * `reason` 随行是给 wake 路由用的,`agentId` 则同时被三处读:路由(@ 到的人
   * 是不是已经在说话)、steer(注入给谁)、abort(打谁)。
   */
  activeTurns: Map<string, CollabLiveTurn>
  /**
   * 在飞的意愿判定轮(路由表 abort 分支)。
   *
   * 用户喊停时全部 abort:那些调用读的是旧上下文,结果回来后既不入队也不写表情,
   * 让它们跑完只是白付 8s × N 人的钱。轮次自己进出这个集合(finally 删),所以
   * 集合为空 = 此刻没有判定在飞。
   *
   * 从裸 `AbortController` 换成带候选面的对象(状态条 §8):此前状态条只知道
   * "有几轮在飞",说不出**在问谁** —— 于是常驻条永远只能说「正在判断谁接话」,
   * 而那句更具体的「阿般 小李 Iris 在判断要不要接话」是一个够不着的死分支。
   */
  judgements: Set<CollabJudgementRound>
  /**
   * 编排调用的排队号(审查 #2)。
   *
   * `handleRoomUserMessage` 是并发的(coordinator 用 `void` 调起,而且那是刻意的),
   * 两条消息各自 await 一份编排,回来时后者覆盖前者的 `state.plan` —— 而前者已经
   * 发出去的那一批没人认领,第一批实际跑的是两份编排的并集。
   *
   * 发起前领一个号,回来时号变了就整个放手:顶掉它的那一方自己会安排。
   */
  planTicket: number
  /**
   * 在飞的编排调用的取消把手(与 `judgements` 各轮的 controller 同一条理由)。
   *
   * 用户喊停时 abort 它:结果本来就会被 epoch 比对作废,但不掐调用的话,
   * 一次已经没人要的请求还会跑满死线(至多 12s)并照常计费。
   */
  planAbort?: AbortController
}

/** 一轮在飞的意愿判定。 */
export interface CollabJudgementRound {
  controller: AbortController
  /** 这一轮在问谁。 */
  agentIds: string[]
}

const rooms = new Map<string, RoomRuntime>()

function statePath(roomSessionId: string): string {
  return path.join(getStorePath(), 'collab', roomSessionId, 'state.json')
}

function loadRoomState(roomSessionId: string): CollabRoomStateFile {
  const raw = readJsonFile<CollabRoomStateFile | null>(statePath(roomSessionId), null)
  if (raw && raw.version === 1) {
    return {
      version: 1,
      lastProcessedMessageId: raw.lastProcessedMessageId,
      lastProcessedAt: typeof raw.lastProcessedAt === 'number' ? raw.lastProcessedAt : undefined,
      chainCount: typeof raw.chainCount === 'number' ? raw.chainCount : 0,
      activations: Array.isArray(raw.activations) ? raw.activations : [],
      floorEpoch: typeof raw.floorEpoch === 'number' ? raw.floorEpoch : 0,
      // 编排:形状不对就当没有(旧 state / 手改坏的文件)。半份编排比没有编排更糟 ——
      // 执行器会照着一个残缺的 waves 发牌。
      ...(isPlanState(raw.plan) ? { plan: raw.plan } : {}),
    }
  }
  return { version: 1, chainCount: 0, activations: [], floorEpoch: 0 }
}

/** 落盘的编排读回来时的形状校验 —— 只认结构,不认内容。 */
function isPlanState(value: unknown): value is CollabRoomPlanState {
  if (!value || typeof value !== 'object') return false
  const plan = value as Partial<CollabRoomPlanState>
  return Array.isArray(plan.waves)
    && plan.waves.every(wave => Array.isArray(wave) && wave.every(id => typeof id === 'string'))
    && typeof plan.waveIndex === 'number'
    && typeof plan.id === 'string'
}

/**
 * Forced flush, every call. `writeJsonFile` is `writeFileSync` + `renameSync`:
 * synchronous and atomic, never queued and never throttled — so the moments
 * that matter (a record created at enqueue, the terminal state after harvest)
 * are already on disk before the next line runs, and a `kill` cannot open a
 * window between the decision and its record. W23 verified this against the
 * live store rather than assuming it: the state files survived every force-quit
 * with their records intact. The durability gap is elsewhere — the session
 * TRANSCRIPTS are the async, 300ms-throttled writers, which is why the state
 * file runs AHEAD of them and never behind.
 */
export function persistRoomState(roomSessionId: string, runtime: RoomRuntime): void {
  // Only the recent tail of activations matters for reconciliation; cap growth.
  //
  // This cap is the fast path's known blind spot (W23): a room busy enough to
  // push 50 records past a stalled watermark loses the record that proves an
  // older message was consumed. `reconcileRoom`'s level-2 transcript scan is
  // the answer — raising the cap would only move the cliff.
  if (runtime.state.activations.length > 50) {
    runtime.state.activations = runtime.state.activations.slice(-50)
  }
  writeJsonFile(statePath(roomSessionId), runtime.state)
}

export function roomRuntime(roomSessionId: string): RoomRuntime {
  let runtime = rooms.get(roomSessionId)
  if (!runtime) {
    runtime = {
      state: loadRoomState(roomSessionId),
      queue: [],
      pumping: false,
      inFlight: new Map(),
      floorHolds: new Set(),
      chainNoticePosted: false,
      frozenNoticePosted: false,
      budgetCheckedAt: 0,
      budgetSpentUSD: 0,
      budgetNoticeDay: '',
      judgements: new Set(),
      activeTurns: new Map(),
      planTicket: 0,
    }
    rooms.set(roomSessionId, runtime)
  }
  return runtime
}

/**
 * Move the watermark forward — and only forward (P2-2).
 *
 * Two `handleRoomUserMessage` calls run concurrently on purpose (serialising
 * them would make B's judgement wait out A's 8-second willingness round), so
 * the later message can finish first and write a watermark the earlier one then
 * overwrites with its own, older, position. Nothing is lost while the process
 * lives — the queue already holds both — but the state file is what boot
 * reconciliation reads, and a watermark that walked backwards makes the next
 * start re-decide messages the room already answered.
 *
 * The guard, not serialisation, is the fix: it removes the harm and keeps the
 * concurrency.
 */
export function advanceWatermark(runtime: RoomRuntime, message: Pick<ChatMessage, 'id' | 'timestamp'>): void {
  const current = runtime.state.lastProcessedAt
  if (current !== undefined && message.timestamp < current) return
  runtime.state.lastProcessedMessageId = message.id
  runtime.state.lastProcessedAt = message.timestamp
}

/**
 * 一间房同时最多几个人在说话。
 *
 * 并行化(2026-08-01)之前这个数恒等于 1:房间队列严格串行,一轮 20–40 秒,于是
 * 「@ 谁」和「谁在说」在屏幕上错位一到两轮——用户报的正是这个。
 *
 * 有上限而不是彻底放开:每条回合都是一次全上下文模型调用 + 工具执行,八个人
 * 同时开口就是八条并发流打同一个 provider(限流)和同一份账单。6 覆盖到目前
 * 房间的实际规模,而 `WILLINGNESS_MAX_PARALLEL` 那侧的极端房保护是 8 ——
 * 判定比回合便宜两个量级,两个数不必一样。
 */
export const COLLAB_MAX_CONCURRENT_TURNS = 6

/**
 * 这间房的同时发言上限。与 dailyCostUSD / maxChain 同一套约定:
 * 缺省(没配过)= 内置默认;**0 = 不限**;其余正数原样生效。
 *
 * 负数按"没配"处理 —— 它不是一个有意义的上限。
 */
export function maxConcurrentTurnsFor(session: ChatSession | undefined): number {
  // **不再为顺序模式恒返回 1。**
  //
  // 接力时代这里返回 1,因为"依次"是靠并发上限压出来的。编排(waves)之后,串行
  // 由**批边界**保证 —— 一批全部落地才发下一批 —— 而批**内**是并行的:
  // `[[a,b,c]]` 就是三个人一起说。继续恒返回 1 会把批内并行悄悄压成串行,
  // 而且没有任何地方会报错(collab-coordinator-plan.md 落地时侦察抓到的一条)。
  //
  // 但**用户钉死的顺序仍然是钉死的**(审查 #21):批边界只管编排发出来的批次,
  // 而编排之外的激活(任务事件的级联、编排耗尽后的自选发言)照旧按房间上限发牌。
  // 「用户强制,协调器不得违背」这条不能只在编排里成立。
  if (isCollabForcedSerialRoom(session?.room)) return 1
  const configured = session?.room?.budgets?.maxConcurrentTurns
  if (typeof configured !== 'number' || !Number.isFinite(configured) || configured < 0) {
    return COLLAB_MAX_CONCURRENT_TURNS
  }
  return configured === 0 ? Number.POSITIVE_INFINITY : Math.floor(configured)
}

/**
 * **占用视图** —— 此刻占着这间房发言权的人(2026-08-03 收敛,架构审查 A1)。
 *
 * 一个答案由两张表合成:`inFlight`(出队即登记,可能还卡在闸上、锁上)与
 * `activeTurns`(进了 agent 锁、流真的在跑)。同一条回合在两张表里都有,按
 * **人**去重后自然合成一格 —— 同一个人不并行说两句是发牌的既有纪律。
 *
 * 三个读者(泵的"这个人有没有活在手上"、状态面的"谁在说"、链闸的预占)此前各
 * 走各的表,于是同一个问题有三个答案;闸那一个还漏了 `inFlight` 整张表,那正是
 * 并行超发的成因。
 *
 * `granted: true` 只算**已经过链闸**的那些(见 `floorHolds` 的注释):闸自己要
 * 的是这一版,否则同批发牌的兄弟记录会在闸前互相顶死。
 */
export function roomOccupancy(
  runtime: RoomRuntime,
  options: {
    /** 排除调用者自己那条记录 —— 不排除的话它会把自己算成一格占用。 */
    excludeRecordId?: string
    /** 只算已经过闸的(链闸预占)。缺省 false = 出队即算。 */
    granted?: boolean
  } = {},
): Set<string> {
  const occupied = new Set<string>()
  const selfAgentId = options.excludeRecordId
    ? runtime.inFlight.get(options.excludeRecordId)?.agentId
    : undefined
  for (const [id, record] of runtime.inFlight) {
    if (id === options.excludeRecordId) continue
    if (options.granted && !runtime.floorHolds.has(id)) continue
    occupied.add(record.agentId)
  }
  for (const turn of runtime.activeTurns.values()) {
    // 自己那条走到 activeTurns 时早就过了闸,排除它与排除 inFlight 里的那条是
    // 同一件事(一个人同时只有一条记录)。
    if (selfAgentId !== undefined && turn.agentId === selfAgentId) continue
    occupied.add(turn.agentId)
  }
  return occupied
}

/**
 * 这个 agent 此刻是不是已经有回合在跑(同一个人不并行说两句)。
 *
 * 出队即算,而不是等它进 agent 锁:一条刚起跑、正卡在锁上的激活同样属于"这个
 * 人已经有事在做"。只看 `activeTurns` 会让泵把同一个人的第二条也发出去,白占
 * 一个并发位在锁上干等。
 */
export function isAgentSpeaking(runtime: RoomRuntime, agentId: string): boolean {
  return roomOccupancy(runtime).has(agentId)
}

/**
 * 链闸的**单一判定点**(架构审查 A1)。
 *
 * 五处判定(驱动强制点、续排预筛、级联预筛、决策预筛、编排推进)全部走这里,
 * 公式只有 `collabChainGateAllows` 一条。传 `record` = 强制点:它同时做两件事
 * ——按已经拿到发言权的人数预占,并在放行时把自己也登记进去。不传 = 预筛:
 * 那些地方问的是"这次调用值不值得买",少算一格只会多买一次判定。
 *
 * 预占为什么必须在**放行的同一行**登记:`chainCount` 要到收尾才 += 说了几句,
 * 同批起跑的 N 条回合读到的是同一个旧计数 —— 登记晚一步(比如等进了 agent 锁
 * 才记),这 N 条就在闸前互不可见,一道设成 k 的闸会放过 k+N-1 条。
 */
export function chainGateAllows(
  runtime: RoomRuntime,
  session: ChatSession,
  reason: CollabActivationReason,
  options: { record?: CollabActivationRecord } = {},
): boolean {
  const record = options.record
  const allowed = collabChainGateAllows({
    reason,
    chainCount: runtime.state.chainCount,
    maxChain: maxChainFor(session),
    ...(record ? { occupied: roomOccupancy(runtime, { granted: true, excludeRecordId: record.id }).size } : {}),
  })
  if (allowed && record) runtime.floorHolds.add(record.id)
  return allowed
}

/** 放开这条激活占着的那一格。与 `inFlight` 的摘除同一处(调度泵的 finally)。 */
export function releaseFloorHold(runtime: RoomRuntime, recordId: string): void {
  runtime.floorHolds.delete(recordId)
}

/** 这个房间当前的 floor 世代号。缺字段的旧 state 读作 0。 */
export function currentFloorEpoch(runtime: RoomRuntime): number {
  return runtime.state.floorEpoch ?? 0
}

/**
 * 世代号 +1 —— 「用户喊停了,这一段对话不算数了」。
 *
 * **不在这里落盘**:喊停之后紧接着就是这条消息自己的决策与 watermark 推进,那些
 * 路径各自会 persist 一次,而 state 文件是同步写(每次都是一次 fsync 级别的开销)。
 */
export function bumpFloorEpoch(runtime: RoomRuntime): number {
  const next = currentFloorEpoch(runtime) + 1
  runtime.state.floorEpoch = next
  return next
}

/**
 * 这条激活是不是已经被喊停顶掉了。
 *
 * `epoch === undefined` = 豁免(任务事件、以及本字段存在之前写下的每一条记录)。
 */
export function isSupersededByFloor(runtime: RoomRuntime, record: CollabActivationRecord): boolean {
  return record.epoch !== undefined && record.epoch !== currentFloorEpoch(runtime)
}

/**
 * Timer registry (P2-6). Every deferred kick the coordinator arms goes through
 * here, so `shutdownCollabCoordinator` can prove it left nothing armed —
 * previously a 60s requeue-retry survived teardown and woke a queue whose
 * subscriptions were gone.
 *
 * `key` de-duplicates: a room that parks ten activations behind one budget
 * ceiling arms one kick, not ten.
 */
const pendingTimers = new Set<ReturnType<typeof setTimeout>>()
const keyedTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function scheduleRoomTimer(delayMs: number, run: () => void, key?: string): void {
  if (key && keyedTimers.has(key)) return
  const timer = setTimeout(() => {
    pendingTimers.delete(timer)
    if (key) keyedTimers.delete(key)
    run()
  }, delayMs)
  // A pending kick must never hold the process open (CLI/daemon exit).
  timer.unref?.()
  pendingTimers.add(timer)
  if (key) keyedTimers.set(key, timer)
}

export function clearRoomTimers(): void {
  for (const timer of pendingTimers) clearTimeout(timer)
  pendingTimers.clear()
  keyedTimers.clear()
}

/**
 * 这个房间**还能指望**的成员名册:主动接话的候选面、mention 的可解析目标、
 * 提示词里的花名册,都读这一条。
 *
 * 退休的成员不在里面(域模型 §3.2 激活链一行):它照旧留在 `memberAgentIds`
 * 里(数据不动,成员条上是墓碑),但不再被提名、不再被 @ 到、也不进模型看到的
 * 花名册 —— 一个永远沉默的名字出现在这三处,只会让房间对着它空转。
 *
 * 投影本身归 `members.ts`(B8 的单一投影点);这里只是它带着房间语义的转发口,
 * 既有的十来个调用点因此一个字都不用改。
 */
export function roomMembers(session: ChatSession): CollabAgentLike[] {
  return collabSessionRoomMembers(session, { withDescription: true })
}

/**
 * 这个房间的链长闸上限:无人类输入时,讨论最多连着走几条。
 *
 * 三条规则,与 dailyCostUSD / 两个回合断路器上限同一套约定:
 *  - 缺省(从没配过)→ `COLLAB_DEFAULT_MAX_CHAIN`,**双成员 dm 房除外**:那里
 *    缺省是 `COLLAB_DM_PAIR_MAX_CHAIN`(6,agent-im-dm.md §3.3)。一对一免判
 *    激活之后,唯一还拦得住客套乒乓的就是这道闸,而群房那个 32 对两个人来说
 *    等于没有。**只改缺省**:显式配置(含 0 = 不限)照旧原样生效;
 *  - **0 = 关闭该闸** → Infinity。`CollabRoomBudgets` 的注释一直是这么写的,
 *    但代码此前把 0 读成"没配"、回落默认——文档与行为对不上,填 0 的人得到的
 *    是默认值而不是"不限"。现在按文档来。
 *  - 其余正数原样生效,**不再夹上限**。此前有一道 `min(cap, 默认×4)` 的隐形
 *    天花板:填 100 实际得到 32,而没有任何地方告诉你被夹了。要么让人填,
 *    要么别让人填,不该给一个填得进去却不生效的数字。
 *
 * 负数按"没配"处理——它不是一个有意义的上限,也不该被当成关闭。
 */
export function maxChainFor(session: ChatSession): number {
  const configured = session.room?.budgets?.maxChain
  if (typeof configured !== 'number' || !Number.isFinite(configured) || configured < 0) {
    return isAgentPairDmRoom(session.room) ? COLLAB_DM_PAIR_MAX_CHAIN : COLLAB_DEFAULT_MAX_CHAIN
  }
  return configured === 0 ? Number.POSITIVE_INFINITY : Math.floor(configured)
}

export function roomChannel(sessionId: string): string | undefined {
  // goal kick precedent: live channel unless it is the no-signal 'ipc'
  // fallback, then the session's persisted connector.
  const live = getStreamEngineSafe()?.getChannel(sessionId)
  if (live && live !== 'ipc') return live
  return store.getSession(sessionId)?.lastConnector || live
}

/**
 * 房间配置变了,把**全量小快照**播进会话通道(架构收敛 C4 §3)。
 *
 * 每一个改 `session.room` 的写入点在落盘之后调它一次,一行,不用管房间是什么形态
 * ——读的就是刚落下去的那份真值。放在这里而不是协调器里:它是「这间房的读写原语」
 * 那一族(与 `postSystemLine` / `roomChannel` 同族),而建房的两条路
 * (`room-create` / `user-dm-room`)不该为了发一条事件去 import 整个协调器。
 *
 * 落盘之后再调,不是之前:快照现读 store,读到旧值就等于播了一条假消息。
 */
export function emitCollabRoomUpdated(roomSessionId: string): void {
  const session = store.getSession(roomSessionId)
  if (session?.kind !== 'room' || !session.room) return
  try {
    void getEventBus().emit(roomSessionId, {
      type: 'session:collab-updated',
      name: session.name,
      room: session.room,
    } as Parameters<ReturnType<typeof getEventBus>['emit']>[1])
  } catch (error) {
    // 播不出去不是写失败:建房的两条路会在事件系统起来之前跑(daemon 的建房
    // RPC、boot 期的私聊修复),而"房建好了但没人收到通知"远好过"房没建成"。
    console.error('[collab] room update broadcast failed:', error)
  }
}

/**
 * Operational system line: budget, chain gate, freeze, turn failures,
 * permission reminders. Display-only — never enters the model projection
 * (W9.1: machine bookkeeping is not a room fact).
 */
export function postSystemLine(roomSessionId: string, content: string, source: string = COLLAB_MESSAGE_SOURCE): void {
  const message: ChatMessage = {
    id: randomUUID(),
    role: 'system',
    content,
    timestamp: Date.now(),
    source,
  }
  store.addMessage(roomSessionId, message)
  void getEventBus().emit(roomSessionId, {
    type: 'message:user-created',
    message,
  } as Parameters<ReturnType<typeof getEventBus>['emit']>[1])
}

/**
 * Task-lifecycle system line (started / halted / interrupted / review). Same
 * message shape, different source marker — this one IS projected to the model
 * so a reviewer sees what actually happened instead of only what the executor
 * claims (W9.1). Renderer treats both identically.
 */
export function postTaskSystemLine(roomSessionId: string, content: string): void {
  postSystemLine(roomSessionId, content, COLLAB_SYSTEM_SOURCE_TASK)
}

/**
 * W14b retired the coordinator's ghost-writer. It used to post 交付/进展 under
 * a worker's name (COLLAB_HARVEST_SOURCE); now the worker says those things
 * itself through `say`, and the harvest falls back to a SYSTEM line when it
 * stays quiet — 冒名发言 is exactly what「说话即行动」removes. The marker still
 * matters for pre-W14b transcripts: the chain recompute must keep skipping the
 * posts those rooms already hold (W12).
 */

export function selfElected(agentIds: readonly string[]): Array<{ agentId: string; reason: CollabActivationReason }> {
  return agentIds.map(agentId => ({ agentId, reason: 'self-elected' as const }))
}

export function isRoom(sessionId: string): boolean {
  return store.getSession(sessionId)?.kind === 'room'
}
/** Forget every room's in-memory runtime (process teardown / test reset). The
 *  durable state files are untouched — they are the thing that survives. */
export function clearRoomRuntimes(): void {
  rooms.clear()
}

/** Forget ONE room's runtime — the room itself is gone (P2-10). */
export function deleteRoomRuntime(roomSessionId: string): void {
  rooms.delete(roomSessionId)
}

/**
 * Remove a deleted room's whole collab directory — state.json, board.json and
 * activity.jsonl (P2-10).
 *
 * The three Maps that kept a room in memory were only-ever-growing, and the
 * directory outlived the session entirely: delete a room and its board, its
 * audit trail and its watermark stayed on disk forever, keyed by an id nothing
 * would ever look up again.
 */
export function removeCollabRoomDirectory(roomSessionId: string): void {
  try {
    fs.rmSync(path.join(getStorePath(), 'collab', roomSessionId), { recursive: true, force: true })
  } catch (error) {
    console.error('[collab] room directory cleanup failed:', error)
  }
}

/** The runtime for a room ONLY if one already exists. Callers that are merely
 *  inspecting (an abort target, a typing sweep) must not conjure one — reading
 *  a room into memory has a disk cost and leaves an entry behind. */
export function peekRoomRuntime(roomSessionId: string): RoomRuntime | undefined {
  return rooms.get(roomSessionId)
}
