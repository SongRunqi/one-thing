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
  /** 「删除」= 退休或硬删(域模型 §3.2)。 */
  delete: string
  /** 重新入职(域模型 §8)。 */
  restore: string
}

export interface ElectronAgentModelBinding {
  providerId?: string
  modelId?: string
  thinking?: string
}

export interface ElectronAgentCreateRequest {
  name?: string
  systemPrompt?: string
  tools?: string[]
  title?: string
  avatar?: string
  avatarImage?: string
  color?: string
  description?: string
  model?: ElectronAgentModelBinding
  toolGrants?: string[]
  permissionMode?: string
  maxTurns?: number
}

export interface ElectronAgentUpdateRequest {
  agentId?: string
  name?: string
  systemPrompt?: string
  tools?: string[] | null
  title?: string | null
  avatar?: string | null
  avatarImage?: string | null
  color?: string | null
  description?: string | null
  model?: ElectronAgentModelBinding | null
  toolGrants?: string[] | null
  permissionMode?: string | null
  maxTurns?: number | null
}

export interface ElectronAgentDeleteRequest {
  agentId?: string
}

export interface ElectronAgentRestoreRequest {
  agentId?: string
}

export interface RegisterElectronAgentsIpcHandlersOptions {
  channels: ElectronAgentsIpcChannels
  listAgents(): unknown
  createAgent(request: ElectronAgentCreateRequest): unknown
  updateAgent(request: ElectronAgentUpdateRequest): unknown
  deleteAgent(request: ElectronAgentDeleteRequest): unknown
  restoreAgent(request: ElectronAgentRestoreRequest): unknown
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

  host.handle(options.channels.restore, (_event, request: ElectronAgentRestoreRequest) => {
    return options.restoreAgent(request)
  })
}
