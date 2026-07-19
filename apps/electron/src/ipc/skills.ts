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
  listDirectories?: string
  addDirectory?: string
  updateDirectory?: string
  removeDirectory?: string
  setAgent?: string
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

export interface ElectronSkillAddDirectoryRequest {
  path: string
  label?: string
  agentId?: string | null
}

export interface ElectronSkillUpdateDirectoryRequest {
  id: string
  enabled?: boolean
  label?: string
  agentId?: string | null
}

export interface ElectronSkillRemoveDirectoryRequest {
  id: string
}

export interface ElectronSkillSetAgentRequest {
  skillId: string
  agentId: string | null
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
  listDirectories?(): unknown
  addDirectory?(request: ElectronSkillAddDirectoryRequest): unknown
  updateDirectory?(request: ElectronSkillUpdateDirectoryRequest): unknown
  removeDirectory?(request: ElectronSkillRemoveDirectoryRequest): unknown
  setAgent?(request: ElectronSkillSetAgentRequest): unknown
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

  if (options.channels.listDirectories && options.listDirectories) {
    const listDirectories = options.listDirectories
    host.handle(options.channels.listDirectories, () => listDirectories())
  }

  if (options.channels.addDirectory && options.addDirectory) {
    const addDirectory = options.addDirectory
    host.handle(options.channels.addDirectory, (_event, request: ElectronSkillAddDirectoryRequest) => {
      return addDirectory(request)
    })
  }

  if (options.channels.updateDirectory && options.updateDirectory) {
    const updateDirectory = options.updateDirectory
    host.handle(options.channels.updateDirectory, (_event, request: ElectronSkillUpdateDirectoryRequest) => {
      return updateDirectory(request)
    })
  }

  if (options.channels.removeDirectory && options.removeDirectory) {
    const removeDirectory = options.removeDirectory
    host.handle(options.channels.removeDirectory, (_event, request: ElectronSkillRemoveDirectoryRequest) => {
      return removeDirectory(request)
    })
  }

  if (options.channels.setAgent && options.setAgent) {
    const setAgent = options.setAgent
    host.handle(options.channels.setAgent, (_event, request: ElectronSkillSetAgentRequest) => {
      return setAgent(request)
    })
  }
}
