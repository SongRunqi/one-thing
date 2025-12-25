import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ChatSession } from '@/types'
import { useChatStore } from './chat'
import { useWorkspacesStore } from './workspaces'
import { useAgentsStore } from './agents'
import { useSettingsStore } from './settings'

export const useSessionsStore = defineStore('sessions', () => {
  const sessions = ref<ChatSession[]>([])
  const currentSessionId = ref<string>('')
  const isLoading = ref(false)

  const currentSession = computed(() =>
    sessions.value.find(s => s.id === currentSessionId.value)
  )

  const sessionCount = computed(() => sessions.value.length)

  // Filter sessions by current workspace
  const filteredSessions = computed(() => {
    const workspacesStore = useWorkspacesStore()
    const workspaceId = workspacesStore.currentWorkspaceId

    if (workspaceId === null) {
      // Default mode: show sessions without workspace
      return sessions.value.filter(s => !s.workspaceId)
    } else {
      // Workspace mode: show sessions for this workspace
      return sessions.value.filter(s => s.workspaceId === workspaceId)
    }
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
      // Only reuse if no specific agent is requested
      if (!agentId) {
        const existingEmptySession = filteredSessions.value.find(
          s => (s.name === 'New Chat' || s.name === '') && (!s.messages || s.messages.length === 0)
        )

        if (existingEmptySession) {
          // Switch to existing empty session instead of creating a new one
          await switchSession(existingEmptySession.id)
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

  async function switchSession(sessionId: string) {
    try {
      const response = await window.electronAPI.switchSession(sessionId)
      if (response.success && response.session) {
        const chatStore = useChatStore()
        const agentsStore = useAgentsStore()
        const settingsStore = useSettingsStore()

        currentSessionId.value = sessionId

        // Clear selected agent when switching sessions (the temporary "welcome page" state)
        agentsStore.selectAgent(null)

        // Sync model selection based on session's saved model or global defaults
        if (response.session.lastProvider && response.session.lastModel) {
          // Session has saved model - show it in UI
          settingsStore.updateAIProvider(response.session.lastProvider as any)
          settingsStore.updateModel(response.session.lastModel, response.session.lastProvider as any)
        } else {
          // Session has no saved model - reload global settings to show defaults
          await settingsStore.loadSettings()
        }

        // 1. FIRST: Set the current view session to allow new chunks to be processed
        chatStore.setCurrentViewSession(sessionId)

        // 2. Check if the target session has an active stream
        const hasActiveStream = chatStore.activeSessionStreams.has(sessionId)
        const streamingMessageId = chatStore.activeSessionStreams.get(sessionId)

        // 3. Load from backend (which has accumulated content)
        chatStore.setMessages(response.session.messages || [])

        // 4. If there's an active stream, ensure contentParts is rebuilt
        // (in case setMessages didn't fully reconstruct it)
        if (hasActiveStream && streamingMessageId) {
          chatStore.mergeBackendMessageToStreaming(
            streamingMessageId,
            response.session.messages || []
          )
        }

        return response.session
      }
    } catch (error) {
      console.error('Failed to switch session:', error)
    }
  }

  async function deleteSession(sessionId: string) {
    try {
      const response = await window.electronAPI.deleteSession(sessionId)
      if (response.success) {
        sessions.value = sessions.value.filter(s => s.id !== sessionId)
        if (currentSessionId.value === sessionId && sessions.value.length > 0) {
          await switchSession(sessions.value[0].id)
        }
      }
    } catch (error) {
      console.error('Failed to delete session:', error)
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
        // Switch to the new branch session
        await switchSession(response.session.id)
        return response.session
      }
    } catch (error) {
      console.error('Failed to create branch:', error)
    }
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

  return {
    sessions,
    currentSessionId,
    isLoading,
    currentSession,
    sessionCount,
    filteredSessions,
    filteredSessionCount,
    loadSessions,
    createSession,
    switchSession,
    deleteSession,
    renameSession,
    createBranch,
    updateSessionPin,
  }
})
