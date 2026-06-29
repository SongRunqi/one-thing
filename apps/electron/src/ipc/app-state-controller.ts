import { ipcMain } from 'electron'
import type { OnethingUiStatePatch } from '@onething/runtime/storage'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronAppStateIpcChannels {
  getAppState: string
  saveUiState: string
}

export interface RegisterElectronAppStateIpcHandlersOptions {
  channels: ElectronAppStateIpcChannels
  getAppState(): unknown
  saveUiState(uiState: OnethingUiStatePatch): unknown
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronAppStateIpcHandlers(
  options: RegisterElectronAppStateIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.getAppState, () => {
    return options.getAppState()
  })

  host.handle(options.channels.saveUiState, (_event, uiState: OnethingUiStatePatch) => {
    return options.saveUiState(uiState)
  })
}
