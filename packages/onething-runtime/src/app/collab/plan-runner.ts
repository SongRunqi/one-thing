/**
 * 编排的**执行器** —— docs/design/collab-coordinator-plan.md §5。
 *
 * 协调器给出一份 waves(有序批次),这个文件负责把它跑完:
 *
 *   安装 → 发第 0 批 → 等这批全部落地 → 发第 1 批 → … → 耗尽/撞闸/被打断
 *
 * 与接力那一版最重要的结构差别:**推进发生在批边界,不是回合收尾**。
 * 接力时代一棒就是一个回合,于是"传棒"写在 `turn.ts` 里;而一个 wave 可以有
 * N 个回合,"这一批跑完了没有"只有调度泵知道。硬把它留在回合收尾,同一批的
 * 兄弟回合会互相误判成"另一根棒子"—— 那正是接力那套「一根棒子」检查在批内
 * 并行下会塌掉的地方。
 *
 * 这里不发模型调用。要一份编排是 `planner.ts` 的事,而它被**动态引入** ——
 * 理由见 `queue.ts` 那处调用点的注释。
 */
import { randomUUID } from 'node:crypto'
import {
  advanceCollabPlan,
  buildCollabChainHoldLine,
  collabRelayLoopsFor,
  isAgentPairDmRoom,
  type CollabPlan,
} from '@onething/runtime/collab'
import type { ChatSession } from '@shared/ipc.js'
import * as store from '../store.js'
import { noteCollabSchedule } from './inspector.js'
import {
  chainGateAllows,
  currentFloorEpoch,
  maxChainFor,
  persistRoomState,
  postSystemLine,
  roomMembers,
  type CollabActivationInput,
  type CollabRoomPlanState,
  type RoomRuntime,
} from './room-runtime.js'

/** 编排里一批激活用的理由。文案「轮到发言」在批内并行下同样贴切。 */
export const COLLAB_PLAN_REASON = 'relay' as const

/** 把一份编排装进房间,并给出第一批要驱动的人。 */
export function installCollabPlan(
  roomSessionId: string,
  runtime: RoomRuntime,
  plan: CollabPlan,
  /**
   * 这份编排属于**发起它的那一刻**的世代号,而不是它回来的那一刻。
   *
   * 编排调用要花 2–12s,期间用户可能喊了停(世代号 +1)。在 await **之后**读
   * 世代号,回来的编排就"继承"了新世代号 —— 于是喊停之后一两秒,整轮编排照常
   * 开跑,而 `isSupersededByFloor` 一条都拦不住(审查 #1)。
   */
  epoch: number,
): CollabActivationInput[] {
  if (plan.waves.length === 0) {
    // 「这轮谁都不该说」是一个**有效**答案,不是失败 —— 清掉旧编排就收工。
    // 但必须**说出来**(2026-08-02 真机):用户视角"发了消息什么都没发生"正是
    // 最需要解释的时刻,一行不写的话,读懂了的沉默和坏掉的链在界面上一个样。
    delete runtime.state.plan
    persistRoomState(roomSessionId, runtime)
    noteCollabSchedule(roomSessionId, {
      kind: 'planned',
      count: 0,
      ...(plan.why ? { detail: plan.why } : {}),
    })
    return []
  }
  const state: CollabRoomPlanState = {
    id: randomUUID(),
    waves: plan.waves.map(wave => [...wave]),
    cycle: plan.cycle,
    why: plan.why,
    waveIndex: 0,
    waveCount: 0,
    passStreak: 0,
    waveSpoke: false,
    spokeEver: false,
    epoch,
  }
  runtime.state.plan = state
  persistRoomState(roomSessionId, runtime)
  noteCollabSchedule(roomSessionId, {
    kind: 'planned',
    count: plan.waves.length,
    detail: plan.why,
    // 完整批次进「刚才」:编排跑完 `state.plan` 就没了,这一行是它唯一的遗照。
    waves: plan.waves.map(wave => [...wave]),
  })
  return waveActivations(state.waves[0], state.id)
}

function waveActivations(
  wave: readonly string[] | undefined,
  planId: string,
): CollabActivationInput[] {
  return (wave ?? []).map(agentId => ({ agentId, reason: COLLAB_PLAN_REASON, planId }))
}

/** 这条激活是不是当前这份编排派出去的 —— 旧编排的在飞回合据此认出自己已过期。 */
export function belongsToLiveCollabPlan(
  runtime: RoomRuntime,
  record: { reason: string; planId?: string },
): boolean {
  const plan = runtime.state.plan
  return Boolean(plan && record.reason === COLLAB_PLAN_REASON && record.planId === plan.id)
}

/** 丢掉在飞的编排(喊停、换模式、人再开口)。 */
export function discardCollabPlan(roomSessionId: string, runtime: RoomRuntime): void {
  if (!runtime.state.plan) return
  delete runtime.state.plan
  persistRoomState(roomSessionId, runtime)
}

/** 这份编排还算数吗 —— 用户喊停之后旧编排作废,与队里的对话性激活同一套机制。 */
export function isCollabPlanLive(runtime: RoomRuntime): boolean {
  const plan = runtime.state.plan
  return Boolean(plan && plan.waves.length > 0 && plan.epoch === currentFloorEpoch(runtime))
}

/**
 * 记一笔"这一批有人开口了"。回合收尾调它 —— 它是**唯一**由回合写进编排的东西,
 * 推进本身归调度泵。
 */
export function noteCollabPlanSpoke(runtime: RoomRuntime): void {
  if (runtime.state.plan) {
    runtime.state.plan.waveSpoke = true
    runtime.state.plan.spokeEver = true
  }
}

/**
 * 一位同事在发言里 @ 了人 —— 把还没排上的那些插进**下一批**。
 *
 * 编排一旦开跑就不再重新问协调器(设计:plan 耗尽才停,中途不续推),但
 * 「点名必须能应」是不能让步的红线:A 说「@Iris 你看看」而 Iris 不在剩下的
 * 编排里,那句话就永远没人应。所以这里做一次**机械的**插入 —— 不问模型,
 * 也不重排已有的批次。
 *
 * 只看**还没跑到**的批次:已经跑过的批次里有他不算数(那是上一轮的事)。
 */
export function spliceCollabPlanMentions(
  runtime: RoomRuntime,
  mentionedAgentIds: readonly string[],
  session: ChatSession | undefined,
): string[] {
  const plan = runtime.state.plan
  if (!plan || mentionedAgentIds.length === 0) return []
  const inRoom = new Set(roomMembers(session ?? ({} as ChatSession)).map(member => member.id))
  const named = [...new Set(mentionedAgentIds)].filter(agentId => inRoom.has(agentId))
  if (named.length === 0) return []

  const next = plan.waves[plan.waveIndex + 1] ?? []
  // 已经就是下一批了 —— 不动。这条让"顺手 @ 了下一位"不会白改一次编排。
  if (named.every(agentId => next.includes(agentId)) && next.length === named.length) return []

  // **提到下一批**,而不是"排在后面就算数"。A 说「@Iris 你看看」而 Iris 排在两批
  // 之后的话,中间那两位会先说别的,一个直接提问就那么悬着 —— 那正是「点名必须
  // 能应」要挡住的样子。
  //
  // 已排在更后面的位置一并摘掉:同一个人在一份编排里出现两次,循环时会变成他
  // 一圈说两回。副作用是**环的次序被这次点名永久改了** —— 接受:点名本来就是
  // 一次对次序的干预。
  //
  // 去重要对**整份**编排做,不只是后半段(审查 #8):循环编排里 `waveIndex`
  // 之前的批次下一圈还会跑到,只摘后半段的话被点名的人会在环上出现两次,
  // 此后每一圈他都说两回 —— 正是这段注释自己要避免的事。
  //
  // 已经跑过的批次里摘掉他不影响这一圈(那些批次这一圈不会再跑),而下一圈
  // 他会在被提上来的那个位置说话。
  const namedSet = new Set(named)
  const strip = (waves: string[][]): string[][] => waves
    .map(wave => wave.filter(agentId => !namedSet.has(agentId)))
    .filter(wave => wave.length > 0)
  const head = strip(plan.waves.slice(0, plan.waveIndex + 1))
  const tail = strip(plan.waves.slice(plan.waveIndex + 1))
  plan.waves = [...head, named, ...tail]
  // 摘掉前半段的空批次会让 `waveIndex` 指错位置 —— 它必须重新落在"刚跑完那批"
  // 的后面,也就是新 head 的末尾。
  plan.waveIndex = head.length - 1
  return named
}

export interface CollabPlanStep {
  /** 下一批要驱动的人;空 = 编排到此为止。 */
  activations: CollabActivationInput[]
  stop?: 'exhausted' | 'silent-lap' | 'wave-cap' | 'chain' | 'incomplete' | 'superseded'
  /**
   * 这趟编排里有人真的开过口(只随 `stop: 'exhausted'` 给出)。
   *
   * 续排(泵在编排走完后再问一次协调器"要不要继续")的准入门:静默走完的一趟
   * 不续 —— 材料没变,再问只会得到同一个答案,而链长闸只数说出的话,拦不住
   * 一个静默的续排循环。
   */
  spokeEver?: boolean
}

const NO_STEP: CollabPlanStep = { activations: [] }

/**
 * 一批跑完了 —— 推进到下一批,或者收工。
 *
 * 调度泵在"没有回合在跑、也没有牌可发"的那一刻调它。**它是编排唯一的推进口**。
 *
 * 检查次序与接力那一版同源,每一条都有账可查:
 *  1. 编排作废(喊停换了世代号)→ 停,不贴行 —— 用户已经知道自己喊了停;
 *  2. **这一批一个回合都没跑成 → 停,且不推进任何计数**。一次网络抖动不该
 *     看起来像"大家都没话说",更不该被算进静默收尾;
 *  3. 链长闸 → 停 + 贴行(跨模式的总闸,也是唯一挡得住"协调器一次排 50 批"的东西);
 *  4. 走满一整轮没人开口 → 停,**不贴行**(自然收尾,没什么要解释的);
 *  5. 圈数天花板 → 停 + 贴行(机器按住了一段**还能继续**的对话,用户有权知道怎么解开)。
 */
export function stepCollabPlan(options: {
  roomSessionId: string
  runtime: RoomRuntime
  /** 这一批里有没有回合是干净跑完的。全军覆没 = 这一批没发生过。 */
  waveCompleted: boolean
}): CollabPlanStep {
  const { roomSessionId, runtime } = options
  const plan = runtime.state.plan
  if (!plan || plan.waves.length === 0) return NO_STEP

  if (plan.epoch !== currentFloorEpoch(runtime)) {
    discardCollabPlan(roomSessionId, runtime)
    return { activations: [], stop: 'superseded' }
  }

  if (!options.waveCompleted) {
    discardCollabPlan(roomSessionId, runtime)
    return { activations: [], stop: 'incomplete' }
  }

  const session = store.getSession(roomSessionId)
  if (session?.kind !== 'room') {
    discardCollabPlan(roomSessionId, runtime)
    return { activations: [], stop: 'exhausted' }
  }

  const spoke = plan.waveSpoke
  // 与其余四处同一个判据(架构审查 A1)。此前这里直接拿 `maxChain` 比,绕过了
  // `resolveCollabChainCap` —— 编排派出来的是 'relay',分档结果与这里逐字相同,
  // 但"相同"是靠人肉核对维持的,而那正是收敛要拆掉的东西。
  // **预筛**(不预占):这一步问的是"下一批还发不发",发出去的每一条到了驱动
  // 强制点还要各自过一次闸。
  if (!chainGateAllows(runtime, session, COLLAB_PLAN_REASON)) {
    const maxChain = maxChainFor(session)
    if (!runtime.chainNoticePosted) {
      runtime.chainNoticePosted = true
      postSystemLine(
        roomSessionId,
        buildCollabChainHoldLine({
          maxChain,
          ...(isAgentPairDmRoom(session.room) ? { pairDm: true } : {}),
        }),
      )
    }
    noteCollabSchedule(roomSessionId, { kind: 'blocked', detail: 'chain' })
    discardCollabPlan(roomSessionId, runtime)
    return { activations: [], stop: 'chain' }
  }

  // 圈数天花板换算成批数:一"圈" = 走完整份 waves 一遍。
  const loops = collabRelayLoopsFor(session.room)
  const advance = advanceCollabPlan({
    waveTotal: plan.waves.length,
    waveIndex: plan.waveIndex,
    waveCount: plan.waveCount,
    passStreak: plan.passStreak,
    spoke,
    cycle: plan.cycle,
    maxWaves: loops > 0 ? loops * plan.waves.length : 0,
  })

  plan.waveCount = advance.waveCount
  plan.passStreak = advance.passStreak

  if (!advance.next) {
    if (advance.stop === 'wave-cap') {
      postSystemLine(roomSessionId, `他们轮了 ${loops} 圈,我先按住了——你说一句话就继续`)
      noteCollabSchedule(roomSessionId, { kind: 'blocked', detail: 'loops' })
    }
    // `silent-lap` / `exhausted` 都不贴行:前者是自然收尾,后者是编排本来就走完了。
    const spokeEver = plan.spokeEver === true
    discardCollabPlan(roomSessionId, runtime)
    return {
      activations: [],
      stop: advance.stop,
      ...(advance.stop === 'exhausted' && spokeEver ? { spokeEver: true } : {}),
    }
  }

  plan.waveIndex = advance.waveIndex
  plan.waveSpoke = false
  persistRoomState(roomSessionId, runtime)
  const wave = plan.waves[plan.waveIndex]
  noteCollabSchedule(roomSessionId, {
    kind: 'wave',
    count: wave.length,
    agentId: wave.length === 1 ? wave[0] : undefined,
  })
  return { activations: waveActivations(wave, plan.id) }
}
