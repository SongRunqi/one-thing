/**
 * Agent 会话呈现规则 — the pure half
 * (W20 + collab-team-v2 P1-3 + agent-im-dm.md §4.2 履历页).
 *
 * 侧栏「Agent 组」已退役(P2 §4.1),`buildAgentRosterRows` 随之下线;它唯一的
 * 能力 —— 各群执行会话的只读入口 —— 由履历页「群聊」栏承接,规则在
 * `buildAgentHistory`。这里守住三件事:
 *
 *  - 履历四栏**只摆不判**:归类由产品层 `computeAgentPresence` + store selector
 *    给定,所以这些用例直接喂 presence,验证的是"摆对没有",而不是"过滤对没有"
 *    (过滤的用例在 `agents/__tests__/presence.test.ts` 与 store 那一侧);
 *  - 行名取 LIVE 名册,只有名册答不上来才退回冻结的会话名(减去「[执行] 」);
 *  - `isAgentExecutionSession` 是 composer 的闸 —— 往执行会话里打字会污染 agent
 *    自己的回合历史。
 */
import { describe, expect, it } from 'vitest'
import {
  AGENT_SESSION_FALLBACK_AVATAR,
  buildAgentHistory,
  isAgentExecutionSession,
  resolveAgentSessionDisplay,
  type AgentHistoryInput,
  type AgentSessionLike,
} from '../agent-sessions'

const roster = [
  { id: 'fe', name: '小李', avatar: '🔧' },
  { id: 'qa', name: '小研', avatar: '🔎' },
]

/** A collab-team-v2 execution session: one per (agent × room). */
function execSession(
  agentId: string,
  roomSessionId: string,
  updatedAt: number,
  name = `[执行] ${agentId}`,
): AgentSessionLike {
  return {
    id: `agent-exec-${agentId}-${roomSessionId}`,
    name,
    kind: 'agent',
    agentId,
    updatedAt,
    collab: { roomSessionId },
  }
}

function room(id: string, name: string, updatedAt = 0): AgentSessionLike {
  return { id, name, kind: 'room', updatedAt }
}

const EMPTY_PRESENCE = {
  dmRoomId: null,
  roomSessionIds: [],
  execSessionIds: [],
  workSessionIds: [],
}

function history(overrides: Partial<AgentHistoryInput> & { sessions: AgentSessionLike[] }) {
  return buildAgentHistory({
    presence: EMPTY_PRESENCE,
    directChats: [],
    ...overrides,
  })
}

describe('履历页 · 与你的对话', () => {
  it('私聊房置顶,直聊会话按活跃度跟在后面', () => {
    const dmRoom: AgentSessionLike = {
      id: 'agent-dm-fe',
      name: '小李',
      kind: 'room',
      updatedAt: 10,
      messageCount: 4,
      room: { dm: true, memberAgentIds: ['fe'] },
    }
    const chatNew: AgentSessionLike = { id: 'chat-2', name: '排查登录', kind: 'chat', agentId: 'fe', updatedAt: 300 }
    const chatOld: AgentSessionLike = { id: 'chat-1', name: '写周报', kind: 'chat', agentId: 'fe', updatedAt: 100 }

    const result = history({
      presence: { ...EMPTY_PRESENCE, dmRoomId: 'agent-dm-fe' },
      // store selector 已按活跃度排好;这里照单摆,不再排一次。
      directChats: [chatNew, chatOld],
      sessions: [dmRoom, chatNew, chatOld],
    })

    expect(result.conversations.map(row => row.sessionId))
      .toEqual(['agent-dm-fe', 'chat-2', 'chat-1'])
    expect(result.conversations[0]).toMatchObject({ note: '私聊', readOnly: false, messageCount: 4 })
    expect(result.conversations[1]!.note).toBe('直聊')
  })

  it('一条都没有时四栏都空 —— 空态由呈现层画,builder 不造假行', () => {
    const result = history({ sessions: [] })
    expect(result).toEqual({ conversations: [], rooms: [], pairDms: [], work: [] })
  })

  it('presence 指向一间已经不在列表里的房时不凭空造行', () => {
    const result = history({
      presence: { ...EMPTY_PRESENCE, dmRoomId: 'agent-dm-gone' },
      sessions: [],
    })
    expect(result.conversations).toEqual([])
  })
})

describe('履历页 · 群聊', () => {
  it('每条执行会话按它服务的房间**现名**署名,只读', () => {
    const result = history({
      presence: {
        ...EMPTY_PRESENCE,
        execSessionIds: ['agent-exec-fe-room-1', 'agent-exec-fe-room-2'],
      },
      sessions: [
        room('room-1', '官网改版组'),
        room('room-2', '客服周报组'),
        execSession('fe', 'room-1', 100, '[执行] 旧名字'),
        execSession('fe', 'room-2', 300),
      ],
    })

    expect(result.rooms.map(row => row.label)).toEqual(['群「客服周报组」', '群「官网改版组」'])
    expect(result.rooms.every(row => row.readOnly)).toBe(true)
  })

  it('私聊房的执行会话标注「私聊 · 工作过程」,不读成"和自己开了个群"', () => {
    const result = history({
      presence: {
        ...EMPTY_PRESENCE,
        dmRoomId: 'agent-dm-fe',
        execSessionIds: ['agent-exec-fe-agent-dm-fe'],
      },
      sessions: [
        { id: 'agent-dm-fe', name: '小李', kind: 'room', updatedAt: 5, room: { dm: true, memberAgentIds: ['fe'] } },
        {
          id: 'agent-exec-fe-agent-dm-fe',
          name: '[执行] fe',
          kind: 'agent',
          agentId: 'fe',
          updatedAt: 5,
          collab: { roomSessionId: 'agent-dm-fe' },
        },
      ],
    })

    expect(result.rooms).toHaveLength(1)
    expect(result.rooms[0]).toMatchObject({ label: '私聊', note: '私聊 · 工作过程', readOnly: true })
  })

  it('房间被删 / 没有房间指针,各说各的,绝不编一个群名出来', () => {
    const result = history({
      presence: {
        ...EMPTY_PRESENCE,
        execSessionIds: ['agent-exec-fe-room-deleted', 'agent-exec-fe'],
      },
      sessions: [
        execSession('fe', 'room-deleted', 200),
        { id: 'agent-exec-fe', name: '[执行] fe', kind: 'agent', agentId: 'fe', updatedAt: 100 },
      ],
    })

    expect(result.rooms.map(row => row.label)).toEqual(['群(已删除)', '执行现场'])
  })

  it('archived 的执行会话照常可达 —— 履历是"干过什么",不是"还开着什么"', () => {
    const archived: AgentSessionLike & { isArchived?: boolean } = {
      ...execSession('fe', 'room-1', 100),
      isArchived: true,
    }
    const result = history({
      presence: { ...EMPTY_PRESENCE, execSessionIds: [archived.id] },
      sessions: [room('room-1', '官网改版组'), archived],
    })

    expect(result.rooms.map(row => row.sessionId)).toEqual([archived.id])
  })
})

describe('履历页 · 私下', () => {
  it('只收双成员 dm 房;普通群在同一路 presence 里也不误收', () => {
    const pair: AgentSessionLike = {
      id: 'agent-dm-room-fe--qa',
      name: '小李 ⇄ 小研',
      kind: 'room',
      updatedAt: 400,
      room: { dm: true, memberAgentIds: ['fe', 'qa'] },
    }
    const group: AgentSessionLike = {
      id: 'room-1',
      name: '官网改版组',
      kind: 'room',
      updatedAt: 500,
      room: { memberAgentIds: ['fe', 'qa', 'pm'] },
    }

    const result = history({
      presence: { ...EMPTY_PRESENCE, roomSessionIds: ['room-1', 'agent-dm-room-fe--qa'] },
      sessions: [group, pair],
    })

    expect(result.pairDms.map(row => row.sessionId)).toEqual(['agent-dm-room-fe--qa'])
    expect(result.pairDms[0]!.readOnly).toBe(false)
  })

  it('P3 之前恒空 —— 空态照常成立', () => {
    const result = history({
      presence: { ...EMPTY_PRESENCE, roomSessionIds: ['room-1'] },
      sessions: [room('room-1', '官网改版组', 5)],
    })
    expect(result.pairDms).toEqual([])
  })
})

describe('履历页 · 干过的活', () => {
  function workSession(id: string, taskId: string, updatedAt: number): AgentSessionLike {
    return {
      id,
      name: '[任务] 修登录',
      kind: 'work',
      agentId: 'fe',
      updatedAt,
      collab: { roomSessionId: 'room-1', taskId },
    }
  }

  it('按卡分组,卡标题现查;组与组内都按最新在前', () => {
    const result = history({
      presence: { ...EMPTY_PRESENCE, workSessionIds: ['work-1', 'work-2', 'work-3'] },
      sessions: [
        workSession('work-1', 'task-aaaaaaaa-1', 100),
        workSession('work-2', 'task-aaaaaaaa-1', 300),
        workSession('work-3', 'task-bbbbbbbb-2', 200),
      ],
      taskTitle: taskId => (taskId === 'task-aaaaaaaa-1' ? '修登录' : ''),
    })

    expect(result.work.map(group => group.title)).toEqual(['修登录', '#task-bbb'])
    expect(result.work[0]!.rows.map(row => row.sessionId)).toEqual(['work-2', 'work-1'])
    expect(result.work.every(group => group.rows.every(row => row.readOnly))).toBe(true)
  })

  it('查不到标题就退到短号 —— 状态永远不进快照(Q4)', () => {
    const result = history({
      presence: { ...EMPTY_PRESENCE, workSessionIds: ['work-1'] },
      sessions: [workSession('work-1', 'abcdefghijkl', 1)],
    })
    expect(result.work[0]!.title).toBe('#abcdefgh')
  })

  it('没挂卡的工作台会话自成一组,不被折进别人的卡里', () => {
    const loner: AgentSessionLike = { id: 'work-x', kind: 'work', agentId: 'fe', updatedAt: 1 }
    const result = history({
      presence: { ...EMPTY_PRESENCE, workSessionIds: ['work-1', 'work-x'] },
      sessions: [workSession('work-1', 'task-1', 2), loner],
    })

    expect(result.work).toHaveLength(2)
    expect(result.work.map(group => group.rows.length)).toEqual([1, 1])
  })
})

describe('名字与头像回落', () => {
  it('takes the CURRENT roster name, not the name frozen into the session', () => {
    const session = execSession('fe', 'room-1', 1, '[执行] 旧名字')
    expect(resolveAgentSessionDisplay(session, roster)).toEqual({ name: '小李', avatar: '🔧' })
  })

  it('falls back to the session name minus its 「[执行] 」badge when the agent is gone', () => {
    const session = execSession('ghost', 'room-1', 1, '[执行] 小张')
    expect(resolveAgentSessionDisplay(session, roster).name).toBe('小张')
  })

  it('never borrows another agent\'s identity when the id does not resolve', () => {
    const display = resolveAgentSessionDisplay(execSession('ghost', 'room-1', 1, '[执行] 小张'), roster)
    expect(display.avatar).toBe(AGENT_SESSION_FALLBACK_AVATAR)
    expect(display.name).not.toBe('小李')
  })

  it('falls back to a stamp when the agent carries no emoji', () => {
    const display = resolveAgentSessionDisplay(execSession('pm', 'room-1', 1), [{ id: 'pm', name: '小王' }])
    expect(display).toMatchObject({ name: '小王', avatar: AGENT_SESSION_FALLBACK_AVATAR })
  })
})

describe('composer 禁用分支', () => {
  it('holds exactly for kind=agent — every other session keeps its composer', () => {
    expect(isAgentExecutionSession({ id: 'agent-exec-fe', kind: 'agent' })).toBe(true)
    expect(isAgentExecutionSession({ id: 'room-1', kind: 'room' })).toBe(false)
    expect(isAgentExecutionSession({ id: 'work-1', kind: 'work' })).toBe(false)
    expect(isAgentExecutionSession({ id: 'chat-1' })).toBe(false)
    expect(isAgentExecutionSession(null)).toBe(false)
    expect(isAgentExecutionSession(undefined)).toBe(false)
  })

  it('reads the kind, not the id — a session that kept its kind stays read-only', () => {
    expect(isAgentExecutionSession({ id: 'renamed-somehow', kind: 'agent' })).toBe(true)
    expect(isAgentExecutionSession({ id: 'agent-exec-fe', kind: 'chat' })).toBe(false)
  })
})
