import { ipcMain, dialog, BrowserWindow, nativeTheme } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import * as store from '../store.js'
import { openSettingsWindow } from '../window.js'

export function registerSettingsHandlers() {
  // Open settings window
  ipcMain.handle(IPC_CHANNELS.OPEN_SETTINGS_WINDOW, async () => {
    const parentWindow = BrowserWindow.getFocusedWindow() || undefined
    openSettingsWindow(parentWindow)
    return { success: true }
  })

  // 获取设置
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, async () => {
    return { success: true, settings: store.getSettings() }
  })

  // 获取系统主题
  ipcMain.handle(IPC_CHANNELS.GET_SYSTEM_THEME, async () => {
    // nativeTheme.shouldUseDarkColors returns true if the OS is in dark mode
    const isDark = nativeTheme.shouldUseDarkColors
    return { success: true, theme: isDark ? 'dark' : 'light' }
  })

  // 监听系统主题变化
  nativeTheme.on('updated', () => {
    const isDark = nativeTheme.shouldUseDarkColors
    const theme = isDark ? 'dark' : 'light'
    // Broadcast to all windows
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send(IPC_CHANNELS.SYSTEM_THEME_CHANGED, theme)
    })
  })

  // 保存设置
  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, async (event, settings) => {
    store.saveSettings(settings)

    // Get the sender's webContents ID to exclude from broadcast
    const senderWebContentsId = event.sender.id

    // Broadcast settings change to OTHER windows (exclude sender to prevent race condition)
    // The sender already updated its local state, so it doesn't need the broadcast
    BrowserWindow.getAllWindows().forEach(win => {
      if (win.webContents.id !== senderWebContentsId) {
        win.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, settings)
      }
    })
    return { success: true }
  })

  // 显示打开目录对话框
  ipcMain.handle(IPC_CHANNELS.SHOW_OPEN_DIALOG, async (_event, options) => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow) {
      return dialog.showOpenDialog(focusedWindow, options)
    }
    return dialog.showOpenDialog(options)
  })
}
