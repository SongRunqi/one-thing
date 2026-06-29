import { BrowserWindow } from 'electron'

export interface ElectronMainWindowVisibilitySnapshot {
  window: BrowserWindow
  visible: boolean
}

export interface ElectronMainWindowVisibilityOptions {
  isMainWindowUrl(url: string): boolean
  getAllWindows?: () => BrowserWindow[]
  schedule?: (callback: () => void, delay: number) => unknown
  restoreDelaysMs?: number[]
}

const DEFAULT_RESTORE_DELAYS_MS = [0, 80, 250, 600, 1200, 2400]

export function isElectronMainAppWindow(
  window: BrowserWindow | null | undefined,
  options: Pick<ElectronMainWindowVisibilityOptions, 'isMainWindowUrl'>,
): window is BrowserWindow {
  if (!window || window.isDestroyed()) return false
  const url = window.webContents.getURL()
  return !url || options.isMainWindowUrl(url)
}

export function captureElectronMainWindowVisibility(
  options: ElectronMainWindowVisibilityOptions,
): ElectronMainWindowVisibilitySnapshot[] {
  const getAllWindows = options.getAllWindows ?? (() => BrowserWindow.getAllWindows())
  return getAllWindows()
    .filter(window => isElectronMainAppWindow(window, options))
    .map(window => ({
      window,
      visible: window.isVisible(),
    }))
}

export function restoreElectronHiddenMainWindows(
  snapshot: ElectronMainWindowVisibilitySnapshot[],
  options: Pick<ElectronMainWindowVisibilityOptions, 'schedule' | 'restoreDelaysMs'> = {},
): void {
  const hiddenMainWindows = snapshot.filter(item => !item.visible)
  if (!hiddenMainWindows.length) return

  const schedule = options.schedule ?? ((callback, delay) => setTimeout(callback, delay))
  const delays = options.restoreDelaysMs ?? DEFAULT_RESTORE_DELAYS_MS
  const restore = () => {
    for (const item of hiddenMainWindows) {
      if (!item.window.isDestroyed() && item.window.isVisible()) {
        item.window.hide()
      }
    }
  }

  for (const delay of delays) {
    schedule(restore, delay)
  }
}
