import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_ONETHING_AGENT_ID,
  createOnethingAgentStore,
} from '../store.js'

let tempDir: string
let agentsPath: string
let timestamp: number

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-runtime-agents-test-'))
  agentsPath = path.join(tempDir, 'agents.json')
  timestamp = 1_700_000_000_000
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tempDir, { recursive: true, force: true })
})

function createStore() {
  return createOnethingAgentStore({
    agentsPath,
    now: () => timestamp,
  })
}

describe('createOnethingAgentStore', () => {
  it('initializes and persists a protected default agent', () => {
    const store = createStore()

    const agents = store.listAgents()

    expect(agents).toHaveLength(1)
    expect(agents[0]).toMatchObject({
      id: DEFAULT_ONETHING_AGENT_ID,
      name: 'Default Agent',
      systemPrompt: '',
      isDefault: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    expect(JSON.parse(fs.readFileSync(agentsPath, 'utf-8')).agents[0]).toMatchObject({
      id: DEFAULT_ONETHING_AGENT_ID,
      isDefault: true,
    })
    expect(store.getAgent('missing').id).toBe(DEFAULT_ONETHING_AGENT_ID)
    expect(store.agentExists(DEFAULT_ONETHING_AGENT_ID)).toBe(true)
    expect(() => store.deleteAgent(DEFAULT_ONETHING_AGENT_ID)).toThrow('Default Agent cannot be deleted')
  })

  it('creates, updates, persists, and deletes custom agents', () => {
    const store = createStore()

    const created = store.createAgent({
      id: 'agent-research',
      name: 'Research',
      systemPrompt: 'Prefer concise source-backed answers.',
    })
    timestamp += 1
    const updated = store.updateAgent({
      agentId: created.id,
      name: 'Research Lead',
      systemPrompt: 'Ask one clarifying question before deep research.',
    })

    expect(created.id).toBe('agent-research')
    expect(store.agentExists(created.id)).toBe(true)
    expect(updated.name).toBe('Research Lead')
    expect(updated.updatedAt).toBe(timestamp)
    expect(JSON.parse(fs.readFileSync(agentsPath, 'utf-8')).agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'agent-research',
          name: 'Research Lead',
        }),
      ]),
    )

    store.deleteAgent(created.id)

    expect(store.agentExists(created.id)).toBe(false)
    expect(store.listAgents().map(agent => agent.id)).toEqual([DEFAULT_ONETHING_AGENT_ID])
  })

  it('does not rewrite the agents file on repeated list reads', () => {
    const store = createStore()
    store.listAgents()

    const writeSpy = vi.spyOn(fs, 'writeFileSync')
    writeSpy.mockClear()

    expect(store.listAgents()).toHaveLength(1)
    expect(writeSpy).not.toHaveBeenCalled()

    writeSpy.mockRestore()
  })
})
