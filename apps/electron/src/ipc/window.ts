import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc.js'

/**
 * Lets a renderer close its own window. The main window uses this for Cmd+W on
 * the last remaining tab: the renderer owns the tab tree, so only it knows when
 * nothing is left to fall back to.
 */
export function registerWindowHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || window.isDestroyed()) return { success: false }
    window.close()
    return { success: true }
  })
}
