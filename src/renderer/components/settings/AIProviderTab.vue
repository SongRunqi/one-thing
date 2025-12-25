<template>
  <div class="tab-content">
    <!-- Provider Section -->
    <section class="settings-section">
      <h3 class="section-title">Configure Provider</h3>

      <div class="form-group">
        <label class="form-label">Select Provider to Configure</label>
        <div class="custom-select" ref="providerSelectRef">
          <button class="custom-select-trigger" @click="toggleProviderDropdown">
            <span class="select-icon">
              <ProviderIcon :provider="viewingProvider" :size="20" />
            </span>
            <span class="select-text">{{ providers.find(p => p.id === viewingProvider)?.name }}</span>
            <span v-if="isViewingActiveProvider" class="select-badge">Active</span>
            <svg class="select-chevron" :class="{ open: showProviderDropdown }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <div v-if="showProviderDropdown" class="custom-select-dropdown">
            <div
              v-for="provider in providers"
              :key="provider.id"
              :class="['custom-select-option', {
                selected: viewingProvider === provider.id,
                active: settings.ai.provider === provider.id
              }]"
              @click="selectProviderOption(provider.id)"
            >
              <span class="option-icon">
                <ProviderIcon :provider="provider.id" :size="20" />
              </span>
              <div class="option-content">
                <span class="option-name">{{ provider.name }}</span>
                <span class="option-desc">{{ provider.description }}</span>
              </div>
              <!-- Enable toggle for chat model selector -->
              <label
                class="option-enable-toggle"
                :title="isProviderEnabled(provider.id) ? 'Shown in chat' : 'Hidden in chat'"
                @click.stop
              >
                <input
                  type="checkbox"
                  :checked="isProviderEnabled(provider.id)"
                  @change="toggleProviderEnabled(provider.id)"
                />
                <span class="mini-toggle-switch"></span>
              </label>
              <!-- Edit button for custom providers -->
              <button
                v-if="isUserCustomProvider(provider.id)"
                class="option-edit-btn"
                @click.stop="$emit('edit-custom-provider', provider.id)"
                title="Edit provider"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <span v-if="settings.ai.provider === provider.id" class="option-active-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                Active
              </span>
            </div>

            <!-- Add Custom Provider Button -->
            <div class="dropdown-divider"></div>
            <button class="add-provider-btn" @click.stop="$emit('add-custom-provider')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              <span>Add Custom Provider</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Active Provider Toggle -->
      <div class="active-provider-toggle">
        <label class="toggle-label">
          <input
            type="checkbox"
            :checked="isViewingActiveProvider"
            @change="setActiveProvider(viewingProvider)"
            :disabled="isViewingActiveProvider"
          />
          <span class="toggle-switch"></span>
          <span class="toggle-text">
            {{ isViewingActiveProvider ? 'Active provider for chat' : 'Set as active provider' }}
          </span>
        </label>
        <p v-if="!isViewingActiveProvider" class="form-hint" style="margin-top: 4px;">
          Currently using: {{ providers.find(p => p.id === settings.ai.provider)?.name }}
        </p>
      </div>
    </section>

    <!-- API Configuration -->
    <section class="settings-section">
      <h3 class="section-title">API Configuration</h3>

      <div class="form-group">
        <label class="form-label">
          API Key
          <span class="label-hint">Required for {{ currentProviderName }}</span>
        </label>
        <div class="input-wrapper">
          <input
            :value="settings.ai.providers[viewingProvider]?.apiKey"
            @input="updateProviderApiKey(($event.target as HTMLInputElement).value)"
            :type="showApiKey ? 'text' : 'password'"
            class="form-input"
            :placeholder="`Enter your ${currentProviderName} API key...`"
          />
          <button class="input-action" @click="showApiKey = !showApiKey" type="button">
            <svg v-if="showApiKey" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
            <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Base URL</label>
        <input
          :value="settings.ai.providers[viewingProvider]?.baseUrl"
          @input="updateProviderBaseUrl(($event.target as HTMLInputElement).value)"
          type="text"
          class="form-input"
          :placeholder="getDefaultBaseUrl()"
        />
        <p class="form-hint">Leave empty to use default endpoint</p>
      </div>
    </section>

    <!-- Model Selection -->
    <section class="settings-section" ref="modelSectionRef">
      <h3 class="section-title collapsible" @click="toggleModelSection">
        <div class="title-left">
          <svg
            class="collapse-chevron"
            :class="{ expanded: isModelSectionExpanded }"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <span>Models</span>
          <span class="selected-count">({{ currentSelectedModels.length }} selected)</span>
        </div>
        <div class="title-actions" @click.stop>
          <span v-if="modelInfo" class="model-info">{{ modelInfo }}</span>
          <button
            class="refresh-btn"
            @click="fetchModels(true)"
            :disabled="isLoadingModels"
            title="Refresh models from API"
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
      </h3>

      <div class="collapsible-wrapper" :class="{ expanded: isModelSectionExpanded }">
      <div class="collapsible-inner">
        <p class="section-hint">Select models to enable for quick switching in chat. Click to toggle.</p>

      <div v-if="modelError" class="error-message">
        {{ modelError }}
      </div>

      <!-- Search box -->
      <div v-if="availableModels.length > 0" class="model-search">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
          title="Clear search"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- No search results message -->
      <div v-if="modelSearchQuery && filteredModels.length === 0" class="no-results">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <span>No models match "{{ modelSearchQuery }}"</span>
      </div>

      <div v-if="filteredModels.length > 0" class="model-grid">
        <div
          v-for="model in filteredModels"
          :key="model.id"
          :class="['model-card', 'selectable', {
            selected: isModelSelected(model.id),
            active: settings.ai.providers[viewingProvider]?.model === model.id
          }]"
          @click="toggleModelSelection(model.id)"
        >
          <div class="model-check">
            <svg v-if="isModelSelected(model.id)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <div class="model-info-content">
            <div class="model-name">
              {{ model.name || model.id }}
              <span v-if="model.type && model.type !== 'chat'" class="model-type-badge" :class="model.type">
                {{ model.type }}
              </span>
            </div>
            <div v-if="model.description" class="model-desc">{{ model.description }}</div>
          </div>
          <div v-if="settings.ai.providers[viewingProvider]?.model === model.id" class="model-active-badge">
            Active
          </div>
        </div>
      </div>

      <div v-else class="form-group">
        <label class="form-label">Add Model</label>
        <div class="add-model-row">
          <input
            v-model="newModelInput"
            type="text"
            class="form-input"
            placeholder="e.g., gpt-4, claude-3-opus"
            @keydown.enter="addCustomModel"
          />
          <button class="add-model-btn" @click="addCustomModel" :disabled="!newModelInput.trim()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        </div>
        <p class="form-hint">Enter model name or click Refresh to fetch available models</p>
      </div>

      <!-- Selected models list when no available models -->
      <!-- Always show selected models with remove buttons -->
      <div v-if="currentSelectedModels.length > 0" class="selected-models-list">
        <div class="form-label">Selected Models ({{ currentSelectedModels.length }})</div>
        <div class="selected-model-chips">
          <div
            v-for="model in currentSelectedModels"
            :key="model"
            :class="['model-chip', { active: settings.ai.providers[viewingProvider]?.model === model }]"
          >
            <span>{{ getModelDisplayName(model) }}</span>
            <button class="chip-remove" @click.stop="removeSelectedModel(model)" title="Remove model">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
      </div><!-- end collapsible-inner -->
      </div><!-- end collapsible-wrapper -->
    </section>

    <!-- Advanced Settings -->
    <section class="settings-section">
      <h3 class="section-title">Advanced</h3>

      <div class="form-group">
        <label class="form-label">
          Temperature
          <span class="label-value">{{ settings.ai.temperature.toFixed(1) }}</span>
        </label>
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
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { AppSettings, AIProvider, ModelInfo, ProviderInfo } from '@/types'
import { useSettingsStore } from '@/stores/settings'
import ProviderIcon from './ProviderIcon.vue'

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
const showProviderDropdown = ref(false)
const providerSelectRef = ref<HTMLElement | null>(null)
const isModelSectionExpanded = ref(false)
const modelSectionRef = ref<HTMLElement | null>(null)
const modelSearchQuery = ref('')
const newModelInput = ref('')

// Model loading state
const availableModels = ref<ModelInfo[]>([])
const isLoadingModels = ref(false)
const modelError = ref('')
const modelInfo = ref('')

// Viewing provider (can be different from active provider)
const viewingProvider = ref<string>(props.settings.ai.provider)

// Watch for settings changes to sync viewingProvider
watch(() => props.settings.ai.provider, (newProvider) => {
  if (!showProviderDropdown.value) {
    viewingProvider.value = newProvider
  }
})

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

// Get display name for a model (from availableModels or just the id)
function getModelDisplayName(modelId: string): string {
  const model = availableModels.value.find(m => m.id === modelId)
  return model?.name || modelId
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

// Provider dropdown
function toggleProviderDropdown() {
  showProviderDropdown.value = !showProviderDropdown.value
}

async function selectProviderOption(provider: string) {
  showProviderDropdown.value = false
  await switchViewingProvider(provider)
}

async function switchViewingProvider(provider: string) {
  viewingProvider.value = provider
  availableModels.value = []
  modelError.value = ''
  modelInfo.value = ''
  modelSearchQuery.value = ''
  await loadCachedModels()
}

function handleProviderDropdownClickOutside(event: MouseEvent) {
  if (providerSelectRef.value && !providerSelectRef.value.contains(event.target as Node)) {
    showProviderDropdown.value = false
  }
}

// Model section
function toggleModelSection() {
  isModelSectionExpanded.value = !isModelSectionExpanded.value
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

  // Also add to availableModels so it shows in the grid
  if (!availableModels.value.find(m => m.id === modelId)) {
    availableModels.value = [
      ...availableModels.value,
      { id: modelId, name: modelId, description: 'Custom model' }
    ]
  }

  providers[viewingProvider.value] = providerConfig
  updateSettings({ ai: { ...props.settings.ai, providers } })
  newModelInput.value = ''
}

function removeSelectedModel(modelId: string) {
  const providers = { ...props.settings.ai.providers }
  const providerConfig = { ...providers[viewingProvider.value] }

  if (!providerConfig.selectedModels) return

  providerConfig.selectedModels = providerConfig.selectedModels.filter(m => m !== modelId)

  if (providerConfig.model === modelId && providerConfig.selectedModels.length > 0) {
    providerConfig.model = providerConfig.selectedModels[0]
  }

  providers[viewingProvider.value] = providerConfig
  updateSettings({ ai: { ...props.settings.ai, providers } })
}

// Model loading
async function loadCachedModels() {
  try {
    const response = await window.electronAPI.getCachedModels(viewingProvider.value as AIProvider)
    let models: ModelInfo[] = []

    if (response.success && response.models && response.models.length > 0) {
      models = [...response.models]
      if (response.cachedAt) {
        const cachedDate = new Date(response.cachedAt)
        modelInfo.value = `Cached: ${cachedDate.toLocaleDateString()} ${cachedDate.toLocaleTimeString()}`
      }
    }

    // Also include any selected models that aren't in the available list (custom models)
    const selectedModels = props.settings.ai.providers[viewingProvider.value]?.selectedModels || []
    for (const modelId of selectedModels) {
      if (!models.find(m => m.id === modelId)) {
        models.push({ id: modelId, name: modelId, description: 'Custom model' })
      }
    }

    availableModels.value = models
  } catch (err) {
    console.error('Failed to load cached models:', err)
  }
}

async function fetchModels(forceRefresh = true) {
  const providerConfig = props.settings.ai.providers[viewingProvider.value]
  const apiKey = providerConfig?.apiKey || ''

  if (viewingProvider.value !== 'claude' && !apiKey) {
    modelError.value = 'Please enter an API key first'
    return
  }

  isLoadingModels.value = true
  modelError.value = ''
  modelInfo.value = ''

  try {
    const baseUrl = providerConfig?.baseUrl || getDefaultBaseUrl()
    const response = await window.electronAPI.fetchModels(viewingProvider.value as AIProvider, apiKey, baseUrl, forceRefresh)

    if (response.success && response.models) {
      let models = [...response.models]

      // Also include any selected models that aren't in the available list (custom models)
      const selectedModels = props.settings.ai.providers[viewingProvider.value]?.selectedModels || []
      for (const modelId of selectedModels) {
        if (!models.find(m => m.id === modelId)) {
          models.push({ id: modelId, name: modelId, description: 'Custom model' })
        }
      }

      availableModels.value = models

      if (response.fromCache) {
        const cached = await window.electronAPI.getCachedModels(viewingProvider.value as AIProvider)
        if (cached.cachedAt) {
          const cachedDate = new Date(cached.cachedAt)
          modelInfo.value = `From cache: ${cachedDate.toLocaleDateString()} ${cachedDate.toLocaleTimeString()}`
        }
      } else {
        modelInfo.value = 'Fetched from API'
      }

      if (response.error) {
        modelError.value = response.error
      }
    } else {
      modelError.value = response.error || 'Failed to fetch models'
    }

    if (availableModels.value.length === 0) {
      modelError.value = 'No models found'
    }
  } catch (err: any) {
    modelError.value = err.message || 'Failed to fetch models'
  } finally {
    isLoadingModels.value = false
  }
}

onMounted(async () => {
  await loadCachedModels()
  document.addEventListener('click', handleProviderDropdownClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleProviderDropdownClickOutside)
})
</script>

<style scoped>
.tab-content {
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.settings-section {
  margin-bottom: 32px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  opacity: 0.8;
}

.section-title.collapsible {
  cursor: pointer;
  user-select: none;
}

.section-title.collapsible:hover {
  opacity: 1;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.collapse-chevron {
  transition: transform 0.2s ease;
}

.collapse-chevron.expanded {
  transform: rotate(90deg);
}

.selected-count {
  color: var(--accent);
  font-weight: 600;
}

.title-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-info {
  font-size: 10px;
  color: var(--text-muted);
  font-weight: 400;
}

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  font-size: 11px;
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

/* Collapsible wrapper */
.collapsible-wrapper {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.25s ease;
}

.collapsible-wrapper.expanded {
  grid-template-rows: 1fr;
}

.collapsible-inner {
  overflow: hidden;
}

.section-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 0 12px 0;
}

.form-group {
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.label-hint {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 400;
}

.label-value {
  margin-left: auto;
  color: var(--accent);
  font-weight: 600;
}

.form-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--hover);
  color: var(--text-primary);
  font-size: 13px;
  transition: all 0.15s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.form-input::placeholder {
  color: var(--text-muted);
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-wrapper .form-input {
  padding-right: 44px;
}

.input-action {
  position: absolute;
  right: 8px;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 6px;
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

/* Custom Select */
.custom-select {
  position: relative;
}

.custom-select-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--hover);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.custom-select-trigger:hover {
  border-color: rgba(59, 130, 246, 0.3);
}

.select-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
}

.select-text {
  flex: 1;
  text-align: left;
  font-weight: 500;
}

.select-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  font-weight: 600;
}

.select-chevron {
  color: var(--text-muted);
  transition: transform 0.2s ease;
}

.select-chevron.open {
  transform: rotate(180deg);
}

.custom-select-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
  z-index: 100;
  max-height: 320px;
  overflow-y: auto;
}

.custom-select-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.custom-select-option:first-child {
  border-radius: 12px 12px 0 0;
}

.custom-select-option:hover {
  background: var(--hover);
}

.custom-select-option.selected {
  background: rgba(59, 130, 246, 0.1);
}

.option-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.option-content {
  flex: 1;
  min-width: 0;
}

.option-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.option-desc {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.option-enable-toggle {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.option-enable-toggle input {
  display: none;
}

.mini-toggle-switch {
  width: 28px;
  height: 16px;
  background: var(--border);
  border-radius: 8px;
  position: relative;
  transition: background 0.2s ease;
}

.mini-toggle-switch::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.2s ease;
}

.option-enable-toggle input:checked + .mini-toggle-switch {
  background: var(--accent);
}

.option-enable-toggle input:checked + .mini-toggle-switch::after {
  transform: translateX(12px);
}

.option-edit-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.option-edit-btn:hover {
  background: var(--hover);
  color: var(--accent);
}

.option-active-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  font-weight: 600;
}

.dropdown-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}

.add-provider-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 14px;
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  border-radius: 0 0 12px 12px;
}

.add-provider-btn:hover {
  background: rgba(59, 130, 246, 0.1);
}

/* Active Provider Toggle */
.active-provider-toggle {
  margin-top: 12px;
  padding: 12px;
  background: var(--hover);
  border-radius: 10px;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.toggle-label input {
  display: none;
}

.toggle-switch {
  width: 36px;
  height: 20px;
  background: var(--border);
  border-radius: 10px;
  position: relative;
  transition: background 0.2s ease;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.2s ease;
}

.toggle-label input:checked + .toggle-switch {
  background: var(--accent);
}

.toggle-label input:checked + .toggle-switch::after {
  transform: translateX(16px);
}

.toggle-label input:disabled + .toggle-switch {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggle-text {
  font-size: 13px;
  color: var(--text-primary);
}

/* Model Search */
.model-search {
  position: relative;
  margin-bottom: 12px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}

.search-input {
  width: 100%;
  padding: 10px 36px 10px 36px;
  border: 1px solid var(--border);
  border-radius: 10px;
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
  transition: all 0.15s ease;
}

.search-clear:hover {
  background: var(--hover);
  color: var(--text-primary);
}

.no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: var(--text-muted);
  text-align: center;
}

.error-message {
  padding: 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 8px;
  color: #ef4444;
  font-size: 13px;
  margin-bottom: 12px;
}

/* Model Grid */
.model-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}

.model-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--hover);
  cursor: pointer;
  transition: all 0.15s ease;
}

.model-card:hover {
  border-color: rgba(59, 130, 246, 0.3);
}

.model-card.selected {
  border-color: var(--accent);
  background: rgba(59, 130, 246, 0.1);
}

.model-card.active {
  box-shadow: 0 0 0 2px var(--accent);
}

.model-check {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.model-card.selected .model-check {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.model-info-content {
  flex: 1;
  min-width: 0;
}

.model-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  word-break: break-word;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.model-type-badge {
  font-size: 9px;
  padding: 2px 5px;
  border-radius: 4px;
  font-weight: 600;
  text-transform: uppercase;
}

.model-type-badge.image {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
}

.model-type-badge.embedding {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.model-type-badge.audio {
  background: rgba(249, 115, 22, 0.15);
  color: #f97316;
}

.model-type-badge.tts {
  background: rgba(236, 72, 153, 0.15);
  color: #ec4899;
}

.model-type-badge.other {
  background: rgba(107, 114, 128, 0.15);
  color: #6b7280;
}

.model-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.model-active-badge {
  font-size: 9px;
  padding: 2px 4px;
  border-radius: 3px;
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  font-weight: 600;
  flex-shrink: 0;
}

/* Add Model Row */
.add-model-row {
  display: flex;
  gap: 8px;
}

.add-model-row .form-input {
  flex: 1;
}

.add-model-btn {
  width: 40px;
  height: 40px;
  border: 1px solid var(--accent);
  background: transparent;
  border-radius: 10px;
  color: var(--accent);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.add-model-btn:hover:not(:disabled) {
  background: var(--accent);
  color: white;
}

.add-model-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Selected Models List */
.selected-models-list {
  margin-top: 16px;
}

.selected-model-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.model-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-primary);
}

.model-chip.active {
  border-color: var(--accent);
  background: rgba(59, 130, 246, 0.1);
}

.chip-remove {
  width: 16px;
  height: 16px;
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

.chip-remove:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
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
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-muted);
}

/* Responsive */
@media (max-width: 480px) {
  .model-grid {
    grid-template-columns: 1fr;
  }

  .custom-select-trigger {
    padding: 10px 12px;
  }

  .active-provider-toggle {
    padding: 10px;
  }
}
</style>
