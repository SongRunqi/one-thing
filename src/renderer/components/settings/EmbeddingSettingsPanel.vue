<template>
  <div class="tab-content">
    <!-- Memory Hero Section -->
    <section class="hero-section">
      <div class="hero-content">
        <div class="hero-icon" :class="{ active: isMemoryEnabled }">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.54"/>
            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.54"/>
          </svg>
        </div>
        <div class="hero-text">
          <h2 class="hero-title">Memory</h2>
          <p class="hero-desc">让 AI 记住对话上下文，提供更个性化的回复</p>
        </div>
        <label class="memory-toggle">
          <input
            type="checkbox"
            :checked="isMemoryEnabled"
            @change="toggleMemory"
          />
          <span class="memory-toggle-track"></span>
        </label>
      </div>

      <div class="status-bar" :class="{ active: isMemoryEnabled }">
        <span class="status-dot"></span>
        <span class="status-text">{{ isMemoryEnabled ? '已启用' : '已关闭' }}</span>
      </div>
    </section>

    <!-- Settings Content - Two Column Layout -->
    <Transition name="fade-slide">
      <div v-if="isMemoryEnabled" class="settings-content">
        <div class="panel-content">
          <!-- Left: Provider list -->
          <div class="provider-list">
            <div
              v-for="provider in availableProviders"
              :key="provider.id"
              class="provider-item"
              :class="{
                previewing: previewProviderId === provider.id,
                selected: localSettings.provider === provider.id
              }"
              @click="previewProviderModels(provider.id)"
            >
              <ProviderIcon :provider="provider.aiProvider || provider.id" :size="16" />
              <span class="provider-name">{{ provider.name }}</span>
              <span v-if="localSettings.provider === provider.id" class="selected-badge">✓</span>
              <span v-else-if="provider.models.length > 0" class="model-count">{{ provider.models.length }}</span>
              <span v-else-if="!provider.configured && provider.id !== 'local'" class="config-badge">未配置</span>
            </div>
          </div>

          <!-- Right: Model list -->
          <div class="model-list">
            <!-- Header with refresh button -->
            <div class="model-list-header">
              <span class="header-title">{{ previewProvider?.name || '' }} 模型</span>
              <button
                class="refresh-btn"
                :disabled="loadingModels"
                @click="refreshModelsForProvider(previewProviderId)"
                title="刷新模型列表"
              >
                <svg :class="{ spinning: loadingModels }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
                  <path d="M21 3v5h-5"/>
                </svg>
              </button>
            </div>

            <div v-if="loadingModels" class="loading-state">
              <span class="loading-spinner"></span>
              <span>加载模型...</span>
            </div>

            <div v-else-if="!previewProvider || previewProvider.models.length === 0" class="empty-state">
              <span v-if="!isProviderConfigured(previewProviderId)">请先配置 {{ previewProvider?.name || '' }} 的 API Key</span>
              <span v-else>未找到 Embedding 模型</span>
            </div>

            <template v-else>
              <div
                v-for="model in previewProvider.models"
                :key="model.id"
                class="model-card"
                :class="{
                  active: localSettings.provider === previewProviderId && currentModel === model.id
                }"
                @click="selectModel(previewProviderId, model.id)"
              >
                <div class="model-header">
                  <span class="model-name">{{ model.name }}</span>
                  <span v-if="localSettings.provider === previewProviderId && currentModel === model.id" class="current-badge">当前</span>
                </div>
                <!-- TODO: Dimension badge temporarily hidden -->
              </div>

              <!-- TODO: Dimension info temporarily hidden - need API source for dimensions -->
            </template>

            <!-- Local model notice -->
            <div v-if="localSettings.provider === 'local'" class="notice-card info">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4"/>
                <path d="M12 8h.01"/>
              </svg>
              <span>首次使用时将自动下载模型文件 (~23MB)</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- TODO: Dimension warning dialog removed - needs API source for dimension info -->

    <!-- Disabled State -->
    <Transition name="fade">
      <div v-if="!isMemoryEnabled" class="disabled-state">
        <div class="disabled-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.54" opacity="0.3"/>
            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.54" opacity="0.3"/>
          </svg>
        </div>
        <p class="disabled-text">启用 Memory 后可配置 Embedding 模型</p>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import type { EmbeddingSettings, EmbeddingProviderType, ModelInfo } from '@/types'
import { useSettingsStore } from '@/stores/settings'
import ProviderIcon from './ProviderIcon.vue'

const props = defineProps<{
  settings: EmbeddingSettings
}>()

const emit = defineEmits<{
  'update:settings': [settings: EmbeddingSettings]
}>()

const settingsStore = useSettingsStore()

// Local copy of settings
const localSettings = ref<EmbeddingSettings>({ ...props.settings })

// Memory enabled state
const isMemoryEnabled = computed(() => localSettings.value.memoryEnabled !== false)

// Watch for external changes
watch(() => props.settings, (newSettings) => {
  localSettings.value = { ...newSettings }
}, { deep: true })

// Providers that may have embedding models
const EMBEDDING_CAPABLE_PROVIDERS: { id: EmbeddingProviderType; name: string; aiProvider: string }[] = [
  { id: 'openai', name: 'OpenAI', aiProvider: 'openai' },
  { id: 'gemini', name: 'Gemini', aiProvider: 'gemini' },
  { id: 'zhipu', name: '智谱 AI', aiProvider: 'zhipu' },
]

// TODO: Dimension info temporarily disabled - need API source
// Dimension warning dialog removed until dimension info is available

// Local model fallback
const LOCAL_PROVIDER = {
  id: 'local' as EmbeddingProviderType,
  name: '本地模型',
  models: [{ id: 'all-MiniLM-L6-v2', name: 'all-MiniLM-L6-v2', type: 'embedding' as const }]
}

// LocalStorage cache for embedding models (persists across window reopens)
const CACHE_KEY = 'embeddingModelsCache'

function loadFromCache(): Map<string, ModelInfo[]> {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      const models: Record<string, ModelInfo[]> = JSON.parse(cached)
      return new Map(Object.entries(models))
    }
  } catch (e) {
    console.warn('[EmbeddingSettings] Failed to load cache:', e)
  }
  return new Map()
}

function saveToCache(models: Map<string, ModelInfo[]>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(models)))
  } catch (e) {
    console.warn('[EmbeddingSettings] Failed to save cache:', e)
  }
}

// Reactive wrapper for the cached models
const providerEmbeddingModels = ref<Map<string, ModelInfo[]>>(loadFromCache())
const loadingModels = ref(false)

// Preview provider (separate from selected provider)
// Allows browsing models without changing settings
const previewProviderId = ref<EmbeddingProviderType>(localSettings.value.provider)

// Fetch embedding models from provider APIs
async function fetchEmbeddingModels() {
  loadingModels.value = true
  const modelMap = new Map<string, ModelInfo[]>()

  console.log('[EmbeddingSettings] Fetching embedding models from provider APIs...')

  for (const provider of EMBEDDING_CAPABLE_PROVIDERS) {
    try {
      const models = await settingsStore.getEmbeddingModels(provider.aiProvider)
      console.log(`[EmbeddingSettings] ${provider.id}: ${models.length} embedding models`)
      if (models.length > 0) {
        modelMap.set(provider.id, models as ModelInfo[])
      }
    } catch (error) {
      console.warn(`[EmbeddingSettings] Failed to fetch for ${provider.id}:`, error)
    }
  }

  // Update reactive ref and persist to localStorage
  providerEmbeddingModels.value = modelMap
  saveToCache(modelMap)
  loadingModels.value = false
  console.log('[EmbeddingSettings] Final model map:', Object.fromEntries(modelMap))
}

// Refresh models for a specific provider (manual refresh button)
async function refreshModelsForProvider(providerId: string) {
  loadingModels.value = true
  try {
    const models = await settingsStore.getEmbeddingModels(providerId)
    console.log(`[EmbeddingSettings] Refreshed ${providerId}: ${models.length} models`)
    if (models.length > 0) {
      // Update reactive ref and persist
      const updated = new Map(providerEmbeddingModels.value)
      updated.set(providerId as EmbeddingProviderType, models as ModelInfo[])
      providerEmbeddingModels.value = updated
      saveToCache(updated)
    }
  } catch (error) {
    console.warn(`[EmbeddingSettings] Failed to refresh for ${providerId}:`, error)
  }
  loadingModels.value = false
}

onMounted(() => {
  // Cache is already loaded from localStorage during initialization
  // Only fetch if cache is empty (expired or first time)
  if (providerEmbeddingModels.value.size === 0) {
    fetchEmbeddingModels()
  }
})

// Note: No longer watching provider config changes since Models.dev is static registry
// Models are fetched once on mount and can be refreshed manually

// Sync preview with actual selection when settings change externally
watch(() => localSettings.value.provider, (newProvider) => {
  previewProviderId.value = newProvider
})

function isProviderConfigured(providerId: string): boolean {
  if (providerId === 'local') return true
  const aiSettings = settingsStore.settings?.ai
  if (!aiSettings) return false
  const providerConfig = aiSettings.providers?.[providerId]
  return !!(providerConfig?.apiKey || providerConfig?.oauthToken)
}

const availableProviders = computed(() => {
  const providers: { id: EmbeddingProviderType; name: string; configured: boolean; models: ModelInfo[]; aiProvider: string }[] = []

  for (const provider of EMBEDDING_CAPABLE_PROVIDERS) {
    const models = providerEmbeddingModels.value.get(provider.id) || []
    providers.push({
      id: provider.id,
      name: provider.name,
      configured: isProviderConfigured(provider.id),
      models,
      aiProvider: provider.aiProvider,
    })
  }

  providers.push({
    id: LOCAL_PROVIDER.id,
    name: LOCAL_PROVIDER.name,
    configured: true,
    models: LOCAL_PROVIDER.models as ModelInfo[],
    aiProvider: 'local',
  })

  return providers
})

// Preview provider (for browsing, not the selected one)
const previewProvider = computed(() => {
  return availableProviders.value.find(p => p.id === previewProviderId.value)
})

// Actually selected provider
const selectedProvider = computed(() => {
  return availableProviders.value.find(p => p.id === localSettings.value.provider)
})

const currentModel = computed(() => {
  return localSettings.value.model || selectedProvider.value?.models[0]?.id || ''
})

// Check if previewing a different provider than selected
const isPreviewingDifferent = computed(() => {
  return previewProviderId.value !== localSettings.value.provider
})

const isCurrentProviderConfigured = computed(() => {
  return isProviderConfigured(localSettings.value.provider)
})

// TODO: Dimension-related code temporarily disabled - need API source for dimensions
// supportsCustomDimensions, currentDimensionInfo, getDimensionForModel removed

function emitUpdate() {
  emit('update:settings', { ...localSettings.value })
}

function toggleMemory() {
  localSettings.value.memoryEnabled = !isMemoryEnabled.value
  emitUpdate()
}

// Preview a provider (just browse, don't select)
function previewProviderModels(providerId: EmbeddingProviderType) {
  previewProviderId.value = providerId
}

// Select a specific model (this actually changes the settings)
function selectModel(providerId: EmbeddingProviderType, modelId: string) {
  localSettings.value.provider = providerId
  localSettings.value.model = modelId
  // Sync preview with selection
  previewProviderId.value = providerId
  emitUpdate()
}

function updateModel(model: string) {
  localSettings.value.model = model
  emitUpdate()
}

function updateDimensions(dimensions: number) {
  localSettings.value.dimensions = dimensions
  emitUpdate()
}
</script>

<style scoped>
.tab-content {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Hero Section */
.hero-section {
  background: linear-gradient(135deg,
    rgba(var(--accent-rgb), 0.08) 0%,
    rgba(var(--accent-rgb), 0.02) 100%
  );
  border: 1px solid rgba(var(--accent-rgb), 0.15);
  border-radius: 16px;
  padding: 20px 24px;
  margin-bottom: 24px;
}

.hero-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.hero-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary);
  color: var(--text-muted);
  transition: all 0.3s ease;
  flex-shrink: 0;
}

.hero-icon.active {
  background: var(--accent);
  color: white;
}

.hero-text {
  flex: 1;
  min-width: 0;
}

.hero-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 2px 0;
}

.hero-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

/* Memory Toggle */
.memory-toggle {
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
  display: block;
}

.memory-toggle input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.memory-toggle-track {
  display: block;
  width: 44px;
  height: 24px;
  background: var(--border);
  border-radius: 12px;
  transition: background 0.25s ease;
  position: relative;
}

.memory-toggle-track::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 10px;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.memory-toggle input:checked + .memory-toggle-track {
  background: var(--accent);
}

.memory-toggle input:checked + .memory-toggle-track::before {
  transform: translateX(20px);
}

/* Status Bar */
.status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(var(--accent-rgb), 0.1);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: all 0.3s ease;
}

.status-bar.active .status-dot {
  background: #10b981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
}

.status-text {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

/* Settings Content */
.settings-content {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

/* Two-column layout (matching ModelSelectorPanel) */
.panel-content {
  display: flex;
  height: 280px;
}

/* Provider list */
.provider-list {
  width: 140px;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 6px;
  flex-shrink: 0;
}

.provider-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.1s ease;
}

.provider-item:hover {
  background-color: var(--hover);
}

.provider-item.previewing {
  background-color: rgba(var(--accent-rgb, 59, 130, 246), 0.1);
}

.provider-item.previewing .provider-name {
  color: var(--accent);
}

.provider-item.selected {
  border-left: 2px solid var(--accent);
  padding-left: 8px;
}

.provider-item.selected .provider-name {
  font-weight: 600;
}

.selected-badge {
  font-size: 11px;
  color: var(--accent);
  font-weight: 600;
}

.provider-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-count {
  font-size: 11px;
  color: var(--muted);
  background: var(--hover);
  padding: 2px 6px;
  border-radius: 10px;
}

.config-badge {
  font-size: 9px;
  color: #d97706;
  background: rgba(245, 158, 11, 0.15);
  padding: 2px 5px;
  border-radius: 4px;
}

/* Model list */
.model-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
}

.model-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 10px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 6px;
  flex-shrink: 0;
}

.header-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.refresh-btn:hover {
  background: var(--hover);
  color: var(--accent);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.refresh-btn svg.spinning {
  animation: spin 1s linear infinite;
}

.current-badge {
  font-size: 10px;
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.loading-state,
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  color: var(--muted);
  font-size: 13px;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Model card */
.model-card {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
  border: 1px solid transparent;
  transition: background-color 0.1s ease, border-color 0.1s ease;
}

.model-card:hover {
  background-color: var(--hover);
}

.model-card.active {
  background-color: rgba(var(--accent-rgb, 59, 130, 246), 0.1);
  border-color: var(--accent);
}

.model-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.model-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.model-card.active .model-name {
  color: var(--accent);
  font-weight: 600;
}

/* Model badges */
.model-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.badge.dims {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

/* Dimension section */
.dimension-section {
  margin-top: 8px;
  padding: 10px 12px;
  background: var(--bg);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.dimension-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.dimension-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.dim-chip {
  padding: 4px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 12px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
}

.dim-chip:hover {
  border-color: rgba(var(--accent-rgb), 0.4);
}

.dim-chip.selected {
  border-color: var(--accent);
  background: rgba(var(--accent-rgb), 0.08);
  color: var(--accent);
  font-weight: 500;
}

/* Readonly dimension display */
.dimension-section.readonly {
  background: var(--bg);
  border: 1px dashed var(--border);
}

.dimension-value {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dimension-number {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  font-family: var(--font-mono);
}

.dimension-note {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-secondary);
  padding: 2px 6px;
  border-radius: 4px;
}

/* Warning Dialog */
.warning-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.warning-dialog {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  width: 90%;
  max-width: 360px;
  text-align: center;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.warning-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(245, 158, 11, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  color: #f59e0b;
}

.warning-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 8px 0;
}

.warning-text {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 8px 0;
  line-height: 1.5;
}

.warning-text strong {
  color: var(--text);
  font-family: var(--font-mono);
}

.warning-detail {
  font-size: 11px;
  color: var(--text-muted);
  margin: 0 0 20px 0;
  line-height: 1.5;
  padding: 10px;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.warning-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.btn-cancel,
.btn-confirm {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
}

.btn-cancel {
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.btn-cancel:hover {
  background: var(--hover);
}

.btn-confirm {
  background: #f59e0b;
  color: white;
}

.btn-confirm:hover {
  background: #d97706;
}

/* Notice Cards */
.notice-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-top: 8px;
  border-radius: 8px;
  font-size: 11px;
  line-height: 1.4;
}

.notice-card svg {
  flex-shrink: 0;
}

.notice-card.info {
  background: rgba(var(--accent-rgb), 0.08);
  border: 1px solid rgba(var(--accent-rgb), 0.15);
  color: var(--text);
}

.notice-card.info svg {
  color: var(--accent);
}

/* Disabled State */
.disabled-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  text-align: center;
}

.disabled-icon {
  color: var(--text-muted);
  margin-bottom: 12px;
  opacity: 0.3;
}

.disabled-text {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

/* Transitions */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.2s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Responsive */
@media (max-width: 480px) {
  .hero-content {
    flex-wrap: wrap;
  }

  .hero-text {
    order: 3;
    flex-basis: 100%;
    margin-top: 6px;
  }

  .memory-toggle {
    margin-left: auto;
  }

  .panel-content {
    flex-direction: column;
    height: auto;
  }

  .provider-list {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px;
  }

  .provider-item {
    flex: 0 0 auto;
    padding: 6px 10px;
  }

  .model-list {
    min-height: 160px;
  }
}
</style>
