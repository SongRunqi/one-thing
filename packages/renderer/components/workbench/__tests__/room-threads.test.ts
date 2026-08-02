import { describe, expect, it } from 'vitest'
import {
  ROOM_THREAD_AGENT_DETAIL,
  ROOM_THREAD_DM_DETAIL,
  ROOM_THREAD_WORK_FALLBACK,
  buildRoomPairDmRows,
  buildRoomThreadRows,
  groupRoomThreadRows,
  hasRunningRoomThread,
  type RoomThreadIdentity,
  type RoomThreadSessionLike,
} from '../room-threads'

const NOW = new Date('2026-08-01T15:00:00').getTime()

const ROSTER: Record<string, RoomThreadIdentity> = {
  lin: { name: '小林', avatar: '🐟' },
  che: { name: '阿澈', avatarImage: 'data:image/png;base64,x' },
  shi: { name: '老石', status: 'retired' },
}

/** displayAgent 的语义:查无此人给墓碑,绝不冒充 default agent。 */
function identity(agentId: string): RoomThreadIdentity {
  return ROSTER[agentId] ?? { name: '已注销', status: 'retired' }
}

function session(overrides: Partial<RoomThreadSessionLike> & { id: string }): RoomThreadSessionLike {
  return {
    kind: 'work',
    agentId: 'lin',
    updatedAt: NOW - 60_000,
    collab: { roomSessionId: 'room-1' },
    ...overrides,
  }
}

function build(
  sessions: RoomThreadSessionLike[],
  options: Partial<Parameters<typeof buildRoomThreadRows>[0]> = {},
) {
  return buildRoomThreadRows({
    roomSessionId: 'room-1',
    sessions,
    identity,
    now: NOW,
    ...options,
  })
}

describe('buildRoomThreadRows', () => {
  it('只收这间房的执行会话 —— 归属读 collab.roomSessionId,不反解 id 字符串', () => {
    const rows = build([
      session({ id: 'agent-exec-lin-room-1', kind: 'agent' }),
      session({ id: 'agent-exec-lin-room-9', kind: 'agent', collab: { roomSessionId: 'room-9' } }),
      session({ id: 'work-1', collab: { roomSessionId: 'room-1', taskId: 'task-1' } }),
      // 房间会话自己、直聊、没有归属指针的历史会话都不是"执行会话"
      session({ id: 'room-1', kind: 'room', collab: null }),
      session({ id: 'chat-1', kind: 'chat', collab: null }),
      session({ id: 'orphan', collab: null }),
    ])

    expect(rows.map(row => row.sessionId)).toEqual(['agent-exec-lin-room-1', 'work-1'])
  })

  it('没有房间就没有表(空态由呈现层画,不是错误)', () => {
    expect(build([session({ id: 'work-1' })], { roomSessionId: '' })).toEqual([])
  })

  it('按 updatedAt 倒序;同刻按 id 定序(排序必须稳定)', () => {
    const rows = build([
      session({ id: 'work-old', updatedAt: NOW - 7 * 86_400_000 }),
      session({ id: 'work-new', updatedAt: NOW - 1000 }),
      session({ id: 'work-b', updatedAt: NOW - 5000 }),
      session({ id: 'work-a', updatedAt: NOW - 5000 }),
    ])

    expect(rows.map(row => row.sessionId)).toEqual(['work-new', 'work-a', 'work-b', 'work-old'])
  })

  it('work 行的副文是卡标题(看板那一份),agent 行是「服务房间对话」', () => {
    const rows = build(
      [
        session({ id: 'work-1', collab: { roomSessionId: 'room-1', taskId: 'task-1' }, updatedAt: NOW - 1000 }),
        session({ id: 'agent-exec-che-room-1', kind: 'agent', agentId: 'che', updatedAt: NOW - 2000 }),
      ],
      { taskTitle: taskId => (taskId === 'task-1' ? 'castlabs 换核验证' : '') },
    )

    expect(rows[0]).toMatchObject({ kind: 'work', detail: 'castlabs 换核验证', taskId: 'task-1' })
    expect(rows[1]).toMatchObject({ kind: 'agent', detail: ROOM_THREAD_AGENT_DETAIL, taskId: '' })
  })

  it('卡查不到标题就退回会话名,会话名也没有才给兜底 —— 不编造卡名', () => {
    const rows = build([
      session({ id: 'work-1', name: '工作台 · 元素拾取', collab: { roomSessionId: 'room-1', taskId: 'gone' }, updatedAt: NOW - 1000 }),
      session({ id: 'work-2', name: '', collab: { roomSessionId: 'room-1', taskId: 'gone' }, updatedAt: NOW - 2000 }),
    ])

    expect(rows[0].detail).toBe('工作台 · 元素拾取')
    expect(rows[1].detail).toBe(ROOM_THREAD_WORK_FALLBACK)
  })

  it('署名走 displayAgent:头像/名字照抄,已注销的行打墓碑标记', () => {
    const rows = build([
      session({ id: 'work-1', agentId: 'che', updatedAt: NOW - 1000 }),
      session({ id: 'work-2', agentId: 'shi', updatedAt: NOW - 2000 }),
      session({ id: 'work-3', agentId: 'ghost', updatedAt: NOW - 3000 }),
    ])

    expect(rows[0]).toMatchObject({ name: '阿澈', isRetired: false, avatarImage: 'data:image/png;base64,x' })
    expect(rows[1]).toMatchObject({ name: '老石', isRetired: true })
    expect(rows[2]).toMatchObject({ name: '已注销', isRetired: true })
  })

  it('在跑的行右端是"跑了多久",停着的是"最后动过的时间" —— 与左栏活卡片同一句法', () => {
    const rows = build(
      [
        session({ id: 'work-running', updatedAt: NOW - 12 * 60_000 }),
        session({ id: 'work-idle', updatedAt: NOW - 30 * 60_000 }),
      ],
      { isRunning: sessionId => sessionId === 'work-running' },
    )

    expect(rows[0]).toMatchObject({ sessionId: 'work-running', running: true, meta: '12m' })
    expect(rows[1]).toMatchObject({ sessionId: 'work-idle', running: false, meta: '14:30' })
  })

  it('没给 isRunning 就一条都不算在跑(不假报)', () => {
    expect(build([session({ id: 'work-1' })])[0].running).toBe(false)
  })
})

/**
 * 分组「正在跑 / 今天 / 更早」(房间背台,right-panel.html 一 · 线程)。
 *
 * 纯时间倒序在 15 条线程的房里没有重心 —— 在跑的那一条会沉在「今天」中间。
 */
describe('groupRoomThreadRows — 在跑的置顶', () => {
  function rowsOf(sessions: RoomThreadSessionLike[], running: string[] = []) {
    return buildRoomThreadRows({
      roomSessionId: 'room-1',
      sessions,
      identity,
      isRunning: sessionId => running.includes(sessionId),
      now: NOW,
    })
  }

  it('三段:在跑的恒置顶,其余按今天 / 更早分', () => {
    const rows = rowsOf(
      [
        session({ id: 'old-1', updatedAt: NOW - 3 * 24 * 60 * 60_000 }),
        session({ id: 'today-1', updatedAt: NOW - 60 * 60_000 }),
        // 在跑但时间戳最旧 —— 它照样得排在最上面
        session({ id: 'run-1', updatedAt: NOW - 5 * 24 * 60 * 60_000 }),
      ],
      ['run-1'],
    )
    const groups = groupRoomThreadRows(rows, NOW)

    expect(groups.map(group => group.key)).toEqual(['running', 'today', 'earlier'])
    expect(groups.map(group => group.label)).toEqual(['正在跑', '今天', '更早'])
    expect(groups[0].rows.map(row => row.sessionId)).toEqual(['run-1'])
    expect(groups[1].rows.map(row => row.sessionId)).toEqual(['today-1'])
    expect(groups[2].rows.map(row => row.sessionId)).toEqual(['old-1'])
  })

  it('空段整段不画 —— 样板里没有「今天 — 0」这种行', () => {
    const groups = groupRoomThreadRows(rowsOf([session({ id: 'today-1' })]), NOW)
    expect(groups.map(group => group.key)).toEqual(['today'])
  })

  it('组内顺序照抄入参(已按 updatedAt 倒序),这里只分桶', () => {
    const rows = rowsOf([
      session({ id: 'today-a', updatedAt: NOW - 60_000 }),
      session({ id: 'today-b', updatedAt: NOW - 120_000 }),
    ])
    expect(groupRoomThreadRows(rows, NOW)[0].rows.map(row => row.sessionId))
      .toEqual(['today-a', 'today-b'])
  })

  it('没有 updatedAt 的行归「更早」——不知道什么时候动过的东西不冒充今天', () => {
    const rows = rowsOf([session({ id: 'stray', updatedAt: 0 })])
    expect(groupRoomThreadRows(rows, NOW)[0].key).toBe('earlier')
  })
})

describe('hasRunningRoomThread — 线程格那枚绿点', () => {
  it('只回答有没有,而且与列表层同一条归属判定(不反解 id)', () => {
    const sessions = [
      session({ id: 'work-1' }),
      // 另一间房的执行会话在跑,不该点亮这间房
      session({ id: 'work-9', collab: { roomSessionId: 'room-9' } }),
    ]
    expect(hasRunningRoomThread({
      roomSessionId: 'room-1',
      sessions,
      isRunning: sessionId => sessionId === 'work-9',
    })).toBe(false)
    expect(hasRunningRoomThread({
      roomSessionId: 'room-1',
      sessions,
      isRunning: sessionId => sessionId === 'work-1',
    })).toBe(true)
  })

  it('没有房就不亮(空串不当通配)', () => {
    expect(hasRunningRoomThread({
      roomSessionId: '',
      sessions: [session({ id: 'work-1' })],
      isRunning: () => true,
    })).toBe(false)
  })
})


/**
 * 「私下」—— 这间房两位成员之间的私聊房(2026-08-01 用户要求:「线程里面我最好
 * 能够看到他们的私聊的 session」)。
 *
 * 归属只能由**名册**回答:私下房是按人对建的(id 由两个 agentId 字典序派生),
 * 它不隶属于任何一间房。所以判据是"双方都在这间房的花名册上"。
 */
describe('buildRoomPairDmRows — 房里的「私下」', () => {
  const pair = (id: string, members: string[], updatedAt = NOW - 60_000, name = '') => ({
    id, name, updatedAt, room: { memberAgentIds: members },
  })

  function build(
    pairDmRooms: ReturnType<typeof pair>[],
    options: Partial<Parameters<typeof buildRoomPairDmRows>[0]> = {},
  ) {
    return buildRoomPairDmRows({
      memberAgentIds: ['lin', 'che', 'shi'],
      pairDmRooms,
      identity,
      now: NOW,
      ...options,
    })
  }

  it('双方都在名册上才算这间房的私下', () => {
    const rows = build([
      pair('dm-lin-che', ['lin', 'che']),
      // 一位成员和屋外某人的私聊不是这间房的事 —— 列进来就是把别处的对话
      // 安到这间房头上。
      pair('dm-lin-out', ['lin', 'outsider']),
      pair('dm-out-out', ['outsider', 'another']),
    ])
    expect(rows.map(row => row.sessionId)).toEqual(['dm-lin-che'])
  })

  it('行是两个人的:两张脸、无署名人、副文说「私下对话」', () => {
    const [row] = build([pair('dm-lin-che', ['lin', 'che'])])
    expect(row.kind).toBe('dm')
    expect(row.agentId).toBe('')
    expect(row.detail).toBe(ROOM_THREAD_DM_DETAIL)
    expect(row.faces?.map(face => face.agentId)).toEqual(['lin', 'che'])
    expect(row.faces?.[0].avatar).toBe('🐟')
    expect(row.faces?.[1].avatarImage).toBe('data:image/png;base64,x')
  })

  it('房名现成就用房名,拿不到才用两位的名字拼', () => {
    expect(build([pair('dm-1', ['lin', 'che'], NOW, '小林 ⇄ 阿澈')])[0].name)
      .toBe('小林 ⇄ 阿澈')
    expect(build([pair('dm-1', ['lin', 'che'])])[0].name).toBe('小林 ⇄ 阿澈')
  })

  it('墓碑:两位都退休了才整行灰显(还有一位在,这段对话就还活着)', () => {
    expect(build([pair('dm-1', ['lin', 'shi'])])[0].isRetired).toBe(false)
    expect(build([pair('dm-1', ['shi', 'shi2'])], {
      memberAgentIds: ['shi', 'shi2'],
      identity: () => ({ name: '已注销', status: 'retired' }),
    })[0].isRetired).toBe(true)
  })

  it('有人正在说话 = 绿点(读的仍是 isSessionGenerating,不是第二本账)', () => {
    const [row] = build([pair('dm-1', ['lin', 'che'])], { isRunning: id => id === 'dm-1' })
    expect(row.running).toBe(true)
  })

  it('按 updatedAt 倒序,同刻按 id 定序', () => {
    const rows = build([
      pair('dm-b', ['lin', 'che'], NOW - 10),
      pair('dm-a', ['lin', 'shi'], NOW - 10),
      pair('dm-c', ['che', 'shi'], NOW),
    ])
    expect(rows.map(row => row.sessionId)).toEqual(['dm-c', 'dm-a', 'dm-b'])
  })

  it('名册不足两人 / 房不是双成员 —— 一行都不出', () => {
    expect(build([pair('dm-1', ['lin', 'che'])], { memberAgentIds: ['lin'] })).toEqual([])
    expect(build([pair('dm-1', ['lin'])])).toEqual([])
  })
})

describe('groupRoomThreadRows — 私下自成一段', () => {
  const row = (patch: Partial<Parameters<typeof groupRoomThreadRows>[0][number]>) => ({
    sessionId: 's', agentId: 'lin', kind: 'work' as const, taskId: '', name: '', avatar: '',
    isRetired: false, detail: '', updatedAt: NOW, meta: '', running: false, ...patch,
  })

  /**
   * 私下**不按时间混进**执行那三段:它不是"一次执行",而是一段还在继续的对话。
   * 混进去,"这间房跑过哪几次活"这条主线就被冲散了。
   */
  it('私下恒在最后一段,连在跑的也不上浮', () => {
    const groups = groupRoomThreadRows([
      row({ sessionId: 'dm-1', kind: 'dm', running: true }),
      row({ sessionId: 'w-1', running: true }),
      row({ sessionId: 'w-2', updatedAt: NOW - 5 * 86_400_000 }),
    ], NOW)
    expect(groups.map(group => group.label)).toEqual(['正在跑', '更早', '私下'])
    expect(groups[2].rows.map(r => r.sessionId)).toEqual(['dm-1'])
  })

  it('一间私下房都没有时不画那一段', () => {
    const groups = groupRoomThreadRows([row({ sessionId: 'w-1' })], NOW)
    expect(groups.map(group => group.key)).toEqual(['today'])
  })
})
