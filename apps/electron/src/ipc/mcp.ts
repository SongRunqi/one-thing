import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronMCPIpcChannels {
  getServers: string
  addServer: string
  updateServer: string
  removeServer: string
  connectServer: string
  disconnectServer: string
  logoutServer: string
  probeServer: string
  refreshServer: string
  getTools: string
  callTool: string
  getResources: string
  readResource: string
  getPrompts: string
  getPrompt: string
  readConfigFile: string
}

export interface RegisterElectronMCPIpcHandlersOptions {
  channels: ElectronMCPIpcChannels
  getServers(): unknown
  addServer(request: unknown): unknown
  updateServer(request: unknown): unknown
  removeServer(request: unknown): unknown
  connectServer(request: unknown): unknown
  disconnectServer(request: unknown): unknown
  logoutServer(request: unknown): unknown
  probeServer(request: unknown): unknown
  refreshServer(request: unknown): unknown
  getTools(): unknown
  callTool(request: unknown): unknown
  getResources(): unknown
  readResource(request: unknown): unknown
  getPrompts(): unknown
  getPrompt(request: unknown): unknown
  readConfigFile(request: unknown): unknown
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronMCPIpcHandlers(
  options: RegisterElectronMCPIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.getServers, () => {
    return options.getServers()
  })

  host.handle(options.channels.addServer, (_event, request: unknown) => {
    return options.addServer(request)
  })

  host.handle(options.channels.updateServer, (_event, request: unknown) => {
    return options.updateServer(request)
  })

  host.handle(options.channels.removeServer, (_event, request: unknown) => {
    return options.removeServer(request)
  })

  host.handle(options.channels.connectServer, (_event, request: unknown) => {
    return options.connectServer(request)
  })

  host.handle(options.channels.disconnectServer, (_event, request: unknown) => {
    return options.disconnectServer(request)
  })

  host.handle(options.channels.logoutServer, (_event, request: unknown) => {
    return options.logoutServer(request)
  })

  host.handle(options.channels.probeServer, (_event, request: unknown) => {
    return options.probeServer(request)
  })

  host.handle(options.channels.refreshServer, (_event, request: unknown) => {
    return options.refreshServer(request)
  })

  host.handle(options.channels.getTools, () => {
    return options.getTools()
  })

  host.handle(options.channels.callTool, (_event, request: unknown) => {
    return options.callTool(request)
  })

  host.handle(options.channels.getResources, () => {
    return options.getResources()
  })

  host.handle(options.channels.readResource, (_event, request: unknown) => {
    return options.readResource(request)
  })

  host.handle(options.channels.getPrompts, () => {
    return options.getPrompts()
  })

  host.handle(options.channels.getPrompt, (_event, request: unknown) => {
    return options.getPrompt(request)
  })

  host.handle(options.channels.readConfigFile, (_event, request: unknown) => {
    return options.readConfigFile(request)
  })
}
