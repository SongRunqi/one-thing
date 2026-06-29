import type { BrowserWindow } from 'electron'

export interface ElectronWindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized?: boolean
}

export interface ElectronWindowStateFile extends ElectronWindowState {
  todoPlan?: ElectronWindowState
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
  }
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
