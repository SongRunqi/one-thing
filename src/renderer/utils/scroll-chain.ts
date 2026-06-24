const SCROLL_EDGE_EPSILON = 1

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

export function chainWheelToScrollableAncestor(event: WheelEvent, source: HTMLElement | null): boolean {
  if (!source || event.defaultPrevented) return false
  if (event.deltaY === 0 || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return false

  const sourceMax = maxScrollTop(source)
  if (sourceMax <= SCROLL_EDGE_EPSILON) return false

  const deltaY = wheelDeltaY(event, source)
  const atTop = source.scrollTop <= SCROLL_EDGE_EPSILON
  const atBottom = source.scrollTop >= sourceMax - SCROLL_EDGE_EPSILON
  const shouldReleaseUp = deltaY < 0 && atTop
  const shouldReleaseDown = deltaY > 0 && atBottom

  if (!shouldReleaseUp && !shouldReleaseDown) return false

  const ancestor = findScrollableAncestor(source.parentElement)
  if (!ancestor) return false

  const ancestorMax = maxScrollTop(ancestor)
  const nextScrollTop = clamp(ancestor.scrollTop + deltaY, 0, ancestorMax)
  if (Math.abs(nextScrollTop - ancestor.scrollTop) <= SCROLL_EDGE_EPSILON) return false

  event.preventDefault()
  ancestor.scrollTop = nextScrollTop
  return true
}
