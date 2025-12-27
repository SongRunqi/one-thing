import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type { Workspace, WorkspaceAvatar } from '@/types'

export const useWorkspacesStore = defineStore('workspaces', () => {
  const workspaces = ref<Workspace[]>([])
  const currentWorkspaceId = ref<string | null>(null)
  const isLoading = ref(false)

  // Computed properties
  const currentWorkspace = computed(() =>
    currentWorkspaceId.value
      ? workspaces.value.find(w => w.id === currentWorkspaceId.value)
      : null
  )

  const isDefaultMode = computed(() => currentWorkspaceId.value === null)

  const workspaceCount = computed(() => workspaces.value.length)

  // Load all workspaces
  async function loadWorkspaces() {
    isLoading.value = true
    try {
      const response = await window.electronAPI.getWorkspaces()
      if (response.success) {
        workspaces.value = response.workspaces || []
        currentWorkspaceId.value = response.currentWorkspaceId ?? null
      }
    } catch (error) {
      console.error('Failed to load workspaces:', error)
    } finally {
      isLoading.value = false
    }
  }

  // Create a new workspace
  async function createWorkspace(
    name: string,
    avatar: WorkspaceAvatar,
    systemPrompt: string,
    workingDirectory?: string
  ): Promise<Workspace | undefined> {
    try {
      // Use toRaw to convert reactive proxy to plain object for IPC
      const plainAvatar = toRaw(avatar)
      const response = await window.electronAPI.createWorkspace(name, plainAvatar, workingDirectory, systemPrompt)
      if (response.success && response.workspace) {
        workspaces.value.push(response.workspace)
        return response.workspace
      }
    } catch (error) {
      console.error('Failed to create workspace:', error)
    }
  }

  // Update an existing workspace
  async function updateWorkspace(
    id: string,
    updates: { name?: string; avatar?: WorkspaceAvatar; workingDirectory?: string; systemPrompt?: string }
  ): Promise<boolean> {
    try {
      // Use toRaw to convert reactive proxy to plain object for IPC
      const plainUpdates = {
        ...updates,
        avatar: updates.avatar ? toRaw(updates.avatar) : undefined,
      }
      const response = await window.electronAPI.updateWorkspace(id, plainUpdates)
      if (response.success && response.workspace) {
        const index = workspaces.value.findIndex(w => w.id === id)
        if (index !== -1) {
          workspaces.value[index] = response.workspace
        }
        return true
      }
    } catch (error) {
      console.error('Failed to update workspace:', error)
    }
    return false
  }

  // Delete a workspace
  async function deleteWorkspace(workspaceId: string): Promise<boolean> {
    try {
      const response = await window.electronAPI.deleteWorkspace(workspaceId)
      if (response.success) {
        workspaces.value = workspaces.value.filter(w => w.id !== workspaceId)
        // If current workspace was deleted, switch to default mode
        if (currentWorkspaceId.value === workspaceId) {
          currentWorkspaceId.value = null
        }
        return true
      }
    } catch (error) {
      console.error('Failed to delete workspace:', error)
    }
    return false
  }

  // Switch to a workspace (or default mode if null)
  async function switchWorkspace(workspaceId: string | null): Promise<boolean> {
    try {
      const response = await window.electronAPI.switchWorkspace(workspaceId)
      if (response.success) {
        currentWorkspaceId.value = workspaceId
        return true
      }
    } catch (error) {
      console.error('Failed to switch workspace:', error)
    }
    return false
  }

  // Upload workspace avatar image
  async function uploadAvatar(
    workspaceId: string,
    imageData: string,
    mimeType: string
  ): Promise<string | null> {
    try {
      const response = await window.electronAPI.uploadWorkspaceAvatar(workspaceId, imageData, mimeType)
      if (response.success && response.avatarPath) {
        // Update local workspace avatar
        const workspace = workspaces.value.find(w => w.id === workspaceId)
        if (workspace) {
          workspace.avatar = { type: 'image', value: response.avatarPath }
        }
        return response.avatarPath
      }
    } catch (error) {
      console.error('Failed to upload avatar:', error)
    }
    return null
  }

  return {
    // State
    workspaces,
    currentWorkspaceId,
    isLoading,
    // Computed
    currentWorkspace,
    isDefaultMode,
    workspaceCount,
    // Actions
    loadWorkspaces,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    switchWorkspace,
    uploadAvatar,
  }
})
