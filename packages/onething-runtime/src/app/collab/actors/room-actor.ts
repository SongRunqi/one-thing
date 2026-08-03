/**
 * RoomActor(docs/design/collab-actor-v3.md §1.4)。
 *
 * 房间在 v3 里只是**消息通道 + 发言权仲裁者**:它不再知道谁该被"激活",不再持有
 * 队列泵、意愿判定、编排推进这些控制流 —— 那些在 v2 是 coordinator/queue/turn/
 * worker 四个文件里的 8k 行,在 v3 是几个动词。
 *
 * 这个文件是**装配**,不是规则。规则(账、三道闸、发牌、链账)全在纯层的
 * `collab/actors/room-rules.ts` 里,而且是同步纯函数 —— 这一条不是洁癖:
 *
 *   **金重放与真机必须走同一行代码。** v3 是直接替换、不留双轨(§7 风险 1),
 *   「新运行时行为对不对」只能靠旧房的真实剧本来验。重放架的接缝是同步的
 *   (`onPosted` 直接返回动词),actor 的循环是异步的;把决策抽成纯函数之后,
 *   两边调的是同一个 `applyCollabRoom*`,快照才有资格当行为对照。这个类里剩下的
 *   只有三件带副作用的事:**落账、写转录、投 mailbox**。
 *
 * 次序是契约(§3 三面纪律):
 *
 *   决策 → **落账**(同步原子写)→ 写转录(追加)→ 广播(逐个成员)
 *
 * 账在最前面,因为它是崩溃之后唯一能重建现场的东西;广播在最后面,因为它是
 * at-least-once 的 —— 崩在中途重启后续播,而账里那条在飞广播记录就是"续到哪儿"
 * 的答案。
 *
 * **本期不接引擎、不接宿主**(接线在 D6):所有外部依赖都从 `CollabRoomActorHost`
 * 进来。v2 的调度链仍然是生产,这里一行都没动它。
 */
import {
  ActorBase,
  createActorEvent,
  type ActorBaseOptions,
  type ActorEvent,
  type ActorMailboxSource,
} from '@onething/core/actors'
import { COLLAB_DEFAULT_DAILY_COST_USD, type CollabAddressable, type CollabAgentLike } from '@onething/runtime/collab'
import {
  applyCollabRoomPassthrough,
  applyCollabRoomPhaseChange,
  applyCollabRoomPosted,
  applyCollabRoomRaiseHand,
  applyCollabRoomSetPolicy,
  applyCollabRoomSpeak,
  applyCollabRoomYield,
  bumpCollabRoomEpoch,
  collabActorRef,
  collabRoomActiveLeases,
  collabRoomEventId,
  collabRoomHolders,
  openCollabRoomBroadcast,
  pruneCollabRoomFloor,
  settleCollabRoomBroadcast,
  type CollabActorVerb,
  type CollabFloorRevokeReason,
  type CollabRoomAccount,
  type CollabRoomEffects,
  type CollabRoomGates,
  type CollabRoomIdSource,
  type CollabRoomPendingBroadcast,
  type CollabRoomTranscriptMessage,
} from '@onething/runtime/collab/actors'
import type { CollabCoordinatorState } from '@shared/ipc.js'

import { createCollabRoomAccountFileStore, type CollabRoomAccountStore } from './room-account.js'

/** 一个成员的信箱。真身是 `DurableMailbox`,测试与重放用内存版。 */
export interface CollabRoomMemberMailbox {
  append(event: ActorEvent<CollabActorVerb>): Promise<void>
}

/**
 * 房间要问外面的每一件事。
 *
 * 全部是**读口**,而且全部同步 —— 决策必须是同步的(见文件头),所以任何需要
 * 磁盘往返的读数(预算账本)由宿主自己缓存好再喂进来,这与 v2 协调器状态条读
 * `budgetSpentUSD` 那个 60s 缓存是同一套做法,不是新发明。
 */
export interface CollabRoomActorHost {
  /** 在职成员(授权面)。退休成员不在里面 —— 不被提名、不被 @ 到、不发牌。 */
  members(roomId: string): readonly CollabAgentLike[]
  /** 识别面:哪串字符算一个真身份(用户、退休成员)。缺省退回 `members`。 */
  directory?(roomId: string): readonly CollabAddressable[]
  /** 总闸。 */
  frozen(roomId: string): boolean
  /** 费用闸(宿主自己缓存,见上)。 */
  overBudget(roomId: string): boolean
  maxChain(roomId: string): number
  maxConcurrent(roomId: string): number
  /** agent ⇄ agent 的双成员私聊房?—— 冻结/链闸文案的分支。 */
  pairDm?(roomId: string): boolean
  /** 预算行要的两个数;拿不到就退化成不带数字的那句。 */
  budget?(roomId: string): { spentUSD: number; limitUSD: number } | undefined
  /** 牌的墙钟上限(ms)。缺省不设 —— 牌只被让位/撤销/换代作废。 */
  leaseTtlMs?(roomId: string): number | undefined
  /** 房间转录:追加一条消息。D6 接上 `store.addMessage`。 */
  appendMessage(roomId: string, message: CollabRoomTranscriptMessage): void
  /** 成员信箱。返回 undefined = 这位此刻没有信箱,跳过(不算投递失败)。 */
  memberMailbox(agentId: string): CollabRoomMemberMailbox | undefined
  /** 落库消息 id。真机传 `randomUUID`,重放传确定性派生。 */
  newMessageId(seed: string): string
  now(): number
}

export interface CollabRoomActorOptions extends Omit<ActorBaseOptions<ActorEvent<CollabActorVerb>>, 'id'> {
  roomId: string
  host: CollabRoomActorHost
  /** 账的存取面。缺省落盘(`actors/room.json`)。 */
  store?: CollabRoomAccountStore
  mailbox: ActorMailboxSource<ActorEvent<CollabActorVerb>>
}

/**
 * 一次广播投递失败。
 *
 * 单独一个类型而不是裸 Error:「一个成员的信箱写不进去」与「这条动词本身有问题」
 * 是两个完全不同的事故 —— 前者续播能自愈,后者续播只会一直炸。dead-letter 那侧
 * 要分得开这两者(ActorBase 的既定纪律)。
 */
export class CollabRoomBroadcastError extends Error {
  constructor(readonly eventId: string, readonly agentId: string, cause: unknown) {
    super(`[collab-room] broadcast to ${agentId} failed (${eventId}): ${String(cause)}`)
    this.name = 'CollabRoomBroadcastError'
  }
}

export class CollabRoomActor extends ActorBase<ActorEvent<CollabActorVerb>> {
  readonly roomId: string

  private readonly host: CollabRoomActorHost
  private readonly accountStore: CollabRoomAccountStore
  private readonly ids: CollabRoomIdSource
  private state: CollabRoomAccount
  /** 广播序号 —— 只给没有天然身份的动词派生事件 id 用(见 `collabRoomEventId`)。 */
  private broadcastOrdinal = 0

  constructor(options: CollabRoomActorOptions) {
    super({ ...options, id: `room:${options.roomId}` })
    this.roomId = options.roomId
    this.host = options.host
    this.accountStore = options.store ?? createCollabRoomAccountFileStore()
    this.state = this.accountStore.load(options.roomId)
    this.ids = { newMessageId: seed => this.host.newMessageId(seed) }
  }

  /** 当前的账。只读快照 —— 外面改它不会改到房间。 */
  get account(): CollabRoomAccount {
    return this.state
  }

  /** 三道闸这一刻的读数。每次决策现取 —— 缓存它就等于让房间用过期的闸判事。 */
  gates(): CollabRoomGates {
    const directory = this.host.directory?.(this.roomId)
    const budget = this.host.budget?.(this.roomId)
    const leaseTtlMs = this.host.leaseTtlMs?.(this.roomId)
    return {
      ...(leaseTtlMs === undefined ? {} : { leaseTtlMs }),
      frozen: this.host.frozen(this.roomId),
      overBudget: this.host.overBudget(this.roomId),
      maxChain: this.host.maxChain(this.roomId),
      maxConcurrent: this.host.maxConcurrent(this.roomId),
      members: this.host.members(this.roomId),
      ...(directory ? { directory } : {}),
      ...(this.host.pairDm?.(this.roomId) ? { pairDm: true } : {}),
      now: this.host.now(),
      ...(budget ? { budgetSpentUSD: budget.spentUSD, budgetLimitUSD: budget.limitUSD } : {}),
    }
  }

  /**
   * **同步决策面** —— 金重放与真机的公共入口。
   *
   * 做两件事:把动词路由到纯层的转换,然后**把账落下去**。转录与广播不在这里,
   * 因为它们是副作用而重放不要副作用;返回的 effects 就是那张待执行清单。
   */
  decide(verb: CollabActorVerb): CollabRoomEffects {
    const step = this.route(verb)
    this.state = step.account
    // 账先于一切。这一行之后,即使进程当场没了,重启也知道牌发过、链走到哪。
    this.accountStore.save(this.state)
    return step.effects
  }

  /** 落转录 + 广播。账已经在 `decide` 里落过了。 */
  async commit(effects: CollabRoomEffects): Promise<void> {
    for (const message of effects.messages) {
      this.host.appendMessage(this.roomId, message)
    }
    await this.broadcast(effects.broadcast)
  }

  protected async handleEvent(event: ActorEvent<CollabActorVerb>): Promise<void> {
    await this.commit(this.decide(event.payload))
  }

  /**
   * 续播:把账里还没投完的广播接着投完。
   *
   * 起循环之前调一次。这是 v3 唯一的"恢复"动作 —— 没有全局对账器(§3),每个
   * actor 自己知道自己停在哪儿。
   */
  async resumeBroadcasts(): Promise<void> {
    for (const record of [...this.state.broadcasts]) {
      await this.deliver(record)
    }
  }

  /** 换代:代数 +1,在外的牌全部作废。用户喊停 / 房间被冻住走这条。 */
  async bumpEpoch(reason: CollabFloorRevokeReason): Promise<void> {
    const step = bumpCollabRoomEpoch(this.state, reason, this.host.now())
    this.state = step.account
    this.accountStore.save(this.state)
    await this.commit(step.effects)
  }

  /** 过期回收 + 立刻补发。宿主定期调(牌带 ttl 时才有事做)。 */
  async sweepExpiredLeases(): Promise<void> {
    const step = pruneCollabRoomFloor(this.state, this.gates(), this.ids)
    this.state = step.account
    this.accountStore.save(this.state)
    await this.commit(step.effects)
  }

  /** C4 快照协议的供数面(§5「renderer 几乎不改」)。 */
  snapshot(): CollabCoordinatorState {
    return buildCollabRoomActorSnapshot({ account: this.state, gates: this.gates() })
  }

  /**
   * 动词路由。`default` 分支把 `verb` 收窄成 `never` —— 新增一个动词却漏了处理,
   * typecheck 当场红(C3 纪律,与 `collabActorVerbDirection` 同一套)。
   */
  private route(verb: CollabActorVerb): { account: CollabRoomAccount; effects: CollabRoomEffects } {
    const gates = this.gates()
    switch (verb.type) {
      case 'room:posted':
        return applyCollabRoomPosted(this.state, verb, gates, this.ids)
      case 'agent:raise-hand':
        return applyCollabRoomRaiseHand(this.state, verb, gates, this.ids)
      case 'agent:speak':
        return applyCollabRoomSpeak(this.state, verb, gates, this.ids)
      case 'agent:yield':
        return applyCollabRoomYield(this.state, verb, gates, this.ids)
      case 'referee:set-floor-policy':
        return applyCollabRoomSetPolicy(this.state, verb)
      case 'room:phase-changed':
        return applyCollabRoomPhaseChange(this.state, verb.phase, gates.now)
      // 只落账 + 透传:语义分别归 D2(私聊生命周期)与 D3/D4(相位、看板)。
      case 'agent:dm-open':
      case 'agent:wake':
      case 'room:card-event':
      case 'room:membership-changed':
        return applyCollabRoomPassthrough(this.state, verb)
      // 两类信原样吞掉,都不当错误:
      //  - 房间**自己**的输出回流进自己的信箱(重投、或宿主接错线)。再广播一次
      //    就是一个自激环,而且账已经记过这件事了;
      //  - agent → self 的三个动词根本不该寻址到房间。一封投错的信不该让房间的
      //    循环去记一条 dead-letter。
      case 'room:floor-granted':
      case 'room:floor-revoked':
      case 'agent:note':
      case 'agent:spawn-worker':
      case 'agent:worker-result':
        return { account: this.state, effects: { broadcast: [], messages: [], granted: [] } }
      default:
        return assertNeverRoomVerb(verb)
    }
  }

  private async broadcast(verbs: readonly CollabActorVerb[]): Promise<void> {
    if (verbs.length === 0) return
    const memberIds = this.host.members(this.roomId).map(member => member.id)
    for (const verb of verbs) {
      this.broadcastOrdinal += 1
      const pending = collabRoomBroadcastRecipients(verb, memberIds)
      if (pending.length === 0) continue
      const record: CollabRoomPendingBroadcast = {
        eventId: collabRoomEventId(this.roomId, verb, this.broadcastOrdinal),
        pending,
        verb,
        at: this.host.now(),
      }
      // 先记在飞广播,再投 —— 反过来的话,崩在第二个成员上时账里什么都没有,
      // 续播无从谈起(而重新决策一次会把同一件事变成两个事实)。
      this.state = openCollabRoomBroadcast(this.state, record)
      this.accountStore.save(this.state)
      await this.deliver(record)
    }
  }

  /**
   * 逐个成员投递。**投一个销一个账**。
   *
   * 事件 id 对所有收件人是同一个:它是**事件的身份**,不是这一次投递的流水号
   * (core `envelope.ts` 的定义)。于是同一封信重投多少次,消费端的去重窗都认得出。
   *
   * 中途抛错时,已投的那几个已经从 `pending` 里销掉并落盘了 —— 重启后续播只会
   * 补上剩下的那些,成员不会重复收到。at-least-once 是底线,这条账把它抬到了
   * 「崩溃点续播不重复」。
   */
  private async deliver(record: CollabRoomPendingBroadcast): Promise<void> {
    for (const agentId of [...record.pending]) {
      const mailbox = this.host.memberMailbox(agentId)
      if (mailbox) {
        try {
          await mailbox.append(createActorEvent<CollabActorVerb>({
            id: record.eventId,
            at: record.at,
            type: record.verb.type,
            from: collabActorRef('room', this.roomId),
            to: collabActorRef('agent', agentId),
            payload: record.verb,
          }))
        } catch (error) {
          throw new CollabRoomBroadcastError(record.eventId, agentId, error)
        }
      }
      this.state = settleCollabRoomBroadcast(this.state, record.eventId, agentId)
      this.accountStore.save(this.state)
    }
  }
}

function assertNeverRoomVerb(verb: never): never {
  throw new Error(`[collab-room] unhandled verb: ${JSON.stringify(verb)}`)
}

/**
 * 谁该收到这条动词 —— 可见性边界(§0.1)。
 *
 * 三条:房间消息给全体成员(**除了作者自己**——它说的话不必再回声给它,那句话
 * 在它自己的经历流里,D2);发牌/收牌只给当事人(一张牌是私事,广播它等于把
 * 「轮到谁了」变成全房噪声);其余给全体。
 */
export function collabRoomBroadcastRecipients(
  verb: CollabActorVerb,
  memberIds: readonly string[],
): string[] {
  switch (verb.type) {
    case 'room:posted':
      return verb.author.kind === 'agent'
        ? memberIds.filter(id => id !== verb.author.id)
        : [...memberIds]
    case 'room:floor-granted':
    case 'room:floor-revoked':
      return memberIds.includes(verb.agentId) ? [verb.agentId] : []
    case 'agent:dm-open':
      return verb.peerKind === 'agent' ? [verb.peerId] : []
    case 'agent:wake':
      return [verb.peerId]
    default:
      return [...memberIds]
  }
}

function finiteMax(value: number): number {
  return Number.isFinite(value) ? value : 0
}

/**
 * 房间 → renderer 的状态面(C4 快照协议原样复用,§5)。
 *
 * 形状与 v2 的 `buildCollabCoordinatorState` 完全一致 —— 渲染层一行不改就能读
 * v3 的房间,这是「转录零迁移」之外的第二条零迁移承诺。几处 D1 还给不出的字段
 * 诚实地给空值而不是编:
 *  - `typing`:打字灯是 C4 观察器的账,D6 接线时接回来;
 *  - `judging` / `judgingAgentIds`:v3 的 `free` 没有 per-agent 意愿判定这一步
 *    (D3 的批量裁决会让这两格重新有值);
 *  - `plan`:编排是 `waves` 策略的事(D3);
 *  - `log`:「刚才」只活在内存环形缓冲里,D6 接线。
 *
 * `agentSessionId` 用**牌号**顶着:停止按钮的靶子在 D1 还不存在(没有执行会话),
 * 而给一个空串会让下钻链接指向 undefined。牌号至少是一个真的、能查的东西。
 */
export function buildCollabRoomActorSnapshot(options: {
  account: CollabRoomAccount
  gates: CollabRoomGates
  at?: number
}): CollabCoordinatorState {
  const { account, gates } = options
  const leases = collabRoomActiveLeases(account, gates.now)
  const holders = collabRoomHolders(account, gates.now)

  return {
    roomSessionId: account.roomId,
    seq: account.seq,
    at: options.at ?? gates.now,
    mode: account.policy.name === 'ring'
      ? 'serial'
      : account.policy.name === 'free' ? 'parallel' : 'auto',
    frozen: gates.frozen,
    // 「谁在说话」= 此刻持有效牌的人。v2 那份占用视图(inFlight ∪ activeTurns)
    // 在 v3 退化成一句话:牌就是占用,没有第二张表可漂。
    speaking: [...holders],
    typing: [],
    turns: leases.map(lease => ({
      agentId: lease.agentId,
      reason: account.leaseReasons[lease.leaseId] ?? '',
      startedAt: lease.issuedAt,
      agentSessionId: lease.leaseId,
    })),
    queue: account.hands.map(hand => ({
      id: `hand:${hand.agentId}`,
      agentId: hand.agentId,
      reason: hand.reason,
    })),
    judging: 0,
    judgingAgentIds: [],
    gates: {
      chain: { value: account.chainCount, max: finiteMax(gates.maxChain) },
      concurrency: { value: leases.length, max: finiteMax(gates.maxConcurrent) },
      budget: {
        value: gates.budgetSpentUSD ?? 0,
        max: gates.budgetLimitUSD ?? COLLAB_DEFAULT_DAILY_COST_USD,
      },
    },
    plan: null,
    log: [],
  }
}
