import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronTodoPlanIpcChannels {
  get: string
  create: string
  update: string
  rename: string
  delete: string
  revealDirectory: string
  openWindow: string
  hideWindow: string
  toggleWindow: string
  setWindowPinned: string
}

export interface ElectronTodoPlanPinnedRequest {
  pinned: boolean
}

export interface RegisterElectronTodoPlanIpcHandlersOptions {
  channels: ElectronTodoPlanIpcChannels
  get(request?: unknown): unknown
  create(request: unknown): unknown
  update(request: unknown): unknown
  rename(request: unknown): unknown
  delete(request: unknown): unknown
  revealDirectory(): unknown
  openWindow(request?: unknown): unknown
  hideWindow(request?: unknown): unknown
  toggleWindow(request?: unknown): unknown
  setWindowPinned(request: ElectronTodoPlanPinnedRequest): unknown
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronTodoPlanIpcHandlers(
  options: RegisterElectronTodoPlanIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.get, (_event, request?: unknown) => {
    return options.get(request)
  })

  host.handle(options.channels.create, (_event, request: unknown) => {
    return options.create(request)
  })

  host.handle(options.channels.update, (_event, request: unknown) => {
    return options.update(request)
  })

  host.handle(options.channels.rename, (_event, request: unknown) => {
    return options.rename(request)
  })

  host.handle(options.channels.delete, (_event, request: unknown) => {
    return options.delete(request)
  })

  host.handle(options.channels.revealDirectory, () => {
    return options.revealDirectory()
  })

  host.handle(options.channels.openWindow, (_event, request?: unknown) => {
    return options.openWindow(request)
  })

  host.handle(options.channels.hideWindow, (_event, request?: unknown) => {
    return options.hideWindow(request)
  })

  host.handle(options.channels.toggleWindow, (_event, request?: unknown) => {
    return options.toggleWindow(request)
  })

  host.handle(options.channels.setWindowPinned, (_event, request: ElectronTodoPlanPinnedRequest) => {
    return options.setWindowPinned(request)
  })
}
