import { defineStore } from 'pinia'
import { ref, toRaw, computed } from 'vue'
import type { AppSettings, ProviderInfo, CustomProviderConfig } from '@/types'
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
        selectedModels: ['gpt-4', 'gpt-4o', 'gpt-3.5-turbo'],
      },
      [AIProviderEnum.Claude]: {
        apiKey: '',
        model: 'claude-sonnet-4-5-20250929',
        selectedModels: ['claude-sonnet-4-5-20250929', 'claude-3-5-haiku-20241022'],
      },
      [AIProviderEnum.DeepSeek]: {
        apiKey: '',
        model: 'deepseek-chat',
        selectedModels: ['deepseek-chat', 'deepseek-reasoner'],
      },
      [AIProviderEnum.Kimi]: {
        apiKey: '',
        model: 'moonshot-v1-8k',
        selectedModels: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
      },
      [AIProviderEnum.Zhipu]: {
        apiKey: '',
        model: 'glm-4-flash',
        selectedModels: ['glm-4-flash', 'glm-4-plus', 'glm-4'],
      },
      [AIProviderEnum.OpenRouter]: {
        apiKey: '',
        model: 'openai/gpt-4o',
        selectedModels: [
          'openai/gpt-4o',
          'openai/gpt-4o-mini',
          'anthropic/claude-3.5-sonnet',
          'google/gemini-pro-1.5',
          'meta-llama/llama-3.1-70b-instruct',
        ],
      },
      [AIProviderEnum.Custom]: {
        apiKey: '',
        baseUrl: '',
        model: '',
        selectedModels: [],
      },
    },
    customProviders: [],
  },
  theme: 'dark',
  general: {
    animationSpeed: 0.25,
    sendShortcut: 'enter',
    colorTheme: 'blue',
    baseTheme: 'obsidian',
    shortcuts: {
      sendMessage: { key: 'Enter' },
      newChat: { key: 'n', metaKey: true },
      toggleSidebar: { key: 'b', metaKey: true },
      focusInput: { key: '/' },
    },
  },
  tools: {
    enableToolCalls: true,
    tools: {},
  },
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>(JSON.parse(JSON.stringify(defaultSettings)))
  const availableProviders = ref<ProviderInfo[]>([])

  const isLoading = ref(false)

  // System theme detection
  const systemTheme = ref<'light' | 'dark'>(
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  )

  // Listen for system theme changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handleSystemThemeChange = (e: MediaQueryListEvent) => {
    systemTheme.value = e.matches ? 'dark' : 'light'
    applyTheme()
  }
  mediaQuery.addEventListener('change', handleSystemThemeChange)

  // Computed: actual theme to apply (resolves 'system' to actual theme)
  const effectiveTheme = computed(() => {
    if (settings.value.theme === 'system') {
      return systemTheme.value
    }
    return settings.value.theme
  })

  // Apply theme to document
  function applyTheme() {
    const theme = effectiveTheme.value
    document.documentElement.setAttribute('data-theme', theme)
    // Also apply color theme and base theme
    applyColorTheme()
    applyBaseTheme()
  }

  // Apply color theme to document
  function applyColorTheme() {
    const colorTheme = settings.value.general?.colorTheme || 'blue'
    document.documentElement.setAttribute('data-color-theme', colorTheme)
  }

  // Apply base theme to document
  function applyBaseTheme() {
    const baseTheme = settings.value.general?.baseTheme || 'obsidian'
    document.documentElement.setAttribute('data-base-theme', baseTheme)
  }

  async function loadSettings() {
    isLoading.value = true
    try {
      // Load settings and providers in parallel
      const [settingsResponse, providersResponse] = await Promise.all([
        window.electronAPI.getSettings(),
        window.electronAPI.getProviders(),
      ])

      if (settingsResponse.success) {
        settings.value = settingsResponse.settings
        // Ensure customProviders array exists
        if (!settings.value.ai.customProviders) {
          settings.value.ai.customProviders = []
        }
        applyTheme()
      }

      if (providersResponse.success && providersResponse.providers) {
        // Merge built-in providers with custom providers
        updateAvailableProviders(providersResponse.providers)
      }
    } finally {
      isLoading.value = false
    }
  }

  // Update available providers by merging built-in and custom providers
  function updateAvailableProviders(builtInProviders: ProviderInfo[]) {
    const customProviders = settings.value.ai.customProviders || []
    const customProviderInfos: ProviderInfo[] = customProviders.map(cp => ({
      id: cp.id,
      name: cp.name,
      description: cp.description || `Custom ${cp.apiType === 'openai' ? 'OpenAI' : 'Anthropic'}-compatible API`,
      defaultBaseUrl: cp.baseUrl || '',
      defaultModel: cp.model || '',
      icon: 'custom',
      supportsCustomBaseUrl: true,
      requiresApiKey: true,
    }))

    availableProviders.value = [...builtInProviders, ...customProviderInfos]
  }

  async function loadProviders() {
    try {
      const response = await window.electronAPI.getProviders()
      if (response.success && response.providers) {
        availableProviders.value = response.providers
      }
    } catch (error) {
      console.error('Failed to load providers:', error)
    }
  }

  async function saveSettings(newSettings: AppSettings) {
    isLoading.value = true
    try {
      const plainSettings = JSON.parse(JSON.stringify(toRaw(newSettings))) as AppSettings
      settings.value = plainSettings
      await window.electronAPI.saveSettings(plainSettings)
      applyTheme()
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

  function updateTheme(theme: 'light' | 'dark' | 'system') {
    settings.value.theme = theme
    applyTheme()
  }

  function updateSendShortcut(shortcut: 'enter' | 'ctrl-enter' | 'cmd-enter') {
    settings.value.general.sendShortcut = shortcut
  }

  function updateColorTheme(colorTheme: 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan' | 'red') {
    settings.value.general.colorTheme = colorTheme
    applyColorTheme()
  }

  function updateBaseTheme(baseTheme: 'obsidian' | 'ocean' | 'forest' | 'rose' | 'ember') {
    settings.value.general.baseTheme = baseTheme
    applyBaseTheme()
  }

  // Get current provider's config
  function getCurrentProviderConfig() {
    return settings.value.ai.providers[settings.value.ai.provider]
  }

  // Get provider info by ID
  function getProviderInfo(providerId: string): ProviderInfo | undefined {
    return availableProviders.value.find(p => p.id === providerId)
  }

  // Check if a provider is a custom provider
  function isCustomProvider(providerId: string): boolean {
    return settings.value.ai.customProviders?.some(p => p.id === providerId) || false
  }

  // Get custom provider config by ID
  function getCustomProvider(providerId: string): CustomProviderConfig | undefined {
    return settings.value.ai.customProviders?.find(p => p.id === providerId)
  }

  // Add a new custom provider
  function addCustomProvider(provider: CustomProviderConfig) {
    if (!settings.value.ai.customProviders) {
      settings.value.ai.customProviders = []
    }
    // Ensure unique ID
    if (settings.value.ai.customProviders.some(p => p.id === provider.id)) {
      throw new Error(`Provider with ID "${provider.id}" already exists`)
    }
    settings.value.ai.customProviders.push(provider)

    // Also add to providers config for API key and model storage
    settings.value.ai.providers[provider.id] = {
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      model: provider.model,
      selectedModels: provider.selectedModels,
    }

    // Refresh available providers
    refreshAvailableProviders()
  }

  // Update an existing custom provider
  function updateCustomProvider(providerId: string, updates: Partial<CustomProviderConfig>) {
    const index = settings.value.ai.customProviders?.findIndex(p => p.id === providerId) ?? -1
    if (index === -1) return

    const provider = settings.value.ai.customProviders![index]
    Object.assign(provider, updates)

    // Also update providers config
    if (settings.value.ai.providers[providerId]) {
      if (updates.apiKey !== undefined) settings.value.ai.providers[providerId].apiKey = updates.apiKey
      if (updates.baseUrl !== undefined) settings.value.ai.providers[providerId].baseUrl = updates.baseUrl
      if (updates.model !== undefined) settings.value.ai.providers[providerId].model = updates.model
      if (updates.selectedModels !== undefined) settings.value.ai.providers[providerId].selectedModels = updates.selectedModels
    }

    // Refresh available providers
    refreshAvailableProviders()
  }

  // Delete a custom provider
  function deleteCustomProvider(providerId: string) {
    const index = settings.value.ai.customProviders?.findIndex(p => p.id === providerId) ?? -1
    if (index === -1) return

    settings.value.ai.customProviders!.splice(index, 1)

    // Remove from providers config
    delete settings.value.ai.providers[providerId]

    // If this was the active provider, switch to OpenAI
    if (settings.value.ai.provider === providerId) {
      settings.value.ai.provider = AIProviderEnum.OpenAI
    }

    // Refresh available providers
    refreshAvailableProviders()
  }

  // Refresh available providers list (used after adding/updating/deleting custom providers)
  async function refreshAvailableProviders() {
    try {
      const response = await window.electronAPI.getProviders()
      if (response.success && response.providers) {
        updateAvailableProviders(response.providers)
      }
    } catch (error) {
      console.error('Failed to refresh providers:', error)
    }
  }

  return {
    settings,
    availableProviders,
    isLoading,
    effectiveTheme,
    loadSettings,
    loadProviders,
    saveSettings,
    updateAIProvider,
    updateAPIKey,
    updateModel,
    updateTemperature,
    updateTheme,
    updateSendShortcut,
    getCurrentProviderConfig,
    getProviderInfo,
    isCustomProvider,
    getCustomProvider,
    addCustomProvider,
    updateCustomProvider,
    deleteCustomProvider,
    refreshAvailableProviders,
    applyTheme,
    applyColorTheme,
    applyBaseTheme,
    updateColorTheme,
    updateBaseTheme,
  }
})
