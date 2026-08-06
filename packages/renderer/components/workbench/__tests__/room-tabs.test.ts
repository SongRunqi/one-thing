import { describe, expect, it } from 'vitest'
import {
  buildRoomFixedTabs,
  pickRoomFixedTab,
  resolveRoomPanelTarget,
  ROOM_TAB_LABELS,
} from '../room-tabs'

/**
 * 右栏收敛(2026-08-04,走查 F2c)之后的纯逻辑。
 *
 * 前身是 `room-backstage.ts` 的「分段器判定」。背台整体退役、四段内容搬进工作台
 * 页签之后,判定本身一条没变 —— 变的只是它算出来的东西叫"页签"不叫"格子",
 * 以及"两形态分岔"塌成了"这一面是不是一间房"。
 */
const isUserDm = (session: { room?: { dm?: boolean; memberAgentIds?: string[] } | null }) =>
  session.room?.dm === true && (session.room.memberAgentIds?.length ?? 0) === 1

describe('resolveRoomPanelTarget — 这一面对着哪一间房', () => {
  it('房 → 带房 id;直聊 → 不是房(不备固定页签组)', () => {
    expect(resolveRoomPanelTarget({
      session: { id: 'room-1', kind: 'room', room: { memberAgentIds: ['lin', 'che'] } },
      isUserDm,
    })).toEqual({ roomSessionId: 'room-1', isDm: false, dmAgentId: '' })

    expect(resolveRoomPanelTarget({
      session: { id: 'chat-1', kind: 'chat' },
      isUserDm,
    }).roomSessionId).toBe('')
  })

  it('私聊房带出那一个人', () => {
    expect(resolveRoomPanelTarget({
      session: { id: 'dm-1', kind: 'room', room: { dm: true, memberAgentIds: ['lin'] } },
      isUserDm,
    })).toEqual({ roomSessionId: 'dm-1', isDm: true, dmAgentId: 'lin' })
  })

  /**
   * 判据只剩「是不是一间房」这一条 —— 外壳形态那道门(classic 不备固定组)随
   * shellMode 于 2026-08-05 一起退役(product-two-forms-chatgpt-shell.md D2)。
   */
  it('会话查不到 / 没有 kind 一律不当成房(不猜)', () => {
    expect(resolveRoomPanelTarget({ session: null }).roomSessionId).toBe('')
    expect(resolveRoomPanelTarget({ session: { id: 'x' } }).roomSessionId).toBe('')
  })
})

describe('buildRoomFixedTabs — 固定几条', () => {
  it('群房恒四条,私聊房恒三条 —— 与内容无关', () => {
    const group = buildRoomFixedTabs({ isDm: false })
    expect(group.map(tab => tab.type)).toEqual(['thread', 'members', 'board', 'schedule'])
    expect(group.map(tab => tab.label)).toEqual(['线程', '成员', '看板', '调度'])

    const dm = buildRoomFixedTabs({ isDm: true })
    expect(dm.map(tab => tab.type)).toEqual(['thread', 'members', 'schedule'])
    expect(dm.map(tab => tab.label)).toEqual(['线程', '空间', '调度'])
  })

  /** 私聊房的「成员」就是「空间」—— 同一条页签,一对一没有成员表可言。 */
  it('私聊房没有看板 —— 那是干活现场的东西', () => {
    expect(buildRoomFixedTabs({ isDm: true }).some(tab => tab.type === 'board')).toBe(false)
  })

  /**
   * 「调度」两种形态都有(D8 §4.2):一间只有两个人的私聊房一样有租约、有闸、
   * 有死信,照样会卡住 —— 而在这一页之前那种卡住完全不可见。
   */
  it('私聊房也有调度页 —— 两个人的房照样会卡住', () => {
    expect(buildRoomFixedTabs({ isDm: true }).some(tab => tab.type === 'schedule')).toBe(true)
  })

  /**
   * 页签形态当初崩掉的第一个症状是"按需才开 → 看不到线程"。固定组的反面保证:
   * 一条线程、一个成员、一张卡都没有的房,四条照样在(空的是内容,不是入口)。
   */
  it('一条内容都没有时页签照样在', () => {
    expect(buildRoomFixedTabs({ isDm: false, signals: {} })).toHaveLength(4)
  })

  it('标题不随内容变:亮不亮点都是同一组文案', () => {
    const quiet = buildRoomFixedTabs({ isDm: false })
    const busy = buildRoomFixedTabs({
      isDm: false,
      signals: {
        threadsRunning: true,
        boardAwaiting: true,
        membersUnread: true,
        scheduleFaulted: true,
      },
    })
    expect(busy.map(tab => tab.label)).toEqual(quiet.map(tab => tab.label))
    expect(quiet.map(tab => tab.label)).toEqual([
      ROOM_TAB_LABELS.thread,
      ROOM_TAB_LABELS.members,
      ROOM_TAB_LABELS.board,
      ROOM_TAB_LABELS.schedule,
    ])
  })

  it('状态点长在页签上:线程绿 / 成员墨 / 看板橙 / 调度红,静默时一颗不画', () => {
    const busy = buildRoomFixedTabs({
      isDm: false,
      signals: {
        threadsRunning: true,
        boardAwaiting: true,
        membersUnread: true,
        scheduleFaulted: true,
      },
    })
    expect(busy.map(tab => tab.dot)).toEqual(['run', 'new', 'wait', 'fault'])
    expect(buildRoomFixedTabs({ isDm: false }).map(tab => tab.dot))
      .toEqual([null, null, null, null])
  })

  // 死信与「待你」刻意不同档:等你放行是正常流程的一步,炸了不是。
  it('死信是自己一档(fault),不与看板的 wait 混成一个颜色', () => {
    const [, , board, schedule] = buildRoomFixedTabs({
      isDm: false,
      signals: { boardAwaiting: true, scheduleFaulted: true },
    })
    expect(board.dot).toBe('wait')
    expect(schedule.dot).toBe('fault')
  })
})

describe('pickRoomFixedTab — 外部入口落在哪一条', () => {
  const group = buildRoomFixedTabs({ isDm: false })
  const dm = buildRoomFixedTabs({ isDm: true })

  it('请求的那条在就是它', () => {
    expect(pickRoomFixedTab('board', group)).toBe('board')
    expect(pickRoomFixedTab('thread', dm)).toBe('thread')
  })

  it('私聊房请求「成员」→ 就是那条叫「空间」的(同一条页签,换个名字)', () => {
    expect(pickRoomFixedTab('members', dm)).toBe('members')
    expect(dm.find(tab => tab.type === 'members')?.label).toBe(ROOM_TAB_LABELS.space)
  })

  it('请求的那条不存在 → null(原地不动,不把人甩到没要的视图上)', () => {
    expect(pickRoomFixedTab('board', dm)).toBeNull()
    expect(pickRoomFixedTab(undefined, group)).toBeNull()
  })
})
