import { describe, expect, it } from 'vitest'
import { buildDmPresence, buildRoomHead, buildRoomTopic } from '../room/room-head'
import type { CollabBoard } from '@shared/ipc'

/**
 * 房头两态的纯投影(去复用重构 R1,样板一/三)。
 *
 * 钉的是"房头不新增账":主题是看板在跑的活的一句话读法,私聊那行在忙什么读的
 * 是同一张看板 —— 拿不到就整句不画,绝不编。
 */
function board(tasks: Array<Partial<CollabBoard['tasks'][number]>>): CollabBoard {
  return {
    tasks: tasks.map((task, index) => ({
      id: task.id || `task-${index}`,
      title: task.title || '',
      status: task.status || 'doing',
      assigneeAgentId: task.assigneeAgentId,
      workSessionIds: task.workSessionIds || [],
      updatedAt: task.updatedAt ?? index,
      ...task,
    })),
  } as unknown as CollabBoard
}

describe('buildRoomTopic', () => {
  it('只收在跑的活(doing / review / blocked),按最近更新排,最多三张', () => {
    const topic = buildRoomTopic(board([
      { title: 'todo 的活', status: 'todo', updatedAt: 99 },
      { title: 'castlabs 换核', status: 'doing', updatedAt: 5 },
      { title: '多 profile 隔离', status: 'review', updatedAt: 4 },
      { title: '元素拾取', status: 'blocked', updatedAt: 3 },
      { title: '第四张', status: 'doing', updatedAt: 2 },
      { title: '已交付', status: 'done', updatedAt: 100 },
    ]))
    expect(topic).toBe('castlabs 换核 · 多 profile 隔离 · 元素拾取')
  })

  it('没有看板 / 没有在跑的活 = 空串(房头那一格不画)', () => {
    expect(buildRoomTopic(null)).toBe('')
    expect(buildRoomTopic(board([{ title: '待办', status: 'todo' }]))).toBe('')
  })
})

describe('buildDmPresence', () => {
  it('在忙 · 干什么 / 空闲', () => {
    expect(buildDmPresence({ taskId: 't', title: '编辑 session.ts', shortId: '#t', sessionId: 's' }))
      .toBe('在忙 · 编辑 session.ts')
    expect(buildDmPresence(null)).toBe('空闲')
  })
})

describe('buildRoomHead', () => {
  it('群聊态:# 房名 + 主题,没有 agent', () => {
    const head = buildRoomHead({
      sessionName: '浏览器重构',
      dmAgent: null,
      board: board([{ title: 'castlabs 换核', status: 'doing' }]),
    })
    expect(head.mode).toBe('group')
    expect(head.name).toBe('浏览器重构')
    expect(head.subtitle).toBe('castlabs 换核')
    expect(head.agent).toBeNull()
    expect(head.work).toBeNull()
  })

  it('私聊态:名字 + 在忙什么;只认真开过工作台的卡', () => {
    const head = buildRoomHead({
      sessionName: '小林',
      dmAgent: { id: 'a1', name: '小林', title: '架构' },
      board: board([
        { title: '没开工作台的活', status: 'doing', assigneeAgentId: 'a1', updatedAt: 9 },
        { title: '换核验证', status: 'doing', assigneeAgentId: 'a1', workSessionIds: ['w1', 'w2'], updatedAt: 5 },
      ]),
    })
    expect(head.mode).toBe('dm')
    expect(head.name).toBe('小林')
    expect(head.subtitle).toBe('在忙 · 换核验证')
    // 尾条 = 当前那次执行。
    expect(head.work?.sessionId).toBe('w2')
  })

  it('房名为空退到占位,不显示空标题', () => {
    expect(buildRoomHead({ sessionName: '  ', dmAgent: null, board: null }).name).toBe('未命名房间')
  })
})
