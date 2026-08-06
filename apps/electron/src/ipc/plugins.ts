import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronPluginsIpcChannels {
  list: string
  enable: string
  disable: string
  refresh: string
  commands: string
  executeCommand: string
  request: string
  abortRequest: string
}

export interface ElectronPluginToggleRequest {
  pluginId: string
}

export interface ElectronPluginExecuteCommandRequest {
  commandName: string
  args?: string
  sessionId: string
}

export interface ElectronPluginRequestPayload {
  pluginId: string
  action: string
  payload?: unknown
  requestId?: string
}

export interface ElectronPluginAbortRequestPayload {
  requestId: string
}

export interface RegisterElectronPluginsIpcHandlersOptions {
  channels: ElectronPluginsIpcChannels
  listPlugins(): unknown
  enablePlugin(request: ElectronPluginToggleRequest): unknown
  disablePlugin(request: ElectronPluginToggleRequest): unknown
  refreshPlugins(): unknown
  listCommands(): unknown
  executeCommand(request: ElectronPluginExecuteCommandRequest): unknown
  pluginRequest(request: ElectronPluginRequestPayload): unknown
  abortPluginRequest(request: ElectronPluginAbortRequestPayload): unknown
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronPluginsIpcHandlers(
  options: RegisterElectronPluginsIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.list, () => {
    return options.listPlugins()
  })

  host.handle(options.channels.enable, (_event, request: ElectronPluginToggleRequest) => {
    return options.enablePlugin(request)
  })

  host.handle(options.channels.disable, (_event, request: ElectronPluginToggleRequest) => {
    return options.disablePlugin(request)
  })

  host.handle(options.channels.refresh, () => {
    return options.refreshPlugins()
  })

  host.handle(options.channels.commands, () => {
    return options.listCommands()
  })

  host.handle(options.channels.executeCommand, (_event, request: ElectronPluginExecuteCommandRequest) => {
    return options.executeCommand(request)
  })

  host.handle(options.channels.request, (_event, request: ElectronPluginRequestPayload) => {
    return options.pluginRequest(request)
  })

  host.handle(options.channels.abortRequest, (_event, request: ElectronPluginAbortRequestPayload) => {
    return options.abortPluginRequest(request)
  })
}
