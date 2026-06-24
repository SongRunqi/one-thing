import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { toJsonValue } from '../../shared/json.js'
import type {
  SchedulerCreateTaskRequest,
  SchedulerDeleteTaskRequest,
  SchedulerGetRequest,
  SchedulerGetRunRequest,
  SchedulerListRunsRequest,
  SchedulerRunNowRequest,
  SchedulerSetEnabledRequest,
  SchedulerUpdateTaskRequest,
} from '../../shared/ipc.js'
import { getScheduler } from '../scheduler/index.js'
import {
  createUserSchedulerTask,
  deleteUserSchedulerTask,
  genericRunDetailFromRecord,
  isUserSchedulerTask,
  setUserSchedulerTaskEnabled,
  updateUserSchedulerTask,
} from '../scheduler/user-tasks.js'
import {
  getSchedulerRunDetail,
  listSchedulerRunDetails,
  saveSchedulerRunDetail,
} from '../scheduler/run-history.js'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function registerSchedulerHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SCHEDULER_LIST, async () => {
    try {
      return { success: true, tasks: getScheduler().list() }
    } catch (error) {
      console.error('[SchedulerIPC] list error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SCHEDULER_GET, async (_event, request: SchedulerGetRequest) => {
    try {
      const task = getScheduler().getStatus(request.id)
      if (!task) return { success: false, error: `Scheduled task not found: ${request.id}` }
      return { success: true, task }
    } catch (error) {
      console.error('[SchedulerIPC] get error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SCHEDULER_RUN_NOW, async (_event, request: SchedulerRunNowRequest) => {
    try {
      const record = await getScheduler().runNow(request.id, {
        reason: 'manual',
        force: request.force ?? true,
      })
      if (!isUserSchedulerTask(request.id)) {
        saveSchedulerRunDetail(genericRunDetailFromRecord({ ...record, result: toJsonValue(record.result) }))
      }
      return { success: true, record }
    } catch (error) {
      console.error('[SchedulerIPC] run-now error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SCHEDULER_SET_ENABLED, async (_event, request: SchedulerSetEnabledRequest) => {
    try {
      const task = isUserSchedulerTask(request.id)
        ? setUserSchedulerTaskEnabled(request.id, request.enabled)
        : getScheduler().setEnabled(request.id, request.enabled)
      if (!task) return { success: false, error: `Scheduled task not found: ${request.id}` }
      return { success: true, task }
    } catch (error) {
      console.error('[SchedulerIPC] set-enabled error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SCHEDULER_CREATE_TASK, async (_event, request: SchedulerCreateTaskRequest) => {
    try {
      return { success: true, task: createUserSchedulerTask(request) }
    } catch (error) {
      console.error('[SchedulerIPC] create-task error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SCHEDULER_UPDATE_TASK, async (_event, request: SchedulerUpdateTaskRequest) => {
    try {
      if (!isUserSchedulerTask(request.id)) {
        return { success: false, error: 'Plugin scheduled tasks cannot be edited.' }
      }
      return { success: true, task: updateUserSchedulerTask(request) }
    } catch (error) {
      console.error('[SchedulerIPC] update-task error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SCHEDULER_DELETE_TASK, async (_event, request: SchedulerDeleteTaskRequest) => {
    try {
      if (!isUserSchedulerTask(request.id)) {
        return { success: false, error: 'Plugin scheduled tasks cannot be deleted.' }
      }
      deleteUserSchedulerTask(request.id)
      return { success: true }
    } catch (error) {
      console.error('[SchedulerIPC] delete-task error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SCHEDULER_LIST_RUNS, async (_event, request: SchedulerListRunsRequest) => {
    try {
      const savedRuns = listSchedulerRunDetails(request.taskId, request.limit)
      if (savedRuns.length > 0) {
        return { success: true, runs: savedRuns }
      }
      const task = getScheduler().getStatus(request.taskId)
      const runs = (task?.recentRuns || [])
        .slice(0, Math.max(1, Math.min(50, Math.floor(request.limit || 50))))
        .map(record => genericRunDetailFromRecord({ ...record, result: toJsonValue(record.result) }))
      return { success: true, runs }
    } catch (error) {
      console.error('[SchedulerIPC] list-runs error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SCHEDULER_GET_RUN, async (_event, request: SchedulerGetRunRequest) => {
    try {
      const saved = getSchedulerRunDetail(request.taskId, request.runId)
      if (saved) return { success: true, run: saved }
      const task = getScheduler().getStatus(request.taskId)
      const recent = task?.recentRuns?.find(record => record.runId === request.runId)
      if (!recent) return { success: false, error: `Scheduled run not found: ${request.runId}` }
      return { success: true, run: genericRunDetailFromRecord({ ...recent, result: toJsonValue(recent.result) }) }
    } catch (error) {
      console.error('[SchedulerIPC] get-run error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })
}
