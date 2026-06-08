import type { SearchWindowGuideState } from '../../shared/ipc/search.js'

export interface SearchWindowRectangle {
  x: number
  y: number
  width: number
  height: number
}

export interface SearchWindowSizeConstraints {
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
}

const DEFAULT_WIDTH_RATIO = 0.58
const DEFAULT_HEIGHT_RATIO = 0.4
const MAX_PARENT_WIDTH_RATIO = 0.92
const MAX_PARENT_HEIGHT_RATIO = 0.78
const DEFAULT_TOP_RATIO = 0.18
const PARENT_EDGE_PADDING = 24
const GUIDE_THRESHOLD = 12

export const SEARCH_WINDOW_MIN_WIDTH = 520
export const SEARCH_WINDOW_MIN_HEIGHT = 240
export const SEARCH_WINDOW_MAX_DEFAULT_WIDTH = 720
export const SEARCH_WINDOW_MAX_DEFAULT_HEIGHT = 360

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function getSearchWindowSizeConstraints(parentBounds: SearchWindowRectangle): SearchWindowSizeConstraints {
  return {
    minWidth: SEARCH_WINDOW_MIN_WIDTH,
    minHeight: SEARCH_WINDOW_MIN_HEIGHT,
    maxWidth: Math.max(
      SEARCH_WINDOW_MIN_WIDTH,
      Math.round(parentBounds.width * MAX_PARENT_WIDTH_RATIO),
    ),
    maxHeight: Math.max(
      SEARCH_WINDOW_MIN_HEIGHT,
      Math.round(parentBounds.height * MAX_PARENT_HEIGHT_RATIO),
    ),
  }
}

export function getDefaultSearchWindowBounds(parentBounds: SearchWindowRectangle): SearchWindowRectangle {
  const constraints = getSearchWindowSizeConstraints(parentBounds)
  const width = clamp(
    Math.round(parentBounds.width * DEFAULT_WIDTH_RATIO),
    SEARCH_WINDOW_MIN_WIDTH,
    Math.min(SEARCH_WINDOW_MAX_DEFAULT_WIDTH, constraints.maxWidth),
  )
  const height = clamp(
    Math.round(parentBounds.height * DEFAULT_HEIGHT_RATIO),
    SEARCH_WINDOW_MIN_HEIGHT,
    Math.min(SEARCH_WINDOW_MAX_DEFAULT_HEIGHT, constraints.maxHeight),
  )
  const x = Math.round(parentBounds.x + (parentBounds.width - width) / 2)
  const preferredY = Math.round(parentBounds.y + parentBounds.height * DEFAULT_TOP_RATIO)
  const maxY = parentBounds.y + parentBounds.height - height - PARENT_EDGE_PADDING
  const y = clamp(preferredY, parentBounds.y + PARENT_EDGE_PADDING, Math.max(parentBounds.y + PARENT_EDGE_PADDING, maxY))

  return { x, y, width, height }
}

export function getSearchWindowGuideState(
  currentBounds: SearchWindowRectangle,
  defaultBounds: SearchWindowRectangle,
  visible: boolean,
): SearchWindowGuideState {
  const currentCenterX = currentBounds.x + currentBounds.width / 2
  const defaultCenterX = defaultBounds.x + defaultBounds.width / 2
  const centerX = Math.abs(currentCenterX - defaultCenterX) <= GUIDE_THRESHOLD
  const defaultTop = Math.abs(currentBounds.y - defaultBounds.y) <= GUIDE_THRESHOLD
  const defaultHeight = Math.abs(currentBounds.height - defaultBounds.height) <= GUIDE_THRESHOLD

  return {
    visible,
    centerX,
    defaultTop,
    defaultHeight,
    defaultBounds: centerX && defaultTop && defaultHeight,
  }
}
