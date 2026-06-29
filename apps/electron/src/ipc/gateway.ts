import { ipcMain } from 'electron'
import type {
  GatewayGetStatusResponse,
  GatewayStartRequest,
  GatewayStartResponse,
  GatewayStatus,
  GatewayStopResponse,
  GatewayWechatLogoutResponse,
} from '@shared/ipc'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronGatewayIpcChannels {
  getStatus: string
  start: string
  stop: string
  wechatLogout: string
}

export interface ElectronGatewayIpcOperations {
  getStatus(): GatewayStatus
  start(request?: GatewayStartRequest): Promise<GatewayStatus> | GatewayStatus
  stop(): Promise<GatewayStatus> | GatewayStatus
  wechatLogout(): Promise<GatewayStatus> | GatewayStatus
}

export interface RegisterElectronGatewayIpcHandlersOptions {
  channels: ElectronGatewayIpcChannels
  operations: ElectronGatewayIpcOperations
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronGatewayIpcHandlers(
  options: RegisterElectronGatewayIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.getStatus, async (): Promise<GatewayGetStatusResponse> => {
    return toResponse(() => options.operations.getStatus())
  })

  host.handle(options.channels.start, async (_event, request?: GatewayStartRequest): Promise<GatewayStartResponse> => {
    return toResponse(() => options.operations.start(request))
  })

  host.handle(options.channels.stop, async (): Promise<GatewayStopResponse> => {
    return toResponse(() => options.operations.stop())
  })

  host.handle(options.channels.wechatLogout, async (): Promise<GatewayWechatLogoutResponse> => {
    return toResponse(() => options.operations.wechatLogout())
  })
}

async function toResponse<T extends GatewayStatus>(
  action: () => Promise<T> | T,
): Promise<{ success: boolean; status?: T; error?: string }> {
  try {
    return {
      success: true,
      status: await action(),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
