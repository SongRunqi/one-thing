import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronProvidersIpcChannels {
  list: string
  usage: string
  envStatus: string
}

export interface ElectronProviderUsageRequest {
  providerId: string
}

export interface ElectronProviderEnvStatusRequest {
  providerId: string
}

export interface RegisterElectronProvidersIpcHandlersOptions {
  channels: ElectronProvidersIpcChannels
  listProviders(): unknown
  getUsage(request: ElectronProviderUsageRequest): unknown
  getEnvStatus(request: ElectronProviderEnvStatusRequest): unknown
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronProvidersIpcHandlers(
  options: RegisterElectronProvidersIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.list, () => {
    return options.listProviders()
  })

  host.handle(options.channels.usage, (_event, request: ElectronProviderUsageRequest) => {
    return options.getUsage(request)
  })

  host.handle(options.channels.envStatus, (_event, request: ElectronProviderEnvStatusRequest) => {
    return options.getEnvStatus(request)
  })
}
