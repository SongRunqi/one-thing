/**
 * Floating-layer geometry — the pure half of `useFloatingLayer()`.
 *
 * Nothing here touches the DOM: it takes an anchor rect, the floating box's
 * measured size and the viewport, and returns viewport coordinates. That split
 * is deliberate — placement/flip/clamp are where every hand-rolled popover in
 * this repo went wrong (menus off the right edge, panels under the fold), and
 * they are only testable when they are a function of numbers.
 *
 * Interface follows floating-ui's vocabulary (placement / offset / flip /
 * shift) so the kernel can be swapped for `@floating-ui/dom` later without
 * touching call sites — see docs/design/ui-system-consolidation.md §1 rule 4.
 */

export type FloatingSide = 'top' | 'bottom' | 'left' | 'right'
export type FloatingAlign = 'start' | 'center' | 'end'
export type FloatingPlacement = FloatingSide | `${FloatingSide}-start` | `${FloatingSide}-end`

/** A DOMRect-shaped anchor. Virtual anchors (right-click coordinates) are zero-sized. */
export interface AnchorRect {
  x: number
  y: number
  width: number
  height: number
}

export interface FloatingSize {
  width: number
  height: number
}

export interface ViewportSize {
  width: number
  height: number
}

export interface ComputePositionOptions {
  /** Default `bottom-start`: the shape almost every menu in this app wants. */
  placement?: FloatingPlacement
  /** Gap between anchor edge and floating edge, along the placement axis. */
  offset?: number
  /** Turn to the opposite side when the preferred one cannot hold the box. */
  flip?: boolean
  /** Keep the box inside the viewport after placement (floating-ui's `shift`). */
  clamp?: boolean
  /** Gutter kept between the box and the viewport edges. */
  margin?: number
}

export interface ComputedPosition {
  x: number
  y: number
  /** Placement actually used — differs from the requested one when flipped. */
  placement: FloatingPlacement
  side: FloatingSide
  align: FloatingAlign
  flipped: boolean
  clampedX: boolean
  clampedY: boolean
}

export const DEFAULT_PLACEMENT: FloatingPlacement = 'bottom-start'
export const DEFAULT_OFFSET = 6
export const DEFAULT_MARGIN = 8

const OPPOSITE: Record<FloatingSide, FloatingSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
}

export function parsePlacement(placement: FloatingPlacement): {
  side: FloatingSide
  align: FloatingAlign
} {
  const [side, align] = placement.split('-') as [FloatingSide, FloatingAlign | undefined]
  return { side, align: align ?? 'center' }
}

export function formatPlacement(side: FloatingSide, align: FloatingAlign): FloatingPlacement {
  return (align === 'center' ? side : `${side}-${align}`) as FloatingPlacement
}

/** Turns a virtual anchor (`{x,y}` from a pointer event) into a zero-sized rect. */
export function toAnchorRect(anchor: AnchorRect | { x: number, y: number }): AnchorRect {
  if ('width' in anchor && 'height' in anchor) return anchor
  return { x: anchor.x, y: anchor.y, width: 0, height: 0 }
}

function clampNumber(value: number, min: number, max: number): number {
  // max < min happens when the box is taller/wider than the viewport; pinning to
  // `min` keeps its top-left visible, which is the readable half.
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

/** Free space on `side` of the anchor, minus the viewport gutter. */
function freeSpace(
  side: FloatingSide,
  anchor: AnchorRect,
  viewport: ViewportSize,
  margin: number,
): number {
  switch (side) {
    case 'top': return anchor.y - margin
    case 'bottom': return viewport.height - (anchor.y + anchor.height) - margin
    case 'left': return anchor.x - margin
    case 'right': return viewport.width - (anchor.x + anchor.width) - margin
  }
}

function mainAxisCoord(
  side: FloatingSide,
  anchor: AnchorRect,
  floating: FloatingSize,
  offset: number,
): number {
  switch (side) {
    case 'top': return anchor.y - floating.height - offset
    case 'bottom': return anchor.y + anchor.height + offset
    case 'left': return anchor.x - floating.width - offset
    case 'right': return anchor.x + anchor.width + offset
  }
}

/** Cross-axis start coordinate for the requested alignment. */
function crossAxisCoord(
  align: FloatingAlign,
  anchorStart: number,
  anchorLength: number,
  floatingLength: number,
): number {
  if (align === 'start') return anchorStart
  if (align === 'end') return anchorStart + anchorLength - floatingLength
  return anchorStart + (anchorLength - floatingLength) / 2
}

/**
 * Places `floating` next to `anchor` inside `viewport`.
 *
 * Order matters and mirrors floating-ui's middleware chain: place → flip →
 * clamp. Clamping last is what keeps a flipped-but-still-overflowing box on
 * screen (the case every hand-rolled version in this repo got wrong).
 */
export function computePosition(
  anchor: AnchorRect | { x: number, y: number },
  floating: FloatingSize,
  viewport: ViewportSize,
  options: ComputePositionOptions = {},
): ComputedPosition {
  const rect = toAnchorRect(anchor)
  const {
    placement = DEFAULT_PLACEMENT,
    offset = DEFAULT_OFFSET,
    flip = true,
    clamp = true,
    margin = DEFAULT_MARGIN,
  } = options

  const requested = parsePlacement(placement)
  let side = requested.side
  const align = requested.align
  let flipped = false

  if (flip) {
    const needed = (side === 'top' || side === 'bottom' ? floating.height : floating.width) + offset
    const here = freeSpace(side, rect, viewport, margin)
    const there = freeSpace(OPPOSITE[side], rect, viewport, margin)
    // Only turn when the other side is genuinely roomier — flipping into an
    // equally cramped side just moves the clipping around.
    if (needed > here && there > here) {
      side = OPPOSITE[side]
      flipped = true
    }
  }

  const vertical = side === 'top' || side === 'bottom'
  let x = vertical
    ? crossAxisCoord(align, rect.x, rect.width, floating.width)
    : mainAxisCoord(side, rect, floating, offset)
  let y = vertical
    ? mainAxisCoord(side, rect, floating, offset)
    : crossAxisCoord(align, rect.y, rect.height, floating.height)

  let clampedX = false
  let clampedY = false
  if (clamp) {
    const nextX = clampNumber(x, margin, viewport.width - floating.width - margin)
    const nextY = clampNumber(y, margin, viewport.height - floating.height - margin)
    clampedX = nextX !== x
    clampedY = nextY !== y
    x = nextX
    y = nextY
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    placement: formatPlacement(side, align),
    side,
    align,
    flipped,
    clampedX,
    clampedY,
  }
}
