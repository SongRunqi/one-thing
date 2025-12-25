/**
 * Shell IPC Handlers
 *
 * Handles shell-related operations like opening folders in file explorer.
 */

import { ipcMain, shell, app, BrowserWindow } from 'electron'
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

  // Set window button (traffic lights) visibility (macOS only)
  ipcMain.handle('window:set-button-visibility', (event, visible: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && process.platform === 'darwin') {
      win.setWindowButtonVisibility(visible)
      // Restore traffic light position after showing (macOS resets position on visibility change)
      if (visible) {
        win.setWindowButtonPosition({ x: 16, y: 17 })
      }
    }
  })
}
