/**
 * Agent 会话在 renderer 一侧的呈现规则 — pure logic
 * (W20 + collab-team-v2 §1.1 + agent-im-dm.md §4.2 履历页).
 *
 * W18 gave every agent ONE durable execution session (`agent-exec-<agentId>`,
 * `kind='agent'`) and hid it from every list. collab-team-v2 then made the
 * session per (agent × room) — `agent-exec-<agentId>-<roomSessionId>` — so an
 * agent in N rooms now owns N sessions.
 *
 * 三条规则住在这里,而不是散在三个组件里:
 *
 *  - WHAT a row is called: the agent's CURRENT name from the roster, because
 *    the session name was frozen at creation time and a rename must show. Only
 *    when the roster cannot answer does the frozen name (minus its 「[执行] 」
 *    badge) stand in;
 *  - WHETHER the session is an execution session at all — the predicate the
 *    composer reads to refuse input (a user turn typed into an execution
 *    session would land in the agent's turn history as if the agent had been
 *    addressed directly). That refusal is why the execution session is an
 *    infrastructure view ("执行现场") and NOT the way to talk to an agent;
 *  - 履历页(IM P2)四栏怎么摆:侧栏「Agent 组」退役后,执行会话的只读入口
 *    平移到这里。**归类不在这儿做** —— 四栏各收哪些会话由产品层的
 *    `computeAgentPresence` + sessions store 的两个 selector 回答(单点,见
 *    `stores/sessions.ts` 的 `agentPresence` / `agentDirectChatSessions`);
 *    本文件只把 presence 的一堆 sessionId 摆成能画的行。
 *
 * DOM-free on purpose: the tab label, the composer gate and the 履历页 are then
 * one tested rule each rather than three component behaviours.
 */
import { isAgentPairDmRoom, stripCollabAgentSessionName } from '@onething/runtime/collab'
// 叶子入口而不是 `@onething/runtime/agents` barrel —— barrel 拖着吃 node:fs 的
// store.ts,走它会把文件系统拽进浏览器包(alias 见 onething.aliases.ts)。
import type { AgentPresence } from '@onething/runtime/agents/presence'
import { AGENT_AVATAR_FALLBACK } from '@/components/common/agent-avatar'

/** Row stamp when the agent carries no emoji of its own (RoomMemberStrip's). */
export const AGENT_SESSION_FALLBACK_AVATAR = AGENT_AVATAR_FALLBACK

/** Last-resort label: a session whose agent is gone AND whose name is empty. */
export const AGENT_SESSION_FALLBACK_NAME = 'Agent'

/** The session fields these rules read; a SessionDetails satisfies it. */
export interface AgentSessionLike {
  id: string
  name?: string
  kind?: string
  agentId?: string
  updatedAt?: number
  /** 履历行的「条数」列;老会话可能没有,那就不画。 */
  messageCount?: number
  /** Which room this execution session serves (collab-team-v2 §1.1). */
  collab?: { roomSessionId?: string; taskId?: string } | null
  /** 房间会话才有;「私下」栏靠成员数判形态(禁反解 id)。 */
  room?: { memberAgentIds?: string[]; dm?: boolean } | null
}

/** The agent fields these rules read; an AgentDefinition satisfies it. */
export interface AgentRosterEntry {
  id: string
  name: string
  avatar?: string
  /** Media file name of the picture avatar; rows prefer it over the emoji. */
  avatarImage?: string
  title?: string
}

/**
 * Is this an agent's execution session?
 *
 * The kind is the truth (the id prefix is only a derivation convenience), so a
 * session that somehow lost its prefix but kept its kind still counts.
 */
export function isAgentExecutionSession(session?: AgentSessionLike | null): boolean {
  return session?.kind === 'agent'
}

/**
 * The name and stamp to show for one execution session.
 *
 * Roster first: the session name froze at creation, so an agent renamed since
 * would otherwise show its old name forever. The roster lookup is by id and
 * never falls back to a default agent — showing the wrong agent's name would
 * be worse than showing a stale one.
 */
export function resolveAgentSessionDisplay(
  session: AgentSessionLike,
  agents: readonly AgentRosterEntry[],
): { name: string; avatar: string; avatarImage?: string } {
  const agentId = session.agentId || ''
  const agent = agentId ? agents.find(candidate => candidate.id === agentId) : undefined
  const name = agent?.name?.trim()
    || stripCollabAgentSessionName(session.name)
    || AGENT_SESSION_FALLBACK_NAME
  return {
    name,
    avatar: agent?.avatar || AGENT_SESSION_FALLBACK_AVATAR,
    avatarImage: agent?.avatarImage,
  }
}

/* ── 履历页(agent-im-dm.md §4.2)──────────────────────────────────────── */

/** 履历页一行 = 一条会话。列:名称 / 最后活跃 / 条数。 */
export interface AgentHistoryRow {
  sessionId: string
  /** 主标题。 */
  label: string
  /** 副标注(「私聊 · 工作过程」「直聊」…);'' = 不画。 */
  note: string
  updatedAt: number
  /** 未知条数是 0 —— 呈现层不画,而不是画一个假的 0。 */
  messageCount: number
  /**
   * 只读转录(执行会话 / 工作台)。ChatPanel 自己会禁输入,这个标志只为让行
   * 上说清楚"点进去是看现场,不是去说话"。
   */
  readOnly: boolean
}

/** 「干过的活」按卡分组。卡状态**不入**这份快照(Q4 纪律:状态现查)。 */
export interface AgentWorkGroup {
  taskId: string
  /** 卡标题;查不到就是短号 `#xxxxxxxx`。 */
  title: string
  rows: AgentHistoryRow[]
  /** 组内最新一行的时间,组之间按它排。 */
  updatedAt: number
}

/** 履历页四栏。 */
export interface AgentHistory {
  /** 与你的对话:私聊房置顶 + 直聊会话。 */
  conversations: AgentHistoryRow[]
  /** 群聊:各群常驻执行会话(只读转录)。 */
  rooms: AgentHistoryRow[]
  /** 私下:双成员 dm 房(P3 前恒空)。 */
  pairDms: AgentHistoryRow[]
  /** 干过的活:工作台会话,按卡分组(只读转录)。 */
  work: AgentWorkGroup[]
}

export interface AgentHistoryInput {
  /** 产品层现算的在场面(store 的 `agentPresence`)—— 归类的唯一真源。 */
  presence: AgentPresence
  /** presence 不认的那一路(store 的 `agentDirectChatSessions`)。 */
  directChats: readonly AgentSessionLike[]
  /** 全量会话:行的名字/时间/条数,以及执行会话服务的房间名,都从这里解析。 */
  sessions: readonly AgentSessionLike[]
  /** 卡标题现查(collabBoard store);查不到返回空串。 */
  taskTitle?: (taskId: string) => string
}

const TASK_SHORT_ID_LENGTH = 8

function newestFirst(a: AgentHistoryRow, b: AgentHistoryRow): number {
  return b.updatedAt - a.updatedAt
}

function rowFrom(
  session: AgentSessionLike,
  label: string,
  note: string,
  readOnly: boolean,
): AgentHistoryRow {
  return {
    sessionId: session.id,
    label,
    note,
    updatedAt: session.updatedAt || 0,
    messageCount: session.messageCount || 0,
    readOnly,
  }
}

/**
 * 一条执行会话该署什么名。
 *
 * 归属读 `collab.roomSessionId`(结构化字段),名字再由那条房间会话现查 —— 会话
 * 名冻结在创建时,改群名必须跟着变。私聊房的那条单独措辞:它服务的不是"群",
 * 而是你和 TA 的一对一,标出来才不会读成"和自己开了个群"。
 */
function execRowLabel(
  roomSessionId: string,
  roomName: string,
  isUserDm: boolean,
): { label: string; note: string } {
  if (isUserDm) return { label: '私聊', note: '私聊 · 工作过程' }
  if (roomName) return { label: `群「${roomName}」`, note: '' }
  // 有房间指针但名字查不到 = 群已被删,会话还在;没有指针 = team-v2 之前的全局现场。
  return { label: roomSessionId ? '群(已删除)' : '执行现场', note: '' }
}

/**
 * 把在场面摆成履历页的四栏。
 *
 * 纯摆放:哪条会话属于哪一栏由 `presence` / `directChats` 决定(见文件头注释),
 * 这里既不重新过滤也不重新判定归属。唯一的例外是「私下」——presence 把双成员
 * dm 房和普通群一起塞在 `roomSessionIds` 里(它只分"是不是用户私聊房"),所以
 * 形态判定在这里补一次,并且照旧读成员数而不是反解 id。
 */
export function buildAgentHistory(input: AgentHistoryInput): AgentHistory {
  const byId = new Map<string, AgentSessionLike>()
  for (const session of input.sessions) {
    if (session?.id) byId.set(session.id, session)
  }

  const { presence } = input

  /* ── 与你的对话:私聊房置顶,直聊按活跃度跟在后面 ── */
  const conversations: AgentHistoryRow[] = []
  const dmRoom = presence.dmRoomId ? byId.get(presence.dmRoomId) : undefined
  if (dmRoom) {
    conversations.push(rowFrom(dmRoom, (dmRoom.name || '').trim() || '私聊', '私聊', false))
  }
  for (const chat of input.directChats) {
    if (!chat?.id) continue
    conversations.push(rowFrom(chat, (chat.name || '').trim() || '未命名会话', '直聊', false))
  }

  /* ── 群聊:各群常驻执行会话(只读转录)── */
  const rooms: AgentHistoryRow[] = []
  for (const sessionId of presence.execSessionIds) {
    const session = byId.get(sessionId)
    if (!session) continue
    const roomSessionId = (session.collab?.roomSessionId || '').trim()
    const roomName = roomSessionId ? (byId.get(roomSessionId)?.name || '').trim() : ''
    const { label, note } = execRowLabel(
      roomSessionId,
      roomName,
      Boolean(roomSessionId) && roomSessionId === presence.dmRoomId,
    )
    rooms.push(rowFrom(session, label, note, true))
  }
  rooms.sort(newestFirst)

  /* ── 私下:双成员 dm 房(P3 前恒空,空态照常渲染)── */
  const pairDms: AgentHistoryRow[] = []
  for (const sessionId of presence.roomSessionIds) {
    const session = byId.get(sessionId)
    if (!session || !isAgentPairDmRoom(session.room)) continue
    pairDms.push(rowFrom(session, (session.name || '').trim() || '私下', '', false))
  }
  pairDms.sort(newestFirst)

  /* ── 干过的活:工作台会话按卡分组 ── */
  const groups = new Map<string, AgentWorkGroup>()
  for (const sessionId of presence.workSessionIds) {
    const session = byId.get(sessionId)
    if (!session) continue
    // 没有卡指针的工作台会话不该被折进某张卡里 —— 它自己就是一组,键用会话 id。
    const taskId = (session.collab?.taskId || '').trim()
    const key = taskId || `session:${session.id}`
    const row = rowFrom(
      session,
      (session.name || '').trim() || '工作台',
      '',
      true,
    )
    const group = groups.get(key)
    if (group) {
      group.rows.push(row)
      group.updatedAt = Math.max(group.updatedAt, row.updatedAt)
      continue
    }
    groups.set(key, {
      taskId,
      title: formatTaskTitle(taskId, input.taskTitle?.(taskId) || ''),
      rows: [row],
      updatedAt: row.updatedAt,
    })
  }
  const work = [...groups.values()]
    .map(group => ({ ...group, rows: [...group.rows].sort(newestFirst) }))
    .sort((a, b) => b.updatedAt - a.updatedAt)

  return { conversations, rooms, pairDms, work }
}

/** 卡标题现查不到就退到短号 —— 状态永远不进快照(Q4)。 */
function formatTaskTitle(taskId: string, title: string): string {
  if (title.trim()) return title.trim()
  if (!taskId) return '未挂卡'
  return `#${taskId.slice(0, TASK_SHORT_ID_LENGTH)}`
}
