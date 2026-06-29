import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronToolsIpcChannels {
  getTools: string
  executeTool: string
  cancelTool: string
  backgroundJobsList: string
  backgroundJobsStop: string
  refreshAsyncTools: string
  updateToolCall: string
}

export interface ElectronToolCancelRequest {
  toolCallId?: string
}

export interface ElectronBackgroundJobsListRequest {
  includeInactive?: boolean
}

export interface ElectronBackgroundJobsStopRequest {
  jobId: string
}

export interface ElectronRefreshAsyncToolsRequest {
  workingDirectory?: string
}

export interface RegisterElectronToolsIpcHandlersOptions {
  channels: ElectronToolsIpcChannels
  getTools(): unknown
  executeTool(request: unknown): unknown
  cancelTool(request: ElectronToolCancelRequest): unknown
  backgroundJobsList(request?: ElectronBackgroundJobsListRequest): unknown
  backgroundJobsStop(request: ElectronBackgroundJobsStopRequest): unknown
  refreshAsyncTools(request: ElectronRefreshAsyncToolsRequest): unknown
  updateToolCall(request: unknown): unknown
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronToolsIpcHandlers(
  options: RegisterElectronToolsIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.getTools, () => {
    return options.getTools()
  })

  host.handle(options.channels.executeTool, (_event, request: unknown) => {
    return options.executeTool(request)
  })

  host.handle(options.channels.cancelTool, (_event, request: ElectronToolCancelRequest) => {
    return options.cancelTool(request)
  })

  host.handle(options.channels.backgroundJobsList, (_event, request?: ElectronBackgroundJobsListRequest) => {
    return options.backgroundJobsList(request)
  })

  host.handle(options.channels.backgroundJobsStop, (_event, request: ElectronBackgroundJobsStopRequest) => {
    return options.backgroundJobsStop(request)
  })

  host.handle(options.channels.refreshAsyncTools, (_event, request: ElectronRefreshAsyncToolsRequest) => {
    return options.refreshAsyncTools(request)
  })

  host.handle(options.channels.updateToolCall, (_event, request: unknown) => {
    return options.updateToolCall(request)
  })
}
