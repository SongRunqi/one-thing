/**
 * Permissions Module
 * Permission-related type definitions for IPC communication
 */

// Permission related types
export interface PermissionInfo {
  id: string
  type: string
  pattern?: string | string[]
  sessionId: string
  messageId: string
  callId?: string
  title: string
  metadata: Record<string, unknown>
  createdAt: number
  /** Working directory for workspace-level permissions */
  workingDirectory?: string
}

/**
 * Permission response types:
 * - 'once': Allow this single operation only (本次)
 * - 'session': Allow for the duration of this session (本会话)
 * - 'workspace': Permanently allow in this workspace (本工作区)
 * - 'reject': Deny the operation
 */
export type PermissionResponse = 'once' | 'session' | 'workspace' | 'reject'

/** Legacy alias for backwards compatibility */
export type LegacyPermissionResponse = 'once' | 'always' | 'reject'

export interface PermissionRespondRequest {
  sessionId: string
  permissionId: string
  response: PermissionResponse
  /** Optional reason for rejection */
  rejectReason?: string
}

// Agent permission configuration
export interface AgentPermissionConfig {
  // Bash command permissions: allow, ask, deny
  bash?: 'allow' | 'ask' | 'deny' | BashPermissionRules
  // External directory access
  externalDirectory?: 'allow' | 'ask' | 'deny'
  // File write permissions
  fileWrite?: 'allow' | 'ask' | 'deny'
  // File read permissions
  fileRead?: 'allow' | 'ask' | 'deny'
}

export interface BashPermissionRules {
  // Default action for unlisted commands
  default: 'allow' | 'ask' | 'deny'
  // Specific command rules (pattern -> action)
  rules: Record<string, 'allow' | 'ask' | 'deny'>
}
