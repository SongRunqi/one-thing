/**
 * 左栏「消息」类的纯逻辑 —— 一条时间序的对话流。
 *
 * 钉三件:**只装对话**(群 + 私聊,直聊会话不在此列)、混排排序(置顶在前、
 * 时间倒序、未读不插队)、以及每一行的头像来源。
 */
import { describe, expect, it } from 'vitest'
import { buildRecentEntries, roomInitial } from '../sidebar-recent'

describe('装什么', () => {
  /**
   * 2026-08-01 用户第二次划线:「要么是群聊,要么是和某个 Agent 的聊天,
   * 它不是所有的」。入参**只开两路** —— 直聊会话与 agent ⇄ agent 的「私下」房
   * 都没有入口可进,这条测试钉的是那两路的缺席。
   */
  it('入参只有私聊房与群房两路', () => {
    const keys = ['dmRooms', 'groupRooms']
    const list = buildRecentEntries(
      Object.fromEntries(keys.map(key => [key, [{ id: key }]])) as never,
    )
    expect(list.map(entry => entry.id)).toEqual(['dmRooms', 'groupRooms'])
    // 多塞一路进去也进不来(类型层已经拦住,这里钉运行时同样不认)。
    expect(buildRecentEntries({ chats: [{ id: 's-1' }] } as never)).toEqual([])
  })
})

describe('混排与排序', () => {
  it('群与私聊同轴,按时间倒序 —— 不按对象类型分列', () => {
    const list = buildRecentEntries({
      dmRooms: [
        { id: 'dm-fe', name: '小李', updatedAt: 30, room: { memberAgentIds: ['fe'] } },
        { id: 'dm-be', name: '小王', updatedAt: 60, room: { memberAgentIds: ['be'] } },
      ],
      groupRooms: [
        { id: 'room-1', name: '一组', updatedAt: 50 },
        { id: 'room-2', name: '二组', updatedAt: 10 },
      ],
    })
    expect(list.map(entry => entry.id))
      .toEqual(['dm-be', 'room-1', 'dm-fe', 'room-2'])
    expect(list.map(entry => entry.kind))
      .toEqual(['dm', 'group', 'dm', 'group'])
  })

  it('置顶永远在前,置顶之间仍按时间', () => {
    const list = buildRecentEntries({
      groupRooms: [
        { id: 'a', updatedAt: 90 },
        { id: 'b', updatedAt: 10, isPinned: true },
        { id: 'c', updatedAt: 20, isPinned: true },
      ],
    })
    expect(list.map(entry => entry.id)).toEqual(['c', 'b', 'a'])
  })

  /**
   * 未读**不**插队:IM 里未读是一枚点,不是排序权。把未读顶上去,列表会在别人
   * 说话时自己跳动 —— "刚才那行在哪"是这张表唯一要守住的东西。
   * (未读信息压根不进这个纯函数,这条测试钉的是它的缺席。)
   */
  it('入参里没有未读这一路 —— 排序不认它', () => {
    const list = buildRecentEntries({ groupRooms: [{ id: 'a', updatedAt: 1 }] })
    expect(Object.keys(list[0]).includes('unread')).toBe(false)
  })

  it('时间戳打平时按 id 定序(每次重算不换顺序)', () => {
    const first = buildRecentEntries({ groupRooms: [{ id: 'b' }, { id: 'a' }] })
    const second = buildRecentEntries({ groupRooms: [{ id: 'a' }, { id: 'b' }] })
    expect(first.map(e => e.id)).toEqual(['a', 'b'])
    expect(second.map(e => e.id)).toEqual(['a', 'b'])
  })

  it('同一个 id 只画一行(形态判定万一失手也不出双行)', () => {
    const list = buildRecentEntries({
      dmRooms: [{ id: 'x', room: { memberAgentIds: ['fe'] } }],
      groupRooms: [{ id: 'x' }],
    })
    expect(list).toHaveLength(1)
    expect(list[0].kind).toBe('dm')
  })

  /** 房是手工建出来的,天然几十条量级;而这里是它们唯一的时间序入口,不截断。 */
  it('不截断 —— 有多少间房就画多少行', () => {
    const many = Array.from({ length: 60 }, (_, index) => ({ id: `room-${index}` }))
    expect(buildRecentEntries({ groupRooms: many })).toHaveLength(60)
  })

  it('空表不崩', () => {
    expect(buildRecentEntries({})).toEqual([])
  })
})

describe('头像取谁', () => {
  it('私聊取房里那一个成员;群不取人', () => {
    const list = buildRecentEntries({
      dmRooms: [{ id: 'dm', updatedAt: 3, room: { memberAgentIds: ['fe', '不该有第二个'] } }],
      groupRooms: [{ id: 'g', updatedAt: 1 }],
    })
    expect(list.map(entry => entry.agentId)).toEqual(['fe', ''])
  })
})

describe('群行那枚方章', () => {
  it('取群名第一个字', () => {
    expect(roomInitial('一组')).toBe('一')
    expect(roomInitial('  前端组 ')).toBe('前')
  })

  /** `name[0]` 会把 emoji 拆成半个代理对,渲染成一个替换字符。 */
  it('emoji 群名取整枚,不拆代理对', () => {
    expect(roomInitial('🚀 发射组')).toBe('🚀')
  })

  it('没名字时给一个 #(空章比空白好认)', () => {
    expect(roomInitial('')).toBe('#')
    expect(roomInitial('   ')).toBe('#')
  })
})
