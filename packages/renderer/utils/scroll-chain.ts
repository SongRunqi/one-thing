const SCROLL_EDGE_EPSILON = 1

/**
 * 同一个滚动手势的最大事件间隔。滚轮/触控板没有 "gesture end" 事件,只能靠停顿
 * 判定:同一个 source 上两次 wheel 间隔小于这个值、且方向没变,就当成**同一次
 * 连续滚动**。
 *
 * 350ms 是"手指离开滚轮/触控板"的保守下限:惯性滚动的事件流远密于此(通常
 * 16–50ms 一发),而人有意识地"停一下再滚"基本都超过它。
 */
const WHEEL_GESTURE_IDLE_MS = 350

interface WheelGestureState {
  lastWheelTs: number
  /** +1 = 向下(deltaY > 0),-1 = 向上。方向反转一律算新手势。 */
  direction: 1 | -1
}

/**
 * 每个内滚盒子最近一次滚轮事件的时刻与方向。WeakMap:元素被回收时状态自然消失,
 * 不需要任何清理钩子。
 */
const wheelGestures = new WeakMap<HTMLElement, WheelGestureState>()

/**
 * 记录本次 wheel,并回答"它是上一次那个手势的延续吗"。
 *
 * 必须对**每一次**落在可滚 source 上的 wheel 调用(包括还没到边、滚动仍在盒子
 * 内部消化的那些),否则一次从中间滚到底的手势在到边那一刻会被误判成新手势,
 * 边界闩就形同虚设。
 */
function trackWheelGesture(source: HTMLElement, deltaY: number): boolean {
  const now = Date.now()
  const direction: 1 | -1 = deltaY > 0 ? 1 : -1
  const previous = wheelGestures.get(source)
  const continuing =
    previous !== undefined &&
    previous.direction === direction &&
    now - previous.lastWheelTs < WHEEL_GESTURE_IDLE_MS

  wheelGestures.set(source, { lastWheelTs: now, direction })
  return continuing
}

function maxScrollTop(element: HTMLElement): number {
  return Math.max(0, element.scrollHeight - element.clientHeight)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function parsePixelValue(value: string): number | null {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function lineHeightFor(element: HTMLElement): number {
  if (typeof window === 'undefined' || !window.getComputedStyle) return 16

  const styles = window.getComputedStyle(element)
  const lineHeight = parsePixelValue(styles.lineHeight)
  if (lineHeight !== null) return lineHeight

  const fontSize = parsePixelValue(styles.fontSize)
  return fontSize !== null ? fontSize * 1.2 : 16
}

function wheelDeltaY(event: WheelEvent, element: HTMLElement): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * lineHeightFor(element)
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * Math.max(1, element.clientHeight)
  }
  return event.deltaY
}

function canScrollVertically(element: HTMLElement): boolean {
  return maxScrollTop(element) > SCROLL_EDGE_EPSILON
}

function canUseVerticalOverflow(element: HTMLElement): boolean {
  if (typeof window === 'undefined' || !window.getComputedStyle) return true
  const overflowY = window.getComputedStyle(element).overflowY
  return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'
}

function findScrollableAncestor(start: HTMLElement | null): HTMLElement | null {
  let current = start

  while (current) {
    if (canScrollVertically(current) && canUseVerticalOverflow(current)) return current
    current = current.parentElement
  }

  return null
}

export function findScrollableWheelSource(event: WheelEvent, boundary: HTMLElement | null): HTMLElement | null {
  if (!boundary || !(event.target instanceof HTMLElement)) return boundary

  let current: HTMLElement | null = event.target
  while (current && boundary.contains(current)) {
    if (canScrollVertically(current) && canUseVerticalOverflow(current)) return current
    if (current === boundary) break
    current = current.parentElement
  }

  return canScrollVertically(boundary) && canUseVerticalOverflow(boundary) ? boundary : null
}

/**
 * 内滚面板的滚动链边界。语义是「**到边先闩一下**」:
 *
 * - 盒子还能滚 → 不接管,原生消化。
 * - 盒子到边、而滚动手势**还在继续** → 吞掉溢出量(preventDefault,不转发)。
 *   面板内容滚完的那一瞬间整个消息列表跟着窜出去,是这里要挡的那件事。
 * - 停顿(≥ `WHEEL_GESTURE_IDLE_MS`)或换方向后**再次**滚且仍在边缘 → 这才是
 *   用户在要求滚外面,把滚动量交给最近的可滚祖先。
 *
 * 唯一的例外必须留死:`sourceMax <= epsilon`(压根滚不动的盒子)直接 return
 * false 交给原生。在那种盒子上闩住滚轮 = 滚轮黑洞,那正是 2026-08-06 那次
 * `overscroll-behavior: contain` 死区的复刻。
 */
export function chainWheelToScrollableAncestor(event: WheelEvent, source: HTMLElement | null): boolean {
  if (!source || event.defaultPrevented) return false
  if (event.deltaY === 0 || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return false

  const sourceMax = maxScrollTop(source)
  if (sourceMax <= SCROLL_EDGE_EPSILON) return false

  const deltaY = wheelDeltaY(event, source)
  // 每一次都记:手势的连续性靠"上一发是什么时候、往哪边"判定。
  const gestureContinues = trackWheelGesture(source, deltaY)
  const atTop = source.scrollTop <= SCROLL_EDGE_EPSILON
  const atBottom = source.scrollTop >= sourceMax - SCROLL_EDGE_EPSILON
  const shouldReleaseUp = deltaY < 0 && atTop
  const shouldReleaseDown = deltaY > 0 && atBottom

  if (!shouldReleaseUp && !shouldReleaseDown) return false

  // 边界闩:同一次手势里滚到边,溢出量就地吞掉。
  if (gestureContinues) {
    event.preventDefault()
    return true
  }

  const ancestor = findScrollableAncestor(source.parentElement)
  if (!ancestor) return false

  const ancestorMax = maxScrollTop(ancestor)
  const nextScrollTop = clamp(ancestor.scrollTop + deltaY, 0, ancestorMax)
  if (Math.abs(nextScrollTop - ancestor.scrollTop) <= SCROLL_EDGE_EPSILON) return false

  event.preventDefault()
  ancestor.scrollTop = nextScrollTop
  return true
}
