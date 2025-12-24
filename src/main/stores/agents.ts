import fs from 'fs'
import path from 'path'
import type { Agent, AgentAvatar } from '../../shared/ipc.js'
import {
  getAgentsDir,
  getAgentAvatarsDir,
  getAgentAvatarPath,
  readJsonFile,
  writeJsonFile,
} from './paths.js'
import { getPinnedAgentIds, pinAgent, unpinAgent } from './app-state.js'

// Get agents index path
function getAgentsIndexPath(): string {
  return path.join(getAgentsDir(), 'index.json')
}

// Load agents index
function loadAgentsIndex(): Agent[] {
  return readJsonFile(getAgentsIndexPath(), [])
}

// Save agents index
function saveAgentsIndex(agents: Agent[]): void {
  writeJsonFile(getAgentsIndexPath(), agents)
}

// Get all agents
export function getAgents(): Agent[] {
  return loadAgentsIndex()
}

// Get a single agent by ID
export function getAgent(agentId: string): Agent | undefined {
  const agents = loadAgentsIndex()
  return agents.find(a => a.id === agentId)
}

// Create a new agent
export function createAgent(
  agentId: string,
  name: string,
  avatar: AgentAvatar,
  systemPrompt: string,
  options?: {
    tagline?: string
    personality?: string[]
    primaryColor?: string
  }
): Agent {
  const agent: Agent = {
    id: agentId,
    name,
    avatar,
    systemPrompt,
    tagline: options?.tagline,
    personality: options?.personality,
    primaryColor: options?.primaryColor,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  // Update index (agents are stored in index directly since they're small)
  const agents = loadAgentsIndex()
  agents.push(agent)
  saveAgentsIndex(agents)

  return agent
}

// Update an existing agent
export function updateAgent(
  agentId: string,
  updates: Partial<Pick<Agent, 'name' | 'avatar' | 'systemPrompt' | 'tagline' | 'personality' | 'primaryColor'>>
): Agent | undefined {
  const agents = loadAgentsIndex()
  const index = agents.findIndex(a => a.id === agentId)

  if (index === -1) return undefined

  const agent = agents[index]

  if (updates.name !== undefined) {
    agent.name = updates.name
  }
  if (updates.avatar !== undefined) {
    agent.avatar = updates.avatar
  }
  if (updates.systemPrompt !== undefined) {
    agent.systemPrompt = updates.systemPrompt
  }
  if (updates.tagline !== undefined) {
    agent.tagline = updates.tagline
  }
  if (updates.personality !== undefined) {
    agent.personality = updates.personality
  }
  if (updates.primaryColor !== undefined) {
    agent.primaryColor = updates.primaryColor
  }

  agent.updatedAt = Date.now()

  saveAgentsIndex(agents)

  return agent
}

// Delete an agent
export function deleteAgent(agentId: string): boolean {
  const agents = loadAgentsIndex()
  const index = agents.findIndex(a => a.id === agentId)

  if (index === -1) return false

  const agent = agents[index]

  // Delete avatar file if it's an image
  if (agent.avatar.type === 'image') {
    const avatarPath = agent.avatar.value
    if (fs.existsSync(avatarPath)) {
      try {
        fs.unlinkSync(avatarPath)
      } catch (error) {
        console.error('Failed to delete avatar file:', error)
      }
    }
  }

  // Remove from index
  agents.splice(index, 1)
  saveAgentsIndex(agents)

  // Remove from pinned agents if present
  unpinAgent(agentId)

  return true
}

// Upload agent avatar image
export function uploadAgentAvatar(
  agentId: string,
  imageData: string,
  mimeType: string
): string | null {
  // Determine file extension from mime type
  const extensionMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
  }

  const extension = extensionMap[mimeType]
  if (!extension) {
    console.error('Unsupported image type:', mimeType)
    return null
  }

  // Ensure avatars directory exists
  const avatarsDir = getAgentAvatarsDir()
  if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true })
  }

  // Delete any existing avatar for this agent
  const existingExtensions = ['png', 'jpg', 'gif', 'webp']
  for (const ext of existingExtensions) {
    const existingPath = getAgentAvatarPath(agentId, ext)
    if (fs.existsSync(existingPath)) {
      try {
        fs.unlinkSync(existingPath)
      } catch (error) {
        console.error('Failed to delete existing avatar:', error)
      }
    }
  }

  // Save new avatar
  const avatarPath = getAgentAvatarPath(agentId, extension)
  try {
    // Remove data URL prefix if present
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')
    fs.writeFileSync(avatarPath, buffer)
    return avatarPath
  } catch (error) {
    console.error('Failed to save avatar:', error)
    return null
  }
}

// Export pinned agent functions
export { getPinnedAgentIds, pinAgent, unpinAgent }
