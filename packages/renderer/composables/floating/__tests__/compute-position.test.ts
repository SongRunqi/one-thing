/**
 * Geometry of the floating kernel (docs/design/ui-system-consolidation.md §3.1).
 *
 * These are the cases every hand-rolled popover in this repo got wrong at least
 * once: a menu off the right edge, a panel under the fold, a flip that flipped
 * into a side just as cramped, a right-click menu at the viewport corner.
 */
import { describe, expect, it } from 'vitest'
import {
  computePosition,
  formatPlacement,
  parsePlacement,
  toAnchorRect,
} from '../compute-position'

const VIEWPORT = { width: 1000, height: 800 }
/** A 100×20 anchor in open space, far from every edge. */
const ANCHOR = { x: 400, y: 300, width: 100, height: 20 }
const BOX = { width: 200, height: 120 }

describe('parsePlacement', () => {
  it('defaults a bare side to centre alignment', () => {
    expect(parsePlacement('bottom')).toEqual({ side: 'bottom', align: 'center' })
    expect(parsePlacement('left-end')).toEqual({ side: 'left', align: 'end' })
  })

  it('round-trips through formatPlacement', () => {
    expect(formatPlacement('top', 'center')).toBe('top')
    expect(formatPlacement('top', 'start')).toBe('top-start')
  })
})

describe('computePosition — the four sides', () => {
  it('places below, centred, one offset away', () => {
    const pos = computePosition(ANCHOR, BOX, VIEWPORT, { placement: 'bottom', offset: 8 })
    expect(pos.side).toBe('bottom')
    expect(pos.y).toBe(ANCHOR.y + ANCHOR.height + 8)
    expect(pos.x).toBe(ANCHOR.x + (ANCHOR.width - BOX.width) / 2)
    expect(pos.flipped).toBe(false)
  })

  it('places above by subtracting its own height', () => {
    const pos = computePosition(ANCHOR, BOX, VIEWPORT, { placement: 'top', offset: 8 })
    expect(pos.y).toBe(ANCHOR.y - BOX.height - 8)
  })

  it('places left and right on the cross axis of the anchor', () => {
    const left = computePosition(ANCHOR, BOX, VIEWPORT, { placement: 'left', offset: 8 })
    expect(left.x).toBe(ANCHOR.x - BOX.width - 8)
    expect(left.y).toBe(ANCHOR.y + (ANCHOR.height - BOX.height) / 2)

    const right = computePosition(ANCHOR, BOX, VIEWPORT, { placement: 'right', offset: 8 })
    expect(right.x).toBe(ANCHOR.x + ANCHOR.width + 8)
  })
})

describe('computePosition — start/end alignment', () => {
  it('aligns a bottom layer to the anchor edges', () => {
    const start = computePosition(ANCHOR, BOX, VIEWPORT, { placement: 'bottom-start' })
    expect(start.x).toBe(ANCHOR.x)

    const end = computePosition(ANCHOR, BOX, VIEWPORT, { placement: 'bottom-end' })
    expect(end.x).toBe(ANCHOR.x + ANCHOR.width - BOX.width)
  })

  it('aligns a side layer on the vertical axis', () => {
    const start = computePosition(ANCHOR, BOX, VIEWPORT, { placement: 'right-start' })
    expect(start.y).toBe(ANCHOR.y)

    const end = computePosition(ANCHOR, BOX, VIEWPORT, { placement: 'right-end' })
    expect(end.y).toBe(ANCHOR.y + ANCHOR.height - BOX.height)
  })
})

describe('computePosition — flip', () => {
  it('turns above when there is no room below', () => {
    const low = { x: 400, y: 740, width: 100, height: 20 }
    const pos = computePosition(low, BOX, VIEWPORT, { placement: 'bottom-start', offset: 6 })
    expect(pos.side).toBe('top')
    expect(pos.flipped).toBe(true)
    expect(pos.placement).toBe('top-start')
    expect(pos.y).toBe(low.y - BOX.height - 6)
  })

  it('keeps the alignment it was asked for when it flips', () => {
    const low = { x: 400, y: 740, width: 100, height: 20 }
    expect(computePosition(low, BOX, VIEWPORT, { placement: 'bottom-end' }).placement)
      .toBe('top-end')
  })

  it('flips a side placement on the horizontal axis', () => {
    const farRight = { x: 940, y: 300, width: 40, height: 20 }
    const pos = computePosition(farRight, BOX, VIEWPORT, { placement: 'right' })
    expect(pos.side).toBe('left')
    expect(pos.x).toBe(farRight.x - BOX.width - 6)
  })

  it('stays put when the opposite side is no roomier', () => {
    // A tall box in a short viewport: neither side fits, so flipping would only
    // move the clipping around.
    const pos = computePosition(
      { x: 100, y: 40, width: 100, height: 20 },
      { width: 200, height: 400 },
      { width: 1000, height: 300 },
      { placement: 'bottom-start' },
    )
    expect(pos.side).toBe('bottom')
    expect(pos.flipped).toBe(false)
  })

  it('does nothing when flipping is off', () => {
    const low = { x: 400, y: 740, width: 100, height: 20 }
    const pos = computePosition(low, BOX, VIEWPORT, { placement: 'bottom-start', flip: false })
    expect(pos.side).toBe('bottom')
    expect(pos.flipped).toBe(false)
  })
})

describe('computePosition — clamp', () => {
  it('pulls a layer back inside the right edge', () => {
    const nearEdge = { x: 950, y: 300, width: 40, height: 20 }
    const pos = computePosition(nearEdge, BOX, VIEWPORT, { placement: 'bottom-start', margin: 8 })
    expect(pos.x).toBe(VIEWPORT.width - BOX.width - 8)
    expect(pos.clampedX).toBe(true)
  })

  it('pulls a layer back inside the left edge', () => {
    const nearEdge = { x: 2, y: 300, width: 10, height: 20 }
    const pos = computePosition(nearEdge, BOX, VIEWPORT, { placement: 'bottom-end', margin: 8 })
    expect(pos.x).toBe(8)
    expect(pos.clampedX).toBe(true)
  })

  it('clamps after a flip that still does not fit', () => {
    // 700px of box in an 800px viewport, anchored low: flipping up is the better
    // side but still overflows the top, so the clamp has the last word.
    const low = { x: 400, y: 700, width: 100, height: 20 }
    const tall = { width: 200, height: 700 }
    const pos = computePosition(low, tall, VIEWPORT, { placement: 'bottom-start', margin: 8 })
    expect(pos.side).toBe('top')
    expect(pos.flipped).toBe(true)
    expect(pos.clampedY).toBe(true)
    expect(pos.y).toBe(8)
  })

  it('pins the top-left corner when the layer is larger than the viewport', () => {
    const pos = computePosition(ANCHOR, { width: 1200, height: 900 }, VIEWPORT, { margin: 8 })
    expect(pos.x).toBe(8)
    expect(pos.y).toBe(8)
  })

  it('can be switched off', () => {
    const nearEdge = { x: 950, y: 300, width: 40, height: 20 }
    const pos = computePosition(nearEdge, BOX, VIEWPORT, { clamp: false })
    expect(pos.x).toBe(950)
    expect(pos.clampedX).toBe(false)
  })
})

describe('computePosition — virtual anchors', () => {
  it('treats a point as a zero-sized rect (right-click menus)', () => {
    expect(toAnchorRect({ x: 120, y: 240 })).toEqual({ x: 120, y: 240, width: 0, height: 0 })
    const pos = computePosition({ x: 120, y: 240 }, BOX, VIEWPORT, {
      placement: 'bottom-start',
      offset: 0,
    })
    expect(pos).toMatchObject({ x: 120, y: 240 })
  })

  it('keeps a menu opened in the bottom-right corner on screen', () => {
    const pos = computePosition({ x: 995, y: 795 }, BOX, VIEWPORT, {
      placement: 'bottom-start',
      offset: 0,
      margin: 8,
    })
    expect(pos.x).toBe(VIEWPORT.width - BOX.width - 8)
    expect(pos.y).toBe(VIEWPORT.height - BOX.height - 8)
  })
})
