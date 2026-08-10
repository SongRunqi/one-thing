/**
 * 命令式出口(G5, 2026-08-11)。
 *
 * 内核算术本身由 compute-position.test.ts 钉着,这里只钉**出口的形状**:
 * 一个可以直接 Object.assign 到 `element.style` 上的对象,以及它与
 * `computePosition` 逐字段一致(出口不许自己再算一遍)。
 */
import { describe, expect, it } from 'vitest'
import {
  computeFloatingStyle,
  computePosition,
  elementAnchorRect,
} from '../compute-position'

const VIEWPORT = { width: 1000, height: 800 }
const ANCHOR = { x: 400, y: 300, width: 100, height: 20 }
const BOX = { width: 200, height: 120 }

describe('elementAnchorRect', () => {
  it('reads left/top as x/y — the step a hand-rolled host gets wrong', () => {
    const element = {
      getBoundingClientRect: () => ({ left: 40, top: 90, width: 12, height: 18 }) as DOMRect,
    }
    expect(elementAnchorRect(element)).toEqual({ x: 40, y: 90, width: 12, height: 18 })
  })
})

describe('computeFloatingStyle', () => {
  it('is the same numbers computePosition gives, in style form', () => {
    const expected = computePosition(ANCHOR, BOX, VIEWPORT, { placement: 'top-start', offset: 8 })
    const { position, style } = computeFloatingStyle(ANCHOR, BOX, {
      viewport: VIEWPORT,
      placement: 'top-start',
      offset: 8,
    })
    expect(position).toEqual(expected)
    expect(style).toEqual({
      position: 'fixed',
      left: `${expected.x}px`,
      top: `${expected.y}px`,
    })
  })

  it('writes a z-index only when one is asked for', () => {
    const bare = computeFloatingStyle(ANCHOR, BOX, { viewport: VIEWPORT })
    expect('zIndex' in bare.style).toBe(false)

    const stacked = computeFloatingStyle(ANCHOR, BOX, { viewport: VIEWPORT, zIndex: 'var(--z-max)' })
    expect(stacked.style.zIndex).toBe('var(--z-max)')
  })

  it('flips and clamps like everything else — a box that cannot fit above goes below', () => {
    const nearTop = { x: 400, y: 10, width: 100, height: 20 }
    const { position, style } = computeFloatingStyle(nearTop, BOX, {
      viewport: VIEWPORT,
      placement: 'top-start',
      offset: 8,
      margin: 12,
    })
    expect(position.side).toBe('bottom')
    expect(position.flipped).toBe(true)
    expect(style.top).toBe(`${10 + 20 + 8}px`)
  })

  it('keeps a box off the right edge (the classic hand-rolled bug)', () => {
    const nearRight = { x: 960, y: 300, width: 20, height: 20 }
    const { style } = computeFloatingStyle(nearRight, BOX, {
      viewport: VIEWPORT,
      placement: 'bottom-start',
      margin: 12,
    })
    // 1000 - 200 - 12
    expect(style.left).toBe('788px')
  })

  it('falls back to a zero viewport when there is no window (non-browser host)', () => {
    const { style } = computeFloatingStyle(ANCHOR, BOX, { placement: 'bottom-start', margin: 12 })
    expect(style.position).toBe('fixed')
    expect(style.left).toBe('12px')
  })
})
