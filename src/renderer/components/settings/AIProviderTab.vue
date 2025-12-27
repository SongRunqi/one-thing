<template>
  <div class="provider-tab-wrapper">
    <!-- Global Default Selector -->
    <div class="global-default-section">
      <div class="global-default-header">
        <svg class="default-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        <span class="default-label">Default Model</span>
      </div>
      <div class="global-default-selectors">
        <div class="selector-group">
          <label class="selector-label">Provider</label>
          <select
            class="global-select"
            :value="settings.ai.provider"
            @change="setDefaultProvider(($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="provider in enabledProviders"
              :key="provider.id"
              :value="provider.id"
            >
              {{ provider.name }}
            </option>
          </select>
        </div>
        <div class="selector-group">
          <label class="selector-label">Model</label>
          <select
            class="global-select"
            :value="defaultProviderModel"
            @change="setDefaultModel(($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="modelId in defaultProviderSelectedModels"
              :key="modelId"
              :value="modelId"
            >
              {{ getModelName(modelId) }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="provider-tab">
      <!-- Left: Provider List -->
      <aside class="provider-list">
      <div
        v-for="provider in providers"
        :key="provider.id"
        :class="['provider-item', { active: viewingProvider === provider.id }]"
        @click="switchViewingProvider(provider.id)"
      >
        <ProviderIcon :provider="provider.id" :size="18" />
        <span class="provider-name">{{ provider.name }}</span>
        <span v-if="isProviderEnabled(provider.id)" class="enabled-indicator" title="Enabled in chat"></span>
        <button
          v-if="isUserCustomProvider(provider.id)"
          class="provider-edit-btn"
          @click.stop="$emit('edit-custom-provider', provider.id)"
          title="Edit provider"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </div>

      <div class="provider-list-divider"></div>
      <button class="add-provider-btn" @click="$emit('add-custom-provider')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        <span>Add Custom</span>
      </button>
    </aside>

    <!-- Right: Provider Detail -->
    <main class="provider-detail">
      <!-- Header -->
      <div class="detail-header">
        <h2 class="detail-title">{{ currentProviderName }}</h2>
        <div class="header-actions">
          <label class="enable-toggle" :title="isProviderEnabled(viewingProvider) ? 'Enabled in chat' : 'Disabled in chat'">
            <input
              type="checkbox"
              :checked="isProviderEnabled(viewingProvider)"
              @change="toggleProviderEnabled(viewingProvider)"
            />
            <span class="toggle-switch"></span>
            <span class="toggle-text">{{ isProviderEnabled(viewingProvider) ? 'Enabled' : 'Disabled' }}</span>
          </label>
        </div>
      </div>

      <!-- API Configuration -->
      <section class="detail-section">
        <h3 class="section-title">API Configuration</h3>

        <!-- OAuth Provider Login -->
        <template v-if="isOAuthProvider">
          <div class="oauth-section">
            <template v-if="!oauthStatus.isLoggedIn">
              <button class="oauth-login-btn" @click="startOAuthLogin" :disabled="isOAuthLoading">
                <ProviderIcon :provider="viewingProvider" :size="18" />
                <span>{{ isOAuthLoading ? 'Connecting...' : `Login with ${currentProviderName}` }}</span>
              </button>

              <!-- Device Flow Code Display (for GitHub Copilot) -->
              <div v-if="deviceFlowInfo" class="device-flow-info">
                <p>Enter this code at:</p>
                <a :href="deviceFlowInfo.verificationUri" target="_blank" class="device-flow-link">
                  {{ deviceFlowInfo.verificationUri }}
                </a>
                <div class="device-code">{{ deviceFlowInfo.userCode }}</div>
                <p class="device-flow-hint">Waiting for authorization...</p>
              </div>

              <!-- Manual Code Entry (for Claude Code) -->
              <div v-if="codeEntryInfo" class="code-entry-info">
                <p>{{ codeEntryInfo.instructions }}</p>
                <div class="code-entry-form">
                  <input
                    v-model="manualCode"
                    type="text"
                    class="form-input code-input"
                    placeholder="Paste authorization code here..."
                    @keydown.enter="submitManualCode"
                  />
                  <button
                    class="submit-code-btn"
                    @click="submitManualCode"
                    :disabled="!manualCode.trim() || isSubmittingCode"
                  >
                    {{ isSubmittingCode ? 'Verifying...' : 'Submit' }}
                  </button>
                </div>
                <p v-if="codeEntryError" class="code-entry-error">{{ codeEntryError }}</p>
              </div>
            </template>

            <template v-else>
              <div class="oauth-logged-in">
                <div class="oauth-status">
                  <svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                  <span>Connected to {{ currentProviderName }}</span>
                </div>
                <button class="oauth-logout-btn" @click="logoutOAuth">
                  Disconnect
                </button>
              </div>
            </template>
          </div>
        </template>

        <!-- Traditional API Key Input -->
        <template v-else>
          <div class="form-group">
            <label class="form-label">API Key</label>
            <div class="input-wrapper">
              <input
                :value="settings.ai.providers[viewingProvider]?.apiKey"
                @input="updateProviderApiKey(($event.target as HTMLInputElement).value)"
                :type="showApiKey ? 'text' : 'password'"
                class="form-input"
                :placeholder="`Enter your ${currentProviderName} API key...`"
              />
              <button class="input-action" @click="showApiKey = !showApiKey" type="button">
                <svg v-if="showApiKey" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Base URL <span class="label-hint">(Optional)</span></label>
            <input
              :value="settings.ai.providers[viewingProvider]?.baseUrl"
              @input="updateProviderBaseUrl(($event.target as HTMLInputElement).value)"
              type="text"
              class="form-input"
              :placeholder="getDefaultBaseUrl()"
            />
          </div>
        </template>
      </section>

      <!-- Models Section -->
      <section class="detail-section">
        <div class="section-header">
          <h3 class="section-title">Models <span class="count-badge">{{ currentSelectedModels.length }} selected</span></h3>
          <button
            class="refresh-btn"
            @click="fetchModels(true)"
            :disabled="isLoadingModels"
          >
            <svg
              :class="{ spinning: isLoadingModels }"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M23 4v6h-6M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            {{ isLoadingModels ? 'Loading...' : 'Refresh' }}
          </button>
        </div>

        <div v-if="modelError" class="error-message">
          {{ modelError }}
        </div>

        <!-- Search box -->
        <div v-if="availableModels.length > 0" class="model-search">
          <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            v-model="modelSearchQuery"
            type="text"
            class="search-input"
            placeholder="Search models..."
          />
          <button
            v-if="modelSearchQuery"
            class="search-clear"
            @click="modelSearchQuery = ''"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Model List -->
        <div v-if="filteredModels.length > 0" class="model-list">
          <label
            v-for="model in filteredModels"
            :key="model.id"
            :class="['model-row', { selected: isModelSelected(model.id) }]"
            @click="toggleModelSelection(model.id)"
          >
            <span class="model-checkbox">
              <svg v-if="isModelSelected(model.id)" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </span>
            <span class="model-name">{{ model.name || model.id }}</span>
            <span class="model-caps">
              <Eye v-if="hasVision(model)" :size="12" title="Vision" />
              <Image v-if="hasImageGeneration(model)" :size="12" title="Image Generation" />
              <Wrench v-if="hasTools(model)" :size="12" title="Tool Use" />
              <Brain v-if="hasReasoning(model)" :size="12" title="Reasoning" />
            </span>
            <span class="model-context">{{ formatContextLength(model.context_length) }}</span>
          </label>
        </div>

        <!-- No results -->
        <div v-else-if="modelSearchQuery" class="no-results">
          No models match "{{ modelSearchQuery }}"
        </div>

        <!-- Add custom model -->
        <div v-else class="add-model-section">
          <div class="add-model-row">
            <input
              v-model="newModelInput"
              type="text"
              class="form-input"
              placeholder="Enter model ID (e.g., gpt-4o)"
              @keydown.enter="addCustomModel"
            />
            <button class="add-model-btn" @click="addCustomModel" :disabled="!newModelInput.trim()">
              Add
            </button>
          </div>
          <p class="form-hint">Enter model name or click Refresh to fetch available models</p>
        </div>
      </section>

      <!-- Temperature Section -->
      <section class="detail-section">
        <h3 class="section-title">
          Temperature
          <span class="temp-value">{{ settings.ai.temperature.toFixed(1) }}</span>
        </h3>
        <input
          :value="settings.ai.temperature"
          @input="updateTemperature(($event.target as HTMLInputElement).valueAsNumber)"
          type="range"
          min="0"
          max="2"
          step="0.1"
          class="form-slider"
        />
        <div class="slider-labels">
          <span>Precise</span>
          <span>Creative</span>
        </div>
      </section>
    </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { AppSettings, AIProvider, ProviderInfo, OpenRouterModel } from '@/types'
import { useSettingsStore } from '@/stores/settings'
import ProviderIcon from './ProviderIcon.vue'
import { Eye, Image, Wrench, Brain, Check } from 'lucide-vue-next'

const props = defineProps<{
  settings: AppSettings
  providers: ProviderInfo[]
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
  'add-custom-provider': []
  'edit-custom-provider': [providerId: string]
}>()

const settingsStore = useSettingsStore()

// Local state
const showApiKey = ref(false)
const modelSearchQuery = ref('')
const newModelInput = ref('')
const modelError = ref('')

// OAuth state
const isOAuthLoading = ref(false)
const oauthStatus = ref<{ isLoggedIn: boolean; expiresAt?: number }>({ isLoggedIn: false })
const deviceFlowInfo = ref<{ userCode: string; verificationUri: string } | null>(null)
const devicePollInterval = ref<number | null>(null)
const codeEntryInfo = ref<{ state: string; instructions: string } | null>(null)
const manualCode = ref('')
const isSubmittingCode = ref(false)
const codeEntryError = ref('')

// Viewing provider (can be different from active provider)
const viewingProvider = ref<string>(props.settings.ai.provider)

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

const isViewingActiveProvider = computed(() => {
  return viewingProvider.value === props.settings.ai.provider
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

function hasVision(model: OpenRouterModel): boolean {
  return model.architecture?.input_modalities?.includes('image') ?? false
}

function hasImageGeneration(model: OpenRouterModel): boolean {
  // Check if model can generate images (DALL-E, Imagen, etc.)
  if (model.architecture?.output_modalities?.includes('image')) {
    return true
  }
  // Fallback: check model ID for known image generation models
  const imageGenIndicators = ['dall-e', 'dalle', 'gpt-image', 'imagen', 'stable-diffusion', 'midjourney']
  return imageGenIndicators.some(indicator =>
    model.id.toLowerCase().includes(indicator)
  )
}

function hasTools(model: OpenRouterModel): boolean {
  return model.supported_parameters?.includes('tools') ?? false
}

function hasReasoning(model: OpenRouterModel): boolean {
  // Check supported_parameters first
  if (model.supported_parameters?.includes('reasoning')) {
    return true
  }
  // Fallback: check model ID for known reasoning models (o1, o3, etc.)
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

function setActiveProvider(provider: string) {
  updateSettings({ ai: { ...props.settings.ai, provider: provider as AIProvider } })
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
  // Set model for the global default provider
  const defaultProvider = props.settings.ai.provider
  const providers = { ...props.settings.ai.providers }
  const providerConfig = { ...providers[defaultProvider] }
  providerConfig.model = modelId
  providers[defaultProvider] = providerConfig
  updateSettings({ ai: { ...props.settings.ai, providers } })
}

function getModelName(modelId: string): string {
  // First check current viewing provider's models
  const model = availableModels.value.find(m => m.id === modelId)
  if (model?.name) return model.name
  // Then try store's display name
  return settingsStore.getModelDisplayName(modelId) || modelId
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

  // Add to store cache if not exists
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

// Model loading - uses unified store
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

// OAuth event cleanup refs
let oauthTokenRefreshedCleanup: (() => void) | null = null
let oauthTokenExpiredCleanup: (() => void) | null = null

onMounted(async () => {
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
})

onUnmounted(() => {
  if (oauthTokenRefreshedCleanup) {
    oauthTokenRefreshedCleanup()
  }
  if (oauthTokenExpiredCleanup) {
    oauthTokenExpiredCleanup()
  }

  if (devicePollInterval.value) {
    clearInterval(devicePollInterval.value)
  }
})
</script>

<style scoped>
/* Wrapper for the entire tab */
.provider-tab-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
  overflow: hidden;
}

/* Global Default Section */
.global-default-section {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 16px;
  background: linear-gradient(135deg,
    rgba(var(--accent-rgb), 0.08) 0%,
    rgba(var(--accent-rgb), 0.02) 100%
  );
  border: 1px solid rgba(var(--accent-rgb), 0.15);
  border-radius: 10px;
  flex-shrink: 0;
}

.global-default-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.default-icon {
  color: var(--accent);
}

.default-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.global-default-selectors {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.selector-group {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.selector-group:last-child {
  flex: 1;
  min-width: 0;
}

.selector-group .selector-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.global-select {
  padding: 6px 28px 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  transition: all 0.15s ease;
  min-width: 0;
  max-width: 100%;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.selector-group:first-child .global-select {
  min-width: 120px;
}

.selector-group:last-child .global-select {
  flex: 1;
  min-width: 0;
}

.global-select:hover {
  border-color: var(--accent);
}

.global-select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.1);
}

.global-select option {
  padding: 8px;
  background: var(--bg);
  color: var(--text-primary);
}

/* Main Content */
.provider-tab {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Left: Provider List */
.provider-list {
  width: 200px;
  min-width: 200px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.provider-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  transition: all 0.15s ease;
  position: relative;
}

.provider-item:hover {
  background: var(--hover);
}

.provider-item.active {
  background: var(--accent);
  color: white;
}

.provider-item.active .provider-edit-btn {
  color: rgba(255, 255, 255, 0.7);
}

.provider-item.active .provider-edit-btn:hover {
  color: white;
  background: rgba(255, 255, 255, 0.15);
}

.provider-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.enabled-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}

.provider-item.active .enabled-indicator {
  background: rgba(255, 255, 255, 0.5);
}

.provider-edit-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.15s ease;
}

.provider-item:hover .provider-edit-btn {
  opacity: 1;
}

.provider-edit-btn:hover {
  background: var(--hover);
  color: var(--accent);
}

.provider-list-divider {
  height: 1px;
  background: var(--border);
  margin: 8px 0;
}

.add-provider-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-provider-btn:hover {
  background: rgba(59, 130, 246, 0.1);
}

/* Right: Provider Detail */
.provider-detail {
  flex: 1;
  background: var(--bg);
  padding: 16px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.detail-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.enable-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.enable-toggle input {
  display: none;
}

.toggle-switch {
  width: 32px;
  height: 18px;
  background: var(--border);
  border-radius: 9px;
  position: relative;
  transition: background 0.2s ease;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.2s ease;
}

.enable-toggle input:checked + .toggle-switch {
  background: var(--accent);
}

.enable-toggle input:checked + .toggle-switch::after {
  transform: translateX(14px);
}

.toggle-text {
  font-size: 12px;
  color: var(--text-muted);
}

.set-active-btn {
  padding: 6px 12px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.set-active-btn:hover {
  background: var(--accent);
  color: white;
}

.active-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  font-size: 12px;
  font-weight: 600;
}

/* Detail Sections */
.detail-section {
  margin-bottom: 20px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.section-header .section-title {
  margin-bottom: 0;
}

.count-badge {
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
}

.temp-value {
  margin-left: auto;
  color: var(--accent);
  font-weight: 600;
}

/* Form Elements */
.form-group {
  margin-bottom: 12px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.label-hint {
  font-weight: 400;
  opacity: 0.7;
}

.form-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--hover);
  color: var(--text-primary);
  font-size: 13px;
  transition: all 0.15s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-input::placeholder {
  color: var(--text-muted);
}

.form-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 6px;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-wrapper .form-input {
  padding-right: 40px;
}

.input-action {
  position: absolute;
  right: 8px;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.input-action:hover {
  background: var(--hover);
  color: var(--text-primary);
}

/* Refresh Button */
.refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.refresh-btn:hover:not(:disabled) {
  background: var(--hover);
  color: var(--text-primary);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.refresh-btn svg.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Model Search */
.model-search {
  position: relative;
  margin-bottom: 8px;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}

.search-input {
  width: 100%;
  padding: 8px 32px 8px 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--hover);
  color: var(--text-primary);
  font-size: 13px;
  transition: all 0.15s ease;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-clear:hover {
  background: var(--hover);
  color: var(--text-primary);
}

/* Model List */
.model-list {
  border-radius: 8px;
  overflow: hidden;
  max-height: 280px;
  overflow-y: auto;
}

.model-list::-webkit-scrollbar {
  width: 6px;
}

.model-list::-webkit-scrollbar-track {
  background: transparent;
}

.model-list::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 3px;
  transition: background 0.2s;
}

.model-list:hover::-webkit-scrollbar-thumb {
  background: var(--border);
}

.model-list::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

.model-row {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  gap: 10px;
  border-radius: 6px;
  margin-bottom: 2px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.1s ease;
}

.model-row:last-child {
  margin-bottom: 0;
}

.model-row:hover {
  background: var(--hover);
}

.model-row.selected {
  background: rgba(59, 130, 246, 0.08);
}

.model-checkbox {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.model-row.selected .model-checkbox {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.model-name {
  flex: 1;
  font-weight: 500;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-caps {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  color: var(--text-muted);
}

.model-context {
  color: var(--text-muted);
  font-size: 11px;
  min-width: 40px;
  text-align: right;
  flex-shrink: 0;
}

.no-results {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.error-message {
  padding: 10px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 6px;
  color: #ef4444;
  font-size: 12px;
  margin-bottom: 12px;
}

/* Add Model Section */
.add-model-section {
  padding: 16px;
  background: var(--hover);
  border-radius: 8px;
}

.add-model-row {
  display: flex;
  gap: 8px;
}

.add-model-row .form-input {
  flex: 1;
}

.add-model-btn {
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-model-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.add-model-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Slider */
.form-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--border);
  cursor: pointer;
  -webkit-appearance: none;
}

.form-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-muted);
}

/* OAuth Section */
.oauth-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.oauth-login-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--hover);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.oauth-login-btn:hover:not(:disabled) {
  border-color: var(--accent);
  background: rgba(59, 130, 246, 0.1);
}

.oauth-login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.device-flow-info,
.code-entry-info {
  padding: 16px;
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 8px;
  text-align: center;
}

.device-flow-info p,
.code-entry-info p {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: var(--text-muted);
}

.device-flow-link {
  color: var(--accent);
  text-decoration: none;
  font-size: 13px;
}

.device-flow-link:hover {
  text-decoration: underline;
}

.device-code {
  margin: 12px 0;
  padding: 12px 20px;
  background: var(--bg-elevated);
  border-radius: 6px;
  font-size: 20px;
  font-weight: 700;
  font-family: monospace;
  letter-spacing: 0.1em;
  color: var(--accent);
}

.device-flow-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin: 0;
}

.code-entry-form {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.code-entry-form .code-input {
  flex: 1;
  font-family: monospace;
  text-align: center;
}

.submit-code-btn {
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.submit-code-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.submit-code-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.code-entry-error {
  margin-top: 8px;
  padding: 8px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 4px;
  color: #ef4444;
  font-size: 12px;
}

.oauth-logged-in {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.2);
  border-radius: 8px;
}

.oauth-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #22c55e;
}

.check-icon {
  color: #22c55e;
}

.oauth-logout-btn {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.oauth-logout-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}
</style>
