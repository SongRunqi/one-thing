/**
 * CustomAgent Store
 *
 * Frontend store for managing CustomAgents with custom tools.
 * Replaces the old Agent store as the primary agent management system.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  CustomAgent,
  CustomToolDefinition,
  CustomAgentConfig,
} from '../../shared/ipc/custom-agents.js'
import { useWorkspacesStore } from './workspaces'

export const useCustomAgentsStore = defineStore('customAgents', () => {
  // State
  const customAgents = ref<CustomAgent[]>([])
  const pinnedAgentIds = ref<string[]>([])
  const selectedAgentId = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const agentCount = computed(() => customAgents.value.length)

  const pinnedAgents = computed(() =>
    pinnedAgentIds.value
      .map(id => customAgents.value.find(a => a.id === id))
      .filter((a): a is CustomAgent => a !== undefined)
  )

  const unpinnedAgents = computed(() =>
    customAgents.value.filter(a => !pinnedAgentIds.value.includes(a.id))
  )

  // Get currently selected agent object
  const selectedAgent = computed(() =>
    selectedAgentId.value
      ? customAgents.value.find(a => a.id === selectedAgentId.value) ?? null
      : null
  )

  const userAgents = computed(() =>
    customAgents.value.filter(a => a.source === 'user')
  )

  const projectAgents = computed(() =>
    customAgents.value.filter(a => a.source === 'project')
  )

  /**
   * Get current working directory from workspace store
   */
  function getWorkingDirectory(): string | undefined {
    const workspacesStore = useWorkspacesStore()
    return workspacesStore.currentWorkspace?.workingDirectory
  }

  /**
   * Load all CustomAgents
   */
  async function loadCustomAgents() {
    isLoading.value = true
    error.value = null

    try {
      const workingDirectory = getWorkingDirectory()
      const response = await window.electronAPI.getCustomAgents(workingDirectory)

      if (response.success && response.agents) {
        customAgents.value = response.agents
        pinnedAgentIds.value = response.pinnedAgentIds || []
      } else {
        error.value = response.error || 'Failed to load custom agents'
        console.error('[CustomAgentsStore] Load error:', error.value)
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to load custom agents'
      console.error('[CustomAgentsStore] Load exception:', err)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Refresh CustomAgents (reload from backend)
   */
  async function refreshCustomAgents() {
    isLoading.value = true
    error.value = null

    try {
      const workingDirectory = getWorkingDirectory()
      const response = await window.electronAPI.refreshCustomAgents(workingDirectory)

      if (response.success && response.agents) {
        customAgents.value = response.agents
      } else {
        error.value = response.error || 'Failed to refresh custom agents'
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to refresh custom agents'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get a single CustomAgent by ID
   */
  function getAgentById(agentId: string): CustomAgent | undefined {
    return customAgents.value.find(a => a.id === agentId)
  }

  /**
   * Create a new CustomAgent
   */
  async function createCustomAgent(
    config: Omit<CustomAgentConfig, 'id' | 'createdAt' | 'updatedAt'>,
    source: 'user' | 'project' = 'user'
  ): Promise<CustomAgent | undefined> {
    try {
      const workingDirectory = getWorkingDirectory()
      const response = await window.electronAPI.createCustomAgent(
        config,
        source,
        workingDirectory
      )

      if (response.success && response.agent) {
        customAgents.value.push(response.agent)
        // Refresh async tools so CustomAgentTool picks up the new agent
        await window.electronAPI.refreshAsyncTools(workingDirectory)
        return response.agent
      } else {
        console.error('[CustomAgentsStore] Create error:', response.error)
        error.value = response.error || 'Failed to create custom agent'
      }
    } catch (err: any) {
      console.error('[CustomAgentsStore] Create exception:', err)
      error.value = err.message || 'Failed to create custom agent'
    }
    return undefined
  }

  /**
   * Update an existing CustomAgent
   */
  async function updateCustomAgent(
    agentId: string,
    updates: Partial<Omit<CustomAgentConfig, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<CustomAgent | undefined> {
    try {
      const workingDirectory = getWorkingDirectory()
      const response = await window.electronAPI.updateCustomAgent(
        agentId,
        updates,
        workingDirectory
      )

      if (response.success && response.agent) {
        const index = customAgents.value.findIndex(a => a.id === agentId)
        if (index !== -1) {
          customAgents.value[index] = response.agent
        }
        // Refresh async tools so CustomAgentTool picks up the updated agent
        await window.electronAPI.refreshAsyncTools(workingDirectory)
        return response.agent
      } else {
        console.error('[CustomAgentsStore] Update error:', response.error)
        error.value = response.error || 'Failed to update custom agent'
      }
    } catch (err: any) {
      console.error('[CustomAgentsStore] Update exception:', err)
      error.value = err.message || 'Failed to update custom agent'
    }
    return undefined
  }

  /**
   * Delete a CustomAgent
   */
  async function deleteCustomAgent(agentId: string): Promise<boolean> {
    try {
      const workingDirectory = getWorkingDirectory()
      const response = await window.electronAPI.deleteCustomAgent(
        agentId,
        workingDirectory
      )

      if (response.success) {
        customAgents.value = customAgents.value.filter(a => a.id !== agentId)
        // Refresh async tools so CustomAgentTool removes the deleted agent
        await window.electronAPI.refreshAsyncTools(workingDirectory)
        return true
      } else {
        console.error('[CustomAgentsStore] Delete error:', response.error)
        error.value = response.error || 'Failed to delete custom agent'
      }
    } catch (err: any) {
      console.error('[CustomAgentsStore] Delete exception:', err)
      error.value = err.message || 'Failed to delete custom agent'
    }
    return false
  }

  /**
   * Add a custom tool to an agent
   */
  async function addToolToAgent(
    agentId: string,
    tool: CustomToolDefinition
  ): Promise<boolean> {
    const agent = getAgentById(agentId)
    if (!agent) return false

    const newTools = [...agent.customTools, tool]
    const updated = await updateCustomAgent(agentId, { customTools: newTools })
    return !!updated
  }

  /**
   * Update a custom tool in an agent
   */
  async function updateToolInAgent(
    agentId: string,
    toolId: string,
    updates: Partial<CustomToolDefinition>
  ): Promise<boolean> {
    const agent = getAgentById(agentId)
    if (!agent) return false

    const newTools = agent.customTools.map(t =>
      t.id === toolId ? { ...t, ...updates } : t
    )
    const updated = await updateCustomAgent(agentId, { customTools: newTools })
    return !!updated
  }

  /**
   * Delete a custom tool from an agent
   */
  async function deleteToolFromAgent(
    agentId: string,
    toolId: string
  ): Promise<boolean> {
    const agent = getAgentById(agentId)
    if (!agent) return false

    const newTools = agent.customTools.filter(t => t.id !== toolId)
    const updated = await updateCustomAgent(agentId, { customTools: newTools })
    return !!updated
  }

  /**
   * Open the custom agents directory in file explorer
   */
  async function openAgentsDirectory(): Promise<boolean> {
    try {
      const response = await window.electronAPI.openCustomAgentsDirectory()
      return response.success
    } catch (err) {
      console.error('[CustomAgentsStore] Open directory error:', err)
      return false
    }
  }

  /**
   * Clear error state
   */
  function clearError() {
    error.value = null
  }

  /**
   * Select an agent (for UI display)
   */
  function selectAgent(agentId: string | null) {
    selectedAgentId.value = agentId
  }

  /**
   * Pin an agent to sidebar
   */
  async function pinAgent(agentId: string): Promise<boolean> {
    try {
      const response = await window.electronAPI.pinCustomAgent(agentId)
      if (response.success && response.pinnedAgentIds) {
        pinnedAgentIds.value = response.pinnedAgentIds
        return true
      }
    } catch (err) {
      console.error('[CustomAgentsStore] Pin error:', err)
    }
    return false
  }

  /**
   * Unpin an agent from sidebar
   */
  async function unpinAgent(agentId: string): Promise<boolean> {
    try {
      const response = await window.electronAPI.unpinCustomAgent(agentId)
      if (response.success && response.pinnedAgentIds) {
        pinnedAgentIds.value = response.pinnedAgentIds
        return true
      }
    } catch (err) {
      console.error('[CustomAgentsStore] Unpin error:', err)
    }
    return false
  }

  /**
   * Toggle pin state of an agent
   */
  async function togglePinAgent(agentId: string): Promise<boolean> {
    if (pinnedAgentIds.value.includes(agentId)) {
      return unpinAgent(agentId)
    } else {
      return pinAgent(agentId)
    }
  }

  return {
    // State
    customAgents,
    pinnedAgentIds,
    selectedAgentId,
    isLoading,
    error,

    // Computed
    agentCount,
    pinnedAgents,
    unpinnedAgents,
    selectedAgent,
    userAgents,
    projectAgents,

    // Actions
    loadCustomAgents,
    refreshCustomAgents,
    getAgentById,
    createCustomAgent,
    updateCustomAgent,
    deleteCustomAgent,
    addToolToAgent,
    updateToolInAgent,
    deleteToolFromAgent,
    openAgentsDirectory,
    clearError,
    selectAgent,
    pinAgent,
    unpinAgent,
    togglePinAgent,
  }
})
