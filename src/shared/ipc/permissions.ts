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
  /** Working directory for persistent directory-level permissions */
  workingDirectory?: string
}

/**
 * Permission response types:
 * - 'once': Allow this single operation only (本次)
 * - 'session': Allow for the duration of this session (本会话)
 * - 'workdir': Permanently allow in this working directory (本工作目录)
 * - 'reject': Deny the operation
 */
export type PermissionResponse = 'once' | 'session' | 'workdir' | 'reject'

/** Legacy alias for backwards compatibility */
export type LegacyPermissionResponse = 'once' | 'always' | 'workspace' | 'reject'

export interface PermissionRespondRequest {
  sessionId: string
  permissionId: string
  response: PermissionResponse | LegacyPermissionResponse
  /** Optional reason for rejection */
  rejectReason?: string
}
