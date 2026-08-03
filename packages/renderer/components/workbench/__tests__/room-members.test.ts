import { describe, expect, it } from 'vitest'
import type { CollabBoard, CollabTask } from '@shared/ipc'
import {
  buildRoomMemberEntries,
  type RoomMemberPresence,
} from '@/components/chat/room-member-strip'
import {
  ROOM_MEMBER_RETIRED_DETAIL,
  buildRoomPresenceGroups,
  countRoomPresenceMembers,
} from '../room-members'

/** agents 账那一口(由宿主注入)。不给就是全员空闲。 */
const presenceOf = (map: Record<string, RoomMemberPresence>) =>
  (agentId: string): RoomMemberPresence => map[agentId] ?? 'idle'

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
      presence: presenceOf({ lin: 'generating', che: 'working' }),
    })

    expect(groups.map(group => group.key)).toEqual(['busy', 'idle', 'retired'])
    expect(groups[0].members.map(member => member.name)).toEqual(['小林', '阿澈'])
    expect(groups[1].members.map(member => member.name)).toEqual(['砚'])
    expect(groups[2].members.map(member => member.name)).toEqual(['老石'])
  })

  /**
   * 口径换过一次(D8 §4.4):在忙判定读 agents 账,**不再**从看板 doing 卡现算。
   * 这两条断言是那次换口径的正反两面 —— 旧口径在两个方向上都会撒谎。
   */
  it('一张忘了收的 doing 卡不再让闲人亮着(旧口径的第一种谎)', () => {
    const groups = buildRoomPresenceGroups({
      entries: entriesFor(['lin']),
      board: board([task({ title: '编辑 session.ts', assigneeAgentId: 'lin' })]),
      presence: presenceOf({}),
    })
    expect(groups.map(group => group.key)).toEqual(['idle'])
    expect(groups[0].members[0].busy).toBe(false)
  })

  it('名下没有卡、却正在写字的人算在忙(旧口径的第二种谎)', () => {
    const groups = buildRoomPresenceGroups({
      entries: entriesFor(['lin']),
      board: board([]),
      presence: presenceOf({ lin: 'generating' }),
    })
    expect(groups.map(group => group.key)).toEqual(['busy'])
    expect(groups[0].members[0].detail).toBe('生成中')
  })

  it('v3 特有的「持牌等大脑」有自己的说法,不与「生成中」混成一格', () => {
    const groups = buildRoomPresenceGroups({
      entries: entriesFor(['lin']),
      board: board([]),
      presence: presenceOf({ lin: 'holding' }),
    })
    expect(groups[0].members[0]).toMatchObject({ presence: 'holding', detail: '持牌等大脑' })
  })

  // 看板仍然回答另一个问题:「TA 在做哪张卡」—— 那是行上的副文案与线程靶子。
  it('在场的说法优先于卡名,两样都有就都说', () => {
    const [busy] = buildRoomPresenceGroups({
      entries: entriesFor(['lin']),
      board: board([task({ title: '编辑 session.ts', assigneeAgentId: 'lin' })]),
      presence: presenceOf({ lin: 'working' }),
    })

    expect(busy.members[0].busy).toBe(true)
    expect(busy.members[0].detail).toBe('在干活 · 编辑 session.ts')
    expect(busy.members[0].work?.taskId).toBe('task-1')
  })

  it('没开过工作台的 doing 卡照样查得到(卡片查询这一档没变,不带 requireWorkSession)', () => {
    const [busy] = buildRoomPresenceGroups({
      entries: entriesFor(['lin']),
      board: board([task({ title: '编辑 session.ts', assigneeAgentId: 'lin', workSessionIds: [] })]),
      presence: presenceOf({ lin: 'working' }),
    })

    expect(busy.members[0].work?.taskId).toBe('task-1')
  })

  // 不给 presence = 显示"不知道"(全员空闲),而不是回落到那个会撒谎的旧口径。
  it('空闲的人副文案退到职务;没接上 agents 账时全员空闲', () => {
    const groups = buildRoomPresenceGroups({ entries: entriesFor(['yan']), board: null })

    expect(groups[0].key).toBe('idle')
    expect(groups[0].members[0].detail).toBe('资料')
    expect(groups[0].members[0].presence).toBe('idle')
  })

  it('已注销走墓碑语义:灰显但不消失,且永不被判成在忙', () => {
    const groups = buildRoomPresenceGroups({
      entries: entriesFor(['shi']),
      // 墓碑名下即使还挂着一张 doing 卡、账上还留着一份活动快照,他也不再"在忙"。
      board: board([task({ title: '老活', assigneeAgentId: 'shi' })]),
      presence: presenceOf({ shi: 'generating' }),
    })

    expect(groups.map(group => group.key)).toEqual(['retired'])
    expect(groups[0].members[0].busy).toBe(false)
    expect(groups[0].members[0].detail).toBe(ROOM_MEMBER_RETIRED_DETAIL)
    expect(groups[0].members[0].presence).toBe('idle')
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
      presence: presenceOf({ lin: 'generating' }),
    })
    expect(countRoomPresenceMembers(groups)).toBe(3)
  })
})
