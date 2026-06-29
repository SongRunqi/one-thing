import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronMemoryIpcHandlerDefinition {
  channel: string
  handle(...args: unknown[]): unknown
}

export interface RegisterElectronMemoryIpcHandlersOptions {
  handlers: ElectronMemoryIpcHandlerDefinition[]
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronMemoryIpcHandlers(
  options: RegisterElectronMemoryIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  for (const handler of options.handlers) {
    host.handle(handler.channel, (_event, ...args: unknown[]) => {
      return handler.handle(...args)
    })
  }
}
