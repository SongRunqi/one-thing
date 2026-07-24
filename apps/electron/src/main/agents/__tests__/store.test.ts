import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AGENT_ID } from '@shared/ipc.js'
import {
  agentExists,
  createAgent,
  deleteAgent,
  getAgent,
  listAgents,
  updateAgent,
} from '../store.js'
import { getAgentsPath } from '../../stores/paths.js'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
  },
}))

let previousHome: string | undefined
let tempHome: string

beforeEach(() => {
  previousHome = process.env.HOME
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-agents-test-'))
  process.env.HOME = tempHome
})

afterEach(() => {
  process.env.HOME = previousHome
  fs.rmSync(tempHome, { recursive: true, force: true })
})

describe('agent store', () => {
  it('initializes with a protected Default Agent', () => {
    const agents = listAgents()

    expect(agents).toHaveLength(1)
    expect(agents[0]).toMatchObject({
      id: DEFAULT_AGENT_ID,
      name: 'Default Agent',
      systemPrompt: '',
      isDefault: true,
    })
    expect(JSON.parse(fs.readFileSync(getAgentsPath(), 'utf-8')).agents[0]).toMatchObject({
      id: DEFAULT_AGENT_ID,
      isDefault: true,
    })
    expect(getAgent('missing').id).toBe(DEFAULT_AGENT_ID)
    expect(agentExists(DEFAULT_AGENT_ID)).toBe(true)
    expect(() => deleteAgent(DEFAULT_AGENT_ID)).toThrow('Default Agent cannot be deleted')
  })

  it('creates, updates, persists, and deletes custom agents', () => {
    const created = createAgent({
      id: 'agent-research',
      name: 'Research',
      systemPrompt: 'Prefer concise source-backed answers.',
    })

    expect(created.id).toBe('agent-research')
    expect(agentExists(created.id)).toBe(true)

    const updated = updateAgent({
      agentId: created.id,
      name: 'Research Lead',
      systemPrompt: 'Ask one clarifying question before deep research.',
    })

    expect(updated.name).toBe('Research Lead')
    expect(updated.systemPrompt).toContain('clarifying question')
    expect(JSON.parse(fs.readFileSync(getAgentsPath(), 'utf-8')).agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'agent-research',
          name: 'Research Lead',
        }),
      ]),
    )

    deleteAgent(created.id)

    expect(agentExists(created.id)).toBe(false)
    expect(listAgents().map(agent => agent.id)).toEqual([DEFAULT_AGENT_ID])
  })
})
