import { ipcMain } from 'electron'
import type {
  GatewayGetStatusResponse,
  GatewayWechatAddAccountRequest,
  GatewayWechatAddAccountResponse,
  GatewayWechatStopAccountRequest,
  GatewayWechatStopAccountResponse,
  GatewayWechatRemoveAccountRequest,
  GatewayWechatRemoveAccountResponse,
  GatewayWechatRenameAccountRequest,
  GatewayWechatRenameAccountResponse,
  GatewayWechatLogoutRequest,
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
  wechatAddAccount: string
  wechatStopAccount: string
  wechatRemoveAccount: string
  wechatRenameAccount: string
}

export interface ElectronGatewayIpcOperations {
  getStatus(): GatewayStatus
  start(request?: GatewayStartRequest): Promise<GatewayStatus> | GatewayStatus
  stop(): Promise<GatewayStatus> | GatewayStatus
  wechatLogout(request?: GatewayWechatLogoutRequest): Promise<GatewayStatus> | GatewayStatus
  wechatAddAccount(request?: GatewayWechatAddAccountRequest): Promise<{
    status: GatewayStatus
    account?: NonNullable<GatewayWechatAddAccountResponse['account']>
  }>
  wechatStopAccount(request: GatewayWechatStopAccountRequest): Promise<GatewayStatus> | GatewayStatus
  wechatRemoveAccount(request: GatewayWechatRemoveAccountRequest): Promise<GatewayStatus> | GatewayStatus
  wechatRenameAccount(request: GatewayWechatRenameAccountRequest): Promise<{
    status: GatewayStatus
    account?: NonNullable<GatewayWechatRenameAccountResponse['account']>
  }>
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

  host.handle(options.channels.wechatLogout, async (_event, request?: GatewayWechatLogoutRequest): Promise<GatewayWechatLogoutResponse> => {
    return toResponse(() => options.operations.wechatLogout(request))
  })

  host.handle(options.channels.wechatAddAccount, async (_event, request?: GatewayWechatAddAccountRequest): Promise<GatewayWechatAddAccountResponse> => {
    return toObjectResponse(() => options.operations.wechatAddAccount(request))
  })

  host.handle(options.channels.wechatStopAccount, async (_event, request: GatewayWechatStopAccountRequest): Promise<GatewayWechatStopAccountResponse> => {
    return toResponse(() => options.operations.wechatStopAccount(request))
  })

  host.handle(options.channels.wechatRemoveAccount, async (_event, request: GatewayWechatRemoveAccountRequest): Promise<GatewayWechatRemoveAccountResponse> => {
    return toResponse(() => options.operations.wechatRemoveAccount(request))
  })

  host.handle(options.channels.wechatRenameAccount, async (_event, request: GatewayWechatRenameAccountRequest): Promise<GatewayWechatRenameAccountResponse> => {
    return toObjectResponse(() => options.operations.wechatRenameAccount(request))
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

async function toObjectResponse<T extends { status: GatewayStatus }>(
  action: () => Promise<T> | T,
): Promise<{ success: boolean; status?: GatewayStatus; account?: T extends { account?: infer A } ? A : never; error?: string }> {
  try {
    const result = await action()
    return {
      success: true,
      ...result,
    } as { success: boolean; status?: GatewayStatus; account?: T extends { account?: infer A } ? A : never; error?: string }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
