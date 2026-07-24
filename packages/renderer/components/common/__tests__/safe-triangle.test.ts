import { describe, expect, it } from 'vitest'
import {
  buildSafeTriangle,
  isPointInRect,
  isPointInTriangle,
  type Rect,
} from '../safe-triangle.js'

// A sidebar row at x≈0–200 with the preview panel to its right.
const panel: Rect = { left: 300, right: 620, top: 200, bottom: 500 }

describe('buildSafeTriangle', () => {
  it('spans from the pointer to the panel edge facing it', () => {
    const triangle = buildSafeTriangle({ x: 180, y: 220 }, panel, 'right')

    expect(triangle.apex).toEqual({ x: 180, y: 220 })
    expect(triangle.a.x).toBe(panel.left)
    expect(triangle.b.x).toBe(panel.left)
    // Padded past the corners: pointers rarely aim at an exact corner.
    expect(triangle.a.y).toBeLessThan(panel.top)
    expect(triangle.b.y).toBeGreaterThan(panel.bottom)
  })

  it('uses the right edge when the panel sits to the left', () => {
    const triangle = buildSafeTriangle({ x: 700, y: 220 }, panel, 'left')
    expect(triangle.a.x).toBe(panel.right)
    expect(triangle.b.x).toBe(panel.right)
  })

  it('uses a horizontal edge for top and bottom placements', () => {
    expect(buildSafeTriangle({ x: 400, y: 600 }, panel, 'top').a.y).toBe(panel.bottom)
    expect(buildSafeTriangle({ x: 400, y: 100 }, panel, 'bottom').a.y).toBe(panel.top)
  })
})

describe('isPointInTriangle', () => {
  const triangle = buildSafeTriangle({ x: 180, y: 220 }, panel, 'right')

  it('accepts a pointer travelling diagonally toward the panel', () => {
    // The exact journey the wedge exists for: leaving a row near the top of
    // the panel and cutting down-right toward its middle.
    expect(isPointInTriangle({ x: 240, y: 300 }, triangle)).toBe(true)
    expect(isPointInTriangle({ x: 290, y: 400 }, triangle)).toBe(true)
  })

  it('accepts a pointer moving straight across', () => {
    expect(isPointInTriangle({ x: 250, y: 225 }, triangle)).toBe(true)
  })

  it('rejects a pointer heading away from the panel', () => {
    // Straight down the sidebar — the user is scanning other rows, not
    // travelling to the panel, so the panel should close at once.
    expect(isPointInTriangle({ x: 180, y: 600 }, triangle)).toBe(false)
    expect(isPointInTriangle({ x: 100, y: 300 }, triangle)).toBe(false)
  })

  it('rejects a pointer past the panel entirely', () => {
    expect(isPointInTriangle({ x: 800, y: 300 }, triangle)).toBe(false)
  })

  it('counts the apex and edge points as inside', () => {
    expect(isPointInTriangle({ x: 180, y: 220 }, triangle)).toBe(true)
    expect(isPointInTriangle(triangle.a, triangle)).toBe(true)
    expect(isPointInTriangle(triangle.b, triangle)).toBe(true)
  })

  it('works the same mirrored, for a panel on the left', () => {
    const mirrored = buildSafeTriangle({ x: 700, y: 220 }, panel, 'left')
    expect(isPointInTriangle({ x: 660, y: 300 }, mirrored)).toBe(true)
    expect(isPointInTriangle({ x: 800, y: 300 }, mirrored)).toBe(false)
  })
})

describe('isPointInRect', () => {
  it('includes the boundary', () => {
    expect(isPointInRect({ x: 300, y: 200 }, panel)).toBe(true)
    expect(isPointInRect({ x: 460, y: 350 }, panel)).toBe(true)
    expect(isPointInRect({ x: 299, y: 350 }, panel)).toBe(false)
  })
})
