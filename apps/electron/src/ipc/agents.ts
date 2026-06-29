import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronAgentsIpcChannels {
  list: string
  create: string
  update: string
  delete: string
}

export interface ElectronAgentCreateRequest {
  name?: string
  systemPrompt?: string
}

export interface ElectronAgentUpdateRequest {
  agentId?: string
  name?: string
  systemPrompt?: string
}

export interface ElectronAgentDeleteRequest {
  agentId?: string
}

export interface RegisterElectronAgentsIpcHandlersOptions {
  channels: ElectronAgentsIpcChannels
  listAgents(): unknown
  createAgent(request: ElectronAgentCreateRequest): unknown
  updateAgent(request: ElectronAgentUpdateRequest): unknown
  deleteAgent(request: ElectronAgentDeleteRequest): unknown
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronAgentsIpcHandlers(
  options: RegisterElectronAgentsIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.list, () => {
    return options.listAgents()
  })

  host.handle(options.channels.create, (_event, request: ElectronAgentCreateRequest) => {
    return options.createAgent(request)
  })

  host.handle(options.channels.update, (_event, request: ElectronAgentUpdateRequest) => {
    return options.updateAgent(request)
  })

  host.handle(options.channels.delete, (_event, request: ElectronAgentDeleteRequest) => {
    return options.deleteAgent(request)
  })
}
