import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type {
  SchedulerGetRequest,
  SchedulerRunNowRequest,
  SchedulerSetEnabledRequest,
} from '../../shared/ipc.js'
import { getScheduler } from '../scheduler/index.js'

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
      return { success: true, record }
    } catch (error) {
      console.error('[SchedulerIPC] run-now error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SCHEDULER_SET_ENABLED, async (_event, request: SchedulerSetEnabledRequest) => {
    try {
      const task = getScheduler().setEnabled(request.id, request.enabled)
      if (!task) return { success: false, error: `Scheduled task not found: ${request.id}` }
      return { success: true, task }
    } catch (error) {
      console.error('[SchedulerIPC] set-enabled error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })
}
