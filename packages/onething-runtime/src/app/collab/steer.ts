/**
 * 把一条中途到达的用户消息并进正在跑的那个回合(路由表的 steer 分支,
 * docs/design/qm-collab-learnings.md §1.3 / P1-6)。
 *
 * 「连发两条」走的就是这里:第一条的回合不被杀掉,第二条在下一个工具回合边界
 * 被那位成员读到,两条一起答。
 *
 * ## 为什么必须显式注入
 *
 * 直觉上"房间转录里已经有这条消息了,下一轮 rebuild 时它自然会被读到" —— 不对。
 * 房间投影只在**开流那一刻**建一次;`rebuildMessages` 只有压缩计划命中时才会
 * 触发(agent-loop-runtime.ts)。所以一个已经在跑的回合看不见此后落库的任何
 * 房间消息,除非有人把它推进去。引擎的 steering 队列就是那个推手:它在每个工具
 * 回合边界被 drain 进消息数组。
 *
 * ## 三处刻意的收窄
 *
 *  - **信封与投影同源**。注入的正文裹 `<message from="用户#句柄">`,和房间投影里
 *    那条一模一样(projection.ts §6.2)。两处写法分家,同一个人在同一份上下文里
 *    就成了两个称呼。
 *  - **source 不能用 `collab`**。`COLLAB_MESSAGE_SOURCE` 的语义是"这是协调器
 *    的驱动",而 steering 消息会被引擎**持久化进执行会话**;打上那个标记,
 *    `latestCollabDriveMessage` 下一轮就会把它当成"本轮驱动"追到上下文尾部。
 *  - **迟到要能退回去**。steering 在回合边界才被消费,而一个回合可能已经跑到了
 *    最后一轮 —— 那条消息就会烂在队列里,等到这个 agent 下次被驱动时才被 drain,
 *    以一个完全错位的时序出现在它眼前。所以这里等一个结果:没被消费就撤回,
 *    调用方退回 engage 另起一轮。
 */
import {
  formatCollabUserLabel,
  wrapCollabMessageEnvelope,
} from '@onething/runtime/collab'
import type { ChatMessage } from '@shared/ipc.js'
import { getEventBus } from '../events/index.js'
import { getStreamEngineSafe } from '../engine/index.js'
import type { RoomRuntime } from './room-runtime.js'
import { resolveUserIdentity } from './user-identity.js'

/**
 * 注入消息在执行会话里的来源标记。
 *
 * 刻意**不是** `COLLAB_MESSAGE_SOURCE`(见文件头)。一个自己的名字,于是分类器
 * 把它读成普通 user 消息 —— 而执行会话里的普通 user 消息本来就不进任何投影。
 */
export const COLLAB_STEER_SOURCE = 'collab-steer'

/** 等一个回合边界的上限。超过它就当作"这一轮不会再读了"。 */
const STEER_CONSUME_TIMEOUT_MS = 10 * 60_000

interface SteerOutcome {
  /** 被当前回合读到了。false = 调用方应退回 engage。 */
  consumed: boolean
}

/**
 * 等这条注入的命运:被消费,还是回合先结束了。
 *
 * 监听的是**执行会话**:`steering:consumed` 由 agent loop 在 drain 时发在
 * `ctx.sessionId` 上,而 W18 之后那就是执行会话(房间会话上一个流都没有 ——
 * 这也是 coordinator 里那个 `isRoom(sessionId)` 的 steering 订阅至今没生效过
 * 的原因,另案)。
 */
function waitForSteerOutcome(
  agentSessionId: string,
  onQueuedId: (messageId: string) => void,
): { outcome: Promise<SteerOutcome>; cancel: () => void } {
  let cancel = (): void => {}
  const outcome = new Promise<SteerOutcome>(resolve => {
    let settled = false
    const finish = (consumed: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsubscribe()
      resolve({ consumed })
    }
    const unsubscribe = getEventBus().onAny(
      agentSessionId,
      envelope => {
        const event = envelope.event as { type?: string; messageId?: string }
        switch (event?.type) {
          case 'steering:queued':
            // 撤回要用它。先记下来,别等到需要的时候才发现没有。
            if (event.messageId) onQueuedId(event.messageId)
            return
          case 'steering:consumed':
            finish(true)
            return
          case 'stream:complete':
          case 'stream:error':
          case 'stream:aborted':
            // 回合结束了却没人 drain 过 —— 这条注入迟到了。
            finish(false)
            return
          default:
        }
      },
      'collab-steer',
    )
    const timer = setTimeout(() => finish(false), STEER_CONSUME_TIMEOUT_MS)
    // 注入本身就抛了的时候用它把订阅和定时器一起收掉 —— 否则一次失败会留下
    // 一个挂十分钟的监听。
    cancel = () => finish(false)
  })
  return { outcome, cancel }
}

/** 一条注入的去向与结局。 */
async function steerOne(
  engine: NonNullable<ReturnType<typeof getStreamEngineSafe>>,
  agentSessionId: string,
  body: string,
): Promise<boolean> {
  let queuedMessageId: string | undefined
  const { outcome, cancel } = waitForSteerOutcome(agentSessionId, id => {
    queuedMessageId = id
  })
  try {
    engine.steerMessage(agentSessionId, body, COLLAB_STEER_SOURCE)
  } catch (error) {
    // 注入不进去(引擎没有这扇门 / 会话已经没了)。调用方退回 engage —— 让这条
    // 消息走完整的激活决策,总好过把它连同异常一起丢掉。
    console.error('[collab] steer inject failed:', error)
    cancel()
    return false
  }

  const { consumed } = await outcome
  if (consumed) return true

  // 迟到:把它从队列里(以及执行会话的转录里)拿回来,否则这个 agent 下次被
  // 驱动时会先读到一条来自上一段对话的用户消息。
  if (queuedMessageId) {
    try {
      engine.retractSteerMessage(agentSessionId, queuedMessageId)
    } catch (error) {
      console.error('[collab] steer retract failed:', error)
    }
  }
  return false
}

/**
 * 把 `message` 并进**当前正在跑的每一个**回合。
 *
 * 广播而不是挑一个:群里说话本来就是说给所有人听的,而并行之后"正在说话的人"
 * 是一组。挑其中一个注入,等于让其余几位在本轮对这句话装作没听见 —— 他们手上
 * 那份房间快照是开流那一刻建的,此后落库的消息一条都读不到。
 *
 * 返回 true = **至少有一条**回合真的读到了,调用方不再为这条消息做激活决策。
 * 全部迟到(或没有活跃回合 / 引擎没绑)才返回 false,调用方按 engage 处理 ——
 * 没被消费的那几条已经各自撤回,不会在下一轮错位冒出来。
 */
export async function steerIntoLiveTurn(
  runtime: RoomRuntime,
  message: ChatMessage,
): Promise<boolean> {
  const targets = [...runtime.activeTurns.values()]
  if (targets.length === 0) return false
  const engine = getStreamEngineSafe()
  if (!engine) return false

  const text = (message.content ?? '').trim()
  if (!text) return false

  const identity = resolveUserIdentity()
  const body = wrapCollabMessageEnvelope(
    formatCollabUserLabel(identity.label, identity.handle),
    text,
    message.timestamp,
  )

  const results = await Promise.all(
    targets.map(turn => steerOne(engine, turn.agentSessionId, body)),
  )
  return results.some(Boolean)
}
