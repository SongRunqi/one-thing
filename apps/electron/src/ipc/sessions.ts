import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronSessionIpcHandlerDefinition {
  channel: string
  handle(...args: unknown[]): unknown
}

export interface RegisterElectronSessionIpcHandlersOptions {
  handlers: ElectronSessionIpcHandlerDefinition[]
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronSessionIpcHandlers(
  options: RegisterElectronSessionIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  for (const handler of options.handlers) {
    host.handle(handler.channel, (_event, ...args: unknown[]) => {
      return handler.handle(...args)
    })
  }
}
