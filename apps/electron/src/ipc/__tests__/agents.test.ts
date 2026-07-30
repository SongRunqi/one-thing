import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronAgentsIpcHandlers } from '../agents.js'

describe('electron agents IPC host', () => {
  it('registers agent handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const listAgents = vi.fn().mockResolvedValue({ success: true, agents: [] })
    const createAgent = vi.fn().mockResolvedValue({ success: true, agent: { id: 'agent-1' } })
    const updateAgent = vi.fn().mockResolvedValue({ success: true, agent: { id: 'agent-1', name: 'new' } })
    const deleteAgent = vi.fn().mockResolvedValue({ success: true, outcome: 'retired' })
    const restoreAgent = vi.fn().mockResolvedValue({ success: true, agent: { id: 'agent-1' } })

    registerElectronAgentsIpcHandlers({
      channels: {
        list: 'agents:list',
        create: 'agents:create',
        update: 'agents:update',
        delete: 'agents:delete',
        restore: 'agents:restore',
      },
      listAgents,
      createAgent,
      updateAgent,
      deleteAgent,
      restoreAgent,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(5)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'agents:list',
      'agents:create',
      'agents:update',
      'agents:delete',
      'agents:restore',
    ])

    const createRequest = { name: 'Coder', systemPrompt: 'Build things' }
    const updateRequest = { agentId: 'agent-1', name: 'new' }
    const deleteRequest = { agentId: 'agent-1' }
    const restoreRequest = { agentId: 'agent-1' }

    await expect(handle.mock.calls[0][1]({})).resolves.toEqual({ success: true, agents: [] })
    await expect(handle.mock.calls[1][1]({}, createRequest)).resolves.toEqual({ success: true, agent: { id: 'agent-1' } })
    await expect(handle.mock.calls[2][1]({}, updateRequest)).resolves.toEqual({
      success: true,
      agent: { id: 'agent-1', name: 'new' },
    })
    await expect(handle.mock.calls[3][1]({}, deleteRequest)).resolves.toEqual({
      success: true,
      outcome: 'retired',
    })
    await expect(handle.mock.calls[4][1]({}, restoreRequest)).resolves.toEqual({
      success: true,
      agent: { id: 'agent-1' },
    })

    expect(listAgents).toHaveBeenCalledWith()
    expect(createAgent).toHaveBeenCalledWith(createRequest)
    expect(updateAgent).toHaveBeenCalledWith(updateRequest)
    expect(deleteAgent).toHaveBeenCalledWith(deleteRequest)
    expect(restoreAgent).toHaveBeenCalledWith(restoreRequest)
  })
})
