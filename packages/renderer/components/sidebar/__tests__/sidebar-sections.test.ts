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
  resolveRailBadges,
  resolveRailCategories,
  resolveRailCategory,
  shouldShowActiveWorkSection,
  takeRoomFaces,
} from '../sidebar-sections'

describe('rail 上有哪几类', () => {
  it('四类定序:进行中 / 群聊 / 联系人 / 会话', () => {
    expect(SIDEBAR_RAIL_CATEGORIES.map(category => category.id))
      .toEqual(['active', 'rooms', 'contacts', 'sessions'])
    expect(SIDEBAR_RAIL_CATEGORIES.map(category => category.label))
      .toEqual(['进行中', '群聊', '联系人', '会话'])
  })

  it('有活在跑时四类齐全', () => {
    expect(resolveRailCategories({ roomsEnabled: true, activeWorkCount: 2 }))
      .toEqual(['active', 'rooms', 'contacts', 'sessions'])
  })

  /**
   * 真机比对后改口径(2026-07-31):**四类恒在 rail 上**。
   *
   * 「没有活就整区不显示」是给*列表里的分区*定的 —— 空分区白占左栏最贵的纵向
   * 空间。到了 rail 上它不成立:图标不占列表空间,藏掉却有两个坏处 —— 活一起一停
   * rail 就上下跳(肌肉记忆没了);没活时还点不进去看「已交付」。
   * 空态改由面板内部说话(`.active-work-empty` 一行),不由 rail 决定去留。
   */
  it('没有在跑的活:「进行中」仍在 rail 上,空态由面板自己说', () => {
    expect(resolveRailCategories({ roomsEnabled: true, activeWorkCount: 0 }))
      .toEqual(['active', 'rooms', 'contacts', 'sessions'])
  })

  it('有活时同样是四类,顺序不随数据变', () => {
    expect(resolveRailCategories({ roomsEnabled: true, activeWorkCount: 5 }))
      .toEqual(['active', 'rooms', 'contacts', 'sessions'])
  })

  /**
   * web 端 `platformApi.capabilities.collabRooms` 为 false:进行中/群聊/联系人
   * 三类无源可吃,留在 rail 上就是三枚点不出东西的死图标。
   */
  it('web 降级:没有 rooms 能力时只留「会话」,不留死图标', () => {
    expect(resolveRailCategories({ roomsEnabled: false, activeWorkCount: 3 }))
      .toEqual(['sessions'])
  })
})

describe('当前类别', () => {
  const all = ['active', 'rooms', 'contacts', 'sessions'] as const

  it('存过什么就是什么', () => {
    expect(resolveRailCategory('contacts', all)).toBe('contacts')
  })

  it('没存过 / 存了读不懂的东西 → 第一个可用类别', () => {
    expect(resolveRailCategory(null, all)).toBe('active')
    expect(resolveRailCategory('', all)).toBe('active')
    // 旧版本那个键里装的是折叠态数组,形状完全不同 —— 读不懂就当没存过。
    expect(resolveRailCategory('["rooms","sessions"]', all)).toBe('active')
  })

  it('存的那类已经不在 rail 上(活干完了 / web 降级)→ 退到第一个可用的', () => {
    expect(resolveRailCategory('active', ['rooms', 'contacts', 'sessions'])).toBe('rooms')
    expect(resolveRailCategory('rooms', ['sessions'])).toBe('sessions')
  })

  it('一个可用类别都没有也不能崩(兜底到会话)', () => {
    expect(resolveRailCategory('rooms', [])).toBe('sessions')
  })

  it('落点是 localStorage 的一个键(本机视图偏好,不进 settings)', () => {
    expect(SIDEBAR_RAIL_STORAGE_KEY).toBe('onething:sidebar-rail-category')
  })
})

describe('徽标(该类有未读或在跑)', () => {
  it('四路信号各归各的,一枚点不摆数字', () => {
    expect(resolveRailBadges({ active: true, rooms: false, contacts: true, sessions: false }))
      .toEqual({ active: true, rooms: false, contacts: true, sessions: false })
  })

  it('全静时一枚都不亮', () => {
    expect(resolveRailBadges({ active: false, rooms: false, contacts: false, sessions: false }))
      .toEqual({ active: false, rooms: false, contacts: false, sessions: false })
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
