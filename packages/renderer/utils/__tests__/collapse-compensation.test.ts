// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  beginCollapseCompensation,
  computeCollapseCompensation,
  measureCollapseAnchor,
} from '../collapse-compensation'

/**
 * 造一个"够用的元素":只有补偿逻辑真正会碰的那几个面 —— getBoundingClientRect
 * 与 scrollTop/scrollHeight/clientHeight。happy-dom 不做布局,rect 只能自己喂。
 */
function fakeElement(rect: { top: number; bottom: number }) {
  const box = { ...rect }
  return {
    box,
    el: {
      getBoundingClientRect: () => ({
        top: box.top,
        bottom: box.bottom,
        left: 0,
        right: 0,
        width: 0,
        height: box.bottom - box.top,
        x: 0,
        y: box.top,
        toJSON: () => ({}),
      }),
    } as unknown as HTMLElement,
  }
}

function fakeScroller(state: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
  const box = { ...state, top: 0 }
  return {
    state: box,
    el: {
      get scrollTop() {
        return box.scrollTop
      },
      set scrollTop(next: number) {
        box.scrollTop = next
      },
      get scrollHeight() {
        return box.scrollHeight
      },
      get clientHeight() {
        return box.clientHeight
      },
      getBoundingClientRect: () => ({
        top: box.top,
        bottom: box.top + box.clientHeight,
        left: 0,
        right: 0,
        width: 0,
        height: box.clientHeight,
        x: 0,
        y: box.top,
        toJSON: () => ({}),
      }),
    } as unknown as HTMLElement,
  }
}

describe('computeCollapseCompensation', () => {
  const above = { top: -400, bottom: -100, atBottom: false }
  const straddling = { top: -50, bottom: 200, atBottom: false }
  const visible = { top: 40, bottom: 300, atBottom: false }

  it('gives back exactly the collapsed height when the element sat above the viewport', () => {
    // 300px 的 rail 塌成 24px 一行 → 下边上移 276px。
    expect(computeCollapseCompensation(above, -376)).toBe(-276)
  })

  it('compensates an element straddling the viewport top', () => {
    expect(computeCollapseCompensation(straddling, 24)).toBe(-176)
  })

  it('does not compensate an element that is fully visible', () => {
    expect(computeCollapseCompensation(visible, 64)).toBe(0)
  })

  it('does not compensate while parked at the bottom (跟底逻辑负责)', () => {
    expect(computeCollapseCompensation({ ...above, atBottom: true }, -376)).toBe(0)
  })

  it('ignores growth — this layer only pays back shrinkage', () => {
    expect(computeCollapseCompensation(above, 20)).toBe(0)
    expect(computeCollapseCompensation(above, -100)).toBe(0)
  })
})

describe('measureCollapseAnchor', () => {
  it('reports geometry relative to the scroller viewport and the bottom state', () => {
    const scroller = fakeScroller({ scrollTop: 500, scrollHeight: 2000, clientHeight: 800 })
    const target = fakeElement({ top: -300, bottom: -20 })

    expect(measureCollapseAnchor(target.el, scroller.el)).toEqual({
      top: -300,
      bottom: -20,
      atBottom: false,
    })
  })

  it('flags the bottom state within the epsilon', () => {
    const scroller = fakeScroller({ scrollTop: 1199, scrollHeight: 2000, clientHeight: 800 })
    const target = fakeElement({ top: -300, bottom: -20 })

    expect(measureCollapseAnchor(target.el, scroller.el)?.atBottom).toBe(true)
  })

  it('returns null without an element or a scroller', () => {
    expect(measureCollapseAnchor(null, fakeScroller({ scrollTop: 0, scrollHeight: 1, clientHeight: 1 }).el)).toBeNull()
    expect(measureCollapseAnchor(fakeElement({ top: 0, bottom: 1 }).el, null)).toBeNull()
  })
})

describe('beginCollapseCompensation', () => {
  it('keeps the content below a collapsing element visually still', () => {
    const scroller = fakeScroller({ scrollTop: 900, scrollHeight: 4000, clientHeight: 800 })
    const target = fakeElement({ top: -320, bottom: -20 })

    const apply = beginCollapseCompensation(target.el, scroller.el)
    expect(apply).not.toBeNull()

    // The rail folds: 300px → 24px.
    target.box.bottom = -296

    expect(apply?.()).toBe(-276)
    expect(scroller.state.scrollTop).toBe(624)
  })

  it('does nothing when the user was already at the bottom', () => {
    const scroller = fakeScroller({ scrollTop: 3200, scrollHeight: 4000, clientHeight: 800 })
    const target = fakeElement({ top: -320, bottom: -20 })

    const apply = beginCollapseCompensation(target.el, scroller.el)
    target.box.bottom = -296

    expect(apply?.()).toBe(0)
    expect(scroller.state.scrollTop).toBe(3200)
  })

  it('never scrolls past the top', () => {
    const scroller = fakeScroller({ scrollTop: 40, scrollHeight: 4000, clientHeight: 800 })
    const target = fakeElement({ top: -320, bottom: -20 })

    const apply = beginCollapseCompensation(target.el, scroller.el)
    target.box.bottom = -296

    expect(apply?.()).toBe(-40)
    expect(scroller.state.scrollTop).toBe(0)
  })

  it('returns null when there is no scroll container to correct', () => {
    expect(beginCollapseCompensation(null, null)).toBeNull()
    expect(beginCollapseCompensation(document.createElement('div'), null)).toBeNull()
  })
})
