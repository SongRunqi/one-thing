import { describe, expect, it, vi } from 'vitest'
import {
  addOnethingACPAgentForIpc,
  cancelOnethingACPSessionForIpc,
  connectOnethingACPAgentForIpc,
  getOnethingACPAgentsForIpc,
  normalizeOnethingACPAgentConfig,
  removeOnethingACPAgentForIpc,
  updateOnethingACPAgentForIpc,
} from '../ipc-operations.js'
import type { OnethingACPSettingsLike } from '../ipc-operations.js'

interface TestAgentConfig {
  id?: string
  name?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  enabled?: boolean
  permissionMode?: 'allow' | 'reject'
}

interface TestAgentState {
  config: TestAgentConfig
  status: string
}

function createAdapters(settings: OnethingACPSettingsLike<TestAgentConfig>) {
  const manager = {
    updateSettings: vi.fn(),
    getAgentStates: vi.fn((): TestAgentState[] => []),
    getAgentState: vi.fn((agentId: string): TestAgentState | undefined => ({
      config: { id: agentId, command: 'agent' },
      status: 'disconnected',
    })),
    connectAgent: vi.fn(async (agentId: string): Promise<TestAgentState> => ({
      config: { id: agentId, command: 'agent' },
      status: 'connected',
    })),
    disconnectAgent: vi.fn(),
    refreshAgent: vi.fn(async (agentId: string): Promise<TestAgentState> => ({
      config: { id: agentId, command: 'agent' },
      status: 'connected',
    })),
    cancelSession: vi.fn(),
  }

  return {
    manager,
    getSettings: vi.fn(() => settings),
    saveSettings: vi.fn(),
  }
}

describe('ACP IPC operations', () => {
  it('normalizes ACP agent config with stable defaults', () => {
    expect(normalizeOnethingACPAgentConfig({
      name: '  ',
      command: '  codex  ',
      args: undefined,
      enabled: undefined,
      permissionMode: 'anything',
    }, () => 'acp-test')).toEqual({
      id: 'acp-test',
      name: 'codex',
      command: 'codex',
      args: [],
      env: undefined,
      enabled: true,
      permissionMode: 'allow',
    })
  })

  it('lists agents after syncing manager settings', async () => {
    const adapters = createAdapters({
      enabled: true,
      agents: [{ id: 'agent-1', command: 'codex' }],
    })
    adapters.manager.getAgentStates.mockReturnValue([{
      config: { id: 'agent-1', command: 'codex' },
      status: 'connected',
    }])

    await expect(getOnethingACPAgentsForIpc(adapters)).resolves.toEqual({
      success: true,
      agents: [{
        config: { id: 'agent-1', command: 'codex' },
        status: 'connected',
      }],
    })
    expect(adapters.manager.updateSettings).toHaveBeenCalledWith({
      enabled: true,
      agents: [{ id: 'agent-1', command: 'codex' }],
    })
  })

  it('adds and updates agents through settings adapters', async () => {
    const adapters = createAdapters({ enabled: true, agents: [] })

    await expect(addOnethingACPAgentForIpc({
      ...adapters,
      config: { command: '  codex  ' },
      createId: () => 'acp-1',
    })).resolves.toEqual({
      success: true,
      agent: {
        config: { id: 'acp-1', command: 'agent' },
        status: 'disconnected',
      },
    })
    expect(adapters.saveSettings).toHaveBeenCalledWith({
      enabled: true,
      agents: [{
        id: 'acp-1',
        name: 'codex',
        command: 'codex',
        args: [],
        env: undefined,
        enabled: true,
        permissionMode: 'allow',
      }],
    })

    const updateAdapters = createAdapters({
      enabled: true,
      agents: [{ id: 'acp-1', command: 'old' }],
    })
    await expect(updateOnethingACPAgentForIpc({
      ...updateAdapters,
      config: { id: 'acp-1', command: 'new' },
    })).resolves.toMatchObject({ success: true })
    expect(updateAdapters.saveSettings).toHaveBeenCalledWith({
      enabled: true,
      agents: [expect.objectContaining({ id: 'acp-1', command: 'new' })],
    })
  })

  it('rejects invalid or duplicate agent configs', async () => {
    const adapters = createAdapters({
      enabled: true,
      agents: [{ id: 'acp-1', command: 'codex' }],
    })

    await expect(addOnethingACPAgentForIpc({
      ...adapters,
      config: { id: 'acp-2', command: ' ' },
    })).resolves.toEqual({
      success: false,
      error: 'ACP agent command is required',
    })

    await expect(addOnethingACPAgentForIpc({
      ...adapters,
      config: { id: 'acp-1', command: 'codex' },
    })).resolves.toEqual({
      success: false,
      error: 'ACP agent "acp-1" already exists',
    })

    await expect(updateOnethingACPAgentForIpc({
      ...adapters,
      config: { id: 'missing', command: 'codex' },
    })).resolves.toEqual({
      success: false,
      error: 'ACP agent "missing" not found',
    })
  })

  it('routes remove, connect, and cancel through host manager adapters', async () => {
    const adapters = createAdapters({
      enabled: true,
      agents: [
        { id: 'keep', command: 'keep' },
        { id: 'drop', command: 'drop' },
      ],
    })

    await expect(removeOnethingACPAgentForIpc({
      ...adapters,
      agentId: 'drop',
    })).resolves.toEqual({ success: true })
    expect(adapters.manager.disconnectAgent).toHaveBeenCalledWith('drop')
    expect(adapters.saveSettings).toHaveBeenCalledWith({
      enabled: true,
      agents: [{ id: 'keep', command: 'keep' }],
    })

    await expect(connectOnethingACPAgentForIpc({
      getSettings: adapters.getSettings,
      manager: adapters.manager,
      agentId: 'keep',
    })).resolves.toEqual({
      success: true,
      agent: { config: { id: 'keep', command: 'agent' }, status: 'connected' },
    })
    expect(adapters.manager.connectAgent).toHaveBeenCalledWith('keep')

    await expect(cancelOnethingACPSessionForIpc({
      sessionId: 'session-1',
      agentId: 'keep',
      cancelSession: adapters.manager.cancelSession,
    })).resolves.toEqual({ success: true })
    expect(adapters.manager.cancelSession).toHaveBeenCalledWith('session-1', 'keep')
  })
})
