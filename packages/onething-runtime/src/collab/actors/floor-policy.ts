/**
 * 发言策略族(docs/design/collab-actor-v3.md §1.5)。
 *
 * v2 的 planner / plan-runner / speaking-order / willingness-runner 是**四条代码
 * 路径**:谁能说话藏在四个文件的控制流里,想换一种排法就得改控制流。v3 把它翻成
 * 一个接口 + 若干实现 —— 房间只问一句「这一刻该给谁发牌」,怎么答是策略的事。
 *
 * D1 只落地 `free`(裁判缺席时的内置档)。`ring` / `waves` / `phase` 是 D3,
 * 它们与 `free` 的区别全部落在这个 `decide` 上,房间一行都不用改 —— 这正是把
 * 策略做成接口(而不是在房间里写 switch)的理由。
 *
 * 这一层是**纯函数**:不碰时钟(`now` 一律由调用方传)、不碰账(只读入参、只返回
 * 决定)、不认识租约的落盘形态。发不发得成、发出去要不要计链,是房间的账说了算
 * (`room-rules.ts`)—— 策略只排队,不管闸。两件事分开的理由很实际:闸只有一套
 * (三道,单账),而策略会长出四种;把闸写进策略等于把它抄四遍。
 */
import type { CollabActivationReason } from '../activation.js'
import type { CollabFloorPolicyName, CollabFloorPolicyParams, CollabHandUrgency } from './protocol.js'

/**
 * 一只举着的手。
 *
 * `origin` 不是装饰:`@` 提及在任何策略下都是**直通授牌**(§1.5 保留的已拍板
 * 决策),座位满时它退化成一只**排在最前面**的手,而不是退化成一只普通的手 ——
 * 后者会让「我点名了 A,结果先说话的是排队更久的 B」成为常态,而那正是 @ 这个
 * 社交信号存在的意义要否掉的事。
 */
export interface CollabRaisedHand {
  agentId: string
  /** 举手时刻(ms)。FIFO 就按它排。 */
  at: number
  /** `mention` = 被点名但当时没座位;`hand` = 自己举的。 */
  origin: 'mention' | 'hand'
  /** 这只手对应的激活理由 —— 链闸的分档读它(task-event 豁免)。 */
  reason: CollabActivationReason
  urgency?: CollabHandUrgency
  why?: string
  /** 触发这次举手的房间消息(链闸清零判定与排障要它)。 */
  sourceMessageId?: string
}

/** 策略选中的一个候选。发不发得出去还要过三道闸(房间的账说了算)。 */
export interface CollabFloorGrantCandidate {
  agentId: string
  origin: 'mention' | 'hand'
  reason: CollabActivationReason
  sourceMessageId?: string
}

export interface CollabFloorDecisionInput {
  /** 这一刻被 @ 到的成员(调用方已按名册过滤、已排除作者)。 */
  mentioned: readonly string[]
  /** 举手队列(房间账里的原序)。 */
  hands: readonly CollabRaisedHand[]
  /** 此刻手里有牌的人 —— 同一个 agent 不并发持两张同房租约。 */
  holders: ReadonlySet<string>
  /** 在外的有效租约数。 */
  activeLeases: number
  /** 并发上限。**0 或负数 = 不限**(与 dailyCostUSD / maxChain 同一套约定)。 */
  maxConcurrent: number
  /** 在职成员。不传 = 不校验(重放里名册从转录现取的场合)。 */
  members?: readonly string[]
  /** 当前相位(`phase` 策略读它;`free` 忽略)。 */
  phase?: string
  params?: CollabFloorPolicyParams
}

export interface CollabFloorDecision {
  /** 按发牌次序排好的候选。 */
  grants: CollabFloorGrantCandidate[]
}

export interface CollabFloorPolicy {
  readonly name: CollabFloorPolicyName
  decide(input: CollabFloorDecisionInput): CollabFloorDecision
}

/**
 * 还剩几个座位。`maxConcurrent <= 0` = 不限。
 *
 * 单独一个函数而不是内联三次:`0 = 不限` 这条约定在这个仓库里被写错过
 * (`maxChainFor` 曾把 0 读成"没配"而回落默认),一处判定省一次翻案。
 */
export function collabFloorSeats(input: Pick<CollabFloorDecisionInput, 'activeLeases' | 'maxConcurrent'>): number {
  if (!Number.isFinite(input.maxConcurrent) || input.maxConcurrent <= 0) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.floor(input.maxConcurrent) - input.activeLeases)
}

/**
 * 举手队列的发牌次序:**被点名的在前,其余按举手时刻 FIFO**,同刻按入队原序。
 *
 * 不动输入数组(账是不可变的,`sort` 就地改会让上一份账在调用方手里悄悄变形)。
 */
export function orderCollabHands(hands: readonly CollabRaisedHand[]): CollabRaisedHand[] {
  return hands
    .map((hand, index) => ({ hand, index }))
    .sort((a, b) => {
      const aMention = a.hand.origin === 'mention' ? 0 : 1
      const bMention = b.hand.origin === 'mention' ? 0 : 1
      return aMention - bMention || a.hand.at - b.hand.at || a.index - b.index
    })
    .map(entry => entry.hand)
}

/**
 * 免裁判的内置策略(§1.5「referee 缺席时房间用内置 free 策略」)。
 *
 * 三条规则,全在下面这十几行里:
 *  1. **@ 提及直通授牌** —— 座位优先给被点名的人,不排队、不判定;
 *  2. 其余按**举手队列**发牌(mention 起源的手排在普通举手之前,见 `CollabRaisedHand.origin`);
 *  3. 座位数 = `maxConcurrent`(0 = 不限),且**同一个 agent 不并发持两张牌**。
 *
 * 刻意**没有**做的事:批量举手裁决(一次调用给全员排序,qm P0-2 的 O(N)→O(1))。
 * 那需要一次模型调用,而模型调用不属于纯层 —— D3 会把它做成 referee 下发的策略,
 * `free` 则永远是那条不花钱的降级路径(§7 风险 3 要的「对照与降级」)。
 *
 * `urgency` 记而不用:`free` 是先到先得,让紧急度插队就等于给了每个 agent 一个
 * 自评优先级的旋钮 —— 那是 D3 批量裁决要在**一次**判断里统一定夺的事,不是
 * 每个人自己说了算。字段留着,因为丢掉它 D3 就重建不出当时的现场。
 */
export function createCollabFreeFloorPolicy(): CollabFloorPolicy {
  return {
    name: 'free',
    decide(input: CollabFloorDecisionInput): CollabFloorDecision {
      const grants: CollabFloorGrantCandidate[] = []
      // 本地副本:一次决策里先被选中的人立刻算作"手里有牌",否则同一条消息
      // 里 @ 了同一个人两次会发出两张牌。
      const holders = new Set(input.holders)
      const members = input.members ? new Set(input.members) : null
      let seats = collabFloorSeats(input)

      const take = (candidate: CollabFloorGrantCandidate): void => {
        if (seats <= 0) return
        if (holders.has(candidate.agentId)) return
        if (members && !members.has(candidate.agentId)) return
        holders.add(candidate.agentId)
        seats -= 1
        grants.push(candidate)
      }

      for (const agentId of input.mentioned) {
        take({ agentId, origin: 'mention', reason: 'mention' })
      }
      for (const hand of orderCollabHands(input.hands)) {
        take({
          agentId: hand.agentId,
          origin: hand.origin,
          reason: hand.reason,
          ...(hand.sourceMessageId ? { sourceMessageId: hand.sourceMessageId } : {}),
        })
      }

      return { grants }
    },
  }
}

/**
 * 按名字取策略。D1 只有 `free`;其余三档还没实现,**回落到 `free` 而不是抛** ——
 * 一间配了 `ring` 的房在 D3 落地之前应该照常能说话,而不是整间房打不开。
 */
export function resolveCollabFloorPolicy(name: CollabFloorPolicyName | undefined): CollabFloorPolicy {
  // D3 在这里长出 ring/waves/phase 三个分支。
  void name
  return createCollabFreeFloorPolicy()
}
