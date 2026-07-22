/**
 * Hover "safe triangle" — the reason a pointer can travel diagonally from a
 * trigger to the panel it opened without the panel closing on the way.
 *
 * Moving from a sidebar row to a panel beside it is a diagonal path, and that
 * path sweeps across the rows in between. Plain mouseleave logic reads those
 * rows as new hovers and swaps or dismisses the panel mid-journey. The fix is
 * to treat the wedge between where the pointer left and the panel's near edge
 * as still-hovering: inside it, the pointer is evidently on its way there.
 *
 * Leaving the wedge closes immediately — the grace period is for travel, not
 * for a pointer that has gone somewhere else entirely.
 */

export interface Point {
  x: number
  y: number
}

export interface Rect {
  top: number
  left: number
  right: number
  bottom: number
}

export type SafeTrianglePosition = 'top' | 'bottom' | 'left' | 'right'

export interface SafeTriangle {
  apex: Point
  a: Point
  b: Point
}

/**
 * Widens the panel-side edge slightly. The pointer rarely aims at the exact
 * corner, and a wedge that hugs the edge feels like it closes for no reason.
 */
const EDGE_PADDING = 12

/**
 * Builds the wedge from where the pointer left the trigger to the panel's
 * near edge. `position` is where the panel sits relative to the trigger.
 */
export function buildSafeTriangle(
  apex: Point,
  panel: Rect,
  position: SafeTrianglePosition,
): SafeTriangle {
  switch (position) {
    case 'right':
      return {
        apex,
        a: { x: panel.left, y: panel.top - EDGE_PADDING },
        b: { x: panel.left, y: panel.bottom + EDGE_PADDING },
      }
    case 'left':
      return {
        apex,
        a: { x: panel.right, y: panel.top - EDGE_PADDING },
        b: { x: panel.right, y: panel.bottom + EDGE_PADDING },
      }
    case 'bottom':
      return {
        apex,
        a: { x: panel.left - EDGE_PADDING, y: panel.top },
        b: { x: panel.right + EDGE_PADDING, y: panel.top },
      }
    case 'top':
    default:
      return {
        apex,
        a: { x: panel.left - EDGE_PADDING, y: panel.bottom },
        b: { x: panel.right + EDGE_PADDING, y: panel.bottom },
      }
  }
}

function cross(a: Point, b: Point, p: Point): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
}

/**
 * Inside-or-on-edge test by consistent winding. Points exactly on an edge
 * count as inside: a pointer grazing the boundary is still travelling.
 */
export function isPointInTriangle(point: Point, triangle: SafeTriangle): boolean {
  const { apex, a, b } = triangle
  const d1 = cross(apex, a, point)
  const d2 = cross(a, b, point)
  const d3 = cross(b, apex, point)

  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNegative && hasPositive)
}

/**
 * `padding` grows the rect outward before testing. A pointer that clips the
 * edge of a panel by a pixel has not left it in any sense the user intended,
 * and treating that as an exit reads as the panel flinching away.
 */
export function isPointInRect(point: Point, rect: Rect, padding = 0): boolean {
  return (
    point.x >= rect.left - padding &&
    point.x <= rect.right + padding &&
    point.y >= rect.top - padding &&
    point.y <= rect.bottom + padding
  )
}
