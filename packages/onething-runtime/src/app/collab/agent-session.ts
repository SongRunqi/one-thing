/**
 * App wiring of the agent execution session (W18,
 * docs/design/multi-agent-collab-im.md §4.6 v5).
 *
 * One durable session per agent — `agent-exec-<agentId>` — where all of its
 * room turns run. The room keeps only messages; drives, thinking and tool calls
 * live here.
 *
 * Hidden the way the scheduler hides its run sessions: `isArchived`. That flag
 * already keeps a session out of every list the sidebar builds, and the
 * renderer additionally drops `kind === 'agent'` from both the active list and
 * the archive (an execution session is not something a user archives — it is
 * infrastructure with a lifetime of its own).
 *
 * The room this session currently answers rides on `collab.roomSessionId`, the
 * same field a work session uses to name its parent room. Two consumers read
 * it, and both need it to be persisted rather than held in memory:
 *  - the prompt builder, to take its persona/roster/projection material from
 *    the TARGET room instead of the session being driven;
 *  - the `say` executor, to know where an utterance lands when the tool call
 *    carries no explicit `room`.
 */
import {
  collabAgentSessionId,
  collabAgentSessionName,
} from '@onething/runtime/collab'
import * as store from '../store.js'
import { findAgent } from '../agents/index.js'
import { ensureCollabRoomFolder } from './room-folder.js'

/**
 * Get (or lazily create) an agent's execution session and point it at the room
 * whose drive it is about to answer.
 *
 * Idempotent by construction: the id is derived from the agent id, so "ensure"
 * is a read plus at most one create. Called on every drive — the room pointer
 * is what changes, and it is written only when it actually moved (a session
 * write per turn would churn the index for nothing).
 *
 * Returns the session id, or null when the agent does not exist.
 */
export function ensureCollabAgentSession(
  agentId: string,
  roomSessionId?: string,
): string | null {
  const sessionId = collabAgentSessionId(agentId, roomSessionId)
  if (!sessionId) return null
  const agent = findAgent(agentId)
  if (!agent) return null

  const existing = store.getSession(sessionId)
  if (!existing) {
    // createSession moves the global current-session pointer — restore it
    // (scheduler agent-task-runner / collab worker precedent), otherwise
    // creating a hidden session yanks the user's active tab.
    const previousSessionId = store.getCurrentSessionId()
    store.createSession(sessionId, collabAgentSessionName(agent.name))
    if (previousSessionId && previousSessionId !== sessionId) {
      store.setCurrentSessionId(previousSessionId)
    }
    store.updateSessionArchived(sessionId, true, Date.now())
  }

  const session = store.getSession(sessionId)
  if (!session) return null

  // collab-team-v2 §1.1:指针在创建时写一次,之后永不改写。
  //
  // 会话 id 里已经带了房间,所以归属是 id 本身的属性,`collab.roomSessionId`
  // 退化成一个恒定的归属标记 —— 它的所有读者(say 落点、board 归属、系统提示词、
  // 权限策略、投影)一行都不用改,而"后到的 drive 把指针改到别的房间"这一类
  // 事故在结构上消失了。写入条件因此只剩"还没写过"。
  if (session.kind !== 'agent' || (roomSessionId && !session.collab?.roomSessionId)) {
    store.updateSessionCollab(sessionId, {
      kind: 'agent',
      ...(roomSessionId ? { collab: { roomSessionId } } : {}),
    })
  }
  if (session.agentId !== agentId) store.updateSessionAgent(sessionId, agentId)

  // collab-team-v2 §7:常驻会话的 cwd 是群 folder。union 之后这条会话真的有
  // write/edit 了,「随手放个文档」需要的只是一个落点。
  //
  // 刻意 NOT 继承房间的 permissionMode(§2.3):work 会话继承是因为那是"正经
  // 开工的活"被授权过;一个只是来聊天的回合绝不该悄悄带上全自动放行的写权限。
  // 常驻会话只走 agent 自己声明的模式与严格者胜复合。
  if (roomSessionId && !session.workingDirectory) {
    const folder = ensureCollabRoomFolder(roomSessionId)
    if (folder) store.updateSessionWorkingDirectory(sessionId, folder)
  }
  // A session created before this agent was hidden (or un-archived by hand)
  // must not surface in the list — re-assert rather than trust the create path.
  if (!session.isArchived) store.updateSessionArchived(sessionId, true, Date.now())

  return sessionId
}

/**
 * The room an execution session is currently bound to. Undefined for anything
 * that is not one — callers use it as "the linked room" in the say routing and
 * fall through to their own rules.
 */
export function getCollabAgentSessionRoom(sessionId: string): string | undefined {
  const session = store.getSession(sessionId)
  if (session?.kind !== 'agent') return undefined
  return session.collab?.roomSessionId
}
