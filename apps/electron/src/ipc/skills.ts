import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronSkillsIpcChannels {
  getAll: string
  refresh: string
  readFile: string
  openDirectory: string
  create: string
  delete: string
  toggleEnabled: string
}

export interface ElectronSkillsGetAllRequest {
  workingDirectory?: string
}

export interface ElectronSkillReadFileRequest {
  skillId: string
  fileName: string
}

export interface ElectronSkillOpenDirectoryRequest {
  skillId?: string
}

export interface ElectronSkillDeleteRequest {
  skillId: string
}

export interface ElectronSkillToggleEnabledRequest {
  skillId: string
  enabled: boolean
}

export interface RegisterElectronSkillsIpcHandlersOptions {
  channels: ElectronSkillsIpcChannels
  getAll(request?: ElectronSkillsGetAllRequest): unknown
  refresh(): unknown
  readFile(request: ElectronSkillReadFileRequest): unknown
  openDirectory(request?: ElectronSkillOpenDirectoryRequest): unknown
  create(request: unknown): unknown
  delete(request: ElectronSkillDeleteRequest): unknown
  toggleEnabled(request: ElectronSkillToggleEnabledRequest): unknown
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronSkillsIpcHandlers(
  options: RegisterElectronSkillsIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.getAll, (_event, request?: ElectronSkillsGetAllRequest) => {
    return options.getAll(request)
  })

  host.handle(options.channels.refresh, () => {
    return options.refresh()
  })

  host.handle(options.channels.readFile, (_event, request: ElectronSkillReadFileRequest) => {
    return options.readFile(request)
  })

  host.handle(options.channels.openDirectory, (_event, request?: ElectronSkillOpenDirectoryRequest) => {
    return options.openDirectory(request)
  })

  host.handle(options.channels.create, (_event, request: unknown) => {
    return options.create(request)
  })

  host.handle(options.channels.delete, (_event, request: ElectronSkillDeleteRequest) => {
    return options.delete(request)
  })

  host.handle(options.channels.toggleEnabled, (_event, request: ElectronSkillToggleEnabledRequest) => {
    return options.toggleEnabled(request)
  })
}
