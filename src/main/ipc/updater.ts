/**
 * Updater IPC Handlers
 * Handles updater-related IPC communication
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc/channels.js'
import { checkForUpdates, getUpdateStatus, openReleasePage } from '../updater.js'

export function registerUpdaterHandlers() {
  // Manual check for updates
  ipcMain.handle(IPC_CHANNELS.UPDATER_CHECK, async () => {
    return await checkForUpdates(true)
  })

  // Get current update status
  ipcMain.handle(IPC_CHANNELS.UPDATER_STATUS, () => {
    return getUpdateStatus()
  })

  // Open GitHub Release page in browser
  ipcMain.handle(IPC_CHANNELS.UPDATER_OPEN_RELEASE, () => {
    openReleasePage()
    return { success: true }
  })
}
