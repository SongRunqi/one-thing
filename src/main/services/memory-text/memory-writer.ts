/**
 * Memory Writer
 *
 * Handles writing and updating memory files.
 * Used by the memory update trigger to persist new information.
 */

import { getTextMemoryStorage } from './text-memory-storage.js'
import * as path from 'path'

export interface MemoryUpdate {
  type: 'core' | 'topic' | 'agent'
  file: string           // Relative path within memory directory
  section?: string       // Section heading to update (optional)
  content: string        // Content to write or append
  mode: 'overwrite' | 'append'
}

/**
 * Apply a memory update
 */
export async function applyMemoryUpdate(update: MemoryUpdate): Promise<void> {
  const storage = getTextMemoryStorage()

  console.log(`[MemoryWriter] Applying update: ${update.type}/${update.file}`)

  if (update.mode === 'overwrite') {
    await storage.writeMemoryFile(update.file, update.content)
  } else if (update.section) {
    await storage.appendToSection(update.file, update.section, update.content)
  } else {
    // Append to end of file
    const fullPath = path.join(storage.getBaseDir(), update.file)
    const existingContent = await readFileOrEmpty(fullPath)
    const newContent = existingContent
      ? existingContent + '\n\n' + update.content
      : update.content
    await storage.writeMemoryFile(update.file, newContent)
  }
}

/**
 * Create a new topic file
 */
export async function createTopicFile(
  topicName: string,
  initialContent: string,
  agentId?: string,
  tags?: string[]
): Promise<string> {
  const storage = getTextMemoryStorage()

  // Sanitize topic name for filename
  const fileName = topicName.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-') + '.md'

  let relativePath: string
  if (agentId) {
    relativePath = `agents/${agentId}/topics/${fileName}`
  } else {
    relativePath = `topics/${fileName}`
  }

  const content = `# ${topicName}\n\n${initialContent}`
  await storage.writeMemoryFile(relativePath, content, { tags })

  console.log(`[MemoryWriter] Created topic file: ${relativePath}`)
  return relativePath
}

/**
 * Add a memory point to a topic
 */
export async function addMemoryPoint(
  topicFile: string,
  section: string,
  point: string
): Promise<void> {
  const storage = getTextMemoryStorage()

  // Format as list item
  const formattedPoint = point.startsWith('-') ? point : `- ${point}`

  await storage.appendToSection(topicFile, section, formattedPoint)
  console.log(`[MemoryWriter] Added point to ${topicFile}/${section}`)
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  section: string,
  content: string,
  tags?: string[]
): Promise<void> {
  const storage = getTextMemoryStorage()
  await storage.appendToSection('_core/profile.md', section, content, { tags })
  console.log(`[MemoryWriter] Updated profile section: ${section}`)
}

/**
 * Update user preferences
 */
export async function updateUserPreferences(
  section: string,
  content: string,
  tags?: string[]
): Promise<void> {
  const storage = getTextMemoryStorage()
  await storage.appendToSection('_core/preferences.md', section, content, { tags })
  console.log(`[MemoryWriter] Updated preferences section: ${section}`)
}

/**
 * Update agent relationship
 */
export async function updateAgentRelationship(
  agentId: string,
  updates: {
    trustLevel?: number
    familiarity?: number
    currentMood?: string
    moodNotes?: string
  }
): Promise<void> {
  const storage = getTextMemoryStorage()
  await storage.updateAgentRelationship(agentId, updates)
  console.log(`[MemoryWriter] Updated agent relationship: ${agentId}`)
}

/**
 * Add a memory point for an agent
 */
export async function addAgentMemoryPoint(
  agentId: string,
  point: string
): Promise<void> {
  const storage = getTextMemoryStorage()
  const formattedPoint = point.startsWith('-') ? point : `- ${point}`
  await storage.appendToSection(
    `agents/${agentId}/relationship.md`,
    'Memory Points',
    formattedPoint
  )
  console.log(`[MemoryWriter] Added agent memory point: ${agentId}`)
}

/**
 * Record an interaction with an agent
 */
export async function recordAgentInteraction(agentId: string): Promise<void> {
  const storage = getTextMemoryStorage()
  await storage.recordInteraction(agentId)
}

/**
 * Helper to read a file or return empty string
 */
async function readFileOrEmpty(filePath: string): Promise<string> {
  try {
    const fs = await import('fs/promises')
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return ''
  }
}

/**
 * Batch apply multiple updates
 */
export async function applyMemoryUpdates(updates: MemoryUpdate[]): Promise<void> {
  for (const update of updates) {
    try {
      await applyMemoryUpdate(update)
    } catch (error) {
      console.error(`[MemoryWriter] Failed to apply update:`, update, error)
    }
  }
}

/**
 * List existing topic files (useful for AI to know what topics exist)
 */
export async function listExistingTopics(agentId?: string): Promise<string[]> {
  const storage = getTextMemoryStorage()
  const topics = await storage.listTopicFiles()

  // Also get agent-specific topics if agentId provided
  if (agentId) {
    const fs = await import('fs/promises')
    const agentTopicsDir = path.join(storage.getBaseDir(), 'agents', agentId, 'topics')
    try {
      const entries = await fs.readdir(agentTopicsDir)
      const agentTopics = entries.filter(f => f.endsWith('.md'))
      return [...topics, ...agentTopics.map(t => `agent:${t}`)]
    } catch {
      // Directory may not exist
    }
  }

  return topics
}
