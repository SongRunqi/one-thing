import type { BrowserWindow } from 'electron'

export interface ElectronWindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized?: boolean
}

export interface ElectronSearchWindowSizeState {
  width: number
  height: number
}

export interface ElectronWindowStateFile extends ElectronWindowState {
  todoPlan?: ElectronWindowState
  searchWindow?: ElectronSearchWindowSizeState
}

export interface ElectronWindowStateStorage {
  path: string
  readJsonFile<T>(filePath: string, fallback: T): T
  writeJsonFile(filePath: string, value: ElectronWindowStateFile): void
}

export interface ElectronWindowStateOptions extends ElectronWindowStateStorage {
  defaultWindowState?: ElectronWindowState
  defaultTodoPlanWindowState?: ElectronWindowState
}

const DEFAULT_WINDOW_STATE: ElectronWindowState = {
  width: 1000,
  height: 800,
}

const DEFAULT_TODO_PLAN_WINDOW_STATE: ElectronWindowState = {
  width: 460,
  height: 640,
}

function mainFallback(options: ElectronWindowStateOptions): ElectronWindowState {
  return options.defaultWindowState ?? DEFAULT_WINDOW_STATE
}

function todoPlanFallback(options: ElectronWindowStateOptions): ElectronWindowState {
  return options.defaultTodoPlanWindowState ?? DEFAULT_TODO_PLAN_WINDOW_STATE
}

export function sanitizeElectronWindowState(
  state: Partial<ElectronWindowState> | null | undefined,
  fallback: ElectronWindowState,
): ElectronWindowState {
  const width = Number(state?.width)
  const height = Number(state?.height)
  const x = Number(state?.x)
  const y = Number(state?.y)

  return {
    width: Number.isFinite(width) && width > 0 ? width : fallback.width,
    height: Number.isFinite(height) && height > 0 ? height : fallback.height,
    x: Number.isFinite(x) ? x : undefined,
    y: Number.isFinite(y) ? y : undefined,
    isMaximized: state?.isMaximized === true,
  }
}

export interface ElectronDisplayWorkArea {
  x: number
  y: number
  width: number
  height: number
}

// A restored window must overlap some display by at least this much in both
// axes; anything less (e.g. after unplugging an external monitor) is treated
// as off-screen and pulled back into the nearest display.
const MIN_VISIBLE_EDGE = 64

export function clampElectronWindowStateToDisplays<
  T extends { width: number, height: number, x?: number, y?: number },
>(state: T, displays: ElectronDisplayWorkArea[]): T {
  const { x, y, width, height } = state
  if (x === undefined || y === undefined || displays.length === 0) return state

  const intersectionSize = (area: ElectronDisplayWorkArea) => {
    const overlapWidth = Math.min(x + width, area.x + area.width) - Math.max(x, area.x)
    const overlapHeight = Math.min(y + height, area.y + area.height) - Math.max(y, area.y)
    return { overlapWidth, overlapHeight }
  }

  const visible = displays.some((area) => {
    const { overlapWidth, overlapHeight } = intersectionSize(area)
    return overlapWidth >= Math.min(MIN_VISIBLE_EDGE, width) && overlapHeight >= Math.min(MIN_VISIBLE_EDGE, height)
  })
  if (visible) return state

  const nearest = displays.reduce((best, area) => {
    const distance = (candidate: ElectronDisplayWorkArea) => {
      const centerX = candidate.x + candidate.width / 2
      const centerY = candidate.y + candidate.height / 2
      return Math.hypot(x + width / 2 - centerX, y + height / 2 - centerY)
    }
    return distance(area) < distance(best) ? area : best
  })

  return {
    ...state,
    x: Math.max(nearest.x, Math.min(x, nearest.x + nearest.width - width)),
    y: Math.max(nearest.y, Math.min(y, nearest.y + nearest.height - height)),
  }
}

function sanitizeElectronSearchWindowSize(
  size: Partial<ElectronSearchWindowSizeState> | null | undefined,
): ElectronSearchWindowSizeState | undefined {
  const width = Number(size?.width)
  const height = Number(size?.height)
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return undefined
  return { width: Math.round(width), height: Math.round(height) }
}

export function readElectronWindowState(options: ElectronWindowStateOptions): ElectronWindowStateFile {
  const fallback = mainFallback(options)
  const state = options.readJsonFile<Partial<ElectronWindowStateFile> | null>(options.path, fallback)
  const mainState = sanitizeElectronWindowState(state, fallback)
  const todoPlan = state?.todoPlan
    ? sanitizeElectronWindowState(state.todoPlan, todoPlanFallback(options))
    : undefined

  return {
    ...mainState,
    todoPlan,
    searchWindow: sanitizeElectronSearchWindowSize(state?.searchWindow),
  }
}

export function readElectronSearchWindowSize(
  options: ElectronWindowStateOptions,
): ElectronSearchWindowSizeState | null {
  return readElectronWindowState(options).searchWindow ?? null
}

export function saveElectronSearchWindowSize(
  options: ElectronWindowStateOptions,
  size: ElectronSearchWindowSizeState,
): void {
  const sanitized = sanitizeElectronSearchWindowSize(size)
  if (!sanitized) return

  options.writeJsonFile(options.path, {
    ...readElectronWindowState(options),
    searchWindow: sanitized,
  })
}

export function readElectronTodoPlanWindowState(options: ElectronWindowStateOptions): ElectronWindowState {
  return readElectronWindowState(options).todoPlan || todoPlanFallback(options)
}

export function saveElectronMainWindowState(
  window: BrowserWindow,
  options: ElectronWindowStateOptions,
): void {
  const current = readElectronWindowState(options)
  if (window.isMaximized()) {
    options.writeJsonFile(options.path, { ...current, isMaximized: true })
    return
  }

  const bounds = window.getBounds()
  options.writeJsonFile(options.path, {
    ...current,
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized: false,
  })
}

export function saveElectronTodoPlanWindowState(
  window: BrowserWindow | null,
  options: ElectronWindowStateOptions,
  stableBounds?: ElectronWindowState,
): void {
  if (!window || window.isDestroyed() || window.isMinimized()) return

  const bounds = stableBounds || window.getBounds()
  options.writeJsonFile(options.path, {
    ...readElectronWindowState(options),
    todoPlan: {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
    },
  })
}
