const SCROLL_EDGE_PADDING = 4

export function getScrollTopForSearchResult(params: {
  currentScrollTop: number
  containerHeight: number
  itemTop: number
  itemHeight: number
}): number {
  const { currentScrollTop, containerHeight, itemTop, itemHeight } = params
  if (containerHeight <= 0 || itemHeight <= 0) return currentScrollTop

  const visibleTop = currentScrollTop
  const visibleBottom = currentScrollTop + containerHeight
  const itemBottom = itemTop + itemHeight

  if (itemTop < visibleTop + SCROLL_EDGE_PADDING) {
    return Math.max(0, itemTop - SCROLL_EDGE_PADDING)
  }

  if (itemBottom > visibleBottom - SCROLL_EDGE_PADDING) {
    return Math.max(0, itemBottom - containerHeight + SCROLL_EDGE_PADDING)
  }

  return currentScrollTop
}
