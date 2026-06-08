import { BrowserWindow } from 'electron'
import { isMainAppWindowUrl } from './window-target.js'

export function isMainAppWindow(win: BrowserWindow | null | undefined): win is BrowserWindow {
  return Boolean(win && !win.isDestroyed() && isMainAppWindowUrl(win.webContents.getURL()))
}

export function findMainAppWindow(sourceWindow?: BrowserWindow | null): BrowserWindow | null {
  const source = sourceWindow && !sourceWindow.isDestroyed() ? sourceWindow : null
  if (source && isMainAppWindowUrl(source.webContents.getURL())) return source

  const parentWindow = source?.getParentWindow()
  if (isMainAppWindow(parentWindow)) return parentWindow

  const focusedWindow = BrowserWindow.getFocusedWindow()
  if (isMainAppWindow(focusedWindow)) return focusedWindow

  return BrowserWindow.getAllWindows().find(isMainAppWindow) ?? null
}
