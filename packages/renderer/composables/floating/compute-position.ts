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

/* ─────────────────── 命令式出口(G5, 2026-08-11) ───────────────────────────
 * 上面这半份内核是纯的,但唯一的**出口**至今是 `useFloatingLayer()` —— 一个
 * Vue composable。于是非 Vue 的宿主(CodeMirror 插件、编辑器 widget、任何在
 * `document` 上手搓元素的地方)够不着它,只能自己拼一遍 `position: fixed` 的
 * 钳制算术 —— 拼错的那几种形态(菜单飞出右缘、面板掉到折线下)正是这份内核
 * 存在的理由。
 *
 * 所以这里再开一个**纯函数**出口:锚点矩形 + 盒子尺寸 → 可以直接 Object.assign
 * 到 `element.style` 上的定位样式。Vue 壳一个字节不动 —— `useFloatingLayer`
 * 保持原样(它还要管 width/anchor 宽度匹配、可见性遮帧、ResizeObserver),这里
 * 只把"算坐标"这一件事单独递出去。
 */

/** 直接可以往 `element.style` 上抹的定位样式。 */
export interface FloatingStyle {
  position: 'fixed'
  left: string
  top: string
  zIndex?: string
}

export interface ComputeFloatingStyleOptions extends ComputePositionOptions {
  /** 缺省读 `window`;传值是为了测试和非浏览器宿主。 */
  viewport?: ViewportSize
  /** 完整的 z-index 表达式(`'var(--z-max)'` 这种),原样写进样式。 */
  zIndex?: string
}

/**
 * 把任何"有 getBoundingClientRect 的东西"变成锚点矩形。
 *
 * 单独导出是因为这一步是命令式宿主最容易写歪的地方:`getBoundingClientRect()`
 * 给的是 `left/top`,而内核要的是 `x/y` —— 两者在滚动的文档里不是一回事。
 */
export function elementAnchorRect(element: { getBoundingClientRect(): DOMRect }): AnchorRect {
  const rect = element.getBoundingClientRect()
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
}

/**
 * `computePosition` 的命令式包装:同一套 place → flip → clamp,产出直接可用的
 * 样式对象。返回值同时带上 `position`,因为翻转后的方位是调用方画箭头 / 建安全
 * 三角要用的那一条信息。
 */
export function computeFloatingStyle(
  anchor: AnchorRect | { x: number, y: number },
  floating: FloatingSize,
  options: ComputeFloatingStyleOptions = {},
): { position: ComputedPosition, style: FloatingStyle } {
  const { viewport, zIndex, ...placementOptions } = options
  const box = viewport ?? (typeof window === 'undefined'
    ? { width: 0, height: 0 }
    : { width: window.innerWidth, height: window.innerHeight })

  const position = computePosition(anchor, floating, box, placementOptions)
  const style: FloatingStyle = {
    position: 'fixed',
    left: `${position.x}px`,
    top: `${position.y}px`,
  }
  if (zIndex) style.zIndex = zIndex
  return { position, style }
}
