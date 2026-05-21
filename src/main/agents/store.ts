import type { AgentDefinition } from '../../shared/ipc.js'
import { DEFAULT_AGENT_ID } from '../../shared/ipc.js'
import { getAgentsPath, readJsonFile, writeJsonFile } from '../stores/paths.js'

interface AgentsFile {
  version: 1
  agents: AgentDefinition[]
}

const DEFAULT_AGENT_NAME = 'Default Agent'

function now(): number {
  return Date.now()
}

function createDefaultAgent(timestamp = now()): AgentDefinition {
  return {
    id: DEFAULT_AGENT_ID,
    name: DEFAULT_AGENT_NAME,
    systemPrompt: '',
    isDefault: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function normalizeAgent(agent: Partial<AgentDefinition>, fallbackTimestamp: number): AgentDefinition | null {
  const id = typeof agent.id === 'string' ? agent.id.trim() : ''
  if (!id) return null

  const isDefault = id === DEFAULT_AGENT_ID || agent.isDefault === true
  return {
    id,
    name: typeof agent.name === 'string' && agent.name.trim()
      ? agent.name.trim()
      : isDefault ? DEFAULT_AGENT_NAME : 'Untitled Agent',
    systemPrompt: typeof agent.systemPrompt === 'string' ? agent.systemPrompt : '',
    isDefault: isDefault || undefined,
    createdAt: typeof agent.createdAt === 'number' ? agent.createdAt : fallbackTimestamp,
    updatedAt: typeof agent.updatedAt === 'number' ? agent.updatedAt : fallbackTimestamp,
  }
}

function normalizeFile(raw: unknown): AgentsFile {
  const timestamp = now()
  const rawAgents = Array.isArray((raw as AgentsFile | undefined)?.agents)
    ? (raw as AgentsFile).agents
    : []
  const agents = rawAgents
    .map(agent => normalizeAgent(agent, timestamp))
    .filter((agent): agent is AgentDefinition => agent !== null)

  const defaultIndex = agents.findIndex(agent => agent.id === DEFAULT_AGENT_ID)
  if (defaultIndex >= 0) {
    agents[defaultIndex] = {
      ...agents[defaultIndex],
      name: agents[defaultIndex].name || DEFAULT_AGENT_NAME,
      isDefault: true,
    }
  } else {
    agents.unshift(createDefaultAgent(timestamp))
  }

  return {
    version: 1,
    agents,
  }
}

function loadFile(): AgentsFile {
  return normalizeFile(readJsonFile<unknown>(getAgentsPath(), { version: 1, agents: [] }))
}

function saveFile(file: AgentsFile): void {
  writeJsonFile(getAgentsPath(), normalizeFile(file))
}

export function listAgents(): AgentDefinition[] {
  const file = loadFile()
  saveFile(file)
  return file.agents
}

export function getAgent(agentId: string | undefined | null): AgentDefinition {
  const file = loadFile()
  return file.agents.find(agent => agent.id === agentId) ??
    file.agents.find(agent => agent.id === DEFAULT_AGENT_ID) ??
    createDefaultAgent()
}

export function agentExists(agentId: string | undefined | null): boolean {
  if (!agentId) return false
  return loadFile().agents.some(agent => agent.id === agentId)
}

export function createAgent(input: { id: string; name: string; systemPrompt?: string }): AgentDefinition {
  const file = loadFile()
  const id = input.id.trim()
  if (!id || id === DEFAULT_AGENT_ID) {
    throw new Error('Invalid agent id')
  }
  if (file.agents.some(agent => agent.id === id)) {
    throw new Error('Agent already exists')
  }

  const timestamp = now()
  const agent: AgentDefinition = {
    id,
    name: input.name.trim() || 'Untitled Agent',
    systemPrompt: input.systemPrompt ?? '',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  file.agents.push(agent)
  saveFile(file)
  return agent
}

export function updateAgent(input: { agentId: string; name?: string; systemPrompt?: string }): AgentDefinition {
  const file = loadFile()
  const index = file.agents.findIndex(agent => agent.id === input.agentId)
  if (index < 0) throw new Error('Agent not found')

  const current = file.agents[index]
  const next: AgentDefinition = {
    ...current,
    name: input.name !== undefined ? (input.name.trim() || current.name) : current.name,
    systemPrompt: input.systemPrompt !== undefined ? input.systemPrompt : current.systemPrompt,
    updatedAt: now(),
  }
  file.agents[index] = next
  saveFile(file)
  return next
}

export function deleteAgent(agentId: string): void {
  if (agentId === DEFAULT_AGENT_ID) {
    throw new Error('Default Agent cannot be deleted')
  }

  const file = loadFile()
  const nextAgents = file.agents.filter(agent => agent.id !== agentId)
  if (nextAgents.length === file.agents.length) {
    throw new Error('Agent not found')
  }
  saveFile({ ...file, agents: nextAgents })
}

export { DEFAULT_AGENT_ID }
