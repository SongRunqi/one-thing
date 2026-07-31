import { describe, expect, it } from 'vitest'
import type { CollabBoard, CollabTask } from '@shared/ipc'
import { buildRoomMemberEntries } from '@/components/chat/room-member-strip'
import {
  ROOM_MEMBER_RETIRED_DETAIL,
  buildRoomPresenceGroups,
  countRoomPresenceMembers,
} from '../room-members'

function task(overrides: Partial<CollabTask>): CollabTask {
  return {
    id: 'task-1',
    title: '',
    status: 'doing',
    assigneeAgentId: '',
    workSessionIds: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as CollabTask
}

function board(tasks: CollabTask[]): CollabBoard {
  return { roomSessionId: 'room-1', tasks, updatedAt: 0 } as unknown as CollabBoard
}

const AGENTS = [
  { id: 'lin', name: '小林', title: '架构' },
  { id: 'che', name: '阿澈', title: '测试' },
  { id: 'yan', name: '砚', title: '资料' },
  { id: 'shi', name: '老石', title: '前端', status: 'retired' as const },
]

function entriesFor(ids: string[]) {
  return buildRoomMemberEntries({ memberAgentIds: ids, agents: AGENTS })
}

describe('buildRoomPresenceGroups', () => {
  it('按在忙 / 空闲 / 已注销分三段,段头顺序固定', () => {
    const groups = buildRoomPresenceGroups({
      entries: entriesFor(['lin', 'che', 'yan', 'shi']),
      board: board([
        task({ id: 'a', title: '编辑 session.ts', assigneeAgentId: 'lin' }),
        task({ id: 'b', title: '跑测试', assigneeAgentId: 'che' }),
      ]),
    })

    expect(groups.map(group => group.key)).toEqual(['busy', 'idle', 'retired'])
    expect(groups[0].members.map(member => member.name)).toEqual(['小林', '阿澈'])
    expect(groups[1].members.map(member => member.name)).toEqual(['砚'])
    expect(groups[2].members.map(member => member.name)).toEqual(['老石'])
  })

  it('在忙那一行的副文案是卡标题(与左栏活卡片同一份 findAgentDoingTask)', () => {
    const [busy] = buildRoomPresenceGroups({
      entries: entriesFor(['lin']),
      board: board([task({ title: '编辑 session.ts', assigneeAgentId: 'lin' })]),
    })

    expect(busy.members[0].busy).toBe(true)
    expect(busy.members[0].detail).toBe('编辑 session.ts')
    expect(busy.members[0].work?.taskId).toBe('task-1')
  })

  it('没开过工作台的 doing 卡照样算在忙(不带 requireWorkSession,与左栏同档)', () => {
    const groups = buildRoomPresenceGroups({
      entries: entriesFor(['lin']),
      board: board([task({ title: '编辑 session.ts', assigneeAgentId: 'lin', workSessionIds: [] })]),
    })

    expect(groups.map(group => group.key)).toEqual(['busy'])
  })

  it('空闲的人副文案退到职务;看板没加载时全员空闲', () => {
    const groups = buildRoomPresenceGroups({ entries: entriesFor(['yan']), board: null })

    expect(groups[0].key).toBe('idle')
    expect(groups[0].members[0].detail).toBe('资料')
  })

  it('已注销走墓碑语义:灰显但不消失,且永不被判成在忙', () => {
    const groups = buildRoomPresenceGroups({
      entries: entriesFor(['shi']),
      // 墓碑名下即使还挂着一张 doing 卡,他也不再"在忙" —— 他不会再说话了。
      board: board([task({ title: '老活', assigneeAgentId: 'shi' })]),
    })

    expect(groups.map(group => group.key)).toEqual(['retired'])
    expect(groups[0].members[0].busy).toBe(false)
    expect(groups[0].members[0].detail).toBe(ROOM_MEMBER_RETIRED_DETAIL)
  })

  it('查无此人也照旧出一行(墓碑名 = 已注销),不静默丢弃', () => {
    const groups = buildRoomPresenceGroups({ entries: entriesFor(['ghost']), board: null })

    expect(groups[0].key).toBe('retired')
    expect(groups[0].members[0].name).toBe('已注销')
  })

  it('空段整段不画', () => {
    const groups = buildRoomPresenceGroups({ entries: entriesFor(['yan']), board: null })
    expect(groups).toHaveLength(1)
  })

  it('countRoomPresenceMembers 数的是三段之和', () => {
    const groups = buildRoomPresenceGroups({
      entries: entriesFor(['lin', 'yan', 'shi']),
      board: board([task({ assigneeAgentId: 'lin', title: '活' })]),
    })
    expect(countRoomPresenceMembers(groups)).toBe(3)
  })
})
