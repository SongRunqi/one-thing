import { ipcMain } from 'electron'
import type {
  AbortPluginRequestResult,
  PluginConfigRequest,
  PluginConfigResponse,
  PluginRequestPayload,
  PluginRequestResult,
  SetPluginConfigRequest,
  SetPluginConfigResponse,
  PluginFootprintResponse,
  UninstallPluginRequest,
  UninstallPluginResponse,
  InstallPluginRequest,
  InstallPluginResponse,
  UpdatePluginRequest,
  UpdatePluginResponse,
  CheckPluginUpdatesResponse,
  PluginLifecycleInfoResponse,
} from '@shared/ipc/plugins.js'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: any, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronPluginsIpcChannels {
  list: string
  enable: string
  disable: string
  refresh: string
  commands: string
  executeCommand: string
  request: string
  abortRequest: string
  configGet: string
  configSet: string
  uninstall: string
  footprint: string
  // P1:npm 生命周期
  install: string
  update: string
  checkUpdates: string
  lifecycleInfo: string
}

export interface ElectronPluginToggleRequest {
  pluginId: string
}

export interface ElectronPluginExecuteCommandRequest {
  commandName: string
  args?: string
  sessionId: string
}

/** 形状是共享契约,这里只做别名 —— 四处手写副本没有任何编译期防护。 */
export type ElectronPluginRequestPayload = PluginRequestPayload

export interface ElectronPluginAbortRequestPayload {
  requestId: string
}

/**
 * 发起这次 invoke 的 renderer。
 *
 * progress 必须定向回送给它,不能广播给"主窗口" —— 设置窗是独立 BrowserWindow,
 * 而它恰好是 R3 插件设置 UI 的宿主;走主窗单 sender 的话,设置窗发起的请求
 * 永远收不到进度,主窗关掉时更是全丢。
 */
export interface ElectronPluginRequestSender {
  isDestroyed(): boolean
  send(channel: string, payload: unknown): void
}

export interface RegisterElectronPluginsIpcHandlersOptions {
  channels: ElectronPluginsIpcChannels
  listPlugins(): unknown
  enablePlugin(request: ElectronPluginToggleRequest): unknown
  disablePlugin(request: ElectronPluginToggleRequest): unknown
  refreshPlugins(): unknown
  listCommands(): unknown
  executeCommand(request: ElectronPluginExecuteCommandRequest): unknown
  pluginRequest(
    request: ElectronPluginRequestPayload,
    sender: ElectronPluginRequestSender | undefined,
  ): Promise<PluginRequestResult> | PluginRequestResult
  abortPluginRequest(request: ElectronPluginAbortRequestPayload): AbortPluginRequestResult
  getPluginConfig(request: PluginConfigRequest): PluginConfigResponse
  setPluginConfig(request: SetPluginConfigRequest): SetPluginConfigResponse
  uninstallPlugin(request: UninstallPluginRequest): Promise<UninstallPluginResponse> | UninstallPluginResponse
  getPluginFootprint(request: UninstallPluginRequest): PluginFootprintResponse
  installPlugin(request: InstallPluginRequest): Promise<InstallPluginResponse> | InstallPluginResponse
  updatePlugin(request: UpdatePluginRequest): Promise<UpdatePluginResponse> | UpdatePluginResponse
  checkPluginUpdates(): Promise<CheckPluginUpdatesResponse> | CheckPluginUpdatesResponse
  getPluginLifecycleInfo(): Promise<PluginLifecycleInfoResponse> | PluginLifecycleInfoResponse
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronPluginsIpcHandlers(
  options: RegisterElectronPluginsIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.list, () => {
    return options.listPlugins()
  })

  host.handle(options.channels.enable, (_event, request: ElectronPluginToggleRequest) => {
    return options.enablePlugin(request)
  })

  host.handle(options.channels.disable, (_event, request: ElectronPluginToggleRequest) => {
    return options.disablePlugin(request)
  })

  host.handle(options.channels.refresh, () => {
    return options.refreshPlugins()
  })

  host.handle(options.channels.commands, () => {
    return options.listCommands()
  })

  host.handle(options.channels.executeCommand, (_event, request: ElectronPluginExecuteCommandRequest) => {
    return options.executeCommand(request)
  })

  host.handle(options.channels.request, (event, request: ElectronPluginRequestPayload) => {
    // event.sender 一路透传下去:progress 的收件人就是发起这次调用的那个窗口。
    const sender = (event as { sender?: ElectronPluginRequestSender } | undefined)?.sender
    return options.pluginRequest(request, sender)
  })

  host.handle(options.channels.abortRequest, (_event, request: ElectronPluginAbortRequestPayload) => {
    return options.abortPluginRequest(request)
  })

  host.handle(options.channels.configGet, (_event, request: PluginConfigRequest) => {
    return options.getPluginConfig(request)
  })

  host.handle(options.channels.configSet, (_event, request: SetPluginConfigRequest) => {
    return options.setPluginConfig(request)
  })

  host.handle(options.channels.uninstall, (_event, request: UninstallPluginRequest) => {
    return options.uninstallPlugin(request)
  })

  host.handle(options.channels.footprint, (_event, request: UninstallPluginRequest) => {
    return options.getPluginFootprint(request)
  })

  host.handle(options.channels.install, (_event, request: InstallPluginRequest) => {
    return options.installPlugin(request)
  })

  host.handle(options.channels.update, (_event, request: UpdatePluginRequest) => {
    return options.updatePlugin(request)
  })

  host.handle(options.channels.checkUpdates, () => {
    return options.checkPluginUpdates()
  })

  host.handle(options.channels.lifecycleInfo, () => {
    return options.getPluginLifecycleInfo()
  })
}
