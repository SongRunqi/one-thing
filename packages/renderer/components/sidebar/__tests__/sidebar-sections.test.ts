/**
 * 左栏分区的纯逻辑(R4)。折叠态的存档格式、「进行中」的显隐、头像堆的截断 ——
 * 三件与 DOM 无关的判定钉在这里,组件那一层只验接线。
 */
import { describe, expect, it } from 'vitest'
import {
  SIDEBAR_ROOM_FACE_LIMIT,
  SIDEBAR_SECTION_IDS,
  parseCollapsedSections,
  serializeCollapsedSections,
  shouldShowActiveWorkSection,
  takeRoomFaces,
  toggleCollapsedSection,
} from '../sidebar-sections'

describe('折叠态的读写', () => {
  it('空/坏数据一律当作"什么都没收起来"', () => {
    expect([...parseCollapsedSections(null)]).toEqual([])
    expect([...parseCollapsedSections('')]).toEqual([])
    expect([...parseCollapsedSections('不是 JSON')]).toEqual([])
    // 数组之外的合法 JSON 也不认 —— 读不懂的偏好不该让左栏整片消失。
    expect([...parseCollapsedSections('{"rooms":true}')]).toEqual([])
  })

  it('未知 id 被滤掉(旧版本存下来的键不会把新左栏搞崩)', () => {
    expect([...parseCollapsedSections('["rooms","agent-groups","sessions"]')])
      .toEqual(['rooms', 'sessions'])
  })

  it('写回去按 SIDEBAR_SECTION_IDS 定序,存档可 diff', () => {
    expect(serializeCollapsedSections(new Set(['sessions', 'active-work'])))
      .toBe(JSON.stringify(['active-work', 'sessions']))
  })

  it('读写往返守恒', () => {
    const collapsed = new Set(SIDEBAR_SECTION_IDS)
    expect([...parseCollapsedSections(serializeCollapsedSections(collapsed))])
      .toEqual([...SIDEBAR_SECTION_IDS])
  })

  it('toggle 返回新 Set,不原地改(Vue 的响应式靠换引用)', () => {
    const before = new Set<'rooms'>(['rooms'])
    const after = toggleCollapsedSection(before, 'rooms')
    expect(after).not.toBe(before)
    expect(before.has('rooms')).toBe(true)
    expect(after.has('rooms')).toBe(false)
    expect(toggleCollapsedSection(after, 'rooms').has('rooms')).toBe(true)
  })
})

describe('「进行中」的显隐(2026-07-31 用户真机后拍板)', () => {
  it('没有在跑的活 = 整区不显示(推翻旧的「塌陷成一行」)', () => {
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
