import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import type { AppSettings } from '@/types'
import { AIProvider as AIProviderEnum } from '../../shared/ipc'
import type { AIProvider } from '../../shared/ipc'

const defaultSettings: AppSettings = {
  ai: {
    provider: AIProviderEnum.OpenAI,
    temperature: 0.7,
    providers: {
      [AIProviderEnum.OpenAI]: {
        apiKey: '',
        model: 'gpt-4',
      },
      [AIProviderEnum.Claude]: {
        apiKey: '',
        model: 'claude-sonnet-4-5-20250929',
      },
      [AIProviderEnum.Custom]: {
        apiKey: '',
        baseUrl: '',
        model: '',
      },
    },
  },
  theme: 'light',
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>(JSON.parse(JSON.stringify(defaultSettings)))

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

  function updateAPIKey(apiKey: string, provider?: AIProvider) {
    const targetProvider = provider || settings.value.ai.provider
    settings.value.ai.providers[targetProvider].apiKey = apiKey
  }

  function updateModel(model: string, provider?: AIProvider) {
    const targetProvider = provider || settings.value.ai.provider
    settings.value.ai.providers[targetProvider].model = model
  }

  function updateTemperature(temperature: number) {
    settings.value.ai.temperature = Math.max(0, Math.min(2, temperature))
  }

  function updateTheme(theme: 'light' | 'dark') {
    settings.value.theme = theme
  }

  // Get current provider's config
  function getCurrentProviderConfig() {
    return settings.value.ai.providers[settings.value.ai.provider]
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
    getCurrentProviderConfig,
  }
})
