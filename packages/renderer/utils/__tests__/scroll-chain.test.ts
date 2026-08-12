// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  chainWheelToScrollableAncestor,
  findScrollableWheelSource,
} from '../scroll-chain'

function setScrollGeometry(
  element: HTMLElement,
  geometry: { scrollTop?: number; scrollHeight: number; clientHeight: number },
) {
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: geometry.scrollHeight,
  })
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: geometry.clientHeight,
  })
  element.scrollTop = geometry.scrollTop ?? 0
}

function wheel(deltaY: number): WheelEvent {
  return new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY,
  })
}

/** outer(可滚) > inner(可滚),inner 的几何由参数给。 */
function nestedScrollers(innerScrollTop: number) {
  const outer = document.createElement('div')
  const inner = document.createElement('div')
  outer.style.overflowY = 'auto'
  inner.style.overflowY = 'auto'
  outer.append(inner)
  document.body.append(outer)
  setScrollGeometry(outer, { scrollTop: 120, scrollHeight: 1000, clientHeight: 300 })
  setScrollGeometry(inner, { scrollTop: innerScrollTop, scrollHeight: 400, clientHeight: 200 })
  return { outer, inner }
}

describe('scroll-chain', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('passes downward wheel motion to a scrollable ancestor at the child bottom edge', () => {
    const outer = document.createElement('div')
    const inner = document.createElement('div')
    outer.style.overflowY = 'auto'
    inner.style.overflowY = 'auto'
    outer.append(inner)
    document.body.append(outer)
    setScrollGeometry(outer, { scrollTop: 120, scrollHeight: 1000, clientHeight: 300 })
    setScrollGeometry(inner, { scrollTop: 200, scrollHeight: 400, clientHeight: 200 })

    const event = wheel(40)

    expect(chainWheelToScrollableAncestor(event, inner)).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    expect(outer.scrollTop).toBe(160)
  })

  it('keeps wheel motion in the child while it can still scroll', () => {
    const outer = document.createElement('div')
    const inner = document.createElement('div')
    outer.style.overflowY = 'auto'
    inner.style.overflowY = 'auto'
    outer.append(inner)
    document.body.append(outer)
    setScrollGeometry(outer, { scrollTop: 120, scrollHeight: 1000, clientHeight: 300 })
    setScrollGeometry(inner, { scrollTop: 100, scrollHeight: 400, clientHeight: 200 })

    const event = wheel(40)

    expect(chainWheelToScrollableAncestor(event, inner)).toBe(false)
    expect(event.defaultPrevented).toBe(false)
    expect(outer.scrollTop).toBe(120)
  })

  it('finds the nearest scrollable wheel source inside a component boundary', () => {
    const boundary = document.createElement('section')
    const scroller = document.createElement('div')
    const child = document.createElement('pre')
    boundary.style.overflowY = 'visible'
    scroller.style.overflowY = 'auto'
    scroller.append(child)
    boundary.append(scroller)
    document.body.append(boundary)
    setScrollGeometry(boundary, { scrollHeight: 300, clientHeight: 300 })
    setScrollGeometry(scroller, { scrollHeight: 500, clientHeight: 200 })

    const event = wheel(20)
    child.dispatchEvent(event)

    expect(findScrollableWheelSource(event, boundary)).toBe(scroller)
  })

  // 到边闩:面板内容滚完的那一瞬间,整个消息列表不许跟着窜出去。
  it('swallows the overflow when a running gesture reaches the child edge', () => {
    const { outer, inner } = nestedScrollers(100)

    // 手势第一发:面板自己还能滚,不接管。
    expect(chainWheelToScrollableAncestor(wheel(40), inner)).toBe(false)

    // 同一手势的下一发,此时面板已经到底。
    inner.scrollTop = 200
    vi.advanceTimersByTime(30)
    const atEdge = wheel(40)

    expect(chainWheelToScrollableAncestor(atEdge, inner)).toBe(true)
    expect(atEdge.defaultPrevented).toBe(true)
    expect(outer.scrollTop).toBe(120)
  })

  it('releases to the ancestor only after the gesture pauses', () => {
    const { outer, inner } = nestedScrollers(100)

    chainWheelToScrollableAncestor(wheel(40), inner)
    inner.scrollTop = 200
    vi.advanceTimersByTime(30)
    chainWheelToScrollableAncestor(wheel(40), inner)
    expect(outer.scrollTop).toBe(120)

    // 停顿后再滚 = 新手势:这才是"我要滚外面"。
    vi.advanceTimersByTime(400)
    const next = wheel(40)
    expect(chainWheelToScrollableAncestor(next, inner)).toBe(true)
    expect(next.defaultPrevented).toBe(true)
    expect(outer.scrollTop).toBe(160)
  })

  it('treats a direction reversal as a new gesture', () => {
    const { outer, inner } = nestedScrollers(100)

    // 向下滚到底,闩住。
    chainWheelToScrollableAncestor(wheel(40), inner)
    inner.scrollTop = 200
    vi.advanceTimersByTime(30)
    chainWheelToScrollableAncestor(wheel(40), inner)
    expect(outer.scrollTop).toBe(120)

    // 方向一变就是新手势,不吃闩 —— 哪怕没停顿。
    inner.scrollTop = 0
    vi.advanceTimersByTime(30)
    expect(chainWheelToScrollableAncestor(wheel(-40), inner)).toBe(true)
    expect(outer.scrollTop).toBe(80)
  })

  // 死区回归护栏:压根滚不动的盒子永远不闩,交回原生 —— 否则短内容面板会变成
  // 滚轮黑洞(2026-08-06 那次 `overscroll-behavior: contain` 事故的形状)。
  it('never latches a box that cannot scroll at all', () => {
    const outer = document.createElement('div')
    const inner = document.createElement('div')
    outer.style.overflowY = 'auto'
    inner.style.overflowY = 'auto'
    outer.append(inner)
    document.body.append(outer)
    setScrollGeometry(outer, { scrollTop: 120, scrollHeight: 1000, clientHeight: 300 })
    setScrollGeometry(inner, { scrollHeight: 200, clientHeight: 200 })

    for (let i = 0; i < 3; i += 1) {
      const event = wheel(40)
      expect(chainWheelToScrollableAncestor(event, inner)).toBe(false)
      expect(event.defaultPrevented).toBe(false)
      vi.advanceTimersByTime(30)
    }
  })
})
