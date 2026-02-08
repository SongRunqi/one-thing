import fs from 'fs'
import path from 'path'
import type { Workspace, WorkspaceAvatar } from '../../shared/ipc.js'
import {
  getWorkspacesDir,
  getWorkspacePath,
  getWorkspaceAvatarsDir,
  getWorkspaceAvatarPath,
  readJsonFile,
  writeJsonFile,
  deleteJsonFile,
} from './paths.js'
import { getCurrentWorkspaceId, setCurrentWorkspaceId } from './app-state.js'
import { expandPath } from '../utils/path-utils.js'

// Get workspaces index path
function getWorkspacesIndexPath(): string {
  return path.join(getWorkspacesDir(), 'index.json')
}

// Load workspaces index
function loadWorkspacesIndex(): Workspace[] {
  return readJsonFile(getWorkspacesIndexPath(), [])
}

// Save workspaces index
function saveWorkspacesIndex(workspaces: Workspace[]): void {
  writeJsonFile(getWorkspacesIndexPath(), workspaces)
}

// Get all workspaces
export function getWorkspaces(): Workspace[] {
  const workspaces = loadWorkspacesIndex()
  // Expand ~ in workingDirectory for all workspaces (handles legacy stored paths)
  for (const workspace of workspaces) {
    if (workspace.workingDirectory) {
      workspace.workingDirectory = expandPath(workspace.workingDirectory)
    }
  }
  return workspaces
}

// Get a single workspace by ID
export function getWorkspace(workspaceId: string): Workspace | undefined {
  const workspaces = loadWorkspacesIndex()
  const workspace = workspaces.find(w => w.id === workspaceId)
  // Expand ~ in workingDirectory (handles legacy stored paths)
  if (workspace?.workingDirectory) {
    workspace.workingDirectory = expandPath(workspace.workingDirectory)
  }
  return workspace
}

// Create a new workspace
export function createWorkspace(
  workspaceId: string,
  name: string,
  avatar: WorkspaceAvatar,
  workingDirectory?: string,
  systemPrompt?: string  // Optional: deprecated, use Agent instead
): Workspace {
  // Expand ~ to home directory if workingDirectory is provided
  const expandedWorkingDirectory = workingDirectory ? expandPath(workingDirectory) : undefined

  const workspace: Workspace = {
    id: workspaceId,
    name,
    avatar,
    ...(expandedWorkingDirectory && { workingDirectory: expandedWorkingDirectory }),
    ...(systemPrompt && { systemPrompt }),  // Only include if provided (for migration)
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  // Update index (workspaces are stored in index directly since they're small)
  const workspaces = loadWorkspacesIndex()
  workspaces.push(workspace)
  saveWorkspacesIndex(workspaces)

  return workspace
}

// Update an existing workspace
export function updateWorkspace(
  workspaceId: string,
  updates: Partial<Pick<Workspace, 'name' | 'avatar' | 'workingDirectory' | 'systemPrompt'>>
): Workspace | undefined {
  const workspaces = loadWorkspacesIndex()
  const index = workspaces.findIndex(w => w.id === workspaceId)

  if (index === -1) return undefined

  const workspace = workspaces[index]

  if (updates.name !== undefined) {
    workspace.name = updates.name
  }
  if (updates.avatar !== undefined) {
    workspace.avatar = updates.avatar
  }
  if (updates.workingDirectory !== undefined) {
    // Expand ~ to home directory
    workspace.workingDirectory = updates.workingDirectory ? expandPath(updates.workingDirectory) : undefined
  }
  if (updates.systemPrompt !== undefined) {
    workspace.systemPrompt = updates.systemPrompt
  }

  workspace.updatedAt = Date.now()

  saveWorkspacesIndex(workspaces)

  return workspace
}

// Delete a workspace
export function deleteWorkspace(workspaceId: string): boolean {
  const workspaces = loadWorkspacesIndex()
  const index = workspaces.findIndex(w => w.id === workspaceId)

  if (index === -1) return false

  const workspace = workspaces[index]

  // Delete avatar file if it's an image
  if (workspace.avatar.type === 'image') {
    const avatarPath = workspace.avatar.value
    if (fs.existsSync(avatarPath)) {
      try {
        fs.unlinkSync(avatarPath)
      } catch (error) {
        console.error('Failed to delete avatar file:', error)
      }
    }
  }

  // Remove from index
  workspaces.splice(index, 1)
  saveWorkspacesIndex(workspaces)

  // If this was the current workspace, switch to default mode
  if (getCurrentWorkspaceId() === workspaceId) {
    setCurrentWorkspaceId(null)
  }

  return true
}

// Switch to a workspace (or default mode if null)
export function switchWorkspace(workspaceId: string | null): boolean {
  if (workspaceId !== null) {
    // Verify workspace exists
    const workspace = getWorkspace(workspaceId)
    if (!workspace) return false
  }

  setCurrentWorkspaceId(workspaceId)
  return true
}

// Upload workspace avatar image
export function uploadWorkspaceAvatar(
  workspaceId: string,
  imageData: string,
  mimeType: string
): string | null {
  // Determine file extension from mime type
  const extensionMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
  }

  const extension = extensionMap[mimeType]
  if (!extension) {
    console.error('Unsupported image type:', mimeType)
    return null
  }

  // Ensure avatars directory exists
  const avatarsDir = getWorkspaceAvatarsDir()
  if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true })
  }

  // Delete any existing avatar for this workspace
  const existingExtensions = ['png', 'jpg', 'gif', 'webp']
  for (const ext of existingExtensions) {
    const existingPath = getWorkspaceAvatarPath(workspaceId, ext)
    if (fs.existsSync(existingPath)) {
      try {
        fs.unlinkSync(existingPath)
      } catch (error) {
        console.error('Failed to delete existing avatar:', error)
      }
    }
  }

  // Save new avatar
  const avatarPath = getWorkspaceAvatarPath(workspaceId, extension)
  try {
    // Remove data URL prefix if present
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')
    fs.writeFileSync(avatarPath, buffer)
    return avatarPath
  } catch (error) {
    console.error('Failed to save avatar:', error)
    return null
  }
}

// Get current workspace ID
export { getCurrentWorkspaceId, setCurrentWorkspaceId }
