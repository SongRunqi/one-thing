import { defineStore } from 'pinia'
import { ref, toRaw, computed } from 'vue'
import type { AppSettings, ProviderInfo, CustomProviderConfig, OpenRouterModel } from '@/types'
import { AIProvider as AIProviderEnum } from '../../shared/ipc'
import type { AIProvider, ModelInfo } from '../../shared/ipc'

// Read initial theme from what index.html already set (via URL hash or localStorage)
// This prevents the flash where Vue overwrites the correct theme with defaults
function getInitialTheme(): 'light' | 'dark' | 'system' {
  // First check what index.html already set on the document
  const docTheme = document.documentElement.getAttribute('data-theme')
  if (docTheme === 'light' || docTheme === 'dark') {
    console.log('[Theme] getInitialTheme: using document data-theme:', docTheme)
    // We don't know if user setting is 'system' or explicit, so return the effective theme
    // loadSettings() will later update this to the actual setting
    return docTheme
  }
  // Fallback to localStorage cache
  const cached = localStorage.getItem('cached-theme')
  if (cached === 'light' || cached === 'dark') {
    console.log('[Theme] getInitialTheme: using localStorage cache:', cached)
    return cached
  }
  console.log('[Theme] getInitialTheme: no cached value, defaulting to dark')
  return 'dark'
}

const initialTheme = getInitialTheme()

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
      [AIProviderEnum.Gemini]: {
        apiKey: '',
        model: 'gemini-2.0-flash-exp',
        selectedModels: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
      },
      [AIProviderEnum.ClaudeCode]: {
        model: 'claude-sonnet-4-20250514',
        selectedModels: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-opus-4-20250514'],
        authType: 'oauth',
      },
      [AIProviderEnum.GitHubCopilot]: {
        model: 'gpt-4o',
        selectedModels: ['gpt-4o', 'gpt-4o-mini', 'o1-preview', 'o1-mini'],
        authType: 'oauth',
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
  // Use the initial theme read from document/localStorage to avoid flash
  theme: initialTheme,
  general: {
    animationSpeed: 0.25,
    sendShortcut: 'enter',
    colorTheme: 'blue',
    baseTheme: 'obsidian',
    messageListDensity: 'comfortable',
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

  // Model name cache: model ID -> display name
  const modelNameCache = ref<Map<string, string>>(new Map())

  // Model list cache: provider ID -> full model list (with capabilities)
  const providerModels = ref<Map<string, OpenRouterModel[]>>(new Map())
  const modelsLoading = ref<Map<string, boolean>>(new Map())

  const isLoading = ref(false)

  // System theme detection - use Electron's nativeTheme via IPC
  // Initialize from what index.html set (instead of hardcoding 'dark') to avoid flash
  const systemTheme = ref<'light' | 'dark'>(
    initialTheme === 'system' ? 'dark' : (initialTheme as 'light' | 'dark')
  )

  // Fetch system theme from main process (uses nativeTheme.shouldUseDarkColors)
  async function fetchSystemTheme() {
    try {
      const response = await window.electronAPI.getSystemTheme()
      if (response.success && response.theme) {
        systemTheme.value = response.theme
      }
    } catch (error) {
      console.error('Failed to get system theme:', error)
    }
  }

  // Listen for system theme changes from main process
  window.electronAPI.onSystemThemeChanged((theme: 'light' | 'dark') => {
    systemTheme.value = theme
    // Only apply if current setting is 'system'
    if (settings.value.theme === 'system') {
      applyTheme()
    }
  })

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
    const currentTheme = document.documentElement.getAttribute('data-theme')
    console.log('[Theme] applyTheme called:', {
      effectiveTheme: theme,
      currentDataTheme: currentTheme,
      settingsTheme: settings.value.theme,
      systemTheme: systemTheme.value,
      stack: new Error().stack?.split('\n').slice(1, 4).join('\n')
    })

    // Always apply color theme and base theme first
    // They may need updating even if base theme hasn't changed
    applyColorTheme()
    applyBaseTheme()

    // Skip base theme update if already correct (avoid unnecessary DOM changes)
    if (currentTheme === theme) {
      console.log('[Theme] Skipping base theme - already correct:', theme)
      return
    }
    document.documentElement.setAttribute('data-theme', theme)
    // Cache effective theme to localStorage for instant startup
    localStorage.setItem('cached-theme', theme)
  }

  // Apply color theme to document
  function applyColorTheme() {
    const colorTheme = settings.value.general?.colorTheme || 'blue'
    const currentColorTheme = document.documentElement.getAttribute('data-color-theme')
    console.log('[Theme] applyColorTheme:', { from: currentColorTheme, to: colorTheme })
    if (currentColorTheme === colorTheme) {
      return // Already correct
    }
    document.documentElement.setAttribute('data-color-theme', colorTheme)
    // Cache color theme to localStorage for instant startup
    localStorage.setItem('cached-color-theme', colorTheme)
  }

  // Apply base theme to document
  function applyBaseTheme() {
    const baseTheme = settings.value.general?.baseTheme || 'obsidian'
    const currentBaseTheme = document.documentElement.getAttribute('data-base-theme')
    if (currentBaseTheme === baseTheme) {
      return // Already correct
    }
    document.documentElement.setAttribute('data-base-theme', baseTheme)
  }

  async function loadSettings() {
    isLoading.value = true
    try {
      // Load settings, providers, and model aliases in parallel
      const [settingsResponse, providersResponse, aliasesResponse] = await Promise.all([
        window.electronAPI.getSettings(),
        window.electronAPI.getProviders(),
        window.electronAPI.getModelNameAliases(),
      ])

      if (settingsResponse.success) {
        settings.value = settingsResponse.settings
        // Ensure customProviders array exists
        if (!settings.value.ai.customProviders) {
          settings.value.ai.customProviders = []
        }
        // If theme is 'system', fetch system theme first before applying
        if (settings.value.theme === 'system') {
          await fetchSystemTheme()
        }
        applyTheme()
      }

      if (providersResponse.success && providersResponse.providers) {
        // Merge built-in providers with custom providers
        updateAvailableProviders(providersResponse.providers)
      }

      // Load model name aliases into cache
      if (aliasesResponse.success && aliasesResponse.aliases) {
        for (const [modelId, displayName] of Object.entries(aliasesResponse.aliases)) {
          modelNameCache.value.set(modelId, displayName as string)
        }
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

      // Check if theme-related settings changed
      const themeChanged =
        settings.value.theme !== plainSettings.theme ||
        settings.value.general?.colorTheme !== plainSettings.general?.colorTheme ||
        settings.value.general?.baseTheme !== plainSettings.general?.baseTheme

      settings.value = plainSettings
      await window.electronAPI.saveSettings(plainSettings)

      // Only apply theme if theme-related settings actually changed
      if (themeChanged) {
        applyTheme()
      }
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

  function updateMessageListDensity(density: 'compact' | 'comfortable' | 'spacious') {
    settings.value.general.messageListDensity = density
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

  // Update model name cache with fetched models
  function updateModelNameCache(models: Array<{ id: string; name: string }>) {
    for (const model of models) {
      if (model.id && model.name) {
        modelNameCache.value.set(model.id, model.name)
      }
    }
  }

  // Get display name for a model ID
  function getModelDisplayName(modelId: string): string {
    return modelNameCache.value.get(modelId) || modelId
  }

  // ========== Unified Model List Management ==========

  /**
   * Check if models are loading for a provider
   */
  function isModelsLoading(providerId: string): boolean {
    return modelsLoading.value.get(providerId) || false
  }

  /**
   * Get cached models for a provider (returns empty array if not cached)
   */
  function getCachedModels(providerId: string): OpenRouterModel[] {
    return providerModels.value.get(providerId) || []
  }

  /**
   * Check if models are cached for a provider
   */
  function hasModelsCache(providerId: string): boolean {
    return providerModels.value.has(providerId)
  }

  /**
   * Fetch models for a provider with caching
   * @param providerId - The provider ID
   * @param forceRefresh - If true, bypass cache and fetch fresh data
   * @returns The model list
   */
  async function fetchModelsForProvider(
    providerId: string,
    forceRefresh = false
  ): Promise<OpenRouterModel[]> {
    // Return cached if available and not forcing refresh
    if (!forceRefresh && providerModels.value.has(providerId)) {
      return providerModels.value.get(providerId)!
    }

    // Check if already loading
    if (modelsLoading.value.get(providerId)) {
      // Wait for existing request to complete
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!modelsLoading.value.get(providerId)) {
            clearInterval(checkInterval)
            resolve(providerModels.value.get(providerId) || [])
          }
        }, 100)
      })
    }

    modelsLoading.value.set(providerId, true)

    try {
      // First try to get from capabilities cache (faster)
      const cachedResponse = await window.electronAPI.getModelsWithCapabilities(providerId)

      if (cachedResponse.success && cachedResponse.models && cachedResponse.models.length > 0) {
        const models = cachedResponse.models
        providerModels.value.set(providerId, models)
        // Update name cache
        updateModelNameCache(models)
        return models
      }

      // If no cache, fetch from API
      const providerConfig = settings.value.ai.providers[providerId]
      if (!providerConfig?.apiKey && !providerConfig?.oauthToken) {
        // No credentials, return empty
        providerModels.value.set(providerId, [])
        return []
      }

      const response = await window.electronAPI.fetchModels(
        providerId as AIProvider,
        providerConfig.apiKey || '',
        providerConfig.baseUrl
      )

      if (response.success && response.models) {
        const models = response.models as OpenRouterModel[]
        providerModels.value.set(providerId, models)
        // Update name cache
        updateModelNameCache(models)
        return models
      }

      // Fallback to empty
      providerModels.value.set(providerId, [])
      return []
    } catch (error) {
      console.error(`[SettingsStore] Failed to fetch models for ${providerId}:`, error)
      providerModels.value.set(providerId, [])
      return []
    } finally {
      modelsLoading.value.set(providerId, false)
    }
  }

  /**
   * Refresh model registry and fetch fresh models for a provider
   */
  async function refreshModelsForProvider(providerId: string): Promise<OpenRouterModel[]> {
    try {
      await window.electronAPI.refreshModelRegistry()
    } catch (error) {
      console.warn('[SettingsStore] Failed to refresh model registry:', error)
    }
    return fetchModelsForProvider(providerId, true)
  }

  /**
   * Get embedding models for a provider (filtered from full list)
   * Uses provider's own API (not Models.dev) since embedding models are often not in Models.dev
   * Returns ModelInfo[] with type='embedding' field
   */
  async function getEmbeddingModels(providerId: string): Promise<ModelInfo[]> {
    // Get provider config
    const providerConfig = settings.value.ai.providers[providerId]
    console.log(`[SettingsStore] getEmbeddingModels: providerId=${providerId}, hasConfig=${!!providerConfig}, hasApiKey=${!!providerConfig?.apiKey}, hasOAuth=${!!providerConfig?.oauthToken}`)

    if (!providerConfig?.apiKey && !providerConfig?.oauthToken) {
      console.log(`[SettingsStore] No credentials for ${providerId}, returning empty`)
      return []
    }

    try {
      // Directly call provider's API to get models (bypasses Models.dev cache)
      // Force refresh to get fresh data with type field
      console.log(`[SettingsStore] Calling fetchModels for ${providerId} (forceRefresh=true)...`)
      const response = await window.electronAPI.fetchModels(
        providerId as AIProvider,
        providerConfig.apiKey || '',
        providerConfig.baseUrl,
        true  // forceRefresh - bypass cache to get fresh data with type field
      )

      console.log(`[SettingsStore] fetchModels response for ${providerId}:`, response.success, response.models?.length, response.error)

      if (!response.success || !response.models) {
        console.log(`[SettingsStore] fetchModels failed for ${providerId}:`, response.error)
        return []
      }

      // Log all models before filtering
      console.log(`[SettingsStore] All models for ${providerId}:`, response.models.map(m => ({ id: m.id, type: m.type })))

      // Filter for embedding models
      // ModelInfo has 'type' field set by fetchOpenAIModels, fetchGeminiModels, fetchZhipuModels
      const embeddingModels = response.models.filter(m => {
        // Check type field (set by our fetch*Models functions)
        if (m.type === 'embedding') {
          return true
        }
        // Fallback: check model ID for known embedding patterns
        const embeddingPatterns = ['embedding', 'text-embedding', 'ada-002']
        return embeddingPatterns.some(p => m.id.toLowerCase().includes(p))
      })

      console.log(`[SettingsStore] Filtered embedding models for ${providerId}:`, embeddingModels.length)
      return embeddingModels
    } catch (error) {
      console.error(`[SettingsStore] Failed to fetch embedding models for ${providerId}:`, error)
      return []
    }
  }

  /**
   * Get chat models for a provider (filtered from full list)
   * Excludes embedding and image-only models
   */
  async function getChatModels(providerId: string): Promise<OpenRouterModel[]> {
    const models = await fetchModelsForProvider(providerId)
    return models.filter(m => {
      // Exclude embedding models
      if (m.architecture?.output_modalities?.includes('embeddings')) {
        return false
      }
      const embeddingPatterns = ['embedding', 'text-embedding', 'ada-002']
      if (embeddingPatterns.some(p => m.id.toLowerCase().includes(p))) {
        return false
      }
      // Include if has text output
      return m.architecture?.output_modalities?.includes('text') ?? true
    })
  }

  /**
   * Get selected models for a provider (from user's selectedModels list)
   * Returns full model info for each selected model ID
   */
  async function getSelectedModels(providerId: string): Promise<OpenRouterModel[]> {
    const allModels = await fetchModelsForProvider(providerId)
    const selectedIds = settings.value.ai.providers[providerId]?.selectedModels || []

    // Map selected IDs to full model objects, preserving order
    const selectedModels: OpenRouterModel[] = []
    for (const id of selectedIds) {
      const model = allModels.find(m => m.id === id)
      if (model) {
        selectedModels.push({
          ...model,
          name: getModelDisplayName(model.id) || model.name,
        })
      } else {
        // Create placeholder for models not in the full list
        selectedModels.push({
          id,
          name: getModelDisplayName(id) || id,
          context_length: 0,
          architecture: {
            modality: 'text' as const,
            input_modalities: ['text'],
            output_modalities: ['text'],
            tokenizer: 'unknown',
          },
          pricing: { prompt: '0', completion: '0', request: '0', image: '0' },
          top_provider: { context_length: 0, max_completion_tokens: 0, is_moderated: false },
          supported_parameters: [],
        })
      }
    }

    return selectedModels
  }

  /**
   * Clear model cache for a provider (or all if no provider specified)
   */
  function clearModelsCache(providerId?: string) {
    if (providerId) {
      providerModels.value.delete(providerId)
    } else {
      providerModels.value.clear()
    }
  }

  /**
   * Add a custom model to the cache for a provider
   */
  function addCustomModelToCache(providerId: string, model: OpenRouterModel) {
    const existing = providerModels.value.get(providerId) || []
    if (!existing.find(m => m.id === model.id)) {
      providerModels.value.set(providerId, [...existing, model])
    }
  }

  /**
   * Preload models for multiple providers in background
   */
  async function preloadModels(providerIds: string[]) {
    await Promise.all(
      providerIds.map(id => fetchModelsForProvider(id))
    )
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
    updateMessageListDensity,
    // Model name cache
    updateModelNameCache,
    getModelDisplayName,
    // Unified model list management
    providerModels,
    isModelsLoading,
    getCachedModels,
    hasModelsCache,
    fetchModelsForProvider,
    refreshModelsForProvider,
    getEmbeddingModels,
    getChatModels,
    getSelectedModels,
    clearModelsCache,
    addCustomModelToCache,
    preloadModels,
  }
})
