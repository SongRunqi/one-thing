/**
 * Search Everywhere — IPC handlers
 */

import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { SearchRequest, SearchResponse } from '../../shared/ipc/search.js'
import { toggleSearchWindow, closeSearchWindow } from './window.js'
import { executeSearch } from './providers.js'

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
  ipcMain.handle(IPC_CHANNELS.SEARCH_EXECUTE_ACTION, async (_event, actionId: string) => {
    closeSearchWindow()

    const mainWindow = BrowserWindow.getAllWindows().find(w => {
      // Main window is the one that is NOT the search window, settings window, etc.
      // It's the largest / first one that has no parent
      return !w.isDestroyed() && !w.getParentWindow()
    })

    if (mainWindow) {
      mainWindow.webContents.send('search:action', actionId)
      mainWindow.focus()
    }
    return { success: true }
  })

  console.log('[Search] IPC handlers registered')
}
