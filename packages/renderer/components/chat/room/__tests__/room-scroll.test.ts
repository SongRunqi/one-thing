import { describe, expect, it } from 'vitest'
import {
  repairTailLedgerAfterPrepend,
  shouldShowRoomScrollToBottom,
} from '../room-scroll'
import { SHOW_SCROLL_TO_BOTTOM_DISTANCE_PX } from '@/composables/useFollowScroll'

/**
 * 真机走查:私聊面**已经滚到最底部**,右下角那颗「回到底部」圆钮仍然显示。
 *
 * 根因不在几何,而在分页台账:向上补一页历史会把 `hasMoreAfter` 写成 `true`
 * 并永久留在那儿,而按钮是 `hasMoreAfter || …` 强制点亮的。这一组把两半都钉住
 * ——「到底即灭」的语义,和「向上补页不许改写向下那一边」的修补规则。
 */

/** 真尾:scrollTop 已经等于最大可滚距离(留白也算在里面)。 */
const atBottom = { scrollHeight: 2000, clientHeight: 500, scrollTop: 1500 }

describe('shouldShowRoomScrollToBottom', () => {
  it('到底 + 这扇窗就是真尾 → 灭(这次修的主语义)', () => {
    expect(shouldShowRoomScrollToBottom(atBottom, true, false)).toBe(false)
    // 跟随态与否都一样:距离是 0,没有"回到底部"可回。
    expect(shouldShowRoomScrollToBottom(atBottom, false, false)).toBe(false)
  })

  it('底部留白不改判定:内容与最大滚距同量增长,真尾仍然是距离 0', () => {
    const reserve = 240
    const withReserve = {
      scrollHeight: atBottom.scrollHeight + reserve,
      clientHeight: atBottom.clientHeight,
      scrollTop: atBottom.scrollTop + reserve,
    }
    expect(shouldShowRoomScrollToBottom(withReserve, false, false)).toBe(false)
  })

  it('用户在上面看历史 → 亮(阈值沿用共用件那一份)', () => {
    const scrolledUp = {
      scrollHeight: 2000,
      clientHeight: 500,
      scrollTop: 1500 - (SHOW_SCROLL_TO_BOTTOM_DISTANCE_PX + 1),
    }
    expect(shouldShowRoomScrollToBottom(scrolledUp, false, false)).toBe(true)
  })

  it('刚好在阈值上不亮,越过一像素才亮(边界与旧壳同一条)', () => {
    const onThreshold = {
      scrollHeight: 2000,
      clientHeight: 500,
      scrollTop: 1500 - SHOW_SCROLL_TO_BOTTOM_DISTANCE_PX,
    }
    expect(shouldShowRoomScrollToBottom(onThreshold, false, false)).toBe(false)
  })

  it('跟随态下永远不亮:它正贴着底走', () => {
    const scrolledUp = { scrollHeight: 2000, clientHeight: 500, scrollTop: 200 }
    expect(shouldShowRoomScrollToBottom(scrolledUp, true, false)).toBe(false)
  })

  it('这扇窗没到对话末尾 → 即使到了窗底也亮(回真尾的唯一入口,不能连它一起关掉)', () => {
    expect(shouldShowRoomScrollToBottom(atBottom, true, true)).toBe(true)
  })
})

describe('repairTailLedgerAfterPrepend', () => {
  const tail = { hasMoreAfter: false, backwardsCursor: 'cursor:tail' }

  it('补页把 hasMoreAfter 写成 true(存储层对更旧那一页一律这么答)→ 还原', () => {
    const patch = repairTailLedgerAfterPrepend(tail, {
      hasMoreAfter: true,
      backwardsCursor: 'cursor:middle',
    })
    expect(patch).toEqual(tail)
  })

  it('两栏都没被动过 → 不写空账', () => {
    expect(repairTailLedgerAfterPrepend(tail, { ...tail })).toBeNull()
  })

  it('本来就在截断窗口里(搜索跳转)→ 还原的是 true,不会把回真尾的入口关掉', () => {
    const truncated = { hasMoreAfter: true, backwardsCursor: 'cursor:hit' }
    const patch = repairTailLedgerAfterPrepend(truncated, {
      hasMoreAfter: true,
      backwardsCursor: 'cursor:older-page',
    })
    expect(patch).toEqual(truncated)
  })

  it('补页前没有台账(第一页还没回来)→ 什么都不做', () => {
    expect(repairTailLedgerAfterPrepend(null, { hasMoreAfter: true, backwardsCursor: null })).toBeNull()
    expect(repairTailLedgerAfterPrepend(tail, null)).toBeNull()
  })
})
