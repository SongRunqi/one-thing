import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronModelsIpcChannels {
  getWithCapabilities: string
  getAll: string
  search: string
  refreshRegistry: string
  getNameAliases: string
  getDisplayName: string
}

export interface ElectronModelsWithCapabilitiesRequest {
  providerId: string
  forceRefresh?: boolean
}

export interface ElectronModelsSearchRequest {
  query: string
  providerId?: string
}

export interface ElectronModelDisplayNameRequest {
  modelId: string
}

export interface RegisterElectronModelsIpcHandlersOptions {
  channels: ElectronModelsIpcChannels
  getModelsWithCapabilities(request: ElectronModelsWithCapabilitiesRequest): unknown
  getAllModels(): unknown
  searchModels(request: ElectronModelsSearchRequest): unknown
  refreshModelRegistry(): unknown
  getModelNameAliases(): unknown
  getModelDisplayName(request: ElectronModelDisplayNameRequest): unknown
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronModelsIpcHandlers(
  options: RegisterElectronModelsIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.getWithCapabilities, (_event, request: ElectronModelsWithCapabilitiesRequest) => {
    return options.getModelsWithCapabilities(request)
  })

  host.handle(options.channels.getAll, () => {
    return options.getAllModels()
  })

  host.handle(options.channels.search, (_event, request: ElectronModelsSearchRequest) => {
    return options.searchModels(request)
  })

  host.handle(options.channels.refreshRegistry, () => {
    return options.refreshModelRegistry()
  })

  host.handle(options.channels.getNameAliases, () => {
    return options.getModelNameAliases()
  })

  host.handle(options.channels.getDisplayName, (_event, request: ElectronModelDisplayNameRequest) => {
    return options.getModelDisplayName(request)
  })
}
