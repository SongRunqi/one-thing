import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronACPIpcChannels {
  getAgents: string
  addAgent: string
  updateAgent: string
  removeAgent: string
  connectAgent: string
  disconnectAgent: string
  refreshAgent: string
  cancelSession: string
}

export interface ElectronACPAgentConfigRequest {
  config: unknown
}

export interface ElectronACPAgentIdRequest {
  agentId: string
}

export interface ElectronACPCancelSessionRequest {
  sessionId: string
  agentId?: string
}

export interface RegisterElectronACPIpcHandlersOptions {
  channels: ElectronACPIpcChannels
  getAgents(): unknown
  addAgent(request: ElectronACPAgentConfigRequest): unknown
  updateAgent(request: ElectronACPAgentConfigRequest): unknown
  removeAgent(request: ElectronACPAgentIdRequest): unknown
  connectAgent(request: ElectronACPAgentIdRequest): unknown
  disconnectAgent(request: ElectronACPAgentIdRequest): unknown
  refreshAgent(request: ElectronACPAgentIdRequest): unknown
  cancelSession(request: ElectronACPCancelSessionRequest): unknown
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronACPIpcHandlers(
  options: RegisterElectronACPIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.getAgents, () => {
    return options.getAgents()
  })

  host.handle(options.channels.addAgent, (_event, request: ElectronACPAgentConfigRequest) => {
    return options.addAgent(request)
  })

  host.handle(options.channels.updateAgent, (_event, request: ElectronACPAgentConfigRequest) => {
    return options.updateAgent(request)
  })

  host.handle(options.channels.removeAgent, (_event, request: ElectronACPAgentIdRequest) => {
    return options.removeAgent(request)
  })

  host.handle(options.channels.connectAgent, (_event, request: ElectronACPAgentIdRequest) => {
    return options.connectAgent(request)
  })

  host.handle(options.channels.disconnectAgent, (_event, request: ElectronACPAgentIdRequest) => {
    return options.disconnectAgent(request)
  })

  host.handle(options.channels.refreshAgent, (_event, request: ElectronACPAgentIdRequest) => {
    return options.refreshAgent(request)
  })

  host.handle(options.channels.cancelSession, (_event, request: ElectronACPCancelSessionRequest) => {
    return options.cancelSession(request)
  })
}
