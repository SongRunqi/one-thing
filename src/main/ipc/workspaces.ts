import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import * as workspacesStore from '../stores/workspaces.js'
import { getSessions, deleteSessionsByWorkspace } from '../stores/sessions.js'

export function registerWorkspaceHandlers() {
  // Get all workspaces
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET_ALL, async () => {
    const workspaces = workspacesStore.getWorkspaces()
    const currentWorkspaceId = workspacesStore.getCurrentWorkspaceId()
    return { success: true, workspaces, currentWorkspaceId }
  })

  // Create new workspace
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_CREATE, async (_event, { name, avatar, workingDirectory, systemPrompt }) => {
    try {
      const workspaceId = uuidv4()
      const workspace = workspacesStore.createWorkspace(workspaceId, name, avatar, workingDirectory, systemPrompt)
      return { success: true, workspace }
    } catch (error: any) {
      console.error('Error creating workspace:', error)
      return { success: false, error: error.message || 'Failed to create workspace' }
    }
  })

  // Update workspace
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_UPDATE, async (_event, { id, name, avatar, workingDirectory, systemPrompt }) => {
    try {
      const workspace = workspacesStore.updateWorkspace(id, { name, avatar, workingDirectory, systemPrompt })
      if (!workspace) {
        return { success: false, error: 'Workspace not found' }
      }
      return { success: true, workspace }
    } catch (error: any) {
      console.error('Error updating workspace:', error)
      return { success: false, error: error.message || 'Failed to update workspace' }
    }
  })

  // Delete workspace
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_DELETE, async (_event, { workspaceId }) => {
    try {
      // Delete all sessions associated with this workspace
      const deletedSessionCount = deleteSessionsByWorkspace(workspaceId)

      // Delete the workspace
      const success = workspacesStore.deleteWorkspace(workspaceId)
      if (!success) {
        return { success: false, error: 'Workspace not found' }
      }

      return { success: true, deletedSessionCount }
    } catch (error: any) {
      console.error('Error deleting workspace:', error)
      return { success: false, error: error.message || 'Failed to delete workspace' }
    }
  })

  // Switch workspace
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_SWITCH, async (_event, { workspaceId }) => {
    try {
      const success = workspacesStore.switchWorkspace(workspaceId)
      if (!success && workspaceId !== null) {
        return { success: false, error: 'Workspace not found' }
      }
      return { success: true }
    } catch (error: any) {
      console.error('Error switching workspace:', error)
      return { success: false, error: error.message || 'Failed to switch workspace' }
    }
  })

  // Upload workspace avatar
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_UPLOAD_AVATAR, async (_event, { workspaceId, imageData, mimeType }) => {
    try {
      const avatarPath = workspacesStore.uploadWorkspaceAvatar(workspaceId, imageData, mimeType)
      if (!avatarPath) {
        return { success: false, error: 'Failed to upload avatar' }
      }
      return { success: true, avatarPath }
    } catch (error: any) {
      console.error('Error uploading avatar:', error)
      return { success: false, error: error.message || 'Failed to upload avatar' }
    }
  })
}
