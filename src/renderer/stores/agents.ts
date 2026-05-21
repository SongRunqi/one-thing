import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AgentDefinition } from '@/types'

export const DEFAULT_AGENT_ID = 'default'

export const useAgentsStore = defineStore('agents', () => {
  const agents = ref<AgentDefinition[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const defaultAgent = computed(() =>
    agents.value.find(agent => agent.id === DEFAULT_AGENT_ID) || agents.value[0] || null
  )

  function getAgent(agentId?: string | null): AgentDefinition | null {
    return agents.value.find(agent => agent.id === agentId) || defaultAgent.value
  }

  async function loadAgents(): Promise<AgentDefinition[]> {
    isLoading.value = true
    error.value = null
    try {
      const response = await window.electronAPI.listAgents()
      if (!response.success || !response.agents) {
        throw new Error(response.error || 'Failed to load agents')
      }
      agents.value = response.agents
      return agents.value
    } catch (err: any) {
      error.value = err?.message || 'Failed to load agents'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function createAgent(name: string, systemPrompt = ''): Promise<AgentDefinition> {
    const response = await window.electronAPI.createAgent(name, systemPrompt)
    if (!response.success || !response.agent) {
      throw new Error(response.error || 'Failed to create agent')
    }
    agents.value = [...agents.value, response.agent]
    return response.agent
  }

  async function updateAgent(agentId: string, updates: { name?: string; systemPrompt?: string }): Promise<AgentDefinition> {
    const response = await window.electronAPI.updateAgent(agentId, updates)
    if (!response.success || !response.agent) {
      throw new Error(response.error || 'Failed to update agent')
    }
    agents.value = agents.value.map(agent => agent.id === agentId ? response.agent! : agent)
    return response.agent
  }

  async function deleteAgent(agentId: string): Promise<void> {
    const response = await window.electronAPI.deleteAgent(agentId)
    if (!response.success) {
      throw new Error(response.error || 'Failed to delete agent')
    }
    agents.value = agents.value.filter(agent => agent.id !== agentId)
  }

  return {
    agents,
    isLoading,
    error,
    defaultAgent,
    getAgent,
    loadAgents,
    createAgent,
    updateAgent,
    deleteAgent,
  }
})
