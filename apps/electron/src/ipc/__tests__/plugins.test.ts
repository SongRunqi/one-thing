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
    const getPluginConfig = vi.fn().mockReturnValue({ success: true, config: { a: 1 } })
    const setPluginConfig = vi.fn().mockReturnValue({ success: true, config: { a: 2 } })
    const uninstallPlugin = vi.fn().mockResolvedValue({ success: true, archivePath: '/backup/notes-2026-08-07' })
    const getPluginFootprint = vi.fn().mockReturnValue({ success: true, footprint: { pluginId: 'notes', dataDir: '/data/notes', dataDirExists: true, entries: ['notes.json'], legacyKvExists: false, settingsKeys: ['enabled'] } })
    const installPlugin = vi.fn().mockResolvedValue({ success: true, pluginId: 'plan-status' })
    const updatePlugin = vi.fn().mockResolvedValue({ success: true, pluginId: 'plan-status', version: '2.0.0' })
    const checkPluginUpdates = vi.fn().mockResolvedValue({ success: true, offers: [] })
    const getPluginLifecycleInfo = vi.fn().mockResolvedValue({ success: true, npmAvailable: true })
    const getPluginMarket = vi.fn().mockResolvedValue({ success: true, entries: [], fetchedAt: null, stale: false })

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
        configGet: 'plugins:config-get',
        configSet: 'plugins:config-set',
        uninstall: 'plugins:uninstall',
        footprint: 'plugins:footprint',
        install: 'plugins:install',
        update: 'plugins:update',
        checkUpdates: 'plugins:check-updates',
        lifecycleInfo: 'plugins:lifecycle-info',
        market: 'plugins:market',
      },
      listPlugins,
      enablePlugin,
      disablePlugin,
      refreshPlugins,
      listCommands,
      executeCommand,
      pluginRequest,
      abortPluginRequest,
      getPluginConfig,
      setPluginConfig,
      uninstallPlugin,
      getPluginFootprint,
      installPlugin,
      updatePlugin,
      checkPluginUpdates,
      getPluginLifecycleInfo,
      getPluginMarket,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(17)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'plugins:list',
      'plugins:enable',
      'plugins:disable',
      'plugins:refresh',
      'plugins:commands',
      'plugins:execute-command',
      'plugins:request',
      'plugins:request-abort',
      'plugins:config-get',
      'plugins:config-set',
      'plugins:uninstall',
      'plugins:footprint',
      'plugins:install',
      'plugins:update',
      'plugins:check-updates',
      'plugins:lifecycle-info',
      'plugins:market',
    ])

    const toggleRequest = { pluginId: 'notes' }
    const executeRequest = { commandName: '/note', args: 'today', sessionId: 'session-1' }

    await expect(handle.mock.calls[0][1]({})).resolves.toEqual({ success: true, plugins: [] })
    await expect(handle.mock.calls[1][1]({}, toggleRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[2][1]({}, toggleRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[3][1]({})).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[4][1]({})).resolves.toEqual({ success: true, commands: [] })
    await expect(handle.mock.calls[5][1]({}, executeRequest)).resolves.toEqual({ success: true, message: 'ok' })

    // 卸载确认框据此展示"将被归档的东西"(R4 枚举 + R5 出口)。
    expect(handle.mock.calls[11][1]({}, toggleRequest)).toEqual({
      success: true,
      footprint: {
        pluginId: 'notes',
        dataDir: '/data/notes',
        dataDirExists: true,
        entries: ['notes.json'],
        legacyKvExists: false,
        settingsKeys: ['enabled'],
      },
    })
    expect(getPluginFootprint).toHaveBeenCalledWith(toggleRequest)
    await expect(handle.mock.calls[16][1]({}, { refresh: true }))
      .resolves.toEqual({ success: true, entries: [], fetchedAt: null, stale: false })
    expect(getPluginMarket).toHaveBeenCalledWith({ refresh: true })

    expect(listPlugins).toHaveBeenCalledWith()
    expect(enablePlugin).toHaveBeenCalledWith(toggleRequest)
    expect(disablePlugin).toHaveBeenCalledWith(toggleRequest)
    expect(refreshPlugins).toHaveBeenCalledWith()
    expect(listCommands).toHaveBeenCalledWith()
    // progress 的收件人是发起这次 invoke 的窗口 —— event.sender 必须透传下去,
    // 否则设置窗(独立 BrowserWindow)发起的请求永远收不到进度。
    const sender = { isDestroyed: () => false, send: vi.fn() }
    const channelRequest = { pluginId: 'notes', action: 'search', payload: { q: 'x' } }
    await expect(handle.mock.calls[6][1]({ sender }, channelRequest))
      .resolves.toEqual({ success: true, requestId: 'r1', result: { ok: true } })
    expect(handle.mock.calls[7][1]({}, { requestId: 'r1' }))
      .toEqual({ success: true, aborted: true })

    expect(executeCommand).toHaveBeenCalledWith(executeRequest)
    expect(pluginRequest).toHaveBeenCalledWith(channelRequest, sender)
    expect(handle.mock.calls[8][1]({}, { pluginId: 'notes' }))
      .toEqual({ success: true, config: { a: 1 } })
    expect(handle.mock.calls[9][1]({}, { pluginId: 'notes', config: { a: 2 } }))
      .toEqual({ success: true, config: { a: 2 } })

    expect(abortPluginRequest).toHaveBeenCalledWith({ requestId: 'r1' })
    await expect(handle.mock.calls[10][1]({}, { pluginId: 'notes' }))
      .resolves.toEqual({ success: true, archivePath: '/backup/notes-2026-08-07' })

    expect(getPluginConfig).toHaveBeenCalledWith({ pluginId: 'notes' })
    expect(uninstallPlugin).toHaveBeenCalledWith({ pluginId: 'notes' })
    expect(setPluginConfig).toHaveBeenCalledWith({ pluginId: 'notes', config: { a: 2 } })
  })
})
