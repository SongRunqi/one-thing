/**
 * Search Everywhere — IPC handlers
 */

import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { isSearchCategory, type SearchRequest, type SearchResponse } from '../../shared/ipc/search.js'
import { closeSearchWindow } from './window.js'
import { executeSearch } from './providers.js'
import { executeSearchActionFrom, toggleSearchWindowFrom } from './window-controller.js'

export function registerSearchHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SEARCH_WINDOW_TOGGLE, async (event) => {
    return toggleSearchWindowFrom(BrowserWindow.fromWebContents(event.sender))
  })

  ipcMain.handle(IPC_CHANNELS.SEARCH_WINDOW_CLOSE, async () => {
    closeSearchWindow()
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.SEARCH_QUERY, async (_event, req: SearchRequest): Promise<SearchResponse> => {
    const category = isSearchCategory(req.category) ? req.category : 'all'
    const results = await executeSearch(req.query, category, req.limit)
    return { success: true, results }
  })

  ipcMain.handle(IPC_CHANNELS.SEARCH_EXECUTE_ACTION, async (event, actionId: string) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender)
    return executeSearchActionFrom(sourceWindow, actionId)
  })

  console.log('[Search] IPC handlers registered')
}
