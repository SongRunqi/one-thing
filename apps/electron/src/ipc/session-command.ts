import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronSessionCommandRequest {
  sessionId: string
  command: unknown
}

export interface RegisterElectronSessionCommandIpcHandlerOptions {
  channel: string
  handleCommand(request: ElectronSessionCommandRequest): unknown
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronSessionCommandIpcHandler(
  options: RegisterElectronSessionCommandIpcHandlerOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channel, (_event, request: ElectronSessionCommandRequest) => {
    return options.handleCommand(request)
  })
}
