import { ipcMain } from 'electron'
import type {
  TerminalAckPayload,
  TerminalAttachRequest,
  TerminalAttachResponse,
  TerminalCreateRequest,
  TerminalCreateResponse,
  TerminalKillRequest,
  TerminalListResponse,
  TerminalResizeRequest,
  TerminalSimpleResponse,
  TerminalWriteRequest,
} from '@shared/ipc.js'

export interface ElectronTerminalIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void
}

export interface ElectronTerminalIpcChannels {
  create: string
  list: string
  write: string
  resize: string
  kill: string
  attach: string
  /** One-way renderer→main flow-control ack — registered with `on`, not `handle`. */
  ack: string
}

export interface RegisterElectronTerminalIpcHandlersOptions {
  channels: ElectronTerminalIpcChannels
  create(request: TerminalCreateRequest): TerminalCreateResponse | Promise<TerminalCreateResponse>
  list(): TerminalListResponse | Promise<TerminalListResponse>
  write(request: TerminalWriteRequest): TerminalSimpleResponse | Promise<TerminalSimpleResponse>
  resize(request: TerminalResizeRequest): TerminalSimpleResponse | Promise<TerminalSimpleResponse>
  kill(request: TerminalKillRequest): TerminalSimpleResponse | Promise<TerminalSimpleResponse>
  attach(request: TerminalAttachRequest): TerminalAttachResponse | Promise<TerminalAttachResponse>
  ack(payload: TerminalAckPayload): void
  ipcMain?: ElectronTerminalIpcMainLike
}

export function registerElectronTerminalIpcHandlers(
  options: RegisterElectronTerminalIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.create, (_event, request: TerminalCreateRequest) =>
    options.create(request ?? {}),
  )
  host.handle(options.channels.list, () => options.list())
  host.handle(options.channels.write, (_event, request: TerminalWriteRequest) =>
    options.write(request),
  )
  host.handle(options.channels.resize, (_event, request: TerminalResizeRequest) =>
    options.resize(request),
  )
  host.handle(options.channels.kill, (_event, request: TerminalKillRequest) =>
    options.kill(request),
  )
  host.handle(options.channels.attach, (_event, request: TerminalAttachRequest) =>
    options.attach(request),
  )
  host.on(options.channels.ack, (_event, payload) => {
    options.ack(payload as TerminalAckPayload)
  })
}
