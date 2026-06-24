/**
 * Skills Module
 * Skills-related type definitions for IPC communication.
 */

// Skill source location
export type SkillSource = 'user' | 'project' | 'plugin' | 'builtin'

// Skill definition based on Hermes Agent / SKILL.md skills
export interface SkillDefinition {
  // Parsed from SKILL.md YAML frontmatter
  name: string                    // max 64 chars
  description: string             // max 1024 chars, what it does AND when to use
  allowedTools?: string[]         // Optional tool restrictions
  category?: string               // Category path under the skills root
  tags?: string[]                 // metadata.hermes.tags
  relatedSkills?: string[]        // metadata.hermes.related_skills
  platforms?: string[]            // Supported OS platforms
  conditions?: SkillConditions    // metadata.hermes conditional activation
  disableModelInvocation?: boolean // Exclude from automatic model-visible skill index

  // Metadata added by loader
  id: string                      // Unique identifier (path-based)
  source: SkillSource             // 'user' (~/.onething/skills), 'project', 'plugin', or 'builtin'
  path: string                    // Full path to SKILL.md
  directoryPath: string           // Path to skill directory
  rootPath?: string               // Skills root that contained this skill
  relativePath?: string           // Relative path from root to SKILL.md
  enabled: boolean                // Whether skill is enabled

  // Content
  instructions: string            // Main body of SKILL.md (after frontmatter)
  runtimeContext?: string         // Host-injected context appended at load time

  // Optional: additional files in the skill directory
  files?: SkillFile[]
}

export interface SkillConditions {
  fallbackForToolsets?: string[]
  requiresToolsets?: string[]
  fallbackForTools?: string[]
  requiresTools?: string[]
}

export interface SkillReferenceSnapshot {
  skillId: string
  name: string
  description: string
  source: SkillSource
  content: string
  bodyHash: string
}

// Additional file in a skill directory
export interface SkillFile {
  name: string
  path: string
  type: 'markdown' | 'script' | 'template' | 'other'
}

// Skill settings
export interface SkillSettings {
  enableSkills: boolean
  /**
   * Hermes-compatible skill review cadence. Counts completed agent turns while
   * skill_manage is available. Set to 0 or a negative value
   * to disable automatic background skill review.
   */
  creationNudgeInterval?: number
  // Per-skill enabled state (keyed by skill id)
  skills: Record<string, { enabled: boolean }>
}

// Skills IPC Request/Response types
export interface GetSkillsResponse {
  success: boolean
  skills?: SkillDefinition[]
  error?: string
}

// Refresh skills from filesystem
export interface RefreshSkillsResponse {
  success: boolean
  skills?: SkillDefinition[]
  error?: string
}

// Read a skill file
export interface ReadSkillFileRequest {
  skillId: string
  fileName: string
}

export interface ReadSkillFileResponse {
  success: boolean
  content?: string
  error?: string
}

// Open skill directory in file manager
export interface OpenSkillDirectoryRequest {
  skillId: string
}

export interface OpenSkillDirectoryResponse {
  success: boolean
  error?: string
}

// Create new skill
export interface CreateSkillRequest {
  name: string
  description: string
  instructions: string
  source: SkillSource
}

export interface CreateSkillResponse {
  success: boolean
  skill?: SkillDefinition
  error?: string
}
