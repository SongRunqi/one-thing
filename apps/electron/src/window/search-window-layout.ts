import type { ElectronSearchWindowGuideState } from './search-window.js'

export interface ElectronSearchWindowRectangle {
  x: number
  y: number
  width: number
  height: number
}

export interface ElectronSearchWindowSizeConstraints {
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

export const ELECTRON_SEARCH_WINDOW_MIN_WIDTH = 520
export const ELECTRON_SEARCH_WINDOW_MIN_HEIGHT = 240
export const ELECTRON_SEARCH_WINDOW_MAX_DEFAULT_WIDTH = 720
export const ELECTRON_SEARCH_WINDOW_MAX_DEFAULT_HEIGHT = 360

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function getElectronSearchWindowSizeConstraints(
  parentBounds: ElectronSearchWindowRectangle,
): ElectronSearchWindowSizeConstraints {
  return {
    minWidth: ELECTRON_SEARCH_WINDOW_MIN_WIDTH,
    minHeight: ELECTRON_SEARCH_WINDOW_MIN_HEIGHT,
    maxWidth: Math.max(
      ELECTRON_SEARCH_WINDOW_MIN_WIDTH,
      Math.round(parentBounds.width * MAX_PARENT_WIDTH_RATIO),
    ),
    maxHeight: Math.max(
      ELECTRON_SEARCH_WINDOW_MIN_HEIGHT,
      Math.round(parentBounds.height * MAX_PARENT_HEIGHT_RATIO),
    ),
  }
}

export function getElectronDefaultSearchWindowBounds(
  parentBounds: ElectronSearchWindowRectangle,
): ElectronSearchWindowRectangle {
  const constraints = getElectronSearchWindowSizeConstraints(parentBounds)
  const width = clamp(
    Math.round(parentBounds.width * DEFAULT_WIDTH_RATIO),
    ELECTRON_SEARCH_WINDOW_MIN_WIDTH,
    Math.min(ELECTRON_SEARCH_WINDOW_MAX_DEFAULT_WIDTH, constraints.maxWidth),
  )
  const height = clamp(
    Math.round(parentBounds.height * DEFAULT_HEIGHT_RATIO),
    ELECTRON_SEARCH_WINDOW_MIN_HEIGHT,
    Math.min(ELECTRON_SEARCH_WINDOW_MAX_DEFAULT_HEIGHT, constraints.maxHeight),
  )
  const x = Math.round(parentBounds.x + (parentBounds.width - width) / 2)
  const preferredY = Math.round(parentBounds.y + parentBounds.height * DEFAULT_TOP_RATIO)
  const maxY = parentBounds.y + parentBounds.height - height - PARENT_EDGE_PADDING
  const y = clamp(preferredY, parentBounds.y + PARENT_EDGE_PADDING, Math.max(parentBounds.y + PARENT_EDGE_PADDING, maxY))

  return { x, y, width, height }
}

export interface ElectronSearchWindowAnchor {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Re-center the search window horizontally on an anchor rect reported by the
 * main window renderer (CSS px relative to the parent window's origin), so the
 * window lines up with the chat content area instead of the full window width.
 */
export function applyElectronSearchWindowAnchor(
  bounds: ElectronSearchWindowRectangle,
  parentBounds: ElectronSearchWindowRectangle,
  anchor: ElectronSearchWindowAnchor | null | undefined,
): ElectronSearchWindowRectangle {
  if (!anchor || !(anchor.width > 0)) return bounds

  const anchorCenterX = parentBounds.x + anchor.x + anchor.width / 2
  const minX = parentBounds.x + PARENT_EDGE_PADDING
  const maxX = parentBounds.x + parentBounds.width - bounds.width - PARENT_EDGE_PADDING
  const x = clamp(Math.round(anchorCenterX - bounds.width / 2), minX, Math.max(minX, maxX))

  return { ...bounds, x }
}

export function getElectronSearchWindowGuideState(
  currentBounds: ElectronSearchWindowRectangle,
  defaultBounds: ElectronSearchWindowRectangle,
  visible: boolean,
): ElectronSearchWindowGuideState {
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
