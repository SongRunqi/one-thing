/**
 * Skills Module
 * Skills-related type definitions for IPC communication (Official Claude Code Skills format)
 */

// Skill source location
export type SkillSource = 'user' | 'project' | 'plugin'

// Skill definition based on official Claude Code Skills
export interface SkillDefinition {
  // Parsed from SKILL.md YAML frontmatter
  name: string                    // max 64 chars, lowercase letters/numbers/hyphens
  description: string             // max 1024 chars, what it does AND when to use
  allowedTools?: string[]         // Optional tool restrictions

  // Metadata added by loader
  id: string                      // Unique identifier (path-based)
  source: SkillSource             // 'user' (~/.claude/skills) or 'project' (.claude/skills)
  path: string                    // Full path to SKILL.md
  directoryPath: string           // Path to skill directory
  enabled: boolean                // Whether skill is enabled

  // Content
  instructions: string            // Main body of SKILL.md (after frontmatter)

  // Optional: additional files in the skill directory
  files?: SkillFile[]
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
