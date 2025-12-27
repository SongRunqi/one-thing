<template>
  <Teleport to="body">
    <Transition name="panel">
      <div
        v-if="visible"
        class="model-selector-overlay"
        @click.self="close"
      >
        <div
          class="model-selector-panel"
          :style="panelStyle"
          @click.stop
        >
          <!-- Search -->
          <div class="search-wrapper">
            <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              ref="searchInput"
              v-model="searchQuery"
              type="text"
              class="search-input"
              placeholder="搜索模型..."
              @keydown="handleKeydown"
            />
            <kbd v-if="!searchQuery" class="search-hint">ESC 关闭</kbd>
          </div>

          <!-- Two-column layout -->
          <div class="panel-content">
            <!-- Left: Provider list -->
            <div class="provider-list">
              <div
                v-for="provider in filteredProviders"
                :key="provider.id"
                class="provider-item"
                :class="{ active: selectedProviderId === provider.id }"
                @click="selectProvider(provider.id)"
                @mouseenter="handleProviderHover(provider.id)"
              >
                <ProviderIcon :provider="provider.id" :size="16" />
                <span class="provider-name">{{ provider.name }}</span>
                <span class="model-count">{{ provider.modelCount }}</span>
              </div>
            </div>

            <!-- Right: Model list -->
            <div class="model-list" ref="modelListRef">
              <div v-if="isLoading" class="loading-state">
                <span class="loading-spinner"></span>
                <span>加载模型...</span>
              </div>

              <div v-else-if="filteredModels.length === 0" class="empty-state">
                <span>未找到模型</span>
              </div>

              <div
                v-else
                v-for="(model, index) in filteredModels"
                :key="model.id"
                class="model-card"
                :class="{
                  active: currentModel === model.id,
                  focused: focusedIndex === index
                }"
                @click="selectModel(model)"
                @mouseenter="focusedIndex = index"
              >
                <div class="model-header">
                  <span class="model-name">{{ model.name }}</span>
                  <span class="context-length">{{ formatContextLength(model.context_length) }}</span>
                </div>
                <div class="model-badges">
                  <span v-if="hasTools(model)" class="badge tools">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                    </svg>
                    工具
                  </span>
                  <span v-if="hasReasoning(model)" class="badge reasoning">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 16v-4M12 8h.01"/>
                    </svg>
                    推理
                  </span>
                  <span v-if="hasImageOutput(model)" class="badge image">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    图像
                  </span>
                  <span v-if="hasVision(model)" class="badge vision">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                    视觉
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { OpenRouterModel } from '../../../shared/ipc'
import ProviderIcon from '../settings/ProviderIcon.vue'

interface Props {
  visible: boolean
  position: { bottom: string; left: string }
  currentProvider: string
  currentModel: string
}

interface Emits {
  (e: 'update:visible', value: boolean): void
  (e: 'select', provider: string, model: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const settingsStore = useSettingsStore()

// Refs
const searchInput = ref<HTMLInputElement | null>(null)
const modelListRef = ref<HTMLElement | null>(null)

// State
const searchQuery = ref('')
const selectedProviderId = ref(props.currentProvider)
const focusedIndex = ref(-1)

// Use unified store for models
const isLoading = computed(() => settingsStore.isModelsLoading(selectedProviderId.value))

// Panel position style
const panelStyle = computed(() => ({
  bottom: props.position.bottom,
  left: props.position.left,
}))

// Get providers with model counts
const filteredProviders = computed(() => {
  const settings = settingsStore.settings
  if (!settings?.ai?.providers) return []

  const providers = settingsStore.availableProviders || []
  const query = searchQuery.value.toLowerCase()

  return providers
    .map(p => {
      const config = settings.ai.providers[p.id]
      const selectedModels = config?.selectedModels || []
      return {
        id: p.id,
        name: p.name,
        modelCount: selectedModels.length,
        enabled: config?.enabled !== false,
      }
    })
    .filter(p => p.enabled && p.modelCount > 0)
    .filter(p => {
      if (!query) return true
      // Filter providers by name or if any of their models match
      return p.name.toLowerCase().includes(query)
    })
})

// Cached selected models for current provider (loaded asynchronously)
const selectedModelsCache = ref<Map<string, OpenRouterModel[]>>(new Map())

// Get models for selected provider
const filteredModels = computed(() => {
  const cached = selectedModelsCache.value.get(selectedProviderId.value)
  if (!cached) return []

  const query = searchQuery.value.toLowerCase()
  if (!query) return cached

  return cached.filter(m =>
    m.id.toLowerCase().includes(query) ||
    m.name.toLowerCase().includes(query) ||
    m.description?.toLowerCase().includes(query)
  )
})

// Load models for a provider using unified store
async function loadModelsForProvider(providerId: string) {
  if (selectedModelsCache.value.has(providerId)) return

  try {
    // Use store's getSelectedModels which handles caching and fallbacks
    const models = await settingsStore.getSelectedModels(providerId)
    selectedModelsCache.value.set(providerId, models)
  } catch (error) {
    console.error('Failed to load models:', error)
  }
}

// Select provider
function selectProvider(providerId: string) {
  selectedProviderId.value = providerId
  focusedIndex.value = -1
  loadModelsForProvider(providerId)
}

// Handle provider hover - only switch if models are already cached
function handleProviderHover(providerId: string) {
  // Only auto-switch on hover if models are already cached (no loading needed)
  if (providerId !== selectedProviderId.value && selectedModelsCache.value.has(providerId)) {
    selectedProviderId.value = providerId
    focusedIndex.value = -1
  }
}

// Select model
function selectModel(model: OpenRouterModel) {
  emit('select', selectedProviderId.value, model.id)
  close()
}

// Close panel
function close() {
  emit('update:visible', false)
  searchQuery.value = ''
  focusedIndex.value = -1
}

// Format context length
function formatContextLength(length: number): string {
  if (!length) return ''
  if (length >= 1000000) return `${(length / 1000000).toFixed(1)}M`
  if (length >= 1000) return `${Math.round(length / 1000)}K`
  return String(length)
}

// Capability checks
function hasTools(model: OpenRouterModel): boolean {
  return model.supported_parameters?.includes('tools') || false
}

function hasReasoning(model: OpenRouterModel): boolean {
  return model.supported_parameters?.includes('reasoning') || false
}

function hasImageOutput(model: OpenRouterModel): boolean {
  return model.architecture?.output_modalities?.includes('image') || false
}

function hasVision(model: OpenRouterModel): boolean {
  return model.architecture?.input_modalities?.includes('image') || false
}

// Keyboard navigation
function handleKeydown(event: KeyboardEvent) {
  const models = filteredModels.value

  switch (event.key) {
    case 'Escape':
      close()
      break
    case 'ArrowDown':
      event.preventDefault()
      focusedIndex.value = Math.min(focusedIndex.value + 1, models.length - 1)
      scrollToFocused()
      break
    case 'ArrowUp':
      event.preventDefault()
      focusedIndex.value = Math.max(focusedIndex.value - 1, 0)
      scrollToFocused()
      break
    case 'Enter':
      if (focusedIndex.value >= 0 && focusedIndex.value < models.length) {
        selectModel(models[focusedIndex.value])
      }
      break
    case 'Tab':
      event.preventDefault()
      // Cycle through providers
      const providers = filteredProviders.value
      const currentIdx = providers.findIndex(p => p.id === selectedProviderId.value)
      const nextIdx = event.shiftKey
        ? (currentIdx - 1 + providers.length) % providers.length
        : (currentIdx + 1) % providers.length
      selectProvider(providers[nextIdx].id)
      break
  }
}

function scrollToFocused() {
  nextTick(() => {
    const container = modelListRef.value
    const focused = container?.querySelector('.model-card.focused') as HTMLElement
    if (focused && container) {
      const containerRect = container.getBoundingClientRect()
      const focusedRect = focused.getBoundingClientRect()
      if (focusedRect.bottom > containerRect.bottom) {
        focused.scrollIntoView({ block: 'nearest' })
      } else if (focusedRect.top < containerRect.top) {
        focused.scrollIntoView({ block: 'nearest' })
      }
    }
  })
}

// Handle global ESC
function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.visible) {
    close()
  }
}

// Watch for visibility changes
watch(() => props.visible, async (visible) => {
  if (visible) {
    selectedProviderId.value = props.currentProvider
    await loadModelsForProvider(props.currentProvider)

    // Focus search input
    nextTick(() => {
      searchInput.value?.focus()

      // Set initial focused index to current model
      const models = filteredModels.value
      const idx = models.findIndex(m => m.id === props.currentModel)
      if (idx >= 0) {
        focusedIndex.value = idx
        scrollToFocused()
      }
    })

    // Preload other providers in background (non-blocking)
    const otherProviders = filteredProviders.value.filter(p => p.id !== props.currentProvider)
    for (const provider of otherProviders) {
      loadModelsForProvider(provider.id)
    }
  }
})

// Watch for provider changes from props
watch(() => props.currentProvider, (newProvider) => {
  if (props.visible && newProvider !== selectedProviderId.value) {
    selectProvider(newProvider)
  }
})

onMounted(() => {
  document.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<style scoped>
.model-selector-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
}

.model-selector-panel {
  position: fixed;
  width: 480px;
  height: 400px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 12px);
  box-shadow: var(--shadow-elevated, 0 8px 32px rgba(0, 0, 0, 0.4));
  z-index: 9999;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Search */
.search-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--border);
}

.search-icon {
  color: var(--muted);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text);
  font-size: 14px;
}

.search-input::placeholder {
  color: var(--muted);
}

.search-hint {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--hover);
  border-radius: 4px;
  color: var(--muted);
  font-family: var(--font-mono, monospace);
}

/* Two-column layout */
.panel-content {
  display: flex;
  flex: 1;
  min-height: 0;
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
  contain: layout style;
}

.provider-item:hover {
  background-color: var(--hover);
}

.provider-item.active {
  background-color: rgba(var(--accent-rgb, 59, 130, 246), 0.15);
}

.provider-item.active .provider-name {
  color: var(--accent);
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

/* Model list */
.model-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
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
  contain: layout style;
}

.model-card:hover {
  background-color: var(--hover);
}

.model-card.focused {
  background-color: var(--hover);
  border-color: var(--border);
}

.model-card.active {
  background-color: rgba(var(--accent-rgb, 59, 130, 246), 0.1);
  border-color: var(--accent);
}

.model-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
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

.context-length {
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono, monospace);
}

/* Badges */
.model-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
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

.badge svg {
  flex-shrink: 0;
}

.badge.tools {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.badge.reasoning {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
}

.badge.image {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.badge.vision {
  background: rgba(249, 115, 22, 0.15);
  color: #f97316;
}

/* Transitions - GPU accelerated */
.model-selector-overlay {
  will-change: opacity;
}

.model-selector-panel {
  will-change: transform, opacity;
  transform: translate3d(0, 0, 0);
}

.panel-enter-active {
  transition: opacity 0.12s ease-out;
}

.panel-enter-active .model-selector-panel {
  transition: transform 0.12s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.12s ease-out;
}

.panel-leave-active {
  transition: opacity 0.1s ease-in;
}

.panel-leave-active .model-selector-panel {
  transition: transform 0.1s ease-in, opacity 0.1s ease-in;
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
}

.panel-enter-from .model-selector-panel {
  opacity: 0;
  transform: translate3d(0, 6px, 0) scale(0.98);
}

.panel-leave-to .model-selector-panel {
  opacity: 0;
  transform: translate3d(0, 4px, 0) scale(0.99);
}

/* Light theme adjustments */
html[data-theme='light'] .model-selector-panel {
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05);
}

html[data-theme='light'] .badge.tools {
  background: rgba(59, 130, 246, 0.1);
}

html[data-theme='light'] .badge.reasoning {
  background: rgba(168, 85, 247, 0.1);
}

html[data-theme='light'] .badge.image {
  background: rgba(34, 197, 94, 0.1);
}

html[data-theme='light'] .badge.vision {
  background: rgba(249, 115, 22, 0.1);
}
</style>
