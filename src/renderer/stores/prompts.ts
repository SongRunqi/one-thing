import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  PromptCreateRequest,
  PromptUpdateRequest,
  UserPrompt,
} from '@/types'
import { platformApi } from '@/platform'

export const usePromptsStore = defineStore('prompts', () => {
  const prompts = ref<UserPrompt[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  let loadPromise: Promise<UserPrompt[]> | null = null

  const promptMap = computed(() => {
    const map = new Map<string, UserPrompt>()
    for (const prompt of prompts.value) map.set(prompt.id, prompt)
    return map
  })

  async function loadPrompts(): Promise<UserPrompt[]> {
    if (loadPromise) return loadPromise
    isLoading.value = true
    error.value = null
    loadPromise = (async () => {
      try {
        const response = await platformApi.listPrompts()
        if (!response.success || !response.prompts) {
          throw new Error(response.error || 'Failed to load prompts')
        }
        prompts.value = response.prompts
        return prompts.value
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Failed to load prompts'
        prompts.value = []
        return prompts.value
      } finally {
        isLoading.value = false
        loadPromise = null
      }
    })()
    return loadPromise
  }

  async function getPrompt(id: string): Promise<UserPrompt | undefined> {
    const cached = promptMap.value.get(id)
    if (cached) return cached
    const response = await platformApi.getPrompt({ id })
    if (response.success && response.prompt) {
      prompts.value = [
        ...prompts.value.filter(prompt => prompt.id !== response.prompt!.id),
        response.prompt,
      ].sort((a, b) => a.title.localeCompare(b.title))
      return response.prompt
    }
    return undefined
  }

  async function createPrompt(request: PromptCreateRequest): Promise<UserPrompt | undefined> {
    const response = await platformApi.createPrompt(request)
    if (response.success && response.prompt) {
      prompts.value = [...prompts.value, response.prompt].sort((a, b) => a.title.localeCompare(b.title))
      return response.prompt
    }
    error.value = response.error || 'Failed to create prompt'
    return undefined
  }

  async function updatePrompt(request: PromptUpdateRequest): Promise<UserPrompt | undefined> {
    const response = await platformApi.updatePrompt(request)
    if (response.success && response.prompt) {
      prompts.value = prompts.value
        .map(prompt => prompt.id === response.prompt!.id ? response.prompt! : prompt)
        .sort((a, b) => a.title.localeCompare(b.title))
      return response.prompt
    }
    error.value = response.error || 'Failed to update prompt'
    return undefined
  }

  async function deletePrompt(id: string): Promise<boolean> {
    const response = await platformApi.deletePrompt({ id })
    if (response.success) {
      prompts.value = prompts.value.filter(prompt => prompt.id !== id)
      return true
    }
    error.value = response.error || 'Failed to delete prompt'
    return false
  }

  return {
    prompts,
    promptMap,
    isLoading,
    error,
    loadPrompts,
    getPrompt,
    createPrompt,
    updatePrompt,
    deletePrompt,
  }
})
