/**
 * Custom Agent Loader
 *
 * Loads CustomAgents from filesystem:
 * - User agents: ~/.claude/agents/*.json
 * - Project agents: {workingDirectory}/.claude/agents/*.json
 *
 * Each agent is a JSON file following the CustomAgentJsonFile schema.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import type {
  CustomAgent,
  CustomAgentSource,
  CustomAgentJsonFile,
  CustomToolDefinition,
} from '../../../shared/ipc/custom-agents.js'

/**
 * Get the user agents directory path
 */
export function getUserAgentsPath(): string {
  return path.join(os.homedir(), '.claude', 'agents')
}

/**
 * Get the project agents directory path
 */
export function getProjectAgentsPath(workingDirectory: string): string {
  return path.join(workingDirectory, '.claude', 'agents')
}

/**
 * Validate a CustomToolDefinition
 */
function validateCustomTool(tool: unknown, fileName: string): CustomToolDefinition | null {
  if (!tool || typeof tool !== 'object') {
    console.warn(`[CustomAgent] Invalid tool in ${fileName}: not an object`)
    return null
  }

  const t = tool as Record<string, unknown>

  // Required fields
  if (!t.id || typeof t.id !== 'string') {
    console.warn(`[CustomAgent] Invalid tool in ${fileName}: missing or invalid 'id'`)
    return null
  }

  if (!t.name || typeof t.name !== 'string') {
    console.warn(`[CustomAgent] Invalid tool in ${fileName}: missing or invalid 'name'`)
    return null
  }

  if (!t.description || typeof t.description !== 'string') {
    console.warn(`[CustomAgent] Invalid tool in ${fileName}: missing or invalid 'description'`)
    return null
  }

  if (!t.execution || typeof t.execution !== 'object') {
    console.warn(`[CustomAgent] Invalid tool in ${fileName}: missing or invalid 'execution'`)
    return null
  }

  const execution = t.execution as Record<string, unknown>

  // Validate execution type
  if (!['bash', 'http', 'builtin'].includes(execution.type as string)) {
    console.warn(`[CustomAgent] Invalid tool in ${fileName}: invalid execution type '${execution.type}'`)
    return null
  }

  // Type-specific validation
  if (execution.type === 'bash') {
    if (!execution.command || typeof execution.command !== 'string') {
      console.warn(`[CustomAgent] Invalid bash tool in ${fileName}: missing 'command'`)
      return null
    }
  } else if (execution.type === 'http') {
    if (!execution.url || typeof execution.url !== 'string') {
      console.warn(`[CustomAgent] Invalid http tool in ${fileName}: missing 'url'`)
      return null
    }
    if (!execution.method || typeof execution.method !== 'string') {
      console.warn(`[CustomAgent] Invalid http tool in ${fileName}: missing 'method'`)
      return null
    }
  } else if (execution.type === 'builtin') {
    if (!execution.toolId || typeof execution.toolId !== 'string') {
      console.warn(`[CustomAgent] Invalid builtin tool in ${fileName}: missing 'toolId'`)
      return null
    }
  }

  // Validate parameters (optional, default to empty array)
  const parameters = Array.isArray(t.parameters) ? t.parameters : []

  return {
    id: t.id as string,
    name: t.name as string,
    description: t.description as string,
    parameters: parameters.map((p: any) => ({
      name: p.name || '',
      type: p.type || 'string',
      description: p.description || '',
      required: p.required ?? false,
      default: p.default,
      enum: p.enum,
    })),
    execution: t.execution as CustomToolDefinition['execution'],
  }
}

/**
 * Validate and parse a CustomAgent JSON file
 */
function parseAgentJsonFile(
  content: string,
  fileName: string,
  source: CustomAgentSource,
  sourcePath: string
): CustomAgent | null {
  try {
    const json = JSON.parse(content) as CustomAgentJsonFile

    // Validate required fields
    if (!json.name || typeof json.name !== 'string') {
      console.warn(`[CustomAgent] Invalid agent ${fileName}: missing or invalid 'name'`)
      return null
    }

    if (!json.description || typeof json.description !== 'string') {
      console.warn(`[CustomAgent] Invalid agent ${fileName}: missing or invalid 'description'`)
      return null
    }

    if (!json.systemPrompt || typeof json.systemPrompt !== 'string') {
      console.warn(`[CustomAgent] Invalid agent ${fileName}: missing or invalid 'systemPrompt'`)
      return null
    }

    if (!Array.isArray(json.customTools)) {
      console.warn(`[CustomAgent] Invalid agent ${fileName}: missing or invalid 'customTools'`)
      return null
    }

    // Validate custom tools
    const validTools: CustomToolDefinition[] = []
    for (const tool of json.customTools) {
      const validTool = validateCustomTool(tool, fileName)
      if (validTool) {
        validTools.push(validTool)
      }
    }

    // Generate ID from source and name
    const id = `${source}:${json.name}`

    const agent: CustomAgent = {
      id,
      name: json.name,
      description: json.description,
      avatar: json.avatar,
      systemPrompt: json.systemPrompt,
      customTools: validTools,
      allowBuiltinTools: json.allowBuiltinTools ?? false,
      allowedBuiltinTools: json.allowedBuiltinTools,
      maxToolCalls: json.maxToolCalls ?? 20,
      timeoutMs: json.timeoutMs ?? 120000,
      source,
      sourcePath,
    }

    return agent
  } catch (error) {
    console.error(`[CustomAgent] Error parsing ${fileName}:`, error)
    return null
  }
}

/**
 * Load a single agent from a JSON file
 */
function loadAgentFromFile(
  filePath: string,
  source: CustomAgentSource
): CustomAgent | null {
  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const fileName = path.basename(filePath)
    return parseAgentJsonFile(content, fileName, source, filePath)
  } catch (error) {
    console.error(`[CustomAgent] Error reading ${filePath}:`, error)
    return null
  }
}

/**
 * Load all agents from a directory
 */
function loadAgentsFromPath(
  agentsDir: string,
  source: CustomAgentSource
): CustomAgent[] {
  const agents: CustomAgent[] = []

  if (!fs.existsSync(agentsDir)) {
    return agents
  }

  try {
    const entries = fs.readdirSync(agentsDir, { withFileTypes: true })

    for (const entry of entries) {
      // Only process .json files
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue
      }

      const filePath = path.join(agentsDir, entry.name)
      const agent = loadAgentFromFile(filePath, source)

      if (agent) {
        agents.push(agent)
      }
    }
  } catch (error) {
    console.error(`[CustomAgent] Error scanning ${agentsDir}:`, error)
  }

  return agents
}

/**
 * Load all CustomAgents from user and project directories
 *
 * Priority: project > user (project agents override user agents with same name)
 *
 * @param workingDirectory - Optional working directory for project-level agents
 */
export function loadCustomAgents(workingDirectory?: string): CustomAgent[] {
  // 1. User agents (global)
  const userAgentsPath = getUserAgentsPath()
  const userAgents = loadAgentsFromPath(userAgentsPath, 'user')
  console.log(`[CustomAgent] User agents path: ${userAgentsPath}, found ${userAgents.length} agents:`, userAgents.map(a => a.name))

  // 2. Project agents (if working directory provided)
  let projectAgents: CustomAgent[] = []
  if (workingDirectory) {
    const projectAgentsPath = getProjectAgentsPath(workingDirectory)
    projectAgents = loadAgentsFromPath(projectAgentsPath, 'project')
    console.log(`[CustomAgent] Project agents path: ${projectAgentsPath}, found ${projectAgents.length} agents:`, projectAgents.map(a => a.name))
  }

  // Priority: project > user
  const allAgents = [...projectAgents, ...userAgents]

  // Deduplicate by name (first one wins)
  const seenNames = new Set<string>()
  const dedupedAgents = allAgents.filter(agent => {
    if (seenNames.has(agent.name)) {
      return false
    }
    seenNames.add(agent.name)
    return true
  })

  console.log(`[CustomAgent] Total agents (after dedup): ${dedupedAgents.length}, names:`, dedupedAgents.map(a => a.name))

  return dedupedAgents
}

/**
 * Ensure agents directories exist
 */
export function ensureAgentsDirectories(): void {
  const userAgentsDir = getUserAgentsPath()
  if (!fs.existsSync(userAgentsDir)) {
    fs.mkdirSync(userAgentsDir, { recursive: true })
    console.log(`[CustomAgent] Created user agents directory: ${userAgentsDir}`)
  }
}

/**
 * Get a single CustomAgent by name
 */
export function getCustomAgentByName(
  name: string,
  workingDirectory?: string
): CustomAgent | undefined {
  const agents = loadCustomAgents(workingDirectory)
  return agents.find(a => a.name === name)
}

/**
 * Get a single CustomAgent by ID
 */
export function getCustomAgentById(
  id: string,
  workingDirectory?: string
): CustomAgent | undefined {
  const agents = loadCustomAgents(workingDirectory)
  return agents.find(a => a.id === id)
}

/**
 * Refresh (reload) all CustomAgents
 */
export function refreshCustomAgents(workingDirectory?: string): CustomAgent[] {
  console.log('[CustomAgent] Refreshing agents...')
  return loadCustomAgents(workingDirectory)
}
