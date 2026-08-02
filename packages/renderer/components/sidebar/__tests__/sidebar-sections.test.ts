/**
 * 左栏分区的纯逻辑(方案三 · rail + 单类面板)。rail 上有哪几类、当前类怎么定、
 * 徽标怎么判、头像堆截到几枚 —— 四件与 DOM 无关的判定钉在这里,组件那一层只
 * 验接线。
 *
 * R4 的「分区折叠」(四区各自可收起 + 折叠态存档)已随类别切换一起退役,
 * 那几组测试连同被测函数一并删除。
 */
import { describe, expect, it } from 'vitest'
import {
  SIDEBAR_RAIL_CATEGORIES,
  SIDEBAR_RAIL_STORAGE_KEY,
  SIDEBAR_ROOM_FACE_LIMIT,
  migrateRailCategory,
  resolveRailBadges,
  resolveRailCategories,
  resolveRailCategory,
  shouldShowActiveWorkSection,
  takeRoomFaces,
} from '../sidebar-sections'

const ALL = ['recent', 'active', 'contacts', 'sessions'] as const

describe('rail 上有哪几类', () => {
  /**
   * 2026-08-01 改口径:四格从**按类型分列**改成**按意图分列**。
   * 「消息」在最前且是默认停靠的一类 —— 打开 app 先看见的是最近说过话的人,
   * 而不是一本按类型排的花名册。
   */
  it('四类定序:消息 / 进行中 / 通讯录 / 会话', () => {
    expect(SIDEBAR_RAIL_CATEGORIES.map(category => category.id)).toEqual([...ALL])
    expect(SIDEBAR_RAIL_CATEGORIES.map(category => category.label))
      .toEqual(['消息', '进行中', '通讯录', '会话'])
  })

  it('桌面端四类恒在(rail 不随数据增删图标)', () => {
    expect(resolveRailCategories({ roomsEnabled: true })).toEqual([...ALL])
  })

  /**
   * web 端 `platformApi.capabilities.collabRooms` 为 false:消息/进行中/通讯录
   * 三类无源可吃(私聊与群都是房),留在 rail 上就是三枚点不出东西的死图标。
   */
  it('web 降级:没有 rooms 能力时只留「会话」,不留死图标', () => {
    expect(resolveRailCategories({ roomsEnabled: false })).toEqual(['sessions'])
  })
})

describe('当前类别', () => {
  it('存过什么就是什么', () => {
    expect(resolveRailCategory('contacts', ALL)).toBe('contacts')
  })

  it('没存过 / 存了读不懂的东西 → 第一个可用类别', () => {
    expect(resolveRailCategory(null, ALL)).toBe('recent')
    expect(resolveRailCategory('', ALL)).toBe('recent')
    // 旧版本那个键里装的是折叠态数组,形状完全不同 —— 读不懂就当没存过。
    expect(resolveRailCategory('["rooms","sessions"]', ALL)).toBe('recent')
  })

  /** 「群聊」并进了通讯录:停在那一类的人下次开 app 该落在通讯录,不是被退回。 */
  it('旧存档 rooms → 通讯录', () => {
    expect(migrateRailCategory('rooms')).toBe('contacts')
    expect(migrateRailCategory('contacts')).toBe('contacts')
    expect(migrateRailCategory(null)).toBe(null)
    expect(resolveRailCategory('rooms', ALL)).toBe('contacts')
  })

  it('存的那类已经不在 rail 上(web 降级)→ 退到第一个可用的', () => {
    expect(resolveRailCategory('recent', ['sessions'])).toBe('sessions')
    expect(resolveRailCategory('contacts', ['sessions'])).toBe('sessions')
  })

  it('一个可用类别都没有也不能崩(兜底到会话)', () => {
    expect(resolveRailCategory('recent', [])).toBe('sessions')
  })

  it('落点是 localStorage 的一个键(本机视图偏好,不进 settings)', () => {
    expect(SIDEBAR_RAIL_STORAGE_KEY).toBe('onething:sidebar-rail-category')
  })
})

describe('徽标', () => {
  /**
   * **一条未读只催一次**。「消息」装房(群 + 私聊)、「会话」装直聊,两堆不重叠,
   * 各自亮各自的不会重复报数;而「通讯录」的每一行要么已经在消息流里、要么根本
   * 没聊过 —— 它替谁报都是第二遍,所以恒不亮。
   */
  it('房的未读落「消息」,直聊的未读落「会话」,通讯录恒不亮', () => {
    expect(resolveRailBadges({
      available: ALL, unreadConversations: true, unreadChatSessions: false, activeWork: false,
    })).toEqual({ recent: true, active: false, contacts: false, sessions: false })

    expect(resolveRailBadges({
      available: ALL, unreadConversations: false, unreadChatSessions: true, activeWork: false,
    })).toEqual({ recent: false, active: false, contacts: false, sessions: true })
  })

  it('在跑落在「进行中」,与未读互不干涉', () => {
    expect(resolveRailBadges({
      available: ALL, unreadConversations: false, unreadChatSessions: false, activeWork: true,
    })).toEqual({ recent: false, active: true, contacts: false, sessions: false })
  })

  /** web 端没有房这一路,rail 上也没有「消息」—— 两路未读一起落到唯一那条列表。 */
  it('web 降级:未读全落「会话」,不会无处可报', () => {
    expect(resolveRailBadges({
      available: ['sessions'], unreadConversations: true, unreadChatSessions: false, activeWork: false,
    })).toEqual({ recent: false, active: false, contacts: false, sessions: true })
  })

  it('全静时一枚都不亮', () => {
    expect(resolveRailBadges({
      available: ALL, unreadConversations: false, unreadChatSessions: false, activeWork: false,
    })).toEqual({ recent: false, active: false, contacts: false, sessions: false })
  })
})

describe('「进行中」的显隐(2026-07-31 用户真机后拍板)', () => {
  it('没有在跑的活 = 不显示(推翻旧的「塌陷成一行」)', () => {
    expect(shouldShowActiveWorkSection({ cardCount: 0 })).toBe(false)
  })

  it('有一张卡就露面', () => {
    expect(shouldShowActiveWorkSection({ cardCount: 1 })).toBe(true)
  })
})

describe('群聊行头像堆的截断', () => {
  const entries = ['a', 'b', 'c', 'd', 'e']

  it('默认截三枚,余量报数', () => {
    expect(SIDEBAR_ROOM_FACE_LIMIT).toBe(3)
    expect(takeRoomFaces(entries)).toEqual({ faces: ['a', 'b', 'c'], overflow: 2 })
  })

  it('不足额不报余量(不画 +0)', () => {
    expect(takeRoomFaces(['a'])).toEqual({ faces: ['a'], overflow: 0 })
    expect(takeRoomFaces([])).toEqual({ faces: [], overflow: 0 })
  })

  it('limit 为 0 时一枚不画,全部记进余量', () => {
    expect(takeRoomFaces(entries, 0)).toEqual({ faces: [], overflow: 5 })
  })
})
