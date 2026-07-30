/**
 * App wiring of the `dm` tool (agent-im-dm.md D5 / §3.4 —— 发起 agent 互聊).
 *
 * `say` 把话说进"这一轮在答的那间房",`dm` 把话说进"我和某个人的那间房"——
 * 后者可能还不存在,所以这个执行器比 say 多了一步建房,其余每一步都是既有链路:
 *
 *  - **身份**:发言人 = 当前会话的属主 agent(与 say 同一处推导,不另立一套);
 *  - **收件人**:`findAgent` 严格解析 + `isColleague` + `isActiveAgent` + ≠自己。
 *    四道都答"是"才开房 —— 与 `ensureAgentDmRoom` 的校验重复是刻意的:那边保证
 *    "不会建出一间没人的房",这边保证"拒绝时能说清楚是哪一种拒绝";
 *  - **落库**:直接调 `speakIntoCollabRoom` 并显式指定房间。于是转义白名单、
 *    mention 解析、幂等窗、冻结/预算/成员门一件不落地继承,没有第二条写消息的路;
 *  - **激活**:与 worker 的 `enqueueRoomActivation` 同一个入口(enqueue + 该房的
 *    runtime),reason 用 'mention' —— dm 就是点名,该走满格链长闸、该被去重、
 *    该在驱动侧被退休/预算门拦下。
 *
 * **不搬运上下文**(§3.4 防滥用):这里一个字的群历史都不转运。发起方要交代
 * 背景就自己写进 message —— 工具描述里也是这么说的,两处必须一致。
 */
import { createDmTool, type DmToolResult } from '@onething/runtime/tools'
import { isColleague } from '@onething/runtime/agents'
import { isActiveAgent } from '@shared/ipc.js'
import * as store from '../store.js'
import { findAgent } from '../agents/index.js'
import { ensureAgentDmRoom } from './agent-dm-room.js'
import { speakIntoCollabRoom } from './say-tool.js'
import { enqueue } from './queue.js'
import { roomRuntime } from './room-runtime.js'

/** 拒绝文案。每一条都说清"是哪一种拒绝",因为模型能据此改做别的事。 */
const DM_REFUSED_NO_SELF = '这一轮没有可用的发言身份,dm 发不出去。'
const DM_REFUSED_NOT_COLLAB = 'dm 只在群聊/私聊/工作台的回合里可用,这场对话里没有可发起私聊的身份。'
const DM_REFUSED_EMPTY_TARGET = '要发给谁?to 填花名册里的 agent id。'
const DM_REFUSED_SELF = '这是你自己的 id —— 不能给自己发私聊。'
const DM_REFUSED_NO_ROOM = '私聊房打不开,这条消息没能送出。'

export async function sendCollabDm(input: {
  sessionId: string
  to: string
  message: string
}): Promise<DmToolResult> {
  const session = store.getSession(input.sessionId)
  const selfId = session?.agentId
  if (!selfId) return { ok: false, error: DM_REFUSED_NO_SELF }
  // 注入面写的是"群房工具面 + dm 房常驻会话",这一行让它在行为上也成立。
  // 没配白名单的 agent 看得见注册表里的每一个工具(say/board 一直如此),所以
  // "哪些场子能用"不能只由白名单说了算 —— 普通 chat 会话是直播式对话,那里的
  // agent 没有"我去私下问问 TA"这件事,它就在用户眼前说话。
  if (session?.kind !== 'room' && session?.kind !== 'agent' && session?.kind !== 'work') {
    return { ok: false, error: DM_REFUSED_NOT_COLLAB }
  }

  const targetId = (input.to ?? '').trim()
  if (!targetId) return { ok: false, error: DM_REFUSED_EMPTY_TARGET }
  if (targetId === selfId) return { ok: false, error: DM_REFUSED_SELF }

  const target = findAgent(targetId)
  // A1 纪律:严格解析,查无此人绝不 default 冒充 —— 而且要说清是 id 写错了。
  if (!target) {
    return { ok: false, error: `没有 id 为「${targetId}」的同事;to 要填 id,不是名字。` }
  }
  // 退休先判、service 后判:两句话说的是完全不同的两件事,而"已注销"是模型最
  // 需要知道的那一件(去找活人,而不是换个说法再试)。
  if (!isActiveAgent(target)) {
    return { ok: false, error: `${target.name} 已注销,私聊发不出去 —— 这件事得找别人。` }
  }
  if (!isColleague(target)) {
    return { ok: false, error: `${target.name} 不是同事(它是系统服务),没有私聊。` }
  }

  const roomSessionId = ensureAgentDmRoom(selfId, targetId)
  if (!roomSessionId) return { ok: false, error: DM_REFUSED_NO_ROOM }

  // 落库走 say 的执行器:显式指定房间,于是"发进哪间房"这件事不靠会话指针。
  const said = await speakIntoCollabRoom({
    sessionId: input.sessionId,
    content: input.message,
    room: roomSessionId,
  })
  // 冻结、超预算、空正文 —— say 的拒绝文案原样透传,它们的措辞本身就是可操作的。
  if (!said.ok || !said.messageId) {
    return { ok: false, error: said.error ?? DM_REFUSED_NO_ROOM }
  }

  // 送达即激活对方(D5)。dm 房里 agent 的发言本来就免判(D6),这一步与那条
  // 免判分支等价 —— 差别只是这次的发言不是在这间房的回合里说出来的,没有
  // 级联可以搭,所以由工具自己把人拉起来。
  enqueue(
    roomSessionId,
    roomRuntime(roomSessionId),
    [{ agentId: targetId, reason: 'mention' }],
    said.messageId,
  )

  return {
    ok: true,
    roomSessionId,
    messageId: said.messageId,
    peerName: target.name,
  }
}

export const DmTool = createDmTool({
  send: sendCollabDm,
})
