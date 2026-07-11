import { describe, expect, it } from 'vitest'
import {
  ELECTRON_SEARCH_WINDOW_MAX_DEFAULT_HEIGHT,
  ELECTRON_SEARCH_WINDOW_MIN_HEIGHT,
  applyElectronSearchWindowAnchor,
  getElectronDefaultSearchWindowBounds,
  getElectronSearchWindowGuideState,
  getElectronSearchWindowSizeConstraints,
} from '../search-window-layout.js'

describe('electron search window layout', () => {
  it('uses a lower adaptive default height and keeps the window horizontally centered', () => {
    const parent = { x: 100, y: 50, width: 1200, height: 900 }
    const bounds = getElectronDefaultSearchWindowBounds(parent)

    expect(bounds.height).toBeLessThanOrEqual(ELECTRON_SEARCH_WINDOW_MAX_DEFAULT_HEIGHT)
    expect(bounds.height).toBe(360)
    expect(bounds.x + bounds.width / 2).toBe(parent.x + parent.width / 2)
  })

  it('adapts to smaller parent windows without going below the minimum height', () => {
    const bounds = getElectronDefaultSearchWindowBounds({ x: 0, y: 0, width: 720, height: 560 })

    expect(bounds.height).toBe(ELECTRON_SEARCH_WINDOW_MIN_HEIGHT)
    expect(bounds.width).toBeLessThanOrEqual(720)
  })

  it('limits manual resize size relative to the parent window', () => {
    const constraints = getElectronSearchWindowSizeConstraints({ x: 0, y: 0, width: 1000, height: 800 })

    expect(constraints.maxWidth).toBe(920)
    expect(constraints.maxHeight).toBe(624)
  })

  it('re-centers on the reported content anchor instead of the full window', () => {
    const parent = { x: 100, y: 50, width: 1200, height: 900 }
    const bounds = { x: 380, y: 212, width: 640, height: 360 }
    // Sidebar occupies the first 240 CSS px; the content area starts there.
    const anchored = applyElectronSearchWindowAnchor(bounds, parent, {
      x: 240,
      y: 0,
      width: 960,
      height: 900,
    })

    expect(anchored.x + anchored.width / 2).toBe(parent.x + 240 + 960 / 2)
    expect(anchored.y).toBe(bounds.y)
    expect(anchored.width).toBe(bounds.width)
  })

  it('clamps anchored bounds inside the parent and ignores empty anchors', () => {
    const parent = { x: 0, y: 0, width: 1000, height: 800 }
    const bounds = { x: 180, y: 144, width: 640, height: 320 }

    const clamped = applyElectronSearchWindowAnchor(bounds, parent, {
      x: 900,
      y: 0,
      width: 100,
      height: 800,
    })
    expect(clamped.x + clamped.width).toBeLessThanOrEqual(parent.width - 24)

    expect(applyElectronSearchWindowAnchor(bounds, parent, null)).toEqual(bounds)
    expect(
      applyElectronSearchWindowAnchor(bounds, parent, { x: 0, y: 0, width: 0, height: 0 }),
    ).toEqual(bounds)
  })

  it('reports guide hits near center, default top, and default height', () => {
    const defaults = getElectronDefaultSearchWindowBounds({ x: 0, y: 0, width: 1000, height: 800 })
    const state = getElectronSearchWindowGuideState({
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
