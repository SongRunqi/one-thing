import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronToolsIpcHandlers } from '../tools.js'

describe('electron tools IPC host', () => {
  it('registers tools handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const getTools = vi.fn().mockResolvedValue({ success: true, tools: [] })
    const executeTool = vi.fn().mockResolvedValue({ success: true, result: 'ok' })
    const cancelTool = vi.fn().mockResolvedValue({ success: true })
    const backgroundJobsList = vi.fn().mockResolvedValue({ success: true, jobs: [] })
    const backgroundJobsStop = vi.fn().mockResolvedValue({ success: true })
    const refreshAsyncTools = vi.fn().mockResolvedValue({ success: true })
    const updateToolCall = vi.fn().mockResolvedValue({ success: true })

    registerElectronToolsIpcHandlers({
      channels: {
        getTools: 'tools:get-all',
        executeTool: 'tools:execute',
        cancelTool: 'tools:cancel',
        backgroundJobsList: 'tools:background-jobs:list',
        backgroundJobsStop: 'tools:background-jobs:stop',
        refreshAsyncTools: 'tools:refresh-async',
        updateToolCall: 'tools:update-tool-call',
      },
      getTools,
      executeTool,
      cancelTool,
      backgroundJobsList,
      backgroundJobsStop,
      refreshAsyncTools,
      updateToolCall,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(7)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'tools:get-all',
      'tools:execute',
      'tools:cancel',
      'tools:background-jobs:list',
      'tools:background-jobs:stop',
      'tools:refresh-async',
      'tools:update-tool-call',
    ])

    const executeRequest = { toolId: 'bash', arguments: {}, sessionId: 'session-1' }
    const cancelRequest = { toolCallId: 'tool-1' }
    const listRequest = { includeInactive: true }
    const stopRequest = { jobId: 'job-1' }
    const refreshRequest = { workingDirectory: '/repo' }
    const updateRequest = { sessionId: 'session-1', toolCallId: 'tool-1', updates: {} }

    await expect(handle.mock.calls[0][1]({})).resolves.toEqual({ success: true, tools: [] })
    await expect(handle.mock.calls[1][1]({}, executeRequest)).resolves.toEqual({ success: true, result: 'ok' })
    await expect(handle.mock.calls[2][1]({}, cancelRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[3][1]({}, listRequest)).resolves.toEqual({ success: true, jobs: [] })
    await expect(handle.mock.calls[4][1]({}, stopRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[5][1]({}, refreshRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[6][1]({}, updateRequest)).resolves.toEqual({ success: true })

    expect(getTools).toHaveBeenCalledTimes(1)
    expect(executeTool).toHaveBeenCalledWith(executeRequest)
    expect(cancelTool).toHaveBeenCalledWith(cancelRequest)
    expect(backgroundJobsList).toHaveBeenCalledWith(listRequest)
    expect(backgroundJobsStop).toHaveBeenCalledWith(stopRequest)
    expect(refreshAsyncTools).toHaveBeenCalledWith(refreshRequest)
    expect(updateToolCall).toHaveBeenCalledWith(updateRequest)
  })
})
