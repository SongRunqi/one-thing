import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type { Agent, AgentAvatar, AgentVoice } from '@/types'

export const useAgentsStore = defineStore('agents', () => {
  const agents = ref<Agent[]>([])
  const pinnedAgentIds = ref<string[]>([])
  const selectedAgentId = ref<string | null>(null)
  const isLoading = ref(false)

  // Computed properties
  const selectedAgent = computed(() =>
    selectedAgentId.value
      ? agents.value.find(a => a.id === selectedAgentId.value)
      : null
  )

  const pinnedAgents = computed(() =>
    pinnedAgentIds.value
      .map(id => agents.value.find(a => a.id === id))
      .filter((a): a is Agent => a !== undefined)
  )

  const unpinnedAgents = computed(() =>
    agents.value.filter(a => !pinnedAgentIds.value.includes(a.id))
  )

  const agentCount = computed(() => agents.value.length)

  // Get agent by ID
  function getAgentById(agentId: string): Agent | undefined {
    return agents.value.find(a => a.id === agentId)
  }

  // Load all agents
  async function loadAgents() {
    isLoading.value = true
    try {
      const response = await window.electronAPI.getAgents()
      if (response.success) {
        agents.value = response.agents || []
        pinnedAgentIds.value = response.pinnedAgentIds || []
      }
    } catch (error) {
      console.error('Failed to load agents:', error)
    } finally {
      isLoading.value = false
    }
  }

  // Create a new agent
  async function createAgent(
    name: string,
    avatar: AgentAvatar,
    systemPrompt: string,
    options?: {
      tagline?: string
      personality?: string[]
      primaryColor?: string
      voice?: AgentVoice
    }
  ): Promise<Agent | undefined> {
    try {
      // Convert reactive proxy to plain object for IPC serialization
      const plainAvatar = toRaw(avatar)
      const response = await window.electronAPI.createAgent(name, plainAvatar, systemPrompt, options)
      if (response.success && response.agent) {
        agents.value.push(response.agent)
        return response.agent
      } else {
        console.error('[AgentsStore] createAgent failed:', response.error)
      }
    } catch (error) {
      console.error('Failed to create agent:', error)
    }
  }

  // Update an existing agent
  async function updateAgent(
    id: string,
    updates: {
      name?: string
      avatar?: AgentAvatar
      systemPrompt?: string
      tagline?: string
      personality?: string[]
      primaryColor?: string
      voice?: AgentVoice
    }
  ): Promise<boolean> {
    try {
      // Convert reactive proxy to plain object for IPC serialization
      const plainUpdates = {
        ...updates,
        avatar: updates.avatar ? toRaw(updates.avatar) : undefined
      }
      const response = await window.electronAPI.updateAgent(id, plainUpdates)
      if (response.success && response.agent) {
        const index = agents.value.findIndex(a => a.id === id)
        if (index !== -1) {
          agents.value[index] = response.agent
        }
        return true
      }
    } catch (error) {
      console.error('Failed to update agent:', error)
    }
    return false
  }

  // Delete an agent
  async function deleteAgent(agentId: string): Promise<boolean> {
    try {
      const response = await window.electronAPI.deleteAgent(agentId)
      if (response.success) {
        agents.value = agents.value.filter(a => a.id !== agentId)
        // Also remove from pinned if present
        pinnedAgentIds.value = pinnedAgentIds.value.filter(id => id !== agentId)
        return true
      }
    } catch (error) {
      console.error('Failed to delete agent:', error)
    }
    return false
  }

  // Pin an agent to sidebar
  async function pinAgent(agentId: string): Promise<boolean> {
    try {
      const response = await window.electronAPI.pinAgent(agentId)
      if (response.success && response.pinnedAgentIds) {
        pinnedAgentIds.value = response.pinnedAgentIds
        return true
      }
    } catch (error) {
      console.error('Failed to pin agent:', error)
    }
    return false
  }

  // Unpin an agent from sidebar
  async function unpinAgent(agentId: string): Promise<boolean> {
    try {
      const response = await window.electronAPI.unpinAgent(agentId)
      if (response.success && response.pinnedAgentIds) {
        pinnedAgentIds.value = response.pinnedAgentIds
        return true
      }
    } catch (error) {
      console.error('Failed to unpin agent:', error)
    }
    return false
  }

  // Toggle agent pin status
  async function togglePinAgent(agentId: string): Promise<boolean> {
    if (pinnedAgentIds.value.includes(agentId)) {
      return unpinAgent(agentId)
    } else {
      return pinAgent(agentId)
    }
  }

  // Select an agent (enter agent mode)
  function selectAgent(agentId: string | null) {
    selectedAgentId.value = agentId
  }

  // Upload agent avatar image
  async function uploadAvatar(
    agentId: string,
    imageData: string,
    mimeType: string
  ): Promise<string | null> {
    try {
      const response = await window.electronAPI.uploadAgentAvatar(agentId, imageData, mimeType)
      if (response.success && response.avatarPath) {
        // Update local agent avatar
        const agent = agents.value.find(a => a.id === agentId)
        if (agent) {
          agent.avatar = { type: 'image', value: response.avatarPath }
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
    agents,
    pinnedAgentIds,
    selectedAgentId,
    isLoading,
    // Computed
    selectedAgent,
    pinnedAgents,
    unpinnedAgents,
    agentCount,
    // Actions
    getAgentById,
    loadAgents,
    createAgent,
    updateAgent,
    deleteAgent,
    pinAgent,
    unpinAgent,
    togglePinAgent,
    selectAgent,
    uploadAvatar,
  }
})
