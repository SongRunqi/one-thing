// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
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

describe('scroll-chain', () => {
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
})
