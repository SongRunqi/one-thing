import { app, BrowserWindow, type BrowserWindow as ElectronBrowserWindow } from 'electron'

export interface ElectronDidBecomeActiveAppLike {
  on(event: 'did-become-active', listener: () => void): void
}

export interface ElectronBrowserWindowFocusAdapter {
  getFocusedWindow(): ElectronBrowserWindow | null
}

export interface ElectronDidBecomeActiveOptions {
  getMainWindow(): ElectronBrowserWindow | null
  isTodoPlanWindow(window: ElectronBrowserWindow | null): boolean
  activateMainWindow(window: ElectronBrowserWindow | null): boolean
  app?: ElectronDidBecomeActiveAppLike
  browserWindow?: ElectronBrowserWindowFocusAdapter
  defer?: (callback: () => void) => unknown
}

export function registerElectronDidBecomeActiveHandler(
  options: ElectronDidBecomeActiveOptions,
): void {
  const electronApp = options.app ?? app
  const browserWindow = options.browserWindow ?? BrowserWindow
  const defer = options.defer ?? (callback => setTimeout(callback, 0))

  electronApp.on('did-become-active', () => {
    defer(() => {
      const mainWindow = options.getMainWindow()
      if (!mainWindow || mainWindow.isDestroyed()) return

      const focusedWindow = browserWindow.getFocusedWindow()
      if (options.isTodoPlanWindow(focusedWindow)) {
        options.activateMainWindow(mainWindow)
      }
    })
  })
}
