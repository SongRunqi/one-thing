import {
  registerElectronSchedulerIpcHandlers,
  type ElectronSchedulerCreateTaskRequest,
  type ElectronSchedulerDeleteTaskRequest,
  type ElectronSchedulerGetRequest,
  type ElectronSchedulerGetRunRequest,
  type ElectronSchedulerListRunsRequest,
  type ElectronSchedulerRunNowRequest,
  type ElectronSchedulerSetEnabledRequest,
  type ElectronSchedulerUpdateTaskRequest,
} from '@onething/electron-host/ipc/scheduler'
import {
  createOnethingSchedulerRunDetailFromRecord,
  createOnethingUserSchedulerTaskForIpc,
  deleteOnethingUserSchedulerTaskForIpc,
  getOnethingSchedulerRunForIpc,
  getOnethingSchedulerTaskForIpc,
  listOnethingSchedulerRunsForIpc,
  listOnethingSchedulerTasksForIpc,
  runOnethingSchedulerTaskNowForIpc,
  setOnethingSchedulerTaskEnabledForIpc,
  updateOnethingUserSchedulerTaskForIpc,
} from '@onething/runtime/scheduler'
import { IPC_CHANNELS } from '@shared/ipc.js'
import { toJsonValue } from '@shared/json.js'
import { getScheduler } from '@onething/app/scheduler/index.js'
import type { SchedulerRunRecord } from '@onething/app/scheduler/types.js'
import {
  createUserSchedulerTask,
  deleteUserSchedulerTask,
  isUserSchedulerTask,
  setUserSchedulerTaskEnabled,
  updateUserSchedulerTask,
} from '@onething/app/scheduler/user-tasks.js'
import {
  getSchedulerRunDetail,
  listSchedulerRunDetails,
  saveSchedulerRunDetail,
} from '@onething/app/scheduler/run-history.js'

export function registerSchedulerHandlers(): void {
  registerElectronSchedulerIpcHandlers({
    channels: {
      list: IPC_CHANNELS.SCHEDULER_LIST,
      get: IPC_CHANNELS.SCHEDULER_GET,
      runNow: IPC_CHANNELS.SCHEDULER_RUN_NOW,
      setEnabled: IPC_CHANNELS.SCHEDULER_SET_ENABLED,
      createTask: IPC_CHANNELS.SCHEDULER_CREATE_TASK,
      updateTask: IPC_CHANNELS.SCHEDULER_UPDATE_TASK,
      deleteTask: IPC_CHANNELS.SCHEDULER_DELETE_TASK,
      listRuns: IPC_CHANNELS.SCHEDULER_LIST_RUNS,
      getRun: IPC_CHANNELS.SCHEDULER_GET_RUN,
    },
    listTasks: () => {
      return listOnethingSchedulerTasksForIpc({
        listTasks: () => getScheduler().list(),
        logger: console,
      })
    },
    getTask: (request: ElectronSchedulerGetRequest) => {
      return getOnethingSchedulerTaskForIpc({
        id: request.id,
        getTaskStatus: id => getScheduler().getStatus(id),
        logger: console,
      })
    },
    runNow: (request: ElectronSchedulerRunNowRequest) => {
      return runOnethingSchedulerTaskNowForIpc({
        id: request.id,
        force: request.force,
        runNow: (id, options) => getScheduler().runNow(id, options),
        isUserTask: isUserSchedulerTask,
        toRunDetail: record =>
          createOnethingSchedulerRunDetailFromRecord({ ...record, result: toJsonValue(record.result) }),
        saveRunDetail: saveSchedulerRunDetail,
        logger: console,
      })
    },
    setEnabled: (request: ElectronSchedulerSetEnabledRequest) => {
      return setOnethingSchedulerTaskEnabledForIpc({
        id: request.id,
        enabled: request.enabled,
        isUserTask: isUserSchedulerTask,
        setUserTaskEnabled: setUserSchedulerTaskEnabled,
        setSchedulerTaskEnabled: (id, enabled) => getScheduler().setEnabled(id, enabled),
        logger: console,
      })
    },
    createTask: (request: ElectronSchedulerCreateTaskRequest) => {
      return createOnethingUserSchedulerTaskForIpc({
        request,
        createUserTask: createUserSchedulerTask,
        logger: console,
      })
    },
    updateTask: (request: ElectronSchedulerUpdateTaskRequest) => {
      return updateOnethingUserSchedulerTaskForIpc({
        request,
        isUserTask: isUserSchedulerTask,
        updateUserTask: updateUserSchedulerTask,
        logger: console,
      })
    },
    deleteTask: (request: ElectronSchedulerDeleteTaskRequest) => {
      return deleteOnethingUserSchedulerTaskForIpc({
        id: request.id,
        isUserTask: isUserSchedulerTask,
        deleteUserTask: deleteUserSchedulerTask,
        logger: console,
      })
    },
    listRuns: (request: ElectronSchedulerListRunsRequest) => {
      return listOnethingSchedulerRunsForIpc({
        taskId: request.taskId,
        limit: request.limit,
        listSavedRuns: listSchedulerRunDetails,
        getTaskStatus: taskId => getScheduler().getStatus(taskId),
        toRunDetail: (record: SchedulerRunRecord) =>
          createOnethingSchedulerRunDetailFromRecord({ ...record, result: toJsonValue(record.result) }),
        logger: console,
      })
    },
    getRun: (request: ElectronSchedulerGetRunRequest) => {
      return getOnethingSchedulerRunForIpc({
        taskId: request.taskId,
        runId: request.runId,
        getSavedRun: getSchedulerRunDetail,
        getTaskStatus: taskId => getScheduler().getStatus(taskId),
        toRunDetail: (record: SchedulerRunRecord) =>
          createOnethingSchedulerRunDetailFromRecord({ ...record, result: toJsonValue(record.result) }),
        logger: console,
      })
    },
  })
}
