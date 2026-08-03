/**
 * 停止按钮的那扇门,两代共用一个名字(D6-a 接线)。
 *
 * `apps/electron/src/main/ipc/chat.ts` 注入的是 `abortCollabRoomTurnForStop` ——
 * 一个字都不改,门后面换了实现:v3 起来时按住的是租约(换代 + 撤牌 + 掐流),
 * 没起来(或这间房还没有 v3 actor)时回落 v2 那条按 `activeTurns` 逐条 abort 的
 * 老路。
 *
 * 为什么是独立一个文件而不是改 `turn.ts`:那是 v2 调度链的一部分,D6-b 整层删掉。
 * 在它身上加一个 v3 分支,等于在一份即将消失的代码里留下唯一的路由逻辑。
 */
import { abortCollabRoomTurnForStop as abortCollabRoomTurnForStopV2 } from '../turn.js'
import { stopCollabV3RoomFloor } from './runtime.js'

/**
 * 停下这间房的对话。返回 true = 真的停下了什么(渲染层据此决定要不要提示)。
 *
 * **工作会话刻意不碰**:停对话不是停干活 —— 那是冻结开关的语义,它有自己的按钮。
 * 两代在这一条上完全一致。
 */
export function abortCollabRoomTurnForStop(sessionId: string): boolean {
  const stopped = stopCollabV3RoomFloor(sessionId)
  if (stopped !== null) return stopped
  return abortCollabRoomTurnForStopV2(sessionId)
}
