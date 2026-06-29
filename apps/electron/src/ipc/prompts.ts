import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronPromptsIpcChannels {
  list: string
  get: string
  create: string
  update: string
  delete: string
}

export interface ElectronPromptGetRequest {
  id: string
}

export interface ElectronPromptCreateRequest {
  title: string
  body: string
  description?: string
  tags?: string[]
}

export interface ElectronPromptUpdateRequest {
  id: string
  title?: string
  body?: string
  description?: string
  tags?: string[]
}

export interface ElectronPromptDeleteRequest {
  id: string
}

export interface RegisterElectronPromptsIpcHandlersOptions {
  channels: ElectronPromptsIpcChannels
  listPrompts(): unknown
  getPrompt(request: ElectronPromptGetRequest): unknown
  createPrompt(request: ElectronPromptCreateRequest): unknown
  updatePrompt(request: ElectronPromptUpdateRequest): unknown
  deletePrompt(request: ElectronPromptDeleteRequest): unknown
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronPromptsIpcHandlers(
  options: RegisterElectronPromptsIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.list, () => {
    return options.listPrompts()
  })

  host.handle(options.channels.get, (_event, request: ElectronPromptGetRequest) => {
    return options.getPrompt(request)
  })

  host.handle(options.channels.create, (_event, request: ElectronPromptCreateRequest) => {
    return options.createPrompt(request)
  })

  host.handle(options.channels.update, (_event, request: ElectronPromptUpdateRequest) => {
    return options.updatePrompt(request)
  })

  host.handle(options.channels.delete, (_event, request: ElectronPromptDeleteRequest) => {
    return options.deletePrompt(request)
  })
}
