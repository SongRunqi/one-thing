/**
 * 金重放:把**真的 RoomActor** 接进重放架(docs/design/collab-actor-v3.md §7 风险 1)。
 *
 * D0 立了架子,管线只有一个直通 stub;这里插进第一个真实现。喂进去的是旧房的
 * 转录,吐出来的是 v3 会做的全部决策 —— 举手、发牌、说话、让位、撞闸。快照因此
 * 回答的是一个很具体的问题:**同一段真实对话,新运行时会怎么处理?**
 *
 * 转录 → 动词的翻译规则(只有三条,但每一条都是一个判断):
 *
 * 1. **人类/系统消息** → 直接投给房间(`room:posted`)。清链、推水位、按策略发牌
 *    全在房间的账里发生。
 * 2. **agent 的发言** → 先替它**举手**。转录里"它说了这句"在 v3 的语义是
 *    "它当时想说话",而想说话与说得成是两回事 —— 中间隔着三道闸。手举了没拿到
 *    牌,这条发言在快照里就**没有 speak 动词**:那正是重放要暴露的东西(v3 会
 *    拦下哪些话)。
 * 3. 拿到牌之后 `speak`,然后立刻 `yield`。为什么一句一交牌:转录里没有"回合
 *    边界"这个信息 —— 一个 agent 连说三句和说一句再被打断,落在纸上一模一样。
 *    一句一牌是唯一不需要猜的解释,而且它让并发上限在重放里有确定的含义。
 *
 * 名册从转录里现取(`collabRoomMembersFromTranscript`):重放是事后视角,谁在这
 * 间房里是已知的。真机那侧名册来自房间设置,两者在这一点上必然不同,所以它是
 * 一个显式的入参而不是藏在默认值里。
 *
 * 数据纪律沿用 D0:fixture 全部合成,真实用户转录只用同目录外的只读脚本手工对照。
 */
import { InMemoryMailbox, type ActorEvent } from '@onething/core/actors'
import type { CollabAgentLike } from '@onething/runtime/collab'
import {
  collabAgentRaiseHand,
  collabAgentSpeak,
  collabAgentYield,
  collabRoomActiveLeases,
  collabRoomHolders,
  type CollabActorReplayContext,
  type CollabActorReplayPipeline,
  type CollabActorReplayTranscript,
  type CollabActorVerb,
  type CollabRoomAccount,
  type CollabRoomTranscriptMessage,
} from '@onething/runtime/collab/actors'

import { createCollabRoomAccountMemoryStore } from './room-account.js'
import { CollabRoomActor, type CollabRoomActorHost } from './room-actor.js'

export interface CollabRoomReplayOptions {
  roomId: string
  /** 在职成员。缺省从转录里现取。 */
  members?: readonly CollabAgentLike[]
  /** 链闸上限。缺省 `Infinity`(不设闸的剧本)。 */
  maxChain?: number
  /** 并发上限。0 = 不限。缺省 1 —— 一句一牌的重放里,这是最能读懂的档。 */
  maxConcurrent?: number
  frozen?: boolean
  overBudget?: boolean
  pairDm?: boolean
  /** 时钟起点。重放不碰 `Date.now()`,时刻从转录派生。 */
  startedAt?: number
}

/** 重放管线额外暴露的观测面 —— 测试拿它比账,不必去翻内部。 */
export interface CollabRoomActorReplayPipeline extends CollabActorReplayPipeline {
  /** 跑完之后房间的账。 */
  account(): CollabRoomAccount
  /** 落进转录的消息(重放不真写盘,写到这里)。 */
  messages(): CollabRoomTranscriptMessage[]
  /** 全部动词,按序 —— 与 `replayRoomTranscript` 捕获的那一串相同。 */
  verbs(): CollabActorVerb[]
}

/** 转录里出现过的 agent,按首次出现序。重放的名册就是它。 */
export function collabRoomMembersFromTranscript(
  transcript: CollabActorReplayTranscript,
): CollabAgentLike[] {
  const seen = new Set<string>()
  const members: CollabAgentLike[] = []
  for (const message of transcript.messages) {
    const agentId = message.agentId
    if (!agentId || seen.has(agentId)) continue
    seen.add(agentId)
    // 名字用 id 顶着:重放里没有花名册,而名字只影响"裸 @名字"的扫描兜底 ——
    // fixture 里的 @ 都带 mentions[],走的是 id 那条精确路径。
    members.push({ id: agentId, name: agentId })
  }
  return members
}

/**
 * 造一条重放管线。
 *
 * 里面是一个**真的** `CollabRoomActor`,只是账落在内存、转录落在数组、信箱是
 * 内存版 —— 决策那条路径与真机逐字相同(`decide()` 是同一个方法)。
 */
export function createCollabRoomActorReplayPipeline(
  options: CollabRoomReplayOptions,
): CollabRoomActorReplayPipeline {
  const members = options.members ? [...options.members] : []
  const maxChain = options.maxChain ?? Number.POSITIVE_INFINITY
  const maxConcurrent = options.maxConcurrent ?? 1
  const messages: CollabRoomTranscriptMessage[] = []
  const verbs: CollabActorVerb[] = []
  // 重放的时钟:从转录的时间戳走,拿不到就用一个单调计数。碰 `Date.now()` 会让
  // 金快照每次都变(D0 已经为这条立过测试)。
  let clock = options.startedAt ?? 0

  const host: CollabRoomActorHost = {
    members: () => members,
    frozen: () => options.frozen === true,
    overBudget: () => options.overBudget === true,
    maxChain: () => maxChain,
    maxConcurrent: () => maxConcurrent,
    pairDm: () => options.pairDm === true,
    appendMessage: (_roomId, message) => {
      messages.push(message)
    },
    // 重放不投信箱:动词序列本身就是"谁收到什么"的完整记录,再投一遍内存信箱
    // 只是把同一件事记两遍。
    memberMailbox: () => undefined,
    newMessageId: seed => seed,
    now: () => clock,
  }

  let actor = newActor()

  function newActor(): CollabRoomActor {
    return new CollabRoomActor({
      roomId: options.roomId,
      host,
      store: createCollabRoomAccountMemoryStore(),
      // 信箱建了但循环不起:重放只调同步的 `decide()`,不走 actor 的事件循环 ——
      // 那一层管的是"什么时候处理",而重放问的是"处理成什么样"。
      mailbox: new InMemoryMailbox<ActorEvent<CollabActorVerb>>(),
    })
  }

  /**
   * 跑一个动词:记下它,再记下房间因它产生的全部动词。
   *
   * 广播里与输入**同一个对象**的那一条要滤掉:一条用户 posted 进来,房间原样播
   * 出去,那是同一封信的两次出现 —— 记两遍会让快照读起来像房间把每条消息都
   * 复读了一遍,而且链账的 fold 会把同一个清零事件数两次(结果不变,但理由变脏了)。
   */
  function run(verb: CollabActorVerb): void {
    verbs.push(verb)
    const effects = actor.decide(verb)
    for (const message of effects.messages) messages.push(message)
    verbs.push(...effects.broadcast.filter(entry => entry !== verb))
  }

  return {
    name: 'room-actor',
    reset: () => {
      messages.length = 0
      verbs.length = 0
      clock = options.startedAt ?? 0
      if (options.members) {
        members.splice(0, members.length, ...options.members)
      } else {
        members.length = 0
      }
      actor = newActor()
    },
    account: () => actor.account,
    messages: () => [...messages],
    verbs: () => [...verbs],
    onPosted: (event, _context: CollabActorReplayContext): CollabActorVerb[] => {
      const before = verbs.length
      const message = event.payload.message
      clock = message.timestamp ?? clock + 1

      // 名册没显式给的话按首次出现补 —— 一个还没说过话的人此刻确实不在房里,
      // 而 fixture 的 @ 目标要提前进名册,那就显式传 members。
      if (!options.members && message.agentId && !members.some(member => member.id === message.agentId)) {
        members.push({ id: message.agentId, name: message.agentId })
      }

      if (event.payload.author.kind !== 'agent') {
        run(event.payload)
        return verbs.slice(before)
      }

      const agentId = event.payload.author.id
      if (!collabRoomHolders(actor.account, clock).has(agentId)) {
        run(collabAgentRaiseHand({
          roomId: options.roomId,
          agentId,
          ...(message.id ? { sourceMessageId: message.id } : {}),
        }))
      }

      const lease = collabRoomActiveLeases(actor.account, clock).find(entry => entry.agentId === agentId)
      if (!lease) {
        // 撞闸:这句话在 v3 说不出口。快照里因此没有 speak —— 这不是缺失,
        // 是结论。
        return verbs.slice(before)
      }

      run(collabAgentSpeak({
        roomId: options.roomId,
        agentId,
        leaseId: lease.leaseId,
        content: message.content,
        ...(message.mentions ? { mentions: message.mentions } : {}),
      }))
      run(collabAgentYield({
        roomId: options.roomId,
        agentId,
        leaseId: lease.leaseId,
        reason: 'done',
      }))
      return verbs.slice(before)
    },
  }
}
