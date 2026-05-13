/**
 * Search Everywhere — IPC handlers
 */

import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { SearchRequest, SearchResponse } from '../../shared/ipc/search.js'
import { toggleSearchWindow, closeSearchWindow } from './window.js'
import { createDailyNote, executeSearch } from './providers.js'
import { isMainAppWindowUrl } from './window-target.js'

function isMainAppWindow(win: BrowserWindow | null | undefined): win is BrowserWindow {
  if (!win || win.isDestroyed()) return false
  return isMainAppWindowUrl(win.webContents.getURL())
}

function findMainAppWindow(sourceWindow?: BrowserWindow | null): BrowserWindow | null {
  const parentWindow = sourceWindow?.getParentWindow()
  if (isMainAppWindow(parentWindow)) return parentWindow

  const focusedWindow = BrowserWindow.getFocusedWindow()
  if (isMainAppWindow(focusedWindow)) return focusedWindow

  return BrowserWindow.getAllWindows().find(isMainAppWindow) ?? null
}

export function registerSearchHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SEARCH_WINDOW_TOGGLE, async () => {
    const parentWindow = BrowserWindow.getFocusedWindow()
      || BrowserWindow.getAllWindows().find(w => !w.isDestroyed())
    if (!parentWindow) return { success: false }
    toggleSearchWindow(parentWindow)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.SEARCH_WINDOW_CLOSE, async () => {
    closeSearchWindow()
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.SEARCH_QUERY, async (_event, req: SearchRequest): Promise<SearchResponse> => {
    const results = await executeSearch(req.query, req.category, req.limit)
    return { success: true, results }
  })

  // Action execution: search window tells main window to run an action
  ipcMain.handle(IPC_CHANNELS.SEARCH_EXECUTE_ACTION, async (event, actionId: string) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender)
    closeSearchWindow()

    let resolvedActionId = actionId
    if (actionId.startsWith('create-daily-note:')) {
      const encodedPath = actionId.slice('create-daily-note:'.length)
      const filePath = decodeURIComponent(encodedPath)
      await createDailyNote(filePath)
      resolvedActionId = `open-file:${filePath}`
    }

    const mainWindow = findMainAppWindow(sourceWindow)

    if (mainWindow) {
      mainWindow.webContents.send('search:action', resolvedActionId)
      mainWindow.focus()
    } else {
      console.warn('[Search] No main app window found for action:', resolvedActionId)
    }
    return { success: true }
  })

  console.log('[Search] IPC handlers registered')
}
