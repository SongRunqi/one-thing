import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronPluginsIpcHandlers } from '../plugins.js'

describe('electron plugins IPC host', () => {
  it('registers plugin handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const listPlugins = vi.fn().mockResolvedValue({ success: true, plugins: [] })
    const enablePlugin = vi.fn().mockResolvedValue({ success: true })
    const disablePlugin = vi.fn().mockResolvedValue({ success: true })
    const refreshPlugins = vi.fn().mockResolvedValue({ success: true })
    const listCommands = vi.fn().mockResolvedValue({ success: true, commands: [] })
    const executeCommand = vi.fn().mockResolvedValue({ success: true, message: 'ok' })
    const pluginRequest = vi.fn().mockResolvedValue({ success: true, requestId: 'r1', result: { ok: true } })
    const abortPluginRequest = vi.fn().mockReturnValue({ success: true, aborted: true })

    registerElectronPluginsIpcHandlers({
      channels: {
        list: 'plugins:list',
        enable: 'plugins:enable',
        disable: 'plugins:disable',
        refresh: 'plugins:refresh',
        commands: 'plugins:commands',
        executeCommand: 'plugins:execute-command',
        request: 'plugins:request',
        abortRequest: 'plugins:request-abort',
      },
      listPlugins,
      enablePlugin,
      disablePlugin,
      refreshPlugins,
      listCommands,
      executeCommand,
      pluginRequest,
      abortPluginRequest,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(8)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'plugins:list',
      'plugins:enable',
      'plugins:disable',
      'plugins:refresh',
      'plugins:commands',
      'plugins:execute-command',
      'plugins:request',
      'plugins:request-abort',
    ])

    const toggleRequest = { pluginId: 'notes' }
    const executeRequest = { commandName: '/note', args: 'today', sessionId: 'session-1' }

    await expect(handle.mock.calls[0][1]({})).resolves.toEqual({ success: true, plugins: [] })
    await expect(handle.mock.calls[1][1]({}, toggleRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[2][1]({}, toggleRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[3][1]({})).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[4][1]({})).resolves.toEqual({ success: true, commands: [] })
    await expect(handle.mock.calls[5][1]({}, executeRequest)).resolves.toEqual({ success: true, message: 'ok' })

    expect(listPlugins).toHaveBeenCalledWith()
    expect(enablePlugin).toHaveBeenCalledWith(toggleRequest)
    expect(disablePlugin).toHaveBeenCalledWith(toggleRequest)
    expect(refreshPlugins).toHaveBeenCalledWith()
    expect(listCommands).toHaveBeenCalledWith()
    const channelRequest = { pluginId: 'notes', action: 'search', payload: { q: 'x' } }
    await expect(handle.mock.calls[6][1]({}, channelRequest))
      .resolves.toEqual({ success: true, requestId: 'r1', result: { ok: true } })
    expect(handle.mock.calls[7][1]({}, { requestId: 'r1' }))
      .toEqual({ success: true, aborted: true })

    expect(executeCommand).toHaveBeenCalledWith(executeRequest)
    expect(pluginRequest).toHaveBeenCalledWith(channelRequest)
    expect(abortPluginRequest).toHaveBeenCalledWith({ requestId: 'r1' })
  })
})
