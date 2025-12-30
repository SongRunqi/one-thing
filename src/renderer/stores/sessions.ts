import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ChatSession } from '@/types'
import { useChatStore } from './chat'
import { useWorkspacesStore } from './workspaces'
import { useSettingsStore } from './settings'

export const useSessionsStore = defineStore('sessions', () => {
  const sessions = ref<ChatSession[]>([])
  const currentSessionId = ref<string>('')
  const isLoading = ref(false)

  const currentSession = computed(() =>
    sessions.value.find(s => s.id === currentSessionId.value)
  )

  const sessionCount = computed(() => sessions.value.length)

  // Filter sessions by current workspace (excluding archived), sorted by createdAt desc (stable order)
  const filteredSessions = computed(() => {
    const workspacesStore = useWorkspacesStore()
    const workspaceId = workspacesStore.currentWorkspaceId

    let filtered: ChatSession[]
    if (workspaceId === null) {
      // Default mode: show sessions without workspace (exclude archived)
      filtered = sessions.value.filter(s => !s.workspaceId && !s.isArchived)
    } else {
      // Workspace mode: show sessions for this workspace (exclude archived)
      filtered = sessions.value.filter(s => s.workspaceId === workspaceId && !s.isArchived)
    }

    // Only group by pinned, keep array order (new sessions are unshifted to top)
    const pinned = filtered.filter(s => s.isPinned)
    const unpinned = filtered.filter(s => !s.isPinned)
    return [...pinned, ...unpinned]
  })

  // Get all archived sessions
  const archivedSessions = computed(() => {
    return sessions.value
      .filter(s => s.isArchived)
      .sort((a, b) => (b.archivedAt || b.updatedAt) - (a.archivedAt || a.updatedAt))
  })

  const filteredSessionCount = computed(() => filteredSessions.value.length)

  async function loadSessions() {
    isLoading.value = true
    try {
      const response = await window.electronAPI.getSessions()
      if (response.success) {
        sessions.value = response.sessions || []
        // Always start with a new chat on app open
        if (!currentSessionId.value) {
          await createSession('New Chat')
        }
      }
    } finally {
      isLoading.value = false
    }
  }

  async function createSession(name: string, agentId?: string) {
    try {
      const workspacesStore = useWorkspacesStore()
      const workspaceId = workspacesStore.currentWorkspaceId

      // Check if there's already an empty "New Chat" session in the current workspace (no messages)
      // Only reuse if no specific agent is requested, and only top-level sessions (not branches)
      if (!agentId) {
        const existingEmptySession = filteredSessions.value.find(
          s => (s.name === 'New Chat' || s.name === '') && (!s.messages || s.messages.length === 0) && !s.parentSessionId
        )

        if (existingEmptySession) {
          // Switch to existing empty session instead of creating a new one
          await switchSession(existingEmptySession.id)
          // Update timestamp AFTER switchSession so it won't be overwritten by backend data
          existingEmptySession.updatedAt = Date.now()
          // Trigger reactivity for the sort to update
          sessions.value = [...sessions.value]
          return existingEmptySession
        }
      }

      const response = await window.electronAPI.createSession(name, workspaceId || undefined, agentId)
      if (response.success && response.session) {
        sessions.value.unshift(response.session)
        await switchSession(response.session.id)
        return response.session
      }
    } catch (error) {
      console.error('Failed to create session:', error)
    }
  }

  /**
   * Create a new session without switching to it
   * Used for split view where we want to create a new chat in a split panel
   */
  async function createSessionWithoutSwitch(name: string, agentId?: string) {
    try {
      const workspacesStore = useWorkspacesStore()
      const workspaceId = workspacesStore.currentWorkspaceId

      const response = await window.electronAPI.createSession(name, workspaceId || undefined, agentId)
      if (response.success && response.session) {
        sessions.value.unshift(response.session)
        return response.session
      }
    } catch (error) {
      console.error('Failed to create session:', error)
    }
  }

  async function switchSession(sessionId: string) {
    try {
      const response = await window.electronAPI.switchSession(sessionId)
      if (response.success && response.session) {
        const chatStore = useChatStore()
        const settingsStore = useSettingsStore()

        currentSessionId.value = sessionId

        // Update local session data with latest from backend
        // This ensures workingDirectory and other fields are in sync
        const localSession = sessions.value.find(s => s.id === sessionId)
        if (localSession) {
          Object.assign(localSession, response.session)
        }

        // Sync model selection if session has a saved model
        if (response.session.lastProvider && response.session.lastModel) {
          // Session has saved model - show it in UI
          settingsStore.updateAIProvider(response.session.lastProvider as any)
          settingsStore.updateModel(response.session.lastModel, response.session.lastProvider as any)
        }
        // If session has no saved model, keep using current global settings
        // (already loaded at app startup, no need to reload)

        // Load messages for this session from backend
        // The chat store now manages per-session state in Maps
        // If the session already has messages loaded (e.g., from streaming),
        // we merge with backend data to get the latest state
        await chatStore.loadMessages(sessionId)

        // Also load usage data for this session
        await chatStore.loadSessionUsage(sessionId)

        return response.session
      }
    } catch (error) {
      console.error('Failed to switch session:', error)
    }
  }

  async function deleteSession(sessionId: string) {
    const session = sessions.value.find(s => s.id === sessionId)

    // If session has no messages, permanently delete instead of archiving
    if (!session || !session.messages || session.messages.length === 0) {
      // Check if this is the only session - if so, close the window
      const activeSessions = filteredSessions.value
      if (activeSessions.length === 1 && activeSessions[0].id === sessionId) {
        // Only one empty session left, close the window
        window.close()
        return
      }

      await permanentlyDeleteSession(sessionId)
      // Switch to another session if needed
      if (currentSessionId.value === sessionId) {
        const remaining = filteredSessions.value
        if (remaining.length > 0) {
          await switchSession(remaining[0].id)
        } else {
          await createSession('New Chat')
        }
      }
      return
    }

    // Archive the session (soft delete) if it has messages
    await archiveSession(sessionId)
  }

  async function archiveSession(sessionId: string) {
    try {
      const session = sessions.value.find(s => s.id === sessionId)
      if (!session) return

      const archivedAt = Date.now()

      // Collect all child sessions (branches) recursively
      function collectChildSessionIds(parentId: string): string[] {
        const children = sessions.value.filter(s => s.parentSessionId === parentId)
        let ids: string[] = []
        for (const child of children) {
          ids.push(child.id)
          ids = ids.concat(collectChildSessionIds(child.id))
        }
        return ids
      }

      const childIds = collectChildSessionIds(sessionId)
      const allIdsToArchive = [sessionId, ...childIds]

      // Mark all sessions as archived
      for (const id of allIdsToArchive) {
        const s = sessions.value.find(ses => ses.id === id)
        if (s) {
          s.isArchived = true
          s.archivedAt = archivedAt
          await window.electronAPI.updateSessionArchived(id, true, archivedAt)
        }
      }

      // Switch to another session if current was archived
      if (allIdsToArchive.includes(currentSessionId.value)) {
        const activeSessions = filteredSessions.value
        if (activeSessions.length > 0) {
          await switchSession(activeSessions[0].id)
        } else {
          // Create a new session if no active sessions left
          await createSession('New Chat')
        }
      }
    } catch (error) {
      console.error('Failed to archive session:', error)
    }
  }

  async function restoreSession(sessionId: string) {
    try {
      const session = sessions.value.find(s => s.id === sessionId)
      if (!session) return

      // Collect all child sessions (branches) recursively
      function collectChildSessionIds(parentId: string): string[] {
        const children = sessions.value.filter(s => s.parentSessionId === parentId)
        let ids: string[] = []
        for (const child of children) {
          ids.push(child.id)
          ids = ids.concat(collectChildSessionIds(child.id))
        }
        return ids
      }

      const childIds = collectChildSessionIds(sessionId)
      const allIdsToRestore = [sessionId, ...childIds]

      // Unarchive all sessions
      for (const id of allIdsToRestore) {
        const s = sessions.value.find(ses => ses.id === id)
        if (s) {
          s.isArchived = false
          s.archivedAt = undefined
          await window.electronAPI.updateSessionArchived(id, false, null)
        }
      }
    } catch (error) {
      console.error('Failed to restore session:', error)
    }
  }

  async function permanentlyDeleteSession(sessionId: string) {
    try {
      // Collect all child sessions before delete (backend cascade deletes them)
      function collectChildSessionIds(parentId: string): string[] {
        const children = sessions.value.filter(s => s.parentSessionId === parentId)
        let ids: string[] = []
        for (const child of children) {
          ids.push(child.id)
          ids = ids.concat(collectChildSessionIds(child.id))
        }
        return ids
      }

      const childIds = collectChildSessionIds(sessionId)
      const allIdsToDelete = [sessionId, ...childIds]

      const response = await window.electronAPI.deleteSession(sessionId)
      if (response.success) {
        // Remove all deleted sessions from local state
        sessions.value = sessions.value.filter(s => !allIdsToDelete.includes(s.id))
      }
    } catch (error) {
      console.error('Failed to permanently delete session:', error)
    }
  }

  async function renameSession(sessionId: string, newName: string) {
    try {
      const response = await window.electronAPI.renameSession(sessionId, newName)
      if (response.success) {
        const session = sessions.value.find(s => s.id === sessionId)
        if (session) {
          session.name = newName
        }
      }
    } catch (error) {
      console.error('Failed to rename session:', error)
    }
  }

  async function createBranch(parentSessionId: string, branchFromMessageId: string) {
    try {
      const response = await window.electronAPI.createBranch(parentSessionId, branchFromMessageId)
      if (response.success && response.session) {
        // Add the new branch session to the list
        sessions.value.unshift(response.session)
        // Return the session - caller decides whether to switch or split
        return response.session
      }
    } catch (error) {
      console.error('Failed to create branch:', error)
    }
    return null
  }

  async function updateSessionPin(sessionId: string, isPinned: boolean) {
    try {
      const response = await window.electronAPI.updateSessionPin(sessionId, isPinned)
      if (response.success) {
        const session = sessions.value.find(s => s.id === sessionId)
        if (session) {
          session.isPinned = isPinned
        }
      }
    } catch (error) {
      console.error('Failed to update session pin:', error)
    }
  }

  async function updateSessionWorkingDirectory(sessionId: string, workingDirectory: string | null) {
    try {
      const response = await window.electronAPI.updateSessionWorkingDirectory(sessionId, workingDirectory)
      if (response.success) {
        const session = sessions.value.find(s => s.id === sessionId)
        if (session) {
          if (workingDirectory === null || workingDirectory === '') {
            delete session.workingDirectory
          } else {
            session.workingDirectory = workingDirectory
          }
        }
      }
    } catch (error) {
      console.error('Failed to update session working directory:', error)
    }
  }

  return {
    sessions,
    currentSessionId,
    isLoading,
    currentSession,
    sessionCount,
    filteredSessions,
    filteredSessionCount,
    archivedSessions,
    loadSessions,
    createSession,
    createSessionWithoutSwitch,
    switchSession,
    deleteSession,
    archiveSession,
    restoreSession,
    permanentlyDeleteSession,
    renameSession,
    createBranch,
    updateSessionPin,
    updateSessionWorkingDirectory,
  }
})
