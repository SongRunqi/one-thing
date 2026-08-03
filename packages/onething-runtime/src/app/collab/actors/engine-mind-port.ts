/**
 * 生产用的 MindPort:把一轮对话性回合交给**真的引擎**跑
 * (docs/design/collab-actor-v3.md §1.2)。
 *
 * ## 本期只写不接
 *
 * 这个文件在 D2 **没有任何生产调用点** —— v2 的调度链(coordinator/queue/turn)
 * 仍然是生产,接线在 D6。写在这里而不是等到 D6 一起写,是因为端口的形状要由
 * 「真机那一侧到底需要什么」来定,而不是由假端口的方便程度来定:一个只被
 * FakeMindPort 满足过的接口,到接线那天多半要重画。
 *
 * ## 四个基元来自 `turn-primitives.ts`,回合本体**不**来自 `turn.ts`
 *
 * 复用的是 C2-5 已经合成过一次的那四块 —— drive 信封、模型绑定取舍、超时后的
 * 僵尸流兜底、房内 say 的倒序收割。它们是叶子模块,谁 import 都不成环。
 *
 * `turn.ts` 本体不 import:那是 v2 编排的入口(队列、级联、意愿判定、房间运行时),
 * 而 v3 的编排在房间与心智循环里。搭上去等于把刚拆开的那个环换个方向重新接上,
 * 而且 D6 要整层删掉它。代价是这里重写了一遍**等终端事件**(30 行)与**注入**
 * (40 行)——两段都不带 v2 的编排语义,只剩机械动作。
 *
 * ## 一条刻意的收窄:没有 `waitForEngineBound`
 *
 * v2 的回合起跑前会等最多五分钟的「引擎绑定」(桌面端等窗口)。v3 不等:引擎没绑
 * 就是 `skipped`,牌当场交回去。房间的座位是稀缺资源,而一个挂五分钟的回合会把
 * 它占住 —— 等待的判断属于**房间**(要不要现在发这张牌),不属于拿到牌之后的
 * 这一步。
 */
import {
  COLLAB_MESSAGE_SOURCE,
  COLLAB_USAGE_SOURCE_ROOM,
  type CollabMentionLike,
} from '@onething/runtime/collab'
import type { ChatMessage } from '@shared/ipc.js'

import { findAgent } from '../../agents/index.js'
import { getEventBus } from '../../events/index.js'
import { getStreamEngineSafe } from '../../engine/index.js'
import * as store from '../../store.js'
import { issueCollabDriveToken } from '../drive-guard.js'
import {
  abortCollabZombieStream,
  collabAgentModelFields,
  collabDriveEnvelope,
  scanCollabRoomSays,
} from '../turn-primitives.js'
import type {
  CollabMindPort,
  CollabMindSay,
  CollabMindSteerRequest,
  CollabMindTurnRequest,
  CollabMindTurnResult,
} from './mind-port.js'

/** 起流的等待上限。没见到 `stream:start` 就是没跑起来。 */
const TURN_START_TIMEOUT_MS = 20_000
/** 一轮的总墙钟。超了掐流(见 `abortCollabZombieStream`)。 */
const TURN_TOTAL_TIMEOUT_MS = 10 * 60_000
/** 注入等一个工具回合边界的上限。超过它就当作「这一轮不会再读了」。 */
const STEER_CONSUME_TIMEOUT_MS = 10 * 60_000

/** 注入消息在执行会话里的来源标记 —— 刻意**不是** `COLLAB_MESSAGE_SOURCE`。
 *  那个标记的语义是「这是一条驱动」,而注入消息会被引擎持久化进执行会话;打上
 *  它,下一轮的历史构建就会把这条注入当成「本轮驱动」追到上下文尾部。 */
export const COLLAB_V3_STEER_SOURCE = 'collab-steer'

type TerminalOutcome = 'complete' | 'error' | 'aborted' | 'timeout'

/**
 * 等这条会话上下一个流的终端事件。
 *
 * 与 v2 `waitForRoomTurn` 逐行同义,重写在这里的理由见文件头。两个定时器:
 * 起流超时(没见到 `stream:start`)与总墙钟,任何一个先到都算 `timeout`。
 */
function waitForTerminalEvent(
  sessionId: string,
  startTimeoutMs = TURN_START_TIMEOUT_MS,
  totalTimeoutMs = TURN_TOTAL_TIMEOUT_MS,
): Promise<TerminalOutcome> {
  return new Promise<TerminalOutcome>(resolve => {
    let sawStart = false
    let settled = false
    const finish = (outcome: TerminalOutcome): void => {
      if (settled) return
      settled = true
      clearTimeout(startTimer)
      clearTimeout(totalTimer)
      unsubscribe()
      resolve(outcome)
    }
    const unsubscribe = getEventBus().onAny(
      sessionId,
      envelope => {
        const type = (envelope.event as { type?: string } | undefined)?.type
        if (type === 'stream:start') sawStart = true
        else if (type === 'stream:complete') finish('complete')
        else if (type === 'stream:error') finish('error')
        else if (type === 'stream:aborted') finish('aborted')
      },
      'collab-v3-turn-wait',
    )
    const startTimer = setTimeout(() => {
      if (!sawStart) finish('timeout')
    }, startTimeoutMs)
    const totalTimer = setTimeout(() => finish('timeout'), totalTimeoutMs)
  })
}

/**
 * 房间的连接器 —— 回合跑在执行会话里,但它答的是这间房,出站路由与权限亲和
 * 都跟着房走。
 *
 * 这两行与 v2 `room-runtime.ts#roomChannel` 同义,没有 import 它:那个文件是
 * v2 房间运行时的门面(队列、活动记录、快照广播),为两行代码搭上去等于给这个
 * 叶子模块接一条通往整条 v2 链的实边。
 */
function roomConnector(roomSessionId: string): string | undefined {
  const live = getStreamEngineSafe()?.getChannel(roomSessionId)
  if (live && live !== 'ipc') return live
  return store.getSession(roomSessionId)?.lastConnector || live
}

function toMindSay(message: ChatMessage): CollabMindSay {
  const mentions: CollabMentionLike[] = (message.mentions ?? [])
    .filter(mention => typeof mention?.agentId === 'string')
    .map(mention => ({ agentId: mention.agentId as string, label: mention.label }))
  return {
    content: message.content ?? '',
    ...(mentions.length ? { mentions } : {}),
    ...(message.id ? { messageId: message.id } : {}),
    ...(typeof message.timestamp === 'number' ? { at: message.timestamp } : {}),
  }
}

/** 回合的宿主消息 —— 执行会话里这一窗最新的那条 assistant 记录。 */
function harvestTurnMessage(
  execSessionId: string,
  sinceTs: number,
): { id?: string; proseChars: number; at?: number } | undefined {
  const messages = store.getSession(execSessionId)?.messages ?? []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.timestamp < sinceTs) break
    if (message.role !== 'assistant') continue
    return {
      ...(message.id ? { id: message.id } : {}),
      proseChars: (message.content ?? '').trim().length,
      ...(typeof message.timestamp === 'number' ? { at: message.timestamp } : {}),
    }
  }
  return undefined
}

export interface CreateCollabEngineMindPortOptions {
  /** 时钟注入(排障脚本按转录时刻重放时用)。 */
  now?: () => number
  startTimeoutMs?: number
  totalTimeoutMs?: number
}

/**
 * 真机的 MindPort。
 *
 * 一轮 = 先订阅、再驱动、等终端事件、收割。**先订阅后驱动**不是风格问题:
 * 总线是同步投递的,一个在 `emitDrive` 里就起完又结束的流会在等待者存在之前
 * settle —— 那一轮会坐满整个起流超时,然后被当成它从来不是的僵尸掐掉(v2 P2-7)。
 */
export function createCollabEngineMindPort(
  options: CreateCollabEngineMindPortOptions = {},
): CollabMindPort {
  const now = options.now ?? Date.now

  return {
    name: 'engine',

    async runConversationalTurn(request: CollabMindTurnRequest): Promise<CollabMindTurnResult> {
      const engine = getStreamEngineSafe()
      // 引擎没绑就不驱动:没有 sender 的命令会被引擎静默丢掉,而那一轮会白白
      // 烧掉一张牌(等待的判断归房间,见文件头)。
      if (!engine?.hasCommandTarget()) return { outcome: 'skipped', says: [] }

      const agent = findAgent(request.agentId)
      if (!agent) return { outcome: 'skipped', says: [] }

      // 会话被用户钉过模型就一个绑定字段都不带 —— 命令级 override 会整个盖过会话
      // 自己的配置,于是用户在那个会话 UI 里挑的模型永远生效不了(P1-4)。
      const modelPinned = store.getSession(request.execSessionId)?.modelPinned === true
      const startedAt = now()
      const driveToken = issueCollabDriveToken()

      const turnEnded = waitForTerminalEvent(
        request.execSessionId,
        options.startTimeoutMs,
        options.totalTimeoutMs,
      )
      await getEventBus().emit(request.execSessionId, {
        ...collabDriveEnvelope({
          channel: roomConnector(request.roomSessionId),
          content: request.driveContent,
          // W13.3:这一轮记房间的账,不是匿名 chat。归属而已 —— 预算闸仍按
          // sessionId 求和。
          usageSource: COLLAB_USAGE_SOURCE_ROOM,
        }),
        // 标记说这是什么,令牌证明是谁发的:引擎的 room/exec 门因此不必信一个字符串。
        ...(driveToken ? { collabDriveToken: driveToken } : {}),
        // 这一轮答的是哪张牌。落在执行会话里 = 一份比内存账活得久的幂等凭据。
        collabLeaseId: request.lease.leaseId,
        ...collabAgentModelFields(agent, modelPinned),
      } as Parameters<ReturnType<typeof getEventBus>['emit']>[1])

      const outcome = await turnEnded
      // 等待放弃了,请求并没有:它会继续拿整个上下文来回打,而这一轮已经没有人在听。
      abortCollabZombieStream(outcome, request.execSessionId)

      // 不论结局都收割:一个被 abort 的半截回合里说出去的话**已经在房间里了**。
      const roomMessages = store.getSession(request.roomSessionId)?.messages ?? []
      const { says } = scanCollabRoomSays(roomMessages, request.agentId, startedAt)
      const turnMessage = harvestTurnMessage(request.execSessionId, startedAt)

      return {
        outcome,
        says: says.map(toMindSay),
        ...(turnMessage ? { turnMessage } : {}),
      }
    },

    /**
     * 把一条中途到达的同房消息并进正在跑的这一轮。
     *
     * 等一个结果而不是投完就走:注入在**工具回合边界**才被 drain,而一个回合可能
     * 已经跑到了最后一轮 —— 那条消息就会烂在队列里,等到这个 agent 下次被驱动时
     * 才以一个完全错位的时序出现在它眼前。所以迟到要撤回(v2 steer.ts 第三处收窄)。
     */
    async steer(request: CollabMindSteerRequest): Promise<boolean> {
      const engine = getStreamEngineSafe()
      const body = request.body.trim()
      if (!engine || !body) return false

      let queuedMessageId: string | undefined
      let settle: ((consumed: boolean) => void) | undefined
      const outcome = new Promise<boolean>(resolve => {
        let settled = false
        const finish = (consumed: boolean): void => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          unsubscribe()
          resolve(consumed)
        }
        settle = finish
        const unsubscribe = getEventBus().onAny(
          request.execSessionId,
          envelope => {
            const event = envelope.event as { type?: string; messageId?: string } | undefined
            switch (event?.type) {
              case 'steering:queued':
                if (event.messageId) queuedMessageId = event.messageId
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
          'collab-v3-steer',
        )
        const timer = setTimeout(() => finish(false), STEER_CONSUME_TIMEOUT_MS)
      })

      try {
        engine.steerMessage(request.execSessionId, body, COLLAB_V3_STEER_SOURCE)
      } catch (error) {
        console.error('[collab-v3] steer inject failed:', error)
        settle?.(false)
        return false
      }

      if (await outcome) return true

      if (queuedMessageId) {
        try {
          engine.retractSteerMessage(request.execSessionId, queuedMessageId)
        } catch (error) {
          console.error('[collab-v3] steer retract failed:', error)
        }
      }
      return false
    },
  }
}

/** drive 信封上的来源标记 —— 与 v2 同一个常量,导出只为让接线那侧有一处可断言。 */
export const COLLAB_V3_DRIVE_SOURCE = COLLAB_MESSAGE_SOURCE

/** 一张牌的 id 在命令上的字段名。D6 的引擎侧门按它认「这一轮答的是哪张牌」。 */
export const COLLAB_V3_LEASE_FIELD = 'collabLeaseId'
