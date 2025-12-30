/**
 * Provider Settings Composable
 *
 * 管理 AI Provider 配置、OAuth 流程、模型选择等逻辑
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { AppSettings, AIProvider, ProviderInfo, OpenRouterModel } from '@/types'
import { useSettingsStore } from '@/stores/settings'

export interface OAuthStatus {
  isLoggedIn: boolean
  expiresAt?: number
}

export interface DeviceFlowInfo {
  userCode: string
  verificationUri: string
}

export interface CodeEntryInfo {
  state: string
  instructions: string
}

export function useProviderSettings(
  props: { settings: AppSettings; providers: ProviderInfo[] },
  emit: (event: 'update:settings', settings: AppSettings) => void
) {
  const settingsStore = useSettingsStore()

  // Local state
  const modelSearchQuery = ref('')
  const newModelInput = ref('')
  const modelError = ref('')

  // OAuth state
  const isOAuthLoading = ref(false)
  const oauthStatus = ref<OAuthStatus>({ isLoggedIn: false })
  const deviceFlowInfo = ref<DeviceFlowInfo | null>(null)
  const codeEntryInfo = ref<CodeEntryInfo | null>(null)
  const manualCode = ref('')
  const isSubmittingCode = ref(false)
  const codeEntryError = ref('')

  // Viewing provider (can be different from active provider)
  const viewingProvider = ref<string>(props.settings.ai.provider)

  // OAuth event cleanup refs
  let oauthTokenRefreshedCleanup: (() => void) | null = null
  let oauthTokenExpiredCleanup: (() => void) | null = null

  // Watch for settings changes to sync viewingProvider
  watch(() => props.settings.ai.provider, (newProvider) => {
    viewingProvider.value = newProvider
  })

  // Get models from unified store
  const availableModels = computed(() => settingsStore.getCachedModels(viewingProvider.value))
  const isLoadingModels = computed(() => settingsStore.isModelsLoading(viewingProvider.value))

  // Computed properties
  const currentProviderName = computed(() => {
    return props.providers.find(p => p.id === viewingProvider.value)?.name || viewingProvider.value
  })

  const currentSelectedModels = computed(() => {
    return props.settings.ai.providers[viewingProvider.value]?.selectedModels || []
  })

  const filteredModels = computed(() => {
    if (!modelSearchQuery.value.trim()) {
      return availableModels.value
    }
    const query = modelSearchQuery.value.toLowerCase()
    return availableModels.value.filter(model =>
      model.id.toLowerCase().includes(query) ||
      (model.name && model.name.toLowerCase().includes(query)) ||
      (model.description && model.description.toLowerCase().includes(query))
    )
  })

  const isOAuthProvider = computed(() => {
    const provider = props.providers.find(p => p.id === viewingProvider.value)
    return provider?.requiresOAuth === true
  })

  // Global default computed properties
  const enabledProviders = computed(() => {
    return props.providers.filter(p => {
      const config = props.settings.ai.providers[p.id]
      return config?.enabled !== false && (config?.selectedModels?.length ?? 0) > 0
    })
  })

  const defaultProviderSelectedModels = computed(() => {
    const defaultProvider = props.settings.ai.provider
    return props.settings.ai.providers[defaultProvider]?.selectedModels || []
  })

  const defaultProviderModel = computed(() => {
    const defaultProvider = props.settings.ai.provider
    return props.settings.ai.providers[defaultProvider]?.model || ''
  })

  // Helper functions
  function getDefaultBaseUrl(): string {
    const provider = props.providers.find(p => p.id === viewingProvider.value)
    return provider?.defaultBaseUrl || 'https://api.example.com/v1'
  }

  function isUserCustomProvider(providerId: string): boolean {
    return settingsStore.isCustomProvider(providerId)
  }

  function isProviderEnabled(providerId: string): boolean {
    const config = props.settings.ai.providers[providerId]
    return config?.enabled !== false
  }

  function isModelSelected(modelId: string): boolean {
    const selectedModels = props.settings.ai.providers[viewingProvider.value]?.selectedModels || []
    return selectedModels.includes(modelId)
  }

  function getModelName(modelId: string): string {
    const model = availableModels.value.find(m => m.id === modelId)
    if (model?.name) return model.name
    return settingsStore.getModelDisplayName(modelId) || modelId
  }

  // Model capability checks
  function hasVision(model: OpenRouterModel): boolean {
    return model.architecture?.input_modalities?.includes('image') ?? false
  }

  function hasImageGeneration(model: OpenRouterModel): boolean {
    if (model.architecture?.output_modalities?.includes('image')) {
      return true
    }
    const imageGenIndicators = ['dall-e', 'dalle', 'gpt-image', 'imagen', 'stable-diffusion', 'midjourney']
    return imageGenIndicators.some(indicator =>
      model.id.toLowerCase().includes(indicator)
    )
  }

  function hasTools(model: OpenRouterModel): boolean {
    return model.supported_parameters?.includes('tools') ?? false
  }

  function hasReasoning(model: OpenRouterModel): boolean {
    if (model.supported_parameters?.includes('reasoning')) {
      return true
    }
    const reasoningIndicators = ['o1', 'o3', 'o4', 'deepseek-r1', 'reasoner']
    return reasoningIndicators.some(indicator =>
      model.id.toLowerCase().includes(indicator) ||
      (model.name?.toLowerCase().includes(indicator))
    )
  }

  function formatContextLength(contextLength: number): string {
    if (!contextLength) return ''
    if (contextLength >= 1000000) {
      return `${(contextLength / 1000000).toFixed(1)}M`
    } else if (contextLength >= 1000) {
      return `${Math.round(contextLength / 1000)}K`
    }
    return contextLength.toString()
  }

  // Update functions
  function updateSettings(updates: Partial<AppSettings>) {
    emit('update:settings', { ...props.settings, ...updates })
  }

  function updateProviderApiKey(apiKey: string) {
    const providers = { ...props.settings.ai.providers }
    providers[viewingProvider.value] = { ...providers[viewingProvider.value], apiKey }
    updateSettings({ ai: { ...props.settings.ai, providers } })
  }

  function updateProviderBaseUrl(baseUrl: string) {
    const providers = { ...props.settings.ai.providers }
    providers[viewingProvider.value] = { ...providers[viewingProvider.value], baseUrl }
    updateSettings({ ai: { ...props.settings.ai, providers } })
  }

  function updateTemperature(temperature: number) {
    updateSettings({ ai: { ...props.settings.ai, temperature } })
  }

  function toggleProviderEnabled(providerId: string) {
    const providers = { ...props.settings.ai.providers }
    const config = providers[providerId]
    if (config) {
      providers[providerId] = { ...config, enabled: !isProviderEnabled(providerId) }
      updateSettings({ ai: { ...props.settings.ai, providers } })
    }
  }

  async function switchViewingProvider(provider: string) {
    viewingProvider.value = provider
    modelError.value = ''
    modelSearchQuery.value = ''
    oauthStatus.value = { isLoggedIn: false }
    deviceFlowInfo.value = null
    codeEntryInfo.value = null
    manualCode.value = ''
    codeEntryError.value = ''
    await loadCachedModels()
    await checkOAuthStatus()
  }

  function toggleModelSelection(modelId: string) {
    const providers = { ...props.settings.ai.providers }
    const providerConfig = { ...providers[viewingProvider.value] }

    if (!providerConfig.selectedModels) {
      providerConfig.selectedModels = []
    } else {
      providerConfig.selectedModels = [...providerConfig.selectedModels]
    }

    const index = providerConfig.selectedModels.indexOf(modelId)
    if (index === -1) {
      providerConfig.selectedModels.push(modelId)
      if (providerConfig.selectedModels.length === 1) {
        providerConfig.model = modelId
      }
    } else {
      if (providerConfig.selectedModels.length > 1 || providerConfig.model !== modelId) {
        providerConfig.selectedModels.splice(index, 1)
        if (providerConfig.model === modelId && providerConfig.selectedModels.length > 0) {
          providerConfig.model = providerConfig.selectedModels[0]
        }
      }
    }

    providers[viewingProvider.value] = providerConfig
    updateSettings({ ai: { ...props.settings.ai, providers } })
  }

  // Global default provider and model setters
  function setDefaultProvider(providerId: string) {
    updateSettings({ ai: { ...props.settings.ai, provider: providerId as AIProvider } })
  }

  function setDefaultModel(modelId: string) {
    const defaultProvider = props.settings.ai.provider
    const providers = { ...props.settings.ai.providers }
    const providerConfig = { ...providers[defaultProvider] }
    providerConfig.model = modelId
    providers[defaultProvider] = providerConfig
    updateSettings({ ai: { ...props.settings.ai, providers } })
  }

  function addCustomModel() {
    const modelId = newModelInput.value.trim()
    if (!modelId) return

    const providers = { ...props.settings.ai.providers }
    const providerConfig = { ...providers[viewingProvider.value] }

    if (!providerConfig.selectedModels) {
      providerConfig.selectedModels = []
    } else {
      providerConfig.selectedModels = [...providerConfig.selectedModels]
    }

    if (!providerConfig.selectedModels.includes(modelId)) {
      providerConfig.selectedModels.push(modelId)
    }

    if (!providerConfig.model) {
      providerConfig.model = modelId
    }

    if (!availableModels.value.find(m => m.id === modelId)) {
      settingsStore.addCustomModelToCache(viewingProvider.value, createCustomModel(modelId))
    }

    providers[viewingProvider.value] = providerConfig
    updateSettings({ ai: { ...props.settings.ai, providers } })
    newModelInput.value = ''
  }

  function createCustomModel(modelId: string): OpenRouterModel {
    return {
      id: modelId,
      name: modelId,
      description: 'Custom model',
      context_length: 0,
      architecture: {
        modality: 'text',
        input_modalities: ['text'],
        output_modalities: ['text'],
        tokenizer: 'unknown',
      },
      pricing: { prompt: '0', completion: '0', request: '0', image: '0' },
      top_provider: { context_length: 0, max_completion_tokens: 0, is_moderated: false },
      supported_parameters: [],
    }
  }

  // OAuth functions
  async function checkOAuthStatus() {
    if (!isOAuthProvider.value) return

    try {
      const response = await window.electronAPI.oauthGetStatus(viewingProvider.value)
      if (response.success) {
        oauthStatus.value = {
          isLoggedIn: response.isLoggedIn,
          expiresAt: response.expiresAt,
        }
      }
    } catch (err) {
      console.error('Failed to check OAuth status:', err)
      oauthStatus.value = { isLoggedIn: false }
    }
  }

  async function startOAuthLogin() {
    isOAuthLoading.value = true
    deviceFlowInfo.value = null
    codeEntryInfo.value = null
    manualCode.value = ''
    codeEntryError.value = ''

    try {
      const response = await window.electronAPI.oauthStart(viewingProvider.value)

      if (!response.success) {
        console.error('OAuth start failed:', response.error)
        isOAuthLoading.value = false
        return
      }

      if (response.userCode && response.verificationUri) {
        deviceFlowInfo.value = {
          userCode: response.userCode,
          verificationUri: response.verificationUri,
        }
        await pollDeviceFlow(response.deviceCode!)
      } else if (response.requiresCodeEntry) {
        codeEntryInfo.value = {
          state: response.state || '',
          instructions: response.instructions || 'After authorizing, copy the code from the page and paste it here.',
        }
        isOAuthLoading.value = false
      } else {
        const startTime = Date.now()
        const timeout = 5 * 60 * 1000

        const checkInterval = setInterval(async () => {
          if (Date.now() - startTime > timeout) {
            clearInterval(checkInterval)
            isOAuthLoading.value = false
            return
          }

          await checkOAuthStatus()
          if (oauthStatus.value.isLoggedIn) {
            clearInterval(checkInterval)
            isOAuthLoading.value = false
          }
        }, 2000)
      }
    } catch (err) {
      console.error('OAuth login failed:', err)
      isOAuthLoading.value = false
    }
  }

  async function submitManualCode() {
    if (!manualCode.value.trim() || !codeEntryInfo.value) return

    isSubmittingCode.value = true
    codeEntryError.value = ''

    try {
      const response = await window.electronAPI.oauthCallback(
        viewingProvider.value,
        manualCode.value.trim(),
        codeEntryInfo.value.state
      )

      if (response.success) {
        codeEntryInfo.value = null
        manualCode.value = ''
        await checkOAuthStatus()
      } else {
        codeEntryError.value = response.error || 'Failed to verify code'
      }
    } catch (err: any) {
      codeEntryError.value = err.message || 'Failed to verify code'
    } finally {
      isSubmittingCode.value = false
    }
  }

  async function pollDeviceFlow(deviceCode: string) {
    const pollInterval = 5000
    const maxAttempts = 60

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await window.electronAPI.oauthDevicePoll(viewingProvider.value, deviceCode)

        if (response.success && response.completed) {
          await checkOAuthStatus()
          deviceFlowInfo.value = null
          isOAuthLoading.value = false
          return
        }

        if (response.error === 'authorization_pending') {
          await new Promise(resolve => setTimeout(resolve, pollInterval))
          continue
        }

        if (response.error === 'slow_down') {
          await new Promise(resolve => setTimeout(resolve, pollInterval * 2))
          continue
        }

        if (response.error === 'expired_token' || response.error === 'access_denied') {
          deviceFlowInfo.value = null
          isOAuthLoading.value = false
          return
        }
      } catch (err) {
        console.error('Device flow poll error:', err)
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    deviceFlowInfo.value = null
    isOAuthLoading.value = false
  }

  async function logoutOAuth() {
    try {
      await window.electronAPI.oauthLogout(viewingProvider.value)
      oauthStatus.value = { isLoggedIn: false }
      deviceFlowInfo.value = null
    } catch (err) {
      console.error('OAuth logout failed:', err)
    }
  }

  // Model loading
  async function loadCachedModels() {
    try {
      await settingsStore.fetchModelsForProvider(viewingProvider.value)
    } catch (err) {
      console.error('Failed to load models:', err)
    }
  }

  async function fetchModels(forceRefresh = true) {
    modelError.value = ''

    try {
      const models = forceRefresh
        ? await settingsStore.refreshModelsForProvider(viewingProvider.value)
        : await settingsStore.fetchModelsForProvider(viewingProvider.value)

      if (models.length === 0) {
        modelError.value = 'No models found for this provider'
      }
    } catch (err: any) {
      modelError.value = err.message || 'Failed to fetch models'
    }
  }

  // Lifecycle
  async function initialize() {
    await loadCachedModels()
    await checkOAuthStatus()

    oauthTokenRefreshedCleanup = window.electronAPI.onOAuthTokenRefreshed((data) => {
      if (data.providerId === viewingProvider.value) {
        checkOAuthStatus()
      }
    })

    oauthTokenExpiredCleanup = window.electronAPI.onOAuthTokenExpired((data) => {
      if (data.providerId === viewingProvider.value) {
        oauthStatus.value = { isLoggedIn: false }
      }
    })
  }

  function cleanup() {
    if (oauthTokenRefreshedCleanup) {
      oauthTokenRefreshedCleanup()
    }
    if (oauthTokenExpiredCleanup) {
      oauthTokenExpiredCleanup()
    }
  }

  return {
    // State
    viewingProvider,
    modelSearchQuery,
    newModelInput,
    modelError,
    isOAuthLoading,
    oauthStatus,
    deviceFlowInfo,
    codeEntryInfo,
    manualCode,
    isSubmittingCode,
    codeEntryError,

    // Computed
    availableModels,
    isLoadingModels,
    currentProviderName,
    currentSelectedModels,
    filteredModels,
    isOAuthProvider,
    enabledProviders,
    defaultProviderSelectedModels,
    defaultProviderModel,

    // Methods
    getDefaultBaseUrl,
    isUserCustomProvider,
    isProviderEnabled,
    isModelSelected,
    getModelName,
    hasVision,
    hasImageGeneration,
    hasTools,
    hasReasoning,
    formatContextLength,
    updateProviderApiKey,
    updateProviderBaseUrl,
    updateTemperature,
    toggleProviderEnabled,
    switchViewingProvider,
    toggleModelSelection,
    setDefaultProvider,
    setDefaultModel,
    addCustomModel,
    checkOAuthStatus,
    startOAuthLogin,
    submitManualCode,
    logoutOAuth,
    loadCachedModels,
    fetchModels,
    initialize,
    cleanup,
  }
}

export type ProviderSettingsReturn = ReturnType<typeof useProviderSettings>
