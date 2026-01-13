/**
 * Path Constants for Memory System
 *
 * Centralized path management to avoid scattered hardcoded strings.
 */

/**
 * Directory names within the memory base directory
 */
export const MEMORY_DIRS = {
  /** Core memories (always loaded) */
  CORE: '_core',
  /** Topic-based memories (on-demand) */
  TOPICS: 'topics',
  /** Per-agent memories */
  AGENTS: 'agents',
} as const

/**
 * Common file paths relative to memory base directory
 */
export const MEMORY_FILES = {
  /** User profile information */
  PROFILE: '_core/profile.md',
  /** User preferences */
  PREFERENCES: '_core/preferences.md',
  /** Memory index file */
  INDEX: '_index.json',
} as const

/**
 * Get the path to an agent's directory
 */
export function getAgentDir(agentId: string): string {
  return `${MEMORY_DIRS.AGENTS}/${agentId}`
}

/**
 * Get the path to an agent's relationship file
 */
export function getAgentRelationshipPath(agentId: string): string {
  return `${MEMORY_DIRS.AGENTS}/${agentId}/relationship.md`
}

/**
 * Get the path to an agent's topics directory
 */
export function getAgentTopicsDir(agentId: string): string {
  return `${MEMORY_DIRS.AGENTS}/${agentId}/${MEMORY_DIRS.TOPICS}`
}

/**
 * Get the path to a topic file (shared or agent-specific)
 */
export function getTopicPath(topicName: string, agentId?: string): string {
  // Sanitize topic name for filename
  const fileName = sanitizeFileName(topicName) + '.md'

  if (agentId) {
    return `${MEMORY_DIRS.AGENTS}/${agentId}/${MEMORY_DIRS.TOPICS}/${fileName}`
  }
  return `${MEMORY_DIRS.TOPICS}/${fileName}`
}

/**
 * Sanitize a name for use as filename
 * - Lowercase
 * - Replace non-alphanumeric (except Chinese) with hyphens
 */
export function sanitizeFileName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
}

/**
 * Check if a path is a core file
 */
export function isCorePath(relativePath: string): boolean {
  return relativePath.startsWith(MEMORY_DIRS.CORE + '/')
}

/**
 * Check if a path is an agent-specific file
 */
export function isAgentPath(relativePath: string): boolean {
  return relativePath.startsWith(MEMORY_DIRS.AGENTS + '/')
}

/**
 * Extract agent ID from an agent path
 * Returns undefined if not an agent path
 */
export function extractAgentId(relativePath: string): string | undefined {
  if (!isAgentPath(relativePath)) {
    return undefined
  }
  const parts = relativePath.split('/')
  return parts.length >= 2 ? parts[1] : undefined
}
