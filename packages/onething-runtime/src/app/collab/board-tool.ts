/**
 * App wiring of the board tool: resolves the acting room from the session
 * (rooms act on themselves; work sessions act on their parent room), maps
 * roster names to agent ids, and routes every mutation through the board
 * store so revs/broadcast/coordinator events all apply.
 */
import { createBoardTool } from '@onething/runtime/tools'
import { resolveCollabAgentHandle, type CollabBoardAction } from '@onething/runtime/collab'
import * as store from '../store.js'
import { findAgent } from '../agents/index.js'
import { collabRoomMembers } from './members.js'
import { applyBoardAction } from './board-store.js'
import { collabLinkedRoomSessionId, collabToolAllowedInSession, collabVenueOf } from './venue.js'

function agentName(agentId: string): string {
  const agent = findAgent(agentId)
  return agent ? agent.name : agentId
}

export const BoardTool = createBoardTool({
  /**
   * 场子门 + 房间解析。门走统一那一份(C3-6,`venue.ts`);解析留在这里,因为
   * 「房场子的房是它自己」是这个工具的事实,不是场子表的事实。
   *
   * 等价性:`chat`(含 kind 缺席的网关会话)照旧 null → 工具回那句
   * 「boards exist only in collab rooms and their work sessions」。
   */
  resolveContext(sessionId) {
    const session = store.getSession(sessionId)
    if (!session) return null
    if (!collabToolAllowedInSession(session, 'board')) return null
    if (collabVenueOf(session) === 'room') {
      return { roomSessionId: session.id, actorAgentId: session.agentId }
    }
    // W18: a room turn runs in the agent's own execution session, which carries
    // the room it is currently answering — same shape a work session uses.
    const linked = collabLinkedRoomSessionId(session)
    if (linked) return { roomSessionId: linked, actorAgentId: session.agentId }
    return null
  },

  /**
   * 名字/id → 成员 id,只用于**指派**(create/assign 的 assignee)。
   *
   * 退休的成员解析不出来(域模型 §3.2:不被指派开工):它还在花名册里,但一张
   * 卡落在它头上就是一张永远不会被执行的卡 —— assign 会回一句 Unknown member,
   * 模型据此改派活人,而不是把活儿扔给墓碑。
   */
  /**
   * 指派给谁(collab-agent-handle.md §2.4)。
   *
   * 走统一解析器而不是自己遍历:名字、句柄、`名字#句柄`、全 id 四种写法一视同仁,
   * 而**重名**从「遍历撞上的第一个」变成明确拒绝 —— 从前那个循环会把两位「小李」
   * 里排在前面的那个静静地派上活,谁也不知道派错了。
   */
  resolveMember(roomSessionId, nameOrId) {
    const room = store.getSession(roomSessionId)?.room
    if (!room) return null
    // 纯文本解析:头像与职责说明都进不了判据,所以两样都不取。
    const members = collabRoomMembers(room.memberAgentIds, { withAvatar: false })
    const resolved = resolveCollabAgentHandle(nameOrId, members)
    return resolved.ok ? resolved.agentId : null
  },

  agentName,

  applyAction(roomSessionId, action: CollabBoardAction, actor) {
    return applyBoardAction(roomSessionId, action, actor)
  },
})
