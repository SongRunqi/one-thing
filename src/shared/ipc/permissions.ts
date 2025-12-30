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
}

export type PermissionResponse = 'once' | 'always' | 'reject'

export interface PermissionRespondRequest {
  sessionId: string
  permissionId: string
  response: PermissionResponse
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
