import {
  saveOnethingUiStateForIpc,
  type OnethingUiStatePatch,
} from '@onething/runtime/storage'
import { IPC_CHANNELS } from '@shared/ipc.js'
import { getAppState } from '@main/stores/app-state.js'
import { getAppStatePath } from '@main/stores/paths.js'
import { registerElectronAppStateIpcHandlers } from './app-state-controller.js'

export { registerElectronAppStateIpcHandlers } from './app-state-controller.js'
export type {
  ElectronAppStateIpcChannels,
  ElectronIpcMainLike,
  RegisterElectronAppStateIpcHandlersOptions,
} from './app-state-controller.js'

export function registerAppStateHandlers(): void {
  registerElectronAppStateIpcHandlers({
    channels: {
      getAppState: IPC_CHANNELS.GET_APP_STATE,
      saveUiState: IPC_CHANNELS.SAVE_UI_STATE,
    },
    getAppState,
    saveUiState: (uiState: OnethingUiStatePatch) => {
      return saveOnethingUiStateForIpc(getAppStatePath(), uiState)
    },
  })
}
