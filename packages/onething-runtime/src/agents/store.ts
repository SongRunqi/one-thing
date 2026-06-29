import {
  readJsonFile,
  writeJsonFile,
} from '@onething/core/storage'

export const DEFAULT_ONETHING_AGENT_ID = 'default'
export const DEFAULT_ONETHING_AGENT_NAME = 'Default Agent'

export interface OnethingAgentDefinition {
  id: string
  name: string
  systemPrompt: string
  isDefault?: boolean
  createdAt: number
  updatedAt: number
}

export interface OnethingAgentsFile {
  version: 1
  agents: OnethingAgentDefinition[]
}

export interface CreateOnethingAgentStoreOptions {
  agentsPath: string
  now?: () => number
}

export interface CreateOnethingAgentInput {
  id: string
  name: string
  systemPrompt?: string
}

export interface UpdateOnethingAgentInput {
  agentId: string
  name?: string
  systemPrompt?: string
}

export interface OnethingAgentStore {
  listAgents(): OnethingAgentDefinition[]
  getAgent(agentId: string | undefined | null): OnethingAgentDefinition
  agentExists(agentId: string | undefined | null): boolean
  createAgent(input: CreateOnethingAgentInput): OnethingAgentDefinition
  updateAgent(input: UpdateOnethingAgentInput): OnethingAgentDefinition
  deleteAgent(agentId: string): void
}

function createDefaultAgent(timestamp: number): OnethingAgentDefinition {
  return {
    id: DEFAULT_ONETHING_AGENT_ID,
    name: DEFAULT_ONETHING_AGENT_NAME,
    systemPrompt: '',
    isDefault: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function normalizeAgent(
  agent: Partial<OnethingAgentDefinition>,
  fallbackTimestamp: number,
): OnethingAgentDefinition | null {
  const id = typeof agent.id === 'string' ? agent.id.trim() : ''
  if (!id) return null

  const isDefault = id === DEFAULT_ONETHING_AGENT_ID || agent.isDefault === true
  return {
    id,
    name: typeof agent.name === 'string' && agent.name.trim()
      ? agent.name.trim()
      : isDefault ? DEFAULT_ONETHING_AGENT_NAME : 'Untitled Agent',
    systemPrompt: typeof agent.systemPrompt === 'string' ? agent.systemPrompt : '',
    isDefault: isDefault || undefined,
    createdAt: typeof agent.createdAt === 'number' ? agent.createdAt : fallbackTimestamp,
    updatedAt: typeof agent.updatedAt === 'number' ? agent.updatedAt : fallbackTimestamp,
  }
}

function normalizeFile(raw: unknown, timestamp: number): OnethingAgentsFile {
  const rawAgents = Array.isArray((raw as OnethingAgentsFile | undefined)?.agents)
    ? (raw as OnethingAgentsFile).agents
    : []
  const agents = rawAgents
    .map(agent => normalizeAgent(agent, timestamp))
    .filter((agent): agent is OnethingAgentDefinition => agent !== null)

  const defaultIndex = agents.findIndex(agent => agent.id === DEFAULT_ONETHING_AGENT_ID)
  if (defaultIndex >= 0) {
    agents[defaultIndex] = {
      ...agents[defaultIndex],
      name: agents[defaultIndex].name || DEFAULT_ONETHING_AGENT_NAME,
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

export function createOnethingAgentStore(options: CreateOnethingAgentStoreOptions): OnethingAgentStore {
  const now = options.now ?? (() => Date.now())

  function loadFile(): OnethingAgentsFile {
    return normalizeFile(
      readJsonFile<unknown>(options.agentsPath, { version: 1, agents: [] }),
      now(),
    )
  }

  function saveFile(file: OnethingAgentsFile): void {
    writeJsonFile(options.agentsPath, normalizeFile(file, now()))
  }

  return {
    listAgents() {
      const file = loadFile()
      saveFile(file)
      return file.agents
    },

    getAgent(agentId) {
      const file = loadFile()
      return file.agents.find(agent => agent.id === agentId) ??
        file.agents.find(agent => agent.id === DEFAULT_ONETHING_AGENT_ID) ??
        createDefaultAgent(now())
    },

    agentExists(agentId) {
      if (!agentId) return false
      return loadFile().agents.some(agent => agent.id === agentId)
    },

    createAgent(input) {
      const file = loadFile()
      const id = input.id.trim()
      if (!id || id === DEFAULT_ONETHING_AGENT_ID) {
        throw new Error('Invalid agent id')
      }
      if (file.agents.some(agent => agent.id === id)) {
        throw new Error('Agent already exists')
      }

      const timestamp = now()
      const agent: OnethingAgentDefinition = {
        id,
        name: input.name.trim() || 'Untitled Agent',
        systemPrompt: input.systemPrompt ?? '',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      file.agents.push(agent)
      saveFile(file)
      return agent
    },

    updateAgent(input) {
      const file = loadFile()
      const index = file.agents.findIndex(agent => agent.id === input.agentId)
      if (index < 0) throw new Error('Agent not found')

      const current = file.agents[index]
      const next: OnethingAgentDefinition = {
        ...current,
        name: input.name !== undefined ? (input.name.trim() || current.name) : current.name,
        systemPrompt: input.systemPrompt !== undefined ? input.systemPrompt : current.systemPrompt,
        updatedAt: now(),
      }
      file.agents[index] = next
      saveFile(file)
      return next
    },

    deleteAgent(agentId) {
      if (agentId === DEFAULT_ONETHING_AGENT_ID) {
        throw new Error('Default Agent cannot be deleted')
      }

      const file = loadFile()
      const nextAgents = file.agents.filter(agent => agent.id !== agentId)
      if (nextAgents.length === file.agents.length) {
        throw new Error('Agent not found')
      }
      saveFile({ ...file, agents: nextAgents })
    },
  }
}
