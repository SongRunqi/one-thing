/**
 * Shared Agent Types Module
 *
 * Contains shared type definitions used by multiple modules:
 * - AgentAvatar: used by CustomAgent system
 * - BuiltinAgentMode: used by Ask/Build mode toggle
 * - BuiltinAgent: built-in agent configuration
 *
 * Note: The old Agent CRUD system has been deprecated and removed.
 * Use CustomAgent system instead for creating/managing agents.
 */

// ============================================
// Shared Avatar Type
// ============================================

/**
 * Agent avatar configuration (used by CustomAgent)
 */
export interface AgentAvatar {
  type: 'emoji' | 'icon' | 'image'
  value?: string // emoji character or image path/URL
  icon?: string // lucide icon name for type='icon'
  gradient?: string // gradient style for type='icon'
}

/**
 * Agent voice settings for TTS
 */
export interface AgentVoice {
  enabled: boolean
  voiceURI?: string
  rate?: number
  pitch?: number
  volume?: number
}

/**
 * Skill permission level
 */
export type SkillPermission = 'allow' | 'deny' | 'ask'

/**
 * Agent permissions configuration
 */
export interface AgentPermissions {
  /** Skill permissions: map of skill name patterns to permission level */
  skill?: Record<string, SkillPermission>
}

/**
 * @deprecated Use CustomAgent instead
 * Legacy Agent type alias for backward compatibility during migration
 */
import type { CustomAgent } from './custom-agents.js'
export type Agent = CustomAgent

// ============================================
// Builtin Agent Types (Ask/Build Mode)
// ============================================

/**
 * Built-in agent mode: 'ask' or 'build'
 */
export type BuiltinAgentMode = 'ask' | 'build'

/**
 * Tool permissions for built-in agents
 */
export interface BuiltinAgentToolPermissions {
  /** Edit tool permission: 'allow' | 'deny' */
  edit: 'allow' | 'deny'
  /** Write tool permission: 'allow' | 'deny' */
  write: 'allow' | 'deny'
  /** Bash tool permission: 'allow' | 'deny' | 'read-only' */
  bash: 'allow' | 'deny' | 'read-only'
  /** Patterns that are always allowed in read-only mode */
  bashReadOnlyPatterns: string[]
  /** Patterns that are always forbidden */
  bashForbiddenPatterns: string[]
}

/**
 * Built-in agent configuration
 */
export interface BuiltinAgent {
  mode: BuiltinAgentMode
  name: string
  description: string
  icon: string
  /** Additional system prompt content for this mode */
  systemPromptAddition: string
  toolPermissions: BuiltinAgentToolPermissions
}

// ============================================
// Request/Response Types (for builtin mode)
// ============================================

export interface SetBuiltinModeRequest {
  sessionId: string
  mode: BuiltinAgentMode
}

export interface SetBuiltinModeResponse {
  success: boolean
  mode?: BuiltinAgentMode
  error?: string
}
