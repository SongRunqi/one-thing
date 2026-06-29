import { ipcMain } from 'electron'
import type {
  VariablesDeleteRequest,
  VariablesListRequest,
  VariablesSetRequest,
} from '@onething/runtime/variables'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronVariablesIpcChannels {
  list: string
  set: string
  delete: string
}

export interface RegisterElectronVariablesIpcHandlersOptions {
  channels: ElectronVariablesIpcChannels
  listVariables(request: VariablesListRequest): unknown
  setVariable(request: VariablesSetRequest): unknown
  deleteVariable(request: VariablesDeleteRequest): unknown
  ipcMain?: ElectronIpcMainLike
  logger?: Pick<Console, 'log'>
}

export function registerElectronVariablesIpcHandlers(
  options: RegisterElectronVariablesIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.list, (_event, request: VariablesListRequest) => {
    return options.listVariables(request)
  })

  host.handle(options.channels.set, (_event, request: VariablesSetRequest) => {
    return options.setVariable(request)
  })

  host.handle(options.channels.delete, (_event, request: VariablesDeleteRequest) => {
    return options.deleteVariable(request)
  })

  options.logger?.log('[variables] IPC handlers registered (list/set/delete)')
}
