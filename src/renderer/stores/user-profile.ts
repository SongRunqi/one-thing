import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserProfile, UserFact, UserFactCategory } from '@/types'

export const useUserProfileStore = defineStore('userProfile', () => {
  const profile = ref<UserProfile | null>(null)
  const isLoading = ref(false)

  // Computed properties
  const facts = computed(() => profile.value?.facts || [])

  const factsByCategory = computed(() => {
    const grouped: Record<UserFactCategory, UserFact[]> = {
      personal: [],
      preference: [],
      goal: [],
      trait: [],
    }
    for (const fact of facts.value) {
      grouped[fact.category].push(fact)
    }
    return grouped
  })

  const factCount = computed(() => facts.value.length)

  // 格式化用户画像为可读文本（用于 system prompt 注入）
  const formattedProfile = computed(() => {
    if (!profile.value || facts.value.length === 0) {
      return null
    }

    const sections: string[] = []

    // Personal information
    const personal = factsByCategory.value.personal
    if (personal.length > 0) {
      sections.push(`## 关于用户\n${personal.map(f => `- ${f.content}`).join('\n')}`)
    }

    // Preferences
    const preferences = factsByCategory.value.preference
    if (preferences.length > 0) {
      sections.push(`## 用户偏好\n${preferences.map(f => `- ${f.content}`).join('\n')}`)
    }

    // Goals
    const goals = factsByCategory.value.goal
    if (goals.length > 0) {
      sections.push(`## 用户目标\n${goals.map(f => `- ${f.content}`).join('\n')}`)
    }

    // Traits
    const traits = factsByCategory.value.trait
    if (traits.length > 0) {
      sections.push(`## 用户特点\n${traits.map(f => `- ${f.content}`).join('\n')}`)
    }

    return sections.join('\n\n')
  })

  // Load user profile
  async function loadProfile() {
    isLoading.value = true
    try {
      const response = await window.electronAPI.getUserProfile()
      if (response.success && response.profile) {
        profile.value = response.profile
      }
    } catch (error) {
      console.error('Failed to load user profile:', error)
    } finally {
      isLoading.value = false
    }
  }

  // Add a fact
  async function addFact(
    content: string,
    category: UserFactCategory,
    confidence?: number,
    sourceAgentId?: string
  ): Promise<UserFact | undefined> {
    try {
      const response = await window.electronAPI.addUserFact(
        content,
        category,
        confidence,
        sourceAgentId
      )
      if (response.success && response.fact) {
        if (profile.value) {
          profile.value.facts.push(response.fact)
        }
        return response.fact
      }
    } catch (error) {
      console.error('Failed to add fact:', error)
    }
  }

  // Update a fact
  async function updateFact(
    factId: string,
    updates: {
      content?: string
      category?: UserFactCategory
      confidence?: number
    }
  ): Promise<boolean> {
    try {
      const response = await window.electronAPI.updateUserFact(factId, updates)
      if (response.success && response.fact && profile.value) {
        const index = profile.value.facts.findIndex(f => f.id === factId)
        if (index !== -1) {
          profile.value.facts[index] = response.fact
        }
        return true
      }
    } catch (error) {
      console.error('Failed to update fact:', error)
    }
    return false
  }

  // Delete a fact
  async function deleteFact(factId: string): Promise<boolean> {
    try {
      const response = await window.electronAPI.deleteUserFact(factId)
      if (response.success && profile.value) {
        profile.value.facts = profile.value.facts.filter(f => f.id !== factId)
        return true
      }
    } catch (error) {
      console.error('Failed to delete fact:', error)
    }
    return false
  }

  // Get facts by category
  function getFactsByCategory(category: UserFactCategory): UserFact[] {
    return factsByCategory.value[category]
  }

  return {
    // State
    profile,
    isLoading,
    // Computed
    facts,
    factsByCategory,
    factCount,
    formattedProfile,
    // Actions
    loadProfile,
    addFact,
    updateFact,
    deleteFact,
    getFactsByCategory,
  }
})
