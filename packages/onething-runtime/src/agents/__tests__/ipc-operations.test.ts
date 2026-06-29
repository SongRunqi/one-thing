import { describe, expect, it, vi } from 'vitest'
import {
  createOnethingAgentFromRequest,
  createOnethingAgentFromRequestForIpc,
  deleteOnethingAgentFromRequest,
  deleteOnethingAgentFromRequestForIpc,
  listOnethingAgents,
  listOnethingAgentsForIpc,
  updateOnethingAgentFromRequest,
  updateOnethingAgentFromRequestForIpc,
} from '../ipc-operations.js'
import type { OnethingAgentDefinition } from '../store.js'

const defaultAgent: OnethingAgentDefinition = {
  id: 'default',
  name: 'Default Agent',
  systemPrompt: '',
  isDefault: true,
  createdAt: 1,
  updatedAt: 1,
}

describe('agent IPC operations', () => {
  it('projects list, create, and update responses', async () => {
    const created: OnethingAgentDefinition = {
      id: 'agent-id-1',
      name: 'Research',
      systemPrompt: 'Look things up',
      createdAt: 2,
      updatedAt: 2,
    }
    const listAgents = vi.fn(() => [defaultAgent])
    const createAgent = vi.fn((agent: { id: string; name: string; systemPrompt?: string }) => ({
      ...created,
      ...agent,
      createdAt: 2,
      updatedAt: 2,
    }))
    const updateAgent = vi.fn((agent: { agentId: string; name?: string; systemPrompt?: string }) => ({
      ...created,
      id: agent.agentId,
      name: agent.name || created.name,
      systemPrompt: agent.systemPrompt || created.systemPrompt,
      updatedAt: 3,
    }))

    await expect(listOnethingAgents({ listAgents })).resolves.toEqual({
      success: true,
      agents: [defaultAgent],
    })
    await expect(createOnethingAgentFromRequest({
      name: 'Research',
      systemPrompt: 'Look things up',
      createId: () => 'id-1',
      createAgent,
    })).resolves.toMatchObject({
      success: true,
      agent: { id: 'agent-id-1', name: 'Research' },
    })
    await expect(updateOnethingAgentFromRequest({
      agentId: 'agent-id-1',
      name: 'Research Lead',
      updateAgent,
    })).resolves.toMatchObject({
      success: true,
      agent: { id: 'agent-id-1', name: 'Research Lead' },
    })

    expect(createAgent).toHaveBeenCalledWith({
      id: 'agent-id-1',
      name: 'Research',
      systemPrompt: 'Look things up',
    })
    expect(updateAgent).toHaveBeenCalledWith({
      agentId: 'agent-id-1',
      name: 'Research Lead',
      systemPrompt: undefined,
    })
  })

  it('keeps protected and referenced delete rules in runtime', async () => {
    const deleteAgent = vi.fn()

    await expect(deleteOnethingAgentFromRequest({
      agentId: 'default',
      sessions: [],
      deleteAgent,
    })).rejects.toThrow('Default Agent cannot be deleted')

    await expect(deleteOnethingAgentFromRequest({
      agentId: 'agent-used',
      sessions: [{ agentId: 'agent-used' }],
      deleteAgent,
    })).rejects.toThrow('Agent is used by one or more sessions')

    await expect(deleteOnethingAgentFromRequest({
      agentId: 'agent-unused',
      sessions: [{ agentId: 'default' }, {}],
      deleteAgent,
    })).resolves.toEqual({ success: true })
    expect(deleteAgent).toHaveBeenCalledWith('agent-unused')
  })

  it('normalizes agent adapter failures for IPC callers', async () => {
    const logger = { error: vi.fn() }

    await expect(listOnethingAgentsForIpc({
      listAgents: () => {
        throw new Error('list failed')
      },
      logger,
    })).resolves.toEqual({ success: false, error: 'list failed' })

    await expect(createOnethingAgentFromRequestForIpc({
      createId: () => 'id-1',
      createAgent: () => {
        throw new Error('create failed')
      },
      logger,
    })).resolves.toEqual({ success: false, error: 'create failed' })

    await expect(updateOnethingAgentFromRequestForIpc({
      agentId: 'agent-1',
      updateAgent: () => {
        throw new Error('update failed')
      },
      logger,
    })).resolves.toEqual({ success: false, error: 'update failed' })

    await expect(deleteOnethingAgentFromRequestForIpc({
      agentId: 'agent-1',
      listSessions: () => [],
      deleteAgent: () => {
        throw new Error('delete failed')
      },
      logger,
    })).resolves.toEqual({ success: false, error: 'delete failed' })

    expect(logger.error).toHaveBeenCalledTimes(4)
  })

  it('loads sessions inside the delete IPC operation before applying delete rules', async () => {
    const listSessions = vi.fn(() => [{ agentId: 'agent-used' }])
    const deleteAgent = vi.fn()

    await expect(deleteOnethingAgentFromRequestForIpc({
      agentId: 'agent-used',
      listSessions,
      deleteAgent,
    })).resolves.toEqual({
      success: false,
      error: 'Agent is used by one or more sessions',
    })

    expect(listSessions).toHaveBeenCalled()
    expect(deleteAgent).not.toHaveBeenCalled()
  })
})
