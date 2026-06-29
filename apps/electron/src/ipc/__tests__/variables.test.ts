import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronVariablesIpcHandlers } from '../variables-controller.js'

describe('electron variables IPC host', () => {
  it('registers variable handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const logger = { log: vi.fn() }
    const listVariables = vi.fn().mockResolvedValue({ success: true, variables: [] })
    const setVariable = vi.fn().mockResolvedValue({ success: true, variable: { name: 'project', value: 'onething' } })
    const deleteVariable = vi.fn().mockResolvedValue({ success: true })

    registerElectronVariablesIpcHandlers({
      channels: {
        list: 'variables:list',
        set: 'variables:set',
        delete: 'variables:delete',
      },
      listVariables,
      setVariable,
      deleteVariable,
      ipcMain: { handle },
      logger,
    })

    expect(handle).toHaveBeenCalledTimes(3)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'variables:list',
      'variables:set',
      'variables:delete',
    ])

    const listRequest = { sessionId: 'session-1' }
    const setRequest = { sessionId: 'session-1', name: 'project', value: 'onething' }
    const deleteRequest = { sessionId: 'session-1', name: 'project', scope: 'session' as const }

    await expect(handle.mock.calls[0][1]({}, listRequest)).resolves.toEqual({ success: true, variables: [] })
    await expect(handle.mock.calls[1][1]({}, setRequest)).resolves.toEqual({
      success: true,
      variable: { name: 'project', value: 'onething' },
    })
    await expect(handle.mock.calls[2][1]({}, deleteRequest)).resolves.toEqual({ success: true })

    expect(listVariables).toHaveBeenCalledWith(listRequest)
    expect(setVariable).toHaveBeenCalledWith(setRequest)
    expect(deleteVariable).toHaveBeenCalledWith(deleteRequest)
    expect(logger.log).toHaveBeenCalledWith('[variables] IPC handlers registered (list/set/delete)')
  })
})
