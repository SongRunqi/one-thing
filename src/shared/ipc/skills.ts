/**
 * Skills Module
 * Skills-related type definitions for IPC communication.
 */

// Skill source location
export type SkillSource = 'user' | 'project' | 'plugin' | 'builtin' | 'custom'

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
  agentId?: string | null         // Agent this skill is scoped to; null/undefined = all agents

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

// A user-managed skills root scanned in addition to the app-owned roots
export interface SkillDirectoryConfig {
  id: string
  path: string
  label?: string
  // Bind every skill loaded from this root to one agent; null/undefined = all agents
  agentId?: string | null
  enabled: boolean
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
  // Per-skill enabled state and optional agent binding override (keyed by skill id)
  skills: Record<string, { enabled: boolean; agentId?: string | null }>
  // Manually added skill directories
  customDirectories?: SkillDirectoryConfig[]
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

// Custom skill directory management
export interface ListSkillDirectoriesResponse {
  success: boolean
  directories?: SkillDirectoryConfig[]
  error?: string
}

export interface AddSkillDirectoryRequest {
  path: string
  label?: string
  agentId?: string | null
}

export interface AddSkillDirectoryResponse {
  success: boolean
  directory?: SkillDirectoryConfig
  error?: string
}

export interface UpdateSkillDirectoryRequest {
  id: string
  enabled?: boolean
  label?: string
  // Pass null to clear the binding; omit to leave unchanged
  agentId?: string | null
}

export interface UpdateSkillDirectoryResponse {
  success: boolean
  directory?: SkillDirectoryConfig
  error?: string
}

export interface RemoveSkillDirectoryRequest {
  id: string
}

export interface RemoveSkillDirectoryResponse {
  success: boolean
  error?: string
}

// Per-skill agent assignment override
export interface SetSkillAgentRequest {
  skillId: string
  // null clears the binding (skill becomes available to all agents)
  agentId: string | null
}

export interface SetSkillAgentResponse {
  success: boolean
  error?: string
}
