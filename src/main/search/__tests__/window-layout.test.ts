import { describe, expect, it } from 'vitest'
import {
  getDefaultSearchWindowBounds,
  getSearchWindowGuideState,
  getSearchWindowSizeConstraints,
  SEARCH_WINDOW_MAX_DEFAULT_HEIGHT,
  SEARCH_WINDOW_MIN_HEIGHT,
} from '../window-layout.js'

describe('Search Everywhere window layout', () => {
  it('uses a lower adaptive default height and keeps the window horizontally centered', () => {
    const parent = { x: 100, y: 50, width: 1200, height: 900 }
    const bounds = getDefaultSearchWindowBounds(parent)

    expect(bounds.height).toBeLessThanOrEqual(SEARCH_WINDOW_MAX_DEFAULT_HEIGHT)
    expect(bounds.height).toBe(360)
    expect(bounds.x + bounds.width / 2).toBe(parent.x + parent.width / 2)
  })

  it('adapts to smaller parent windows without going below the minimum height', () => {
    const bounds = getDefaultSearchWindowBounds({ x: 0, y: 0, width: 720, height: 560 })

    expect(bounds.height).toBe(SEARCH_WINDOW_MIN_HEIGHT)
    expect(bounds.width).toBeLessThanOrEqual(720)
  })

  it('limits manual resize size relative to the parent window', () => {
    const constraints = getSearchWindowSizeConstraints({ x: 0, y: 0, width: 1000, height: 800 })

    expect(constraints.maxWidth).toBe(920)
    expect(constraints.maxHeight).toBe(624)
  })

  it('reports guide hits near center, default top, and default height', () => {
    const defaults = getDefaultSearchWindowBounds({ x: 0, y: 0, width: 1000, height: 800 })
    const state = getSearchWindowGuideState({
      ...defaults,
      x: defaults.x + 8,
      y: defaults.y - 6,
      height: defaults.height + 5,
    }, defaults, true)

    expect(state).toEqual({
      visible: true,
      centerX: true,
      defaultTop: true,
      defaultHeight: true,
      defaultBounds: true,
    })
  })
})
