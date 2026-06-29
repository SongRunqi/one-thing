import { ipcMain, type WebContents } from 'electron'
import {
  openElectronExternal,
  openElectronPath,
  setElectronWindowButtonVisibility,
  type ElectronOpenExternalResult,
} from '../shell/operations.js'

export interface ElectronShellIpcEvent {
  sender: WebContents
}

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: ElectronShellIpcEvent, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronShellIpcChannels {
  openPath: string
  openExternal: string
  getDataPath: string
  setWindowButtonVisibility: string
}

export interface ElectronShellIpcOperations {
  openPath(filePath: string): Promise<string>
  openExternal(url: string): Promise<ElectronOpenExternalResult>
  setWindowButtonVisibility(sender: WebContents, visible: boolean): void
}

export interface RegisterElectronShellIpcHandlersOptions {
  getDataPath(): string
  channels?: Partial<ElectronShellIpcChannels>
  operations?: Partial<ElectronShellIpcOperations>
  ipcMain?: ElectronIpcMainLike
}

const DEFAULT_CHANNELS: ElectronShellIpcChannels = {
  openPath: 'shell:open-path',
  openExternal: 'shell:open-external',
  getDataPath: 'app:get-data-path',
  setWindowButtonVisibility: 'window:set-button-visibility',
}

export function registerElectronShellIpcHandlers(
  options: RegisterElectronShellIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain
  const channels = {
    ...DEFAULT_CHANNELS,
    ...options.channels,
  }
  const operations: ElectronShellIpcOperations = {
    openPath: options.operations?.openPath ?? openElectronPath,
    openExternal: options.operations?.openExternal ?? openElectronExternal,
    setWindowButtonVisibility: options.operations?.setWindowButtonVisibility ?? setElectronWindowButtonVisibility,
  }

  host.handle(channels.openPath, (_event, filePath: string) => {
    return operations.openPath(filePath)
  })

  host.handle(channels.openExternal, (_event, url: string) => {
    return operations.openExternal(url)
  })

  host.handle(channels.getDataPath, () => {
    return options.getDataPath()
  })

  host.handle(channels.setWindowButtonVisibility, (event, visible: boolean) => {
    operations.setWindowButtonVisibility(event.sender, visible)
  })
}
