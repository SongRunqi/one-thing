import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import * as store from '../store'

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
}
