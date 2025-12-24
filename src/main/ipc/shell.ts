/**
 * Shell IPC Handlers
 *
 * Handles shell-related operations like opening folders in file explorer.
 */

import { ipcMain, shell, app } from 'electron'
import path from 'path'

export function registerShellHandlers() {
  // Open a path in the system file explorer
  ipcMain.handle('shell:open-path', async (_, filePath: string) => {
    return shell.openPath(filePath)
  })

  // Get the app data folder path
  ipcMain.handle('app:get-data-path', () => {
    return path.join(app.getPath('userData'), 'data')
  })
}
