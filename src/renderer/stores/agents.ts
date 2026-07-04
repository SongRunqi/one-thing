import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AgentDefinition } from '@/types'
import { platformApi } from '@/platform'

export const DEFAULT_AGENT_ID = 'default'

export const useAgentsStore = defineStore('agents', () => {
  const agents = ref<AgentDefinition[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const hasLoaded = ref(false)
  let activeLoad: Promise<AgentDefinition[]> | null = null

  const defaultAgent = computed(() =>
    agents.value.find(agent => agent.id === DEFAULT_AGENT_ID) || agents.value[0] || null
  )

  function getAgent(agentId?: string | null): AgentDefinition | null {
    return agents.value.find(agent => agent.id === agentId) || defaultAgent.value
  }

  async function loadAgents(options: { force?: boolean } = {}): Promise<AgentDefinition[]> {
    if (!options.force && hasLoaded.value) return agents.value
    if (!options.force && activeLoad) return activeLoad

    isLoading.value = true
    error.value = null
    const load = (async () => {
      const response = await platformApi.listAgents()
      if (!response.success || !response.agents) {
        throw new Error(response.error || 'Failed to load agents')
      }
      agents.value = response.agents
      hasLoaded.value = true
      return agents.value
    })()
    activeLoad = load

    try {
      return await load
    } catch (err: any) {
      error.value = err?.message || 'Failed to load agents'
      throw err
    } finally {
      if (activeLoad === load) {
        activeLoad = null
        isLoading.value = false
      }
    }
  }

  async function createAgent(name: string, systemPrompt = ''): Promise<AgentDefinition> {
    const response = await platformApi.createAgent(name, systemPrompt)
    if (!response.success || !response.agent) {
      throw new Error(response.error || 'Failed to create agent')
    }
    agents.value = [...agents.value, response.agent]
    hasLoaded.value = true
    return response.agent
  }

  async function updateAgent(agentId: string, updates: { name?: string; systemPrompt?: string }): Promise<AgentDefinition> {
    const response = await platformApi.updateAgent(agentId, updates)
    if (!response.success || !response.agent) {
      throw new Error(response.error || 'Failed to update agent')
    }
    agents.value = agents.value.map(agent => agent.id === agentId ? response.agent! : agent)
    hasLoaded.value = true
    return response.agent
  }

  async function deleteAgent(agentId: string): Promise<void> {
    const response = await platformApi.deleteAgent(agentId)
    if (!response.success) {
      throw new Error(response.error || 'Failed to delete agent')
    }
    agents.value = agents.value.filter(agent => agent.id !== agentId)
    hasLoaded.value = true
  }

  return {
    agents,
    isLoading,
    error,
    hasLoaded,
    defaultAgent,
    getAgent,
    loadAgents,
    createAgent,
    updateAgent,
    deleteAgent,
  }
})
