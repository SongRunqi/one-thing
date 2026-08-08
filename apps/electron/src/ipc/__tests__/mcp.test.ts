import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronMCPIpcHandlers } from '../mcp.js'

describe('electron MCP IPC host', () => {
  it('registers MCP handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const getServers = vi.fn().mockResolvedValue({ success: true, servers: [] })
    const addServer = vi.fn().mockResolvedValue({ success: true })
    const updateServer = vi.fn().mockResolvedValue({ success: true })
    const removeServer = vi.fn().mockResolvedValue({ success: true })
    const connectServer = vi.fn().mockResolvedValue({ success: true })
    const disconnectServer = vi.fn().mockResolvedValue({ success: true })
    const logoutServer = vi.fn().mockResolvedValue({ success: true })
    const probeServer = vi.fn().mockResolvedValue({ ok: true })
    const refreshServer = vi.fn().mockResolvedValue({ success: true })
    const getTools = vi.fn().mockResolvedValue({ success: true, tools: [] })
    const callTool = vi.fn().mockResolvedValue({ success: true, content: [] })
    const getResources = vi.fn().mockResolvedValue({ success: true, resources: [] })
    const readResource = vi.fn().mockResolvedValue({ success: true, content: [] })
    const getPrompts = vi.fn().mockResolvedValue({ success: true, prompts: [] })
    const getPrompt = vi.fn().mockResolvedValue({ success: true, messages: [] })
    const readConfigFile = vi.fn().mockResolvedValue({ success: true, content: {} })

    registerElectronMCPIpcHandlers({
      channels: {
        getServers: 'mcp:get-servers',
        addServer: 'mcp:add-server',
        updateServer: 'mcp:update-server',
        removeServer: 'mcp:remove-server',
        connectServer: 'mcp:connect-server',
        disconnectServer: 'mcp:disconnect-server',
        logoutServer: 'mcp:logout-server',
        probeServer: 'mcp:probe-server',
        refreshServer: 'mcp:refresh-server',
        getTools: 'mcp:get-tools',
        callTool: 'mcp:call-tool',
        getResources: 'mcp:get-resources',
        readResource: 'mcp:read-resource',
        getPrompts: 'mcp:get-prompts',
        getPrompt: 'mcp:get-prompt',
        readConfigFile: 'mcp:read-config-file',
      },
      getServers,
      addServer,
      updateServer,
      removeServer,
      connectServer,
      disconnectServer,
      logoutServer,
      probeServer,
      refreshServer,
      getTools,
      callTool,
      getResources,
      readResource,
      getPrompts,
      getPrompt,
      readConfigFile,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(16)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'mcp:get-servers',
      'mcp:add-server',
      'mcp:update-server',
      'mcp:remove-server',
      'mcp:connect-server',
      'mcp:disconnect-server',
      'mcp:logout-server',
      'mcp:probe-server',
      'mcp:refresh-server',
      'mcp:get-tools',
      'mcp:call-tool',
      'mcp:get-resources',
      'mcp:read-resource',
      'mcp:get-prompts',
      'mcp:get-prompt',
      'mcp:read-config-file',
    ])

    const serverRequest = { serverId: 'server-1' }
    const callToolRequest = { serverId: 'server-1', toolName: 'search', arguments: {} }
    const readConfigRequest = { filePath: '/repo/mcp.json' }

    await expect(handle.mock.calls[0][1]({})).resolves.toEqual({ success: true, servers: [] })
    await expect(handle.mock.calls[1][1]({}, { config: { id: 'server-1' } })).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[3][1]({}, serverRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[9][1]({})).resolves.toEqual({ success: true, tools: [] })
    await expect(handle.mock.calls[10][1]({}, callToolRequest)).resolves.toEqual({ success: true, content: [] })
    await expect(handle.mock.calls[15][1]({}, readConfigRequest)).resolves.toEqual({
      success: true,
      content: {},
    })

    expect(getServers).toHaveBeenCalledTimes(1)
    expect(addServer).toHaveBeenCalledWith({ config: { id: 'server-1' } })
    expect(removeServer).toHaveBeenCalledWith(serverRequest)
    expect(getTools).toHaveBeenCalledTimes(1)
    expect(callTool).toHaveBeenCalledWith(callToolRequest)
    expect(readConfigFile).toHaveBeenCalledWith(readConfigRequest)
  })
})
