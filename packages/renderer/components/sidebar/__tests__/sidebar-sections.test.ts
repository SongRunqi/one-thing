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

const ALL = ['recent', 'active', 'contacts'] as const

describe('rail 上有哪几类', () => {
  /**
   * 2026-08-01 改口径:四格从**按类型分列**改成**按意图分列**。
   * 「消息」在最前且是默认停靠的一类 —— 打开 app 先看见的是最近说过话的人,
   * 而不是一本按类型排的花名册。
   */
  /**
   * 2026-08-05(U3):第四格「会话」搬走了 —— 直聊列表升成了对话形态,归顶部
   * 的形态切换器管。rail 自此是协作形态专属的三格。
   * 见 docs/design/product-two-forms-chatgpt-shell.md D6。
   */
  it('三类定序:消息 / 进行中 / 通讯录', () => {
    expect(SIDEBAR_RAIL_CATEGORIES.map(category => category.id)).toEqual([...ALL])
    expect(SIDEBAR_RAIL_CATEGORIES.map(category => category.label))
      .toEqual(['消息', '进行中', '通讯录'])
  })

  it('桌面端三类恒在(rail 不随数据增删图标)', () => {
    expect(resolveRailCategories({ roomsEnabled: true })).toEqual([...ALL])
  })

  /**
   * web 端 `platformApi.capabilities.collabRooms` 为 false:协作形态整个不存在
   * (私聊与群都是房),rail 一格都不画。
   */
  it('web 降级:没有 rooms 能力时 rail 一格都不画', () => {
    expect(resolveRailCategories({ roomsEnabled: false })).toEqual([])
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

  it('存的那类已经不在 rail 上 → 退到第一个可用的', () => {
    // 'sessions' 是 U3 搬去对话形态的那一格,存档里还会有 —— 不认它,退回首格。
    expect(resolveRailCategory('sessions', ALL)).toBe('recent')
    expect(resolveRailCategory('recent', ['contacts'])).toBe('contacts')
  })

  it('一个可用类别都没有也不能崩(兜底到消息)', () => {
    expect(resolveRailCategory('recent', [])).toBe('recent')
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
  it('房的未读落「消息」,通讯录恒不亮', () => {
    expect(resolveRailBadges({
      available: ALL, unreadConversations: true, activeWork: false,
    })).toEqual({ recent: true, active: false, contacts: false })
  })

  it('在跑落在「进行中」,与未读互不干涉', () => {
    expect(resolveRailBadges({
      available: ALL, unreadConversations: false, activeWork: true,
    })).toEqual({ recent: false, active: true, contacts: false })
  })

  /** 直聊的未读归对话形态,落在形态切换器上 —— rail 不替它报(U3)。 */
  it('rail 上没有「消息」时,房的未读也不会挪到别的格上去', () => {
    expect(resolveRailBadges({
      available: [], unreadConversations: true, activeWork: false,
    })).toEqual({ recent: false, active: false, contacts: false })
  })

  it('全静时一枚都不亮', () => {
    expect(resolveRailBadges({
      available: ALL, unreadConversations: false, activeWork: false,
    })).toEqual({ recent: false, active: false, contacts: false })
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
