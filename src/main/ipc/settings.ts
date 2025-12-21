import { ipcMain, dialog, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import * as store from '../store.js'

export function registerSettingsHandlers() {
  // 获取设置
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, async () => {
    return { success: true, settings: store.getSettings() }
  })

  // 保存设置
  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, async (_event, settings) => {
    store.saveSettings(settings)
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
