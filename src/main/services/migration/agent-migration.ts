/**
 * Agent Migration Service
 *
 * Migrates old Built-in Agents (from Electron userData) to CustomAgent format.
 *
 * Old format: {userData}/data/agents/index.json (array of Agent objects)
 * New format: ~/.claude/agents/{name}.json (individual CustomAgentJsonFile)
 *
 * The migration:
 * 1. Reads old agents from Electron userData agents/index.json
 * 2. Converts each to CustomAgentJsonFile format
 * 3. Writes them to ~/.claude/agents/ as individual JSON files
 * 4. Renames old index.json to index.json.migrated (backup)
 *
 * Pin state is preserved - the pinnedAgentIds in app-state.json already works
 * for both old Agents and CustomAgents since they use the same ID format.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import type { AgentAvatar } from '../../../shared/ipc/agents.js'
import type { CustomAgentJsonFile } from '../../../shared/ipc/custom-agents.js'
import { getPinnedAgentIds, setPinnedAgentIds } from '../../stores/app-state.js'
import { getAgentsDir } from '../../stores/paths.js'

/**
 * Old Agent type (deprecated - only used for migration)
 * Represents the old Built-in Agent format stored in Electron userData
 */
interface OldAgent {
  id: string
  name: string
  avatar?: AgentAvatar
  systemPrompt?: string
  tagline?: string
  personality?: string[]
  primaryColor?: string
  voice?: {
    enabled: boolean
    voiceURI?: string
    rate?: number
    pitch?: number
    volume?: number
  }
  createdAt?: number
  updatedAt?: number
}

// Old agents stored in Electron userData
function getOldAgentsDir(): string {
  return getAgentsDir() // This returns {userData}/data/agents/
}

// New agents stored in ~/.claude/agents/
const NEW_AGENTS_DIR = path.join(os.homedir(), '.claude', 'agents')

/**
 * Get old index.json path
 */
function getOldIndexPath(): string {
  return path.join(getOldAgentsDir(), 'index.json')
}

/**
 * Get migrated marker path
 */
function getMigratedPath(): string {
  return path.join(getOldAgentsDir(), 'index.json.migrated')
}

/**
 * Check if migration is needed
 */
export function needsMigration(): boolean {
  const oldIndexPath = getOldIndexPath()
  const migratedPath = getMigratedPath()
  // Migration is needed if index.json exists and hasn't been migrated yet
  const needs = fs.existsSync(oldIndexPath) && !fs.existsSync(migratedPath)
  console.log(`[AgentMigration] Check: oldIndex=${oldIndexPath}, exists=${fs.existsSync(oldIndexPath)}, migrated=${fs.existsSync(migratedPath)}, needs=${needs}`)
  return needs
}

/**
 * Load old agents from index.json
 */
function loadOldAgents(): OldAgent[] {
  const oldIndexPath = getOldIndexPath()
  if (!fs.existsSync(oldIndexPath)) {
    console.log(`[AgentMigration] Old index not found: ${oldIndexPath}`)
    return []
  }

  try {
    const content = fs.readFileSync(oldIndexPath, 'utf-8')
    const data = JSON.parse(content)

    if (!Array.isArray(data)) {
      console.warn('[AgentMigration] index.json is not an array, skipping')
      return []
    }

    console.log(`[AgentMigration] Loaded ${data.length} agents from ${oldIndexPath}`)
    return data as OldAgent[]
  } catch (error) {
    console.error('[AgentMigration] Error reading index.json:', error)
    return []
  }
}

/**
 * Sanitize a filename (remove invalid characters)
 */
function sanitizeFilename(name: string): string {
  // Replace invalid characters with underscores
  return name.replace(/[<>:"/\\|?*]/g, '_').trim()
}

/**
 * Convert old Agent to CustomAgentJsonFile format
 */
function convertToCustomAgent(agent: OldAgent): CustomAgentJsonFile {
  // Map avatar (same structure, compatible)
  const avatar: AgentAvatar | undefined = agent.avatar
    ? {
        type: agent.avatar.type,
        value: agent.avatar.value,
      }
    : undefined

  return {
    name: agent.name,
    description: agent.tagline || `Migrated agent: ${agent.name}`,
    avatar,
    systemPrompt: agent.systemPrompt || '',
    customTools: [], // Old agents don't have custom tools
    allowBuiltinTools: false,
    allowedBuiltinTools: undefined,
  }
}

/**
 * Write a CustomAgent to a JSON file in ~/.claude/agents/
 */
function writeAgentFile(agent: CustomAgentJsonFile): string | null {
  const fileName = `${sanitizeFilename(agent.name)}.json`
  const filePath = path.join(NEW_AGENTS_DIR, fileName)

  // Check if file already exists (avoid overwriting)
  if (fs.existsSync(filePath)) {
    console.warn(`[AgentMigration] File already exists: ${fileName}, skipping`)
    return null
  }

  try {
    const content = JSON.stringify(agent, null, 2)
    fs.writeFileSync(filePath, content, 'utf-8')
    console.log(`[AgentMigration] Created: ${filePath}`)
    return filePath
  } catch (error) {
    console.error(`[AgentMigration] Error writing ${fileName}:`, error)
    return null
  }
}

/**
 * Update pinned agent IDs to use the new ID format
 *
 * Old format: just the agent.id (e.g., "abc123")
 * New format: "user:{agent.name}" (e.g., "user:MyAgent")
 */
function migratePinnedAgentIds(oldAgents: OldAgent[]): void {
  const oldPinnedIds = getPinnedAgentIds()

  if (oldPinnedIds.length === 0) {
    console.log('[AgentMigration] No pinned agents to migrate')
    return
  }

  // Build a map from old ID to new ID
  const idMap = new Map<string, string>()
  for (const agent of oldAgents) {
    const newId = `user:${agent.name}`
    idMap.set(agent.id, newId)
  }

  // Convert old IDs to new IDs
  const newPinnedIds: string[] = []
  for (const oldId of oldPinnedIds) {
    const newId = idMap.get(oldId)
    if (newId) {
      newPinnedIds.push(newId)
      console.log(`[AgentMigration] Migrated pinned ID: ${oldId} -> ${newId}`)
    } else {
      // Keep IDs that are already in new format or unknown
      if (oldId.includes(':')) {
        newPinnedIds.push(oldId)
      }
    }
  }

  // Update the pinned IDs
  if (newPinnedIds.length > 0) {
    setPinnedAgentIds(newPinnedIds)
    console.log(`[AgentMigration] Updated pinned agent IDs:`, newPinnedIds)
  }
}

/**
 * Run the migration
 *
 * @returns Number of agents migrated, or -1 if migration was not needed
 */
export function runMigration(): number {
  if (!needsMigration()) {
    console.log('[AgentMigration] No migration needed')
    return -1
  }

  console.log('[AgentMigration] Starting migration...')
  console.log(`[AgentMigration] Source: ${getOldIndexPath()}`)
  console.log(`[AgentMigration] Target: ${NEW_AGENTS_DIR}`)

  // Ensure new agents directory exists
  if (!fs.existsSync(NEW_AGENTS_DIR)) {
    fs.mkdirSync(NEW_AGENTS_DIR, { recursive: true })
    console.log(`[AgentMigration] Created target directory: ${NEW_AGENTS_DIR}`)
  }

  // Load old agents
  const oldAgents = loadOldAgents()

  if (oldAgents.length === 0) {
    console.log('[AgentMigration] No old agents found, marking as migrated')
    // Still mark as migrated to prevent re-running
    try {
      fs.renameSync(getOldIndexPath(), getMigratedPath())
    } catch (error) {
      console.error('[AgentMigration] Error marking as migrated:', error)
    }
    return 0
  }

  console.log(`[AgentMigration] Found ${oldAgents.length} old agents to migrate:`)
  oldAgents.forEach(a => console.log(`  - ${a.name} (${a.id})`))

  // Migrate pinned agent IDs first (before creating new files)
  migratePinnedAgentIds(oldAgents)

  // Convert and write each agent
  let migratedCount = 0
  for (const oldAgent of oldAgents) {
    const customAgent = convertToCustomAgent(oldAgent)
    const filePath = writeAgentFile(customAgent)
    if (filePath) {
      migratedCount++
    }
  }

  // Rename old index.json to mark migration complete
  try {
    fs.renameSync(getOldIndexPath(), getMigratedPath())
    console.log('[AgentMigration] Renamed index.json to index.json.migrated')
  } catch (error) {
    console.error('[AgentMigration] Error renaming index.json:', error)
  }

  console.log(`[AgentMigration] Migration complete: ${migratedCount}/${oldAgents.length} agents migrated`)

  return migratedCount
}
