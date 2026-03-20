/**
 * Workspaces Module
 * Workspace-related type definitions for IPC communication
 */

// Workspace avatar type
export interface WorkspaceAvatar {
  type: 'emoji' | 'image'
  value: string  // Emoji character or image file path
}

// Workspace definition
export interface Workspace {
  id: string
  name: string
  avatar: WorkspaceAvatar
  workingDirectory?: string  // Default working directory for new sessions
  systemPrompt?: string  // Deprecated: migrated to Agent, kept for backward compatibility
  createdAt: number
  updatedAt: number
}

// Workspace IPC Request/Response types
export interface GetWorkspacesResponse {
  success: boolean
  workspaces?: Workspace[]
  currentWorkspaceId?: string | null
  error?: string
}

export interface CreateWorkspaceRequest {
  name: string
  avatar: WorkspaceAvatar
  workingDirectory?: string
  systemPrompt: string
}

export interface CreateWorkspaceResponse {
  success: boolean
  workspace?: Workspace
  error?: string
}

export interface UpdateWorkspaceRequest {
  id: string
  name?: string
  avatar?: WorkspaceAvatar
  workingDirectory?: string
  systemPrompt?: string
}

export interface UpdateWorkspaceResponse {
  success: boolean
  workspace?: Workspace
  error?: string
}

export interface DeleteWorkspaceRequest {
  workspaceId: string
}

export interface DeleteWorkspaceResponse {
  success: boolean
  deletedSessionCount?: number
  error?: string
}

export interface SwitchWorkspaceRequest {
  workspaceId: string | null  // null = switch to default mode
}

export interface SwitchWorkspaceResponse {
  success: boolean
  error?: string
}

export interface UploadWorkspaceAvatarRequest {
  workspaceId: string
  imageData: string  // Base64 encoded image data
  mimeType: string
}

export interface UploadWorkspaceAvatarResponse {
  success: boolean
  avatarPath?: string
  error?: string
}
