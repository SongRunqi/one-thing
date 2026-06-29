import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronSchedulerIpcChannels {
  list: string
  get: string
  runNow: string
  setEnabled: string
  createTask: string
  updateTask: string
  deleteTask: string
  listRuns: string
  getRun: string
}

export type ElectronSchedulerSchedule =
  | {
      kind: 'cron'
      expr: string
      timezone?: string
    }
  | {
      kind: 'interval'
      everyMs: number
      startDelayMs?: number
    }
  | {
      kind: 'at'
      atMs: number
    }

export interface ElectronSchedulerGetRequest {
  id: string
}

export interface ElectronSchedulerRunNowRequest {
  id: string
  force?: boolean
}

export interface ElectronSchedulerSetEnabledRequest {
  id: string
  enabled: boolean
}

export interface ElectronSchedulerCreateTaskRequest {
  name: string
  prompt: string
  agentId: string
  enabled?: boolean
  schedule: ElectronSchedulerSchedule
  workingDirectory?: string
}

export interface ElectronSchedulerUpdateTaskRequest {
  id: string
  name?: string
  prompt?: string
  agentId?: string
  enabled?: boolean
  schedule?: ElectronSchedulerSchedule
  workingDirectory?: string | null
}

export interface ElectronSchedulerDeleteTaskRequest {
  id: string
}

export interface ElectronSchedulerListRunsRequest {
  taskId: string
  limit?: number
}

export interface ElectronSchedulerGetRunRequest {
  taskId: string
  runId: string
}

export interface RegisterElectronSchedulerIpcHandlersOptions {
  channels: ElectronSchedulerIpcChannels
  listTasks(): unknown
  getTask(request: ElectronSchedulerGetRequest): unknown
  runNow(request: ElectronSchedulerRunNowRequest): unknown
  setEnabled(request: ElectronSchedulerSetEnabledRequest): unknown
  createTask(request: ElectronSchedulerCreateTaskRequest): unknown
  updateTask(request: ElectronSchedulerUpdateTaskRequest): unknown
  deleteTask(request: ElectronSchedulerDeleteTaskRequest): unknown
  listRuns(request: ElectronSchedulerListRunsRequest): unknown
  getRun(request: ElectronSchedulerGetRunRequest): unknown
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronSchedulerIpcHandlers(
  options: RegisterElectronSchedulerIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.list, () => {
    return options.listTasks()
  })

  host.handle(options.channels.get, (_event, request: ElectronSchedulerGetRequest) => {
    return options.getTask(request)
  })

  host.handle(options.channels.runNow, (_event, request: ElectronSchedulerRunNowRequest) => {
    return options.runNow(request)
  })

  host.handle(options.channels.setEnabled, (_event, request: ElectronSchedulerSetEnabledRequest) => {
    return options.setEnabled(request)
  })

  host.handle(options.channels.createTask, (_event, request: ElectronSchedulerCreateTaskRequest) => {
    return options.createTask(request)
  })

  host.handle(options.channels.updateTask, (_event, request: ElectronSchedulerUpdateTaskRequest) => {
    return options.updateTask(request)
  })

  host.handle(options.channels.deleteTask, (_event, request: ElectronSchedulerDeleteTaskRequest) => {
    return options.deleteTask(request)
  })

  host.handle(options.channels.listRuns, (_event, request: ElectronSchedulerListRunsRequest) => {
    return options.listRuns(request)
  })

  host.handle(options.channels.getRun, (_event, request: ElectronSchedulerGetRunRequest) => {
    return options.getRun(request)
  })
}
