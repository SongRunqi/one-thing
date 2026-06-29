import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronACPIpcHandlers } from '../acp.js'

describe('electron ACP IPC host', () => {
  it('registers ACP handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const getAgents = vi.fn().mockResolvedValue({ success: true, agents: [] })
    const addAgent = vi.fn().mockResolvedValue({ success: true, agent: { id: 'new' } })
    const updateAgent = vi.fn().mockResolvedValue({ success: true, agent: { id: 'updated' } })
    const removeAgent = vi.fn().mockResolvedValue({ success: true })
    const connectAgent = vi.fn().mockResolvedValue({ success: true, agent: { id: 'connected' } })
    const disconnectAgent = vi.fn().mockResolvedValue({ success: true })
    const refreshAgent = vi.fn().mockResolvedValue({ success: true, agent: { id: 'refreshed' } })
    const cancelSession = vi.fn().mockResolvedValue({ success: true })

    registerElectronACPIpcHandlers({
      channels: {
        getAgents: 'acp:get-agents',
        addAgent: 'acp:add-agent',
        updateAgent: 'acp:update-agent',
        removeAgent: 'acp:remove-agent',
        connectAgent: 'acp:connect-agent',
        disconnectAgent: 'acp:disconnect-agent',
        refreshAgent: 'acp:refresh-agent',
        cancelSession: 'acp:cancel-session',
      },
      getAgents,
      addAgent,
      updateAgent,
      removeAgent,
      connectAgent,
      disconnectAgent,
      refreshAgent,
      cancelSession,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(8)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'acp:get-agents',
      'acp:add-agent',
      'acp:update-agent',
      'acp:remove-agent',
      'acp:connect-agent',
      'acp:disconnect-agent',
      'acp:refresh-agent',
      'acp:cancel-session',
    ])

    const configRequest = { config: { id: 'agent-1', command: 'codex' } }
    const agentRequest = { agentId: 'agent-1' }
    const cancelRequest = { sessionId: 'session-1', agentId: 'agent-1' }

    await expect(handle.mock.calls[0][1]({})).resolves.toEqual({ success: true, agents: [] })
    await expect(handle.mock.calls[1][1]({}, configRequest)).resolves.toEqual({
      success: true,
      agent: { id: 'new' },
    })
    await expect(handle.mock.calls[2][1]({}, configRequest)).resolves.toEqual({
      success: true,
      agent: { id: 'updated' },
    })
    await expect(handle.mock.calls[3][1]({}, agentRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[4][1]({}, agentRequest)).resolves.toEqual({
      success: true,
      agent: { id: 'connected' },
    })
    await expect(handle.mock.calls[5][1]({}, agentRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[6][1]({}, agentRequest)).resolves.toEqual({
      success: true,
      agent: { id: 'refreshed' },
    })
    await expect(handle.mock.calls[7][1]({}, cancelRequest)).resolves.toEqual({ success: true })

    expect(getAgents).toHaveBeenCalledWith()
    expect(addAgent).toHaveBeenCalledWith(configRequest)
    expect(updateAgent).toHaveBeenCalledWith(configRequest)
    expect(removeAgent).toHaveBeenCalledWith(agentRequest)
    expect(connectAgent).toHaveBeenCalledWith(agentRequest)
    expect(disconnectAgent).toHaveBeenCalledWith(agentRequest)
    expect(refreshAgent).toHaveBeenCalledWith(agentRequest)
    expect(cancelSession).toHaveBeenCalledWith(cancelRequest)
  })
})
