import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  AgentMemory,
  AgentMemoryCategory,
  AgentUserRelationship,
  AgentMood,
} from '@/types'

export const useAgentMemoryStore = defineStore('agentMemory', () => {
  // Current agent's relationship data (loaded when switching to an agent)
  const currentRelationship = ref<AgentUserRelationship | null>(null)
  const isLoading = ref(false)

  // Computed properties
  const memories = computed(() => currentRelationship.value?.observations || [])

  const activeMemories = computed(() =>
    memories.value
      .filter(m => m.strength > 10)
      .sort((a, b) => b.strength - a.strength)
  )

  const relationshipStatus = computed(() => currentRelationship.value?.relationship)

  const agentMood = computed(() => currentRelationship.value?.agentFeelings.currentMood)

  const moodNotes = computed(() => currentRelationship.value?.agentFeelings.notes)

  // 格式化记忆为可读文本（用于 system prompt 注入）
  const formattedMemories = computed(() => {
    if (!currentRelationship.value || memories.value.length === 0) {
      return null
    }

    const sections: string[] = []
    const rel = currentRelationship.value.relationship

    // Relationship context
    sections.push(`## 与用户的关系
- 信任度: ${rel.trustLevel}/100
- 熟悉度: ${rel.familiarity}/100
- 总互动次数: ${rel.totalInteractions}`)

    // Current mood
    const moodMap: Record<AgentMood, string> = {
      happy: '开心',
      neutral: '平静',
      concerned: '担忧',
      excited: '兴奋',
    }
    const mood = currentRelationship.value.agentFeelings
    sections.push(`## 当前状态
- 心情: ${moodMap[mood.currentMood]}${mood.notes ? `\n- 备注: ${mood.notes}` : ''}`)

    // Active memories (top 5)
    const topMemories = activeMemories.value.slice(0, 5)
    if (topMemories.length > 0) {
      const memoryLines = topMemories.map(m => {
        const vividnessEmoji = {
          vivid: '🌟',
          clear: '💭',
          hazy: '🌫️',
          fragment: '❓',
        }[m.vividness]
        return `- ${vividnessEmoji} ${m.content}`
      })
      sections.push(`## 关于用户的记忆\n${memoryLines.join('\n')}`)
    }

    return sections.join('\n\n')
  })

  // Load relationship for an agent
  async function loadRelationship(agentId: string) {
    isLoading.value = true
    try {
      const response = await window.electronAPI.getAgentRelationship(agentId)
      if (response.success) {
        currentRelationship.value = response.relationship || null
      }
    } catch (error) {
      console.error('Failed to load agent relationship:', error)
    } finally {
      isLoading.value = false
    }
  }

  // Clear current relationship (when switching away from agent)
  function clearRelationship() {
    currentRelationship.value = null
  }

  // Add a memory
  async function addMemory(
    agentId: string,
    content: string,
    category: AgentMemoryCategory,
    emotionalWeight?: number
  ): Promise<AgentMemory | undefined> {
    try {
      const response = await window.electronAPI.addAgentMemory(
        agentId,
        content,
        category,
        emotionalWeight
      )
      if (response.success && response.memory) {
        // Update local state if this is the current agent
        if (currentRelationship.value?.agentId === agentId) {
          currentRelationship.value.observations.push(response.memory)
        }
        return response.memory
      }
    } catch (error) {
      console.error('Failed to add memory:', error)
    }
  }

  // Delete a memory
  async function deleteMemory(memoryId: string): Promise<boolean> {
    try {
      const response = await window.electronAPI.deleteAgentMemory(memoryId)
      if (response.success && currentRelationship.value) {
        // Remove from local state
        currentRelationship.value.observations = currentRelationship.value.observations.filter(
          m => m.id !== memoryId
        )
        return true
      }
    } catch (error) {
      console.error('Failed to delete memory:', error)
    }
    return false
  }

  // Recall (strengthen) a memory
  async function recallMemory(agentId: string, memoryId: string): Promise<boolean> {
    try {
      const response = await window.electronAPI.recallAgentMemory(agentId, memoryId)
      if (response.success && response.memory && currentRelationship.value?.agentId === agentId) {
        // Update local memory
        const index = currentRelationship.value.observations.findIndex(m => m.id === memoryId)
        if (index !== -1) {
          currentRelationship.value.observations[index] = response.memory
        }
        return true
      }
    } catch (error) {
      console.error('Failed to recall memory:', error)
    }
    return false
  }

  // Record an interaction (called after each message)
  async function recordInteraction(agentId: string): Promise<boolean> {
    try {
      const response = await window.electronAPI.recordAgentInteraction(agentId)
      if (response.success && response.relationship) {
        if (currentRelationship.value?.agentId === agentId) {
          currentRelationship.value = response.relationship
        }
        return true
      }
    } catch (error) {
      console.error('Failed to record interaction:', error)
    }
    return false
  }

  // Update relationship
  async function updateRelationship(
    agentId: string,
    updates: {
      trustLevel?: number
      familiarity?: number
      mood?: AgentMood
      moodNotes?: string
    }
  ): Promise<boolean> {
    try {
      const response = await window.electronAPI.updateAgentRelationship(agentId, updates)
      if (response.success && response.relationship) {
        if (currentRelationship.value?.agentId === agentId) {
          currentRelationship.value = response.relationship
        }
        return true
      }
    } catch (error) {
      console.error('Failed to update relationship:', error)
    }
    return false
  }

  return {
    // State
    currentRelationship,
    isLoading,
    // Computed
    memories,
    activeMemories,
    relationshipStatus,
    agentMood,
    moodNotes,
    formattedMemories,
    // Actions
    loadRelationship,
    clearRelationship,
    addMemory,
    deleteMemory,
    recallMemory,
    recordInteraction,
    updateRelationship,
  }
})
