import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronSchedulerIpcHandlers } from '../scheduler.js'

describe('electron scheduler IPC host', () => {
  it('registers scheduler handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const listTasks = vi.fn().mockResolvedValue({ success: true, tasks: [] })
    const getTask = vi.fn().mockResolvedValue({ success: true, task: { id: 'task-1' } })
    const runNow = vi.fn().mockResolvedValue({ success: true, record: { taskId: 'task-1' } })
    const setEnabled = vi.fn().mockResolvedValue({ success: true, task: { id: 'task-1', enabled: false } })
    const createTask = vi.fn().mockResolvedValue({ success: true, task: { id: 'task-2' } })
    const updateTask = vi.fn().mockResolvedValue({ success: true, task: { id: 'task-1', name: 'New' } })
    const deleteTask = vi.fn().mockResolvedValue({ success: true })
    const listRuns = vi.fn().mockResolvedValue({ success: true, runs: [] })
    const getRun = vi.fn().mockResolvedValue({ success: true, run: { runId: 'run-1' } })

    registerElectronSchedulerIpcHandlers({
      channels: {
        list: 'scheduler:list',
        get: 'scheduler:get',
        runNow: 'scheduler:run-now',
        setEnabled: 'scheduler:set-enabled',
        createTask: 'scheduler:create-task',
        updateTask: 'scheduler:update-task',
        deleteTask: 'scheduler:delete-task',
        listRuns: 'scheduler:list-runs',
        getRun: 'scheduler:get-run',
      },
      listTasks,
      getTask,
      runNow,
      setEnabled,
      createTask,
      updateTask,
      deleteTask,
      listRuns,
      getRun,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(9)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'scheduler:list',
      'scheduler:get',
      'scheduler:run-now',
      'scheduler:set-enabled',
      'scheduler:create-task',
      'scheduler:update-task',
      'scheduler:delete-task',
      'scheduler:list-runs',
      'scheduler:get-run',
    ])

    const getRequest = { id: 'task-1' }
    const runNowRequest = { id: 'task-1', force: true }
    const setEnabledRequest = { id: 'task-1', enabled: false }
    const createRequest = {
      name: 'Daily',
      prompt: 'Summarize',
      agentId: 'default',
      schedule: { kind: 'interval' as const, everyMs: 1000 },
    }
    const updateRequest = { id: 'task-1', name: 'New' }
    const deleteRequest = { id: 'task-1' }
    const listRunsRequest = { taskId: 'task-1', limit: 5 }
    const getRunRequest = { taskId: 'task-1', runId: 'run-1' }

    await expect(handle.mock.calls[0][1]({})).resolves.toEqual({ success: true, tasks: [] })
    await expect(handle.mock.calls[1][1]({}, getRequest)).resolves.toEqual({ success: true, task: { id: 'task-1' } })
    await expect(handle.mock.calls[2][1]({}, runNowRequest)).resolves.toEqual({ success: true, record: { taskId: 'task-1' } })
    await expect(handle.mock.calls[3][1]({}, setEnabledRequest)).resolves.toEqual({
      success: true,
      task: { id: 'task-1', enabled: false },
    })
    await expect(handle.mock.calls[4][1]({}, createRequest)).resolves.toEqual({ success: true, task: { id: 'task-2' } })
    await expect(handle.mock.calls[5][1]({}, updateRequest)).resolves.toEqual({
      success: true,
      task: { id: 'task-1', name: 'New' },
    })
    await expect(handle.mock.calls[6][1]({}, deleteRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[7][1]({}, listRunsRequest)).resolves.toEqual({ success: true, runs: [] })
    await expect(handle.mock.calls[8][1]({}, getRunRequest)).resolves.toEqual({ success: true, run: { runId: 'run-1' } })

    expect(listTasks).toHaveBeenCalledWith()
    expect(getTask).toHaveBeenCalledWith(getRequest)
    expect(runNow).toHaveBeenCalledWith(runNowRequest)
    expect(setEnabled).toHaveBeenCalledWith(setEnabledRequest)
    expect(createTask).toHaveBeenCalledWith(createRequest)
    expect(updateTask).toHaveBeenCalledWith(updateRequest)
    expect(deleteTask).toHaveBeenCalledWith(deleteRequest)
    expect(listRuns).toHaveBeenCalledWith(listRunsRequest)
    expect(getRun).toHaveBeenCalledWith(getRunRequest)
  })
})
