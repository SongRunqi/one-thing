import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { getAppState, saveAppState } from '../stores/app-state.js'
import type { AppState, SerializedTab } from '../stores/app-state.js'

export function registerAppStateHandlers() {
  ipcMain.handle(IPC_CHANNELS.GET_APP_STATE, () => {
    return getAppState()
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_UI_STATE, (_event, uiState: {
    openTabs?: SerializedTab[]
    activeTabIndex?: number
    sidebarCollapsed?: boolean
  }) => {
    const state = getAppState()
    if (uiState.openTabs !== undefined) state.openTabs = uiState.openTabs
    if (uiState.activeTabIndex !== undefined) state.activeTabIndex = uiState.activeTabIndex
    if (uiState.sidebarCollapsed !== undefined) state.sidebarCollapsed = uiState.sidebarCollapsed
    saveAppState(state)
    return { success: true }
  })
}
