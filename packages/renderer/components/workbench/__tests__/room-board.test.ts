import { describe, expect, it } from 'vitest'
import type { CollabTask } from '@shared/ipc'
import { buildRoomBoardGroups, hasRoomBoardAwaiting } from '../room-board'

const NOW = new Date('2026-08-01T10:00:00').getTime()

function task(partial: Partial<CollabTask> & { id: string }): CollabTask {
  return {
    rev: 1,
    title: '',
    status: 'todo',
    createdBy: { type: 'user' },
    workSessionIds: [],
    rejections: 0,
    createdAt: 0,
    updatedAt: NOW,
    ...partial,
  } as CollabTask
}

const identity = (agentId: string) => (agentId === 'lin'
  ? { name: '小林', avatar: '🧭' }
  : { name: '已注销', status: 'retired' })

describe('buildRoomBoardGroups — 窄栏行式看板', () => {
  it('「待你」永远置顶,受阻与等你放行都算待你', () => {
    const groups = buildRoomBoardGroups({
      tasks: [
        task({ id: 'done-1', title: '交了', status: 'done', assigneeAgentId: 'lin' }),
        task({ id: 'doing-1', title: '在做', status: 'doing', assigneeAgentId: 'lin', workSessionIds: ['work-1'] }),
        task({ id: 'todo-1', title: '待办', status: 'todo', assigneeAgentId: 'lin' }),
        task({ id: 'blocked-1', title: '受阻', status: 'blocked', blockReason: '要你裁决', assigneeAgentId: 'lin' }),
        task({ id: 'ask-1', title: '等放行', status: 'doing', assigneeAgentId: 'lin', workSessionIds: ['work-2'] }),
      ],
      identity,
      awaitingPermission: workSessionId => workSessionId === 'work-2',
      now: NOW,
    })

    expect(groups.map(group => group.key)).toEqual(['awaiting', 'doing', 'todo', 'delivered'])
    expect(groups[0].label).toBe('待你')
    expect(groups[0].rows.map(row => row.taskId).sort()).toEqual(['ask-1', 'blocked-1'])
    expect(groups[1].rows.map(row => row.taskId)).toEqual(['doing-1'])
  })

  it('待你那一行副文说「等你什么」——不去解析中文里的工具名', () => {
    const groups = buildRoomBoardGroups({
      tasks: [
        task({ id: 'blocked-1', title: '受阻', status: 'blocked', blockReason: '要你裁决' }),
        task({ id: 'ask-1', title: '等放行', status: 'doing', workSessionIds: ['work-2'] }),
      ],
      identity,
      awaitingPermission: () => true,
      now: NOW,
    })
    const detail = new Map(groups[0].rows.map(row => [row.taskId, row.detail]))
    expect(detail.get('blocked-1')).toBe('要你裁决')
    expect(detail.get('ask-1')).toBe('等你放行')
  })

  it('其余行的副文:有执行记录就说记录,没有就说它在哪一列', () => {
    const groups = buildRoomBoardGroups({
      tasks: [
        task({
          id: 'done-1',
          title: '交了',
          status: 'done',
          report: { summary: '', evidence: { toolCounts: { write: 1, read: 2 } } },
        }),
        task({ id: 'todo-1', title: '待办', status: 'todo' }),
      ],
      identity,
      now: NOW,
    })
    const rows = groups.flatMap(group => group.rows)
    expect(rows.find(row => row.taskId === 'done-1')?.detail).toBe('read×2, write×1')
    expect(rows.find(row => row.taskId === 'todo-1')?.detail).toBe('待办')
  })

  it('署名走 displayAgent:查无此人是墓碑行,不冒充别人', () => {
    const [group] = buildRoomBoardGroups({
      tasks: [task({ id: 'gone-1', title: '孤儿卡', status: 'doing', assigneeAgentId: 'ghost' })],
      identity,
      now: NOW,
    })
    expect(group.rows[0].name).toBe('已注销')
    expect(group.rows[0].isRetired).toBe(true)
  })

  it('没开过工作台的卡点不动(workSessionId 为空)', () => {
    const [group] = buildRoomBoardGroups({
      tasks: [task({ id: 'doing-1', title: '还没开工', status: 'doing' })],
      identity,
      now: NOW,
    })
    expect(group.rows[0].workSessionId).toBe('')
  })

  it('空段整段不画,空板返回空表', () => {
    expect(buildRoomBoardGroups({ tasks: [], identity, now: NOW })).toEqual([])
  })

  it('段内按 updatedAt 倒序,同刻按 taskId 定序(排序必须稳定)', () => {
    const [group] = buildRoomBoardGroups({
      tasks: [
        task({ id: 'b', title: 'B', status: 'doing', updatedAt: 5 }),
        task({ id: 'a', title: 'A', status: 'doing', updatedAt: 5 }),
        task({ id: 'c', title: 'C', status: 'doing', updatedAt: 9 }),
      ],
      identity,
      now: NOW,
    })
    expect(group.rows.map(row => row.taskId)).toEqual(['c', 'a', 'b'])
  })
})

describe('hasRoomBoardAwaiting — 看板格那枚橙点', () => {
  it('只回答有没有,与置顶那一撮同一条判定', () => {
    expect(hasRoomBoardAwaiting({ tasks: [task({ id: 'doing-1', status: 'doing' })] })).toBe(false)
    expect(hasRoomBoardAwaiting({ tasks: [task({ id: 'blocked-1', status: 'blocked' })] })).toBe(true)
    expect(hasRoomBoardAwaiting({
      tasks: [task({ id: 'doing-1', status: 'doing', workSessionIds: ['work-1'] })],
      awaitingPermission: () => true,
    })).toBe(true)
  })
})
