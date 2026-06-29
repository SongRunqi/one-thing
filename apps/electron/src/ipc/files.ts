import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronFilesIpcChannels {
  listFiles: string
  rollback: string
  listDirs: string
  readContent: string
  saveContent: string
  listDirectory: string
  stat: string
  create: string
  createDirectory: string
  rename: string
  delete: string
  reveal: string
  watchStart: string
  watchStop: string
}

export interface RegisterElectronFilesIpcHandlersOptions {
  channels: ElectronFilesIpcChannels
  listFiles(request: unknown): unknown
  rollback(request: unknown): unknown
  listDirs(request: unknown): unknown
  readContent(request: unknown): unknown
  saveContent(request: unknown): unknown
  listDirectory(request: unknown): unknown
  stat(request: unknown): unknown
  create(request: unknown): unknown
  createDirectory(request: unknown): unknown
  rename(request: unknown): unknown
  delete(request: unknown): unknown
  reveal(request: unknown): unknown
  watchStart(request: unknown): unknown
  watchStop(request: unknown): unknown
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronFilesIpcHandlers(
  options: RegisterElectronFilesIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.listFiles, (_event, request: unknown) => options.listFiles(request))
  host.handle(options.channels.rollback, (_event, request: unknown) => options.rollback(request))
  host.handle(options.channels.listDirs, (_event, request: unknown) => options.listDirs(request))
  host.handle(options.channels.readContent, (_event, request: unknown) => options.readContent(request))
  host.handle(options.channels.saveContent, (_event, request: unknown) => options.saveContent(request))
  host.handle(options.channels.listDirectory, (_event, request: unknown) => options.listDirectory(request))
  host.handle(options.channels.stat, (_event, request: unknown) => options.stat(request))
  host.handle(options.channels.create, (_event, request: unknown) => options.create(request))
  host.handle(options.channels.createDirectory, (_event, request: unknown) => options.createDirectory(request))
  host.handle(options.channels.rename, (_event, request: unknown) => options.rename(request))
  host.handle(options.channels.delete, (_event, request: unknown) => options.delete(request))
  host.handle(options.channels.reveal, (_event, request: unknown) => options.reveal(request))
  host.handle(options.channels.watchStart, (_event, request: unknown) => options.watchStart(request))
  host.handle(options.channels.watchStop, (_event, request: unknown) => options.watchStop(request))
}
