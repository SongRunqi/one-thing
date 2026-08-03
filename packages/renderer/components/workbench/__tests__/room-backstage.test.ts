import { describe, expect, it } from 'vitest'
import {
  buildRoomBackstageSegments,
  fallbackRoomBackstageSegment,
  pickRoomBackstageSegment,
  resolveRightPanelForm,
  ROOM_BACKSTAGE_LABELS,
} from '../room-backstage'

const isUserDm = (session: { room?: { dm?: boolean; memberAgentIds?: string[] } | null }) =>
  session.room?.dm === true && (session.room.memberAgentIds?.length ?? 0) === 1

describe('resolveRightPanelForm — 右栏两形态', () => {
  it('房 → 背台;直聊 → 工具页签', () => {
    expect(resolveRightPanelForm({
      shellMode: 'workbench',
      session: { id: 'room-1', kind: 'room', room: { memberAgentIds: ['lin', 'che'] } },
      isUserDm,
    })).toEqual({ form: 'backstage', roomSessionId: 'room-1', isDm: false, dmAgentId: '' })

    expect(resolveRightPanelForm({
      shellMode: 'workbench',
      session: { id: 'chat-1', kind: 'chat' },
      isUserDm,
    }).form).toBe('tools')
  })

  it('私聊房 → 背台的两格形态,并带出那一个人', () => {
    expect(resolveRightPanelForm({
      shellMode: 'workbench',
      session: { id: 'dm-1', kind: 'room', room: { dm: true, memberAgentIds: ['lin'] } },
      isUserDm,
    })).toEqual({ form: 'backstage', roomSessionId: 'dm-1', isDm: true, dmAgentId: 'lin' })
  })

  it('classic 外壳恒是工具页签 —— 回滚闸下右栏一个字节不变', () => {
    expect(resolveRightPanelForm({
      shellMode: 'classic',
      session: { id: 'room-1', kind: 'room', room: { memberAgentIds: ['lin'] } },
      isUserDm,
    }).form).toBe('tools')
  })

  it('会话查不到 / 没有 kind 一律工具页签(不猜)', () => {
    expect(resolveRightPanelForm({ shellMode: 'workbench', session: null }).form).toBe('tools')
    expect(resolveRightPanelForm({ shellMode: 'workbench', session: { id: 'x' } }).form).toBe('tools')
  })
})

describe('buildRoomBackstageSegments — 固定几格', () => {
  it('群房恒四格,私聊房恒三格 —— 与内容无关', () => {
    const group = buildRoomBackstageSegments({ isDm: false })
    expect(group.map(segment => segment.key)).toEqual(['threads', 'members', 'board', 'schedule'])
    expect(group.map(segment => segment.label)).toEqual(['线程', '成员', '看板', '调度'])

    const dm = buildRoomBackstageSegments({ isDm: true })
    expect(dm.map(segment => segment.key)).toEqual(['threads', 'space', 'schedule'])
    expect(dm.map(segment => segment.label)).toEqual(['线程', '空间', '调度'])
  })

  /**
   * 「调度」两种形态都有(D8 §4.2):一间只有两个人的私聊房一样有租约、有闸、
   * 有死信,照样会卡住 —— 而在这一格之前那种卡住完全不可见。
   */
  it('私聊房也有调度格 —— 两个人的房照样会卡住', () => {
    expect(buildRoomBackstageSegments({ isDm: true }).some(segment => segment.key === 'schedule'))
      .toBe(true)
  })

  /**
   * 页签形态崩掉的第一个症状是"按需才开 → 看不到线程"。分段器的反面保证:
   * 一条线程、一个成员、一张卡都没有的房,四格照样在(空的是内容,不是入口)。
   */
  it('一条内容都没有时格子照样在', () => {
    expect(buildRoomBackstageSegments({ isDm: false, signals: {} })).toHaveLength(4)
  })

  it('标题不随内容变:亮不亮点都是同一组文案', () => {
    const quiet = buildRoomBackstageSegments({ isDm: false })
    const busy = buildRoomBackstageSegments({
      isDm: false,
      signals: {
        threadsRunning: true,
        boardAwaiting: true,
        membersUnread: true,
        scheduleFaulted: true,
      },
    })
    expect(busy.map(segment => segment.label)).toEqual(quiet.map(segment => segment.label))
    expect(quiet.map(segment => segment.label)).toEqual([
      ROOM_BACKSTAGE_LABELS.threads,
      ROOM_BACKSTAGE_LABELS.members,
      ROOM_BACKSTAGE_LABELS.board,
      ROOM_BACKSTAGE_LABELS.schedule,
    ])
  })

  it('状态点长在格子上:线程绿 / 成员墨 / 看板橙 / 调度红,静默时一颗不画', () => {
    const busy = buildRoomBackstageSegments({
      isDm: false,
      signals: {
        threadsRunning: true,
        boardAwaiting: true,
        membersUnread: true,
        scheduleFaulted: true,
      },
    })
    expect(busy.map(segment => segment.dot)).toEqual(['run', 'new', 'wait', 'fault'])
    expect(buildRoomBackstageSegments({ isDm: false }).map(segment => segment.dot))
      .toEqual([null, null, null, null])
  })

  // 死信与「待你」刻意不同档:等你放行是正常流程的一步,炸了不是。
  it('死信是自己一档(fault),不与看板的 wait 混成一个颜色', () => {
    const [, , board, schedule] = buildRoomBackstageSegments({
      isDm: false,
      signals: { boardAwaiting: true, scheduleFaulted: true },
    })
    expect(board.dot).toBe('wait')
    expect(schedule.dot).toBe('fault')
  })
})

describe('pickRoomBackstageSegment — 外部入口落在哪一格', () => {
  const group = buildRoomBackstageSegments({ isDm: false })
  const dm = buildRoomBackstageSegments({ isDm: true })

  it('请求的格在就是它', () => {
    expect(pickRoomBackstageSegment('board', group)).toBe('board')
    expect(pickRoomBackstageSegment('threads', dm)).toBe('threads')
  })

  it('私聊房请求「成员」→ 落到「空间」(同一个位置,换个名字)', () => {
    expect(pickRoomBackstageSegment('members', dm)).toBe('space')
    expect(pickRoomBackstageSegment('space', group)).toBe('members')
  })

  it('请求的格不存在 → null(原地不动,不把人甩到没要的视图上)', () => {
    expect(pickRoomBackstageSegment('board', dm)).toBeNull()
    expect(pickRoomBackstageSegment(undefined, group)).toBeNull()
  })
})

describe('fallbackRoomBackstageSegment — 形态变了不留死格', () => {
  it('当前格还在就不动,不在就回第一格', () => {
    const dm = buildRoomBackstageSegments({ isDm: true })
    expect(fallbackRoomBackstageSegment('threads', dm)).toBe('threads')
    expect(fallbackRoomBackstageSegment('board', dm)).toBe('threads')
  })
})
