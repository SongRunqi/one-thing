/**
 * Agents Module
 * Agent-related type definitions for IPC communication
 */

// Agent avatar type (same as WorkspaceAvatar)
export interface AgentAvatar {
  type: 'emoji' | 'image'
  value: string  // Emoji character or image file path
}

// Agent voice configuration (Browser TTS)
export interface AgentVoice {
  enabled: boolean
  voiceURI?: string    // Browser SpeechSynthesis voiceURI
  rate?: number        // 0.1 - 10, default 1
  pitch?: number       // 0 - 2, default 1
  volume?: number      // 0 - 1, default 1
}

// Skill permission type
export type SkillPermission = 'allow' | 'ask' | 'deny'

// Agent permissions configuration
export interface AgentPermissions {
  // Skill permissions: pattern -> permission
  // Supports wildcards: "*" matches all, "prefix-*" matches prefix
  // Later patterns override earlier ones
  skill?: Record<string, SkillPermission>
}

// Agent definition
export interface Agent {
  id: string
  name: string
  avatar: AgentAvatar
  systemPrompt: string
  // Extended persona fields
  tagline?: string           // 一句话介绍
  personality?: string[]     // 性格标签 ['耐心', '幽默', '专业']
  primaryColor?: string      // 主题色 (hex color)
  // Voice configuration
  voice?: AgentVoice
  // Permissions configuration
  permissions?: AgentPermissions
  createdAt: number
  updatedAt: number
}

// Agent IPC Request/Response types
export interface GetAgentsResponse {
  success: boolean
  agents?: Agent[]
  pinnedAgentIds?: string[]
  error?: string
}

export interface CreateAgentRequest {
  name: string
  avatar: AgentAvatar
  systemPrompt: string
  tagline?: string
  personality?: string[]
  primaryColor?: string
  voice?: AgentVoice
  permissions?: AgentPermissions
}

export interface CreateAgentResponse {
  success: boolean
  agent?: Agent
  error?: string
}

export interface UpdateAgentRequest {
  id: string
  name?: string
  avatar?: AgentAvatar
  systemPrompt?: string
  tagline?: string
  personality?: string[]
  primaryColor?: string
  voice?: AgentVoice
  permissions?: AgentPermissions
}

export interface UpdateAgentResponse {
  success: boolean
  agent?: Agent
  error?: string
}

export interface DeleteAgentRequest {
  agentId: string
}

export interface DeleteAgentResponse {
  success: boolean
  error?: string
}

export interface UploadAgentAvatarRequest {
  agentId: string
  imageData: string  // Base64 encoded image data
  mimeType: string
}

export interface UploadAgentAvatarResponse {
  success: boolean
  avatarPath?: string
  error?: string
}

export interface PinAgentRequest {
  agentId: string
}

export interface PinAgentResponse {
  success: boolean
  pinnedAgentIds?: string[]
  error?: string
}

export interface UnpinAgentRequest {
  agentId: string
}

export interface UnpinAgentResponse {
  success: boolean
  pinnedAgentIds?: string[]
  error?: string
}

// ============================================
// Built-in Agent Types (Build Mode / Ask Mode)
// ============================================

/**
 * Built-in agent mode types
 * - 'build': Full access mode (default) - can edit, write, execute all commands
 * - 'ask': Read-only mode - only exploration and answering questions, no file modifications
 */
export type BuiltinAgentMode = 'build' | 'ask'

/**
 * Tool permission configuration for built-in agents
 */
export interface BuiltinAgentToolPermissions {
  /** Edit tool permission: 'allow' | 'deny' */
  edit: 'allow' | 'deny'
  /** Write tool permission: 'allow' | 'deny' */
  write: 'allow' | 'deny'
  /** Bash tool permission: 'allow' = all allowed, 'read-only' = only read commands, 'deny' = all denied */
  bash: 'allow' | 'read-only' | 'deny'
  /** Read-only bash command patterns (prefixes that are allowed in read-only mode) */
  bashReadOnlyPatterns?: string[]
  /** Forbidden bash command patterns (always blocked) */
  bashForbiddenPatterns?: string[]
}

/**
 * Built-in agent definition (system agents, not user-created)
 */
export interface BuiltinAgent {
  /** Agent mode identifier */
  mode: BuiltinAgentMode
  /** Display name */
  name: string
  /** Short description */
  description: string
  /** Lucide icon name */
  icon: string
  /** Additional system prompt to inject when this mode is active */
  systemPromptAddition: string
  /** Tool permission configuration */
  toolPermissions: BuiltinAgentToolPermissions
}

// IPC types for builtin mode
export interface SetBuiltinModeRequest {
  sessionId: string
  mode: BuiltinAgentMode
}

export interface SetBuiltinModeResponse {
  success: boolean
  mode?: BuiltinAgentMode
  error?: string
}
