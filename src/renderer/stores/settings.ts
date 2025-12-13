import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import type { AppSettings } from '@/types'
import { AIProvider as AIProviderEnum } from '../../shared/ipc'
import type { AIProvider } from '../../shared/ipc'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({
    ai: {
      provider: AIProviderEnum.OpenAI,
      apiKey: '',
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
    },
    theme: 'light',
  })

  const isLoading = ref(false)

  async function loadSettings() {
    isLoading.value = true
    try {
      const response = await window.electronAPI.getSettings()
      if (response.success) {
        settings.value = response.settings
      }
    } finally {
      isLoading.value = false
    }
  }

  async function saveSettings(newSettings: AppSettings) {
    isLoading.value = true
    try {
      const plainSettings = JSON.parse(JSON.stringify(toRaw(newSettings))) as AppSettings
      settings.value = plainSettings
      await window.electronAPI.saveSettings(plainSettings)
    } finally {
      isLoading.value = false
    }
  }

  function updateAIProvider(provider: AIProvider) {
    settings.value.ai.provider = provider
  }

  function updateAPIKey(apiKey: string) {
    settings.value.ai.apiKey = apiKey
  }

  function updateModel(model: string) {
    settings.value.ai.model = model
  }

  function updateTemperature(temperature: number) {
    settings.value.ai.temperature = Math.max(0, Math.min(2, temperature))
  }

  function updateTheme(theme: 'light' | 'dark') {
    settings.value.theme = theme
  }

  return {
    settings,
    isLoading,
    loadSettings,
    saveSettings,
    updateAIProvider,
    updateAPIKey,
    updateModel,
    updateTemperature,
    updateTheme,
  }
})
