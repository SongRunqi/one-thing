/**
 * Custom Agent Store
 *
 * Manages CustomAgent configurations stored programmatically.
 * Agents can be stored at user level or project level.
 */

import fs from 'fs'
import path from 'path'
import type { CustomAgent, CustomAgentConfig, CustomToolDefinition } from '../../shared/ipc/custom-agents.js'
import { getStorePath, readJsonFile, writeJsonFile } from './paths.js'

/**
 * Get user-level custom agents directory
 */
export function getUserCustomAgentsDir(): string {
  return path.join(getStorePath(), 'custom-agents')
}

/**
 * Get project-level custom agents directory
 */
export function getProjectCustomAgentsDir(workingDirectory: string): string {
  return path.join(workingDirectory, '.claude', 'agents')
}

/**
 * Get user-level custom agents index path
 */
function getUserAgentsIndexPath(): string {
  return path.join(getUserCustomAgentsDir(), 'index.json')
}

/**
 * Get project-level custom agents index path
 */
function getProjectAgentsIndexPath(workingDirectory: string): string {
  return path.join(getProjectCustomAgentsDir(workingDirectory), 'index.json')
}

/**
 * Ensure directory exists
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * Load user-level custom agents
 */
function loadUserAgents(): CustomAgentConfig[] {
  return readJsonFile(getUserAgentsIndexPath(), [])
}

/**
 * Save user-level custom agents
 */
function saveUserAgents(agents: CustomAgentConfig[]): void {
  ensureDir(getUserCustomAgentsDir())
  writeJsonFile(getUserAgentsIndexPath(), agents)
}

/**
 * Load project-level custom agents
 */
function loadProjectAgents(workingDirectory: string): CustomAgentConfig[] {
  return readJsonFile(getProjectAgentsIndexPath(workingDirectory), [])
}

/**
 * Save project-level custom agents
 */
function saveProjectAgents(workingDirectory: string, agents: CustomAgentConfig[]): void {
  ensureDir(getProjectCustomAgentsDir(workingDirectory))
  writeJsonFile(getProjectAgentsIndexPath(workingDirectory), agents)
}

/**
 * Convert stored config to full CustomAgent
 */
function configToAgent(config: CustomAgentConfig, source: 'user' | 'project', sourcePath: string): CustomAgent {
  return {
    ...config,
    source,
    sourcePath,
  }
}

/**
 * Get all custom agents (user + project)
 * Project agents override user agents with the same name
 */
export function getAllCustomAgents(workingDirectory?: string): CustomAgent[] {
  const userAgents = loadUserAgents().map(config =>
    configToAgent(config, 'user', getUserAgentsIndexPath())
  )

  if (!workingDirectory) {
    return userAgents
  }

  const projectAgents = loadProjectAgents(workingDirectory).map(config =>
    configToAgent(config, 'project', getProjectAgentsIndexPath(workingDirectory))
  )

  // Project agents override user agents with same name
  const agentMap = new Map<string, CustomAgent>()

  for (const agent of userAgents) {
    agentMap.set(agent.name.toLowerCase(), agent)
  }

  for (const agent of projectAgents) {
    agentMap.set(agent.name.toLowerCase(), agent)
  }

  return Array.from(agentMap.values())
}

/**
 * Get a single custom agent by ID
 */
export function getCustomAgent(agentId: string, workingDirectory?: string): CustomAgent | undefined {
  const allAgents = getAllCustomAgents(workingDirectory)
  return allAgents.find(a => a.id === agentId)
}

/**
 * Create a new custom agent
 */
export function createCustomAgent(
  config: Omit<CustomAgentConfig, 'id' | 'createdAt' | 'updatedAt'>,
  options?: { source?: 'user' | 'project'; workingDirectory?: string }
): CustomAgent {
  const source = options?.source ?? 'user'
  const workingDirectory = options?.workingDirectory

  // Generate unique ID
  const id = `custom-agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  const agentConfig: CustomAgentConfig = {
    ...config,
    id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  if (source === 'project' && workingDirectory) {
    const agents = loadProjectAgents(workingDirectory)
    agents.push(agentConfig)
    saveProjectAgents(workingDirectory, agents)
    return configToAgent(agentConfig, 'project', getProjectAgentsIndexPath(workingDirectory))
  } else {
    const agents = loadUserAgents()
    agents.push(agentConfig)
    saveUserAgents(agents)
    return configToAgent(agentConfig, 'user', getUserAgentsIndexPath())
  }
}

/**
 * Update an existing custom agent
 */
export function updateCustomAgent(
  agentId: string,
  updates: Partial<Omit<CustomAgentConfig, 'id' | 'createdAt' | 'updatedAt'>>,
  workingDirectory?: string
): CustomAgent | undefined {
  // Try to find in project agents first
  if (workingDirectory) {
    const projectAgents = loadProjectAgents(workingDirectory)
    const projectIndex = projectAgents.findIndex(a => a.id === agentId)

    if (projectIndex !== -1) {
      projectAgents[projectIndex] = {
        ...projectAgents[projectIndex],
        ...updates,
        updatedAt: Date.now(),
      }
      saveProjectAgents(workingDirectory, projectAgents)
      return configToAgent(projectAgents[projectIndex], 'project', getProjectAgentsIndexPath(workingDirectory))
    }
  }

  // Try user agents
  const userAgents = loadUserAgents()
  const userIndex = userAgents.findIndex(a => a.id === agentId)

  if (userIndex !== -1) {
    userAgents[userIndex] = {
      ...userAgents[userIndex],
      ...updates,
      updatedAt: Date.now(),
    }
    saveUserAgents(userAgents)
    return configToAgent(userAgents[userIndex], 'user', getUserAgentsIndexPath())
  }

  return undefined
}

/**
 * Delete a custom agent
 */
export function deleteCustomAgent(agentId: string, workingDirectory?: string): boolean {
  // Try to find and delete from project agents first
  if (workingDirectory) {
    const projectAgents = loadProjectAgents(workingDirectory)
    const projectIndex = projectAgents.findIndex(a => a.id === agentId)

    if (projectIndex !== -1) {
      projectAgents.splice(projectIndex, 1)
      saveProjectAgents(workingDirectory, projectAgents)
      return true
    }
  }

  // Try user agents
  const userAgents = loadUserAgents()
  const userIndex = userAgents.findIndex(a => a.id === agentId)

  if (userIndex !== -1) {
    userAgents.splice(userIndex, 1)
    saveUserAgents(userAgents)
    return true
  }

  return false
}

/**
 * Add a custom tool to an agent
 */
export function addCustomToolToAgent(
  agentId: string,
  tool: CustomToolDefinition,
  workingDirectory?: string
): CustomAgent | undefined {
  const agent = getCustomAgent(agentId, workingDirectory)
  if (!agent) return undefined

  const newTools = [...agent.customTools, tool]
  return updateCustomAgent(agentId, { customTools: newTools }, workingDirectory)
}

/**
 * Update a custom tool in an agent
 */
export function updateCustomToolInAgent(
  agentId: string,
  toolId: string,
  updates: Partial<CustomToolDefinition>,
  workingDirectory?: string
): CustomAgent | undefined {
  const agent = getCustomAgent(agentId, workingDirectory)
  if (!agent) return undefined

  const newTools = agent.customTools.map(t =>
    t.id === toolId ? { ...t, ...updates } : t
  )
  return updateCustomAgent(agentId, { customTools: newTools }, workingDirectory)
}

/**
 * Delete a custom tool from an agent
 */
export function deleteCustomToolFromAgent(
  agentId: string,
  toolId: string,
  workingDirectory?: string
): CustomAgent | undefined {
  const agent = getCustomAgent(agentId, workingDirectory)
  if (!agent) return undefined

  const newTools = agent.customTools.filter(t => t.id !== toolId)
  return updateCustomAgent(agentId, { customTools: newTools }, workingDirectory)
}
