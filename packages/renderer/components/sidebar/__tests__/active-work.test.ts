/**
 * 左栏「进行中」的判定(C1,docs/design/im-workbench-layout.md §3 W1 / §4 W-Q1)。
 *
 * 三件事各钉一遍:哪些卡进第一区(W-Q1)、状态标只有三档、跨房聚合的排序与
 * 补齐候选。判定全在纯函数里,所以这里喂的是假数据而不是 store。
 */
import { describe, expect, it } from 'vitest'
import type { CollabBoard, CollabTask } from '@shared/ipc'
import {
  ACTIVE_WORK_HYDRATION_LIMIT,
  activeWorkHydrationTargets,
  collectActiveWork,
  isActiveWorkStatus,
  resolveActiveWorkStage,
  resolveActiveWorkTag,
} from '../active-work'

function task(patch: Partial<CollabTask> & Pick<CollabTask, 'id' | 'status'>): CollabTask {
  return {
    rev: 1,
    title: '',
    createdBy: { type: 'user' },
    workSessionIds: [],
    rejections: 0,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  } as CollabTask
}

function board(tasks: CollabTask[]): CollabBoard {
  return { version: 1, tasks }
}

const IDENTITY = (agentId: string) => ({ name: agentId ? `名-${agentId}` : '未指派' })

describe('W-Q1:哪些卡算「在跑」', () => {
  it('只收 doing / review / blocked —— todo 是待办不是在做', () => {
    const statuses = (list: string[]) => list.map(s => s as CollabTask['status'])
    expect(statuses(['doing', 'review', 'blocked']).every(isActiveWorkStatus)).toBe(true)
    expect(statuses(['backlog', 'todo', 'done']).some(isActiveWorkStatus)).toBe(false)
  })

  it('聚合时 todo/backlog/done 一张都不进来', () => {
    const cards = collectActiveWork({
      boards: {
        'room-1': board([
          task({ id: 'a', status: 'doing' }),
          task({ id: 'b', status: 'todo' }),
          task({ id: 'c', status: 'done' }),
          task({ id: 'd', status: 'review' }),
          task({ id: 'e', status: 'blocked' }),
        ]),
      },
      identityOf: IDENTITY,
    })
    expect(cards.map(card => card.taskId).sort()).toEqual(['a', 'd', 'e'])
  })
})

describe('状态标只有三档', () => {
  it('doing → 执行中(绿)', () => {
    expect(resolveActiveWorkTag({ status: 'doing' })).toMatchObject({ tone: 'running', label: '执行中' })
  })

  it('review → 已交付(墨)', () => {
    expect(resolveActiveWorkTag({ status: 'review' })).toMatchObject({ tone: 'delivered', label: '已交付' })
  })

  it('blocked 不自成一档:归入待审批,blockReason 当补语挂出去', () => {
    const tag = resolveActiveWorkTag({ status: 'blocked', blockReason: '等 API key' })
    expect(tag.tone).toBe('awaiting')
    expect(tag.label).toBe('待审批')
    expect(tag.hint).toBe('等 API key')
  })

  it('blockReason 是空白就不编一句补语出来', () => {
    expect(resolveActiveWorkTag({ status: 'blocked', blockReason: '  ' }).hint).toBeUndefined()
  })

  it('doing 卡卡在权限上时改报待审批;拿不到这个信号就还是执行中', () => {
    expect(resolveActiveWorkTag({ status: 'doing' }, { awaitingPermission: true }).tone).toBe('awaiting')
    expect(resolveActiveWorkTag({ status: 'doing' }, { awaitingPermission: false }).tone).toBe('running')
  })
})

describe('进度是阶段刻度不是百分比', () => {
  it('领了活 → 开过工作台 → 有执行痕迹 → 交付,四档单调递增', () => {
    expect(resolveActiveWorkStage(task({ id: 'a', status: 'doing' }))).toBe('assigned')
    expect(resolveActiveWorkStage(task({ id: 'a', status: 'doing', workSessionIds: ['w1'] }))).toBe('started')
    expect(resolveActiveWorkStage(task({
      id: 'a',
      status: 'doing',
      workSessionIds: ['w1'],
      report: { summary: '', evidence: { toolCounts: { edit: 3 } } },
    }))).toBe('producing')
    expect(resolveActiveWorkStage(task({ id: 'a', status: 'review' }))).toBe('delivered')
  })

  it('blocked 停在停下来的那一档上,不因为卡住而更完成或更不完成', () => {
    const before = resolveActiveWorkStage(task({ id: 'a', status: 'doing', workSessionIds: ['w1'] }))
    const after = resolveActiveWorkStage(task({ id: 'a', status: 'blocked', workSessionIds: ['w1'] }))
    expect(after).toBe(before)
  })

  it('空 evidence 不算执行痕迹', () => {
    expect(resolveActiveWorkStage(task({
      id: 'a',
      status: 'doing',
      workSessionIds: ['w1'],
      report: { summary: '', evidence: { toolCounts: {}, files: [] } },
    }))).toBe('started')
  })
})

describe('跨房聚合', () => {
  it('活是主体房是属性:多房摊平后按 updatedAt 倒序,不按房分组', () => {
    const cards = collectActiveWork({
      boards: {
        'room-1': board([task({ id: 'old', status: 'doing', updatedAt: 10 })]),
        'room-2': board([task({ id: 'new', status: 'doing', updatedAt: 30 })]),
        'room-3': board([task({ id: 'mid', status: 'review', updatedAt: 20 })]),
      },
      identityOf: IDENTITY,
    })
    expect(cards.map(card => card.taskId)).toEqual(['new', 'mid', 'old'])
    expect(cards.map(card => card.roomSessionId)).toEqual(['room-2', 'room-3', 'room-1'])
  })

  it('房已经不在会话列表里就不画卡 —— 点开一间不存在的房是死链', () => {
    const cards = collectActiveWork({
      boards: { 'room-gone': board([task({ id: 'a', status: 'doing' })]) },
      identityOf: IDENTITY,
      isKnownRoom: () => false,
    })
    expect(cards).toEqual([])
  })

  it('负责人身份走 displayAgent 投影:查无此人照渲染墓碑,不冒充 default', () => {
    const cards = collectActiveWork({
      boards: { 'room-1': board([task({ id: 'a', status: 'doing', assigneeAgentId: 'gone' })]) },
      identityOf: () => ({ name: '已注销' }),
    })
    expect(cards[0].assigneeName).toBe('已注销')
  })

  it('没写标题就退到短号,`workSessionId` 取尾条(C3 右栏线程的靶)', () => {
    const cards = collectActiveWork({
      boards: {
        'room-1': board([task({ id: 'abcdefgh1234', status: 'doing', workSessionIds: ['w1', 'w2'] })]),
      },
      identityOf: IDENTITY,
    })
    expect(cards[0].title).toBe('#abcdefgh')
    expect(cards[0].workSessionId).toBe('w2')
  })

  it('一个人压着两张 doing 卡时,只有最新那张算「此刻在干的」', () => {
    const cards = collectActiveWork({
      boards: {
        'room-1': board([
          task({ id: 'old', status: 'doing', assigneeAgentId: 'fe', updatedAt: 10 }),
          task({ id: 'new', status: 'doing', assigneeAgentId: 'fe', updatedAt: 20 }),
        ]),
      },
      identityOf: IDENTITY,
    })
    expect(cards.find(c => c.taskId === 'new')?.isAssigneeCurrent).toBe(true)
    expect(cards.find(c => c.taskId === 'old')?.isAssigneeCurrent).toBe(false)
  })

  it('待审批覆盖只认这张卡自己的尾条工作台会话', () => {
    const cards = collectActiveWork({
      boards: {
        'room-1': board([
          task({ id: 'a', status: 'doing', workSessionIds: ['w-blocked'] }),
          task({ id: 'b', status: 'doing', workSessionIds: ['w-free'] }),
        ]),
      },
      identityOf: IDENTITY,
      awaitingPermission: sessionId => sessionId === 'w-blocked',
    })
    expect(cards.find(c => c.taskId === 'a')?.tag.tone).toBe('awaiting')
    expect(cards.find(c => c.taskId === 'b')?.tag.tone).toBe('running')
  })
})

describe('定向补齐:不为了聚合把每间房都拉一遍', () => {
  const sessions = [
    { id: 'room-1', kind: 'room', updatedAt: 100 },
    { id: 'room-2', kind: 'room', updatedAt: 100 },
    { id: 'chat-1', kind: 'chat', updatedAt: 999 },
    { id: 'w-1', kind: 'work', updatedAt: 10, collab: { roomSessionId: 'room-1' } },
    { id: 'w-2', kind: 'work', updatedAt: 40, collab: { roomSessionId: 'room-2' } },
    { id: 'a-1', kind: 'agent', updatedAt: 50, collab: { roomSessionId: 'room-1' } },
  ]

  it('候选只来自开过工作台的房 —— 没干过活的房一次都不拉', () => {
    expect(activeWorkHydrationTargets({ sessions })).toEqual(['room-1', 'room-2'])
  })

  it('按房里最近一次活动排序(room-1 的 agent 会话比 room-2 新)', () => {
    const targets = activeWorkHydrationTargets({ sessions })
    expect(targets[0]).toBe('room-1')
  })

  it('已经在 store 里的板不重复拉', () => {
    expect(activeWorkHydrationTargets({ sessions, loadedRoomIds: ['room-1'] })).toEqual(['room-2'])
  })

  it('房没了就别去拉它的板', () => {
    expect(activeWorkHydrationTargets({ sessions, isKnownRoom: id => id === 'room-2' })).toEqual(['room-2'])
  })

  it('有上限,冷启不会变成 N 次 IPC', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `w-${i}`,
      kind: 'work',
      updatedAt: i,
      collab: { roomSessionId: `room-${i}` },
    }))
    expect(activeWorkHydrationTargets({ sessions: many })).toHaveLength(ACTIVE_WORK_HYDRATION_LIMIT)
    expect(activeWorkHydrationTargets({ sessions: many, limit: 3 })).toEqual(['room-39', 'room-38', 'room-37'])
  })
})
