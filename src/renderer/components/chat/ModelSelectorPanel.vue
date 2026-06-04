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
            <svg
              class="search-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle
                cx="11"
                cy="11"
                r="8"
              />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              ref="searchInput"
              v-model="searchQuery"
              type="text"
              class="search-input"
              placeholder="Search models..."
              @keydown="handleKeydown"
            >
            <kbd
              v-if="!searchQuery"
              class="search-hint"
            >ESC to close</kbd>
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
                <ProviderIcon
                  :provider="provider.id"
                  :size="16"
                />
                <span class="provider-name">{{ provider.name }}</span>
                <span class="model-count">{{ provider.modelCount }}</span>
              </div>
            </div>

            <!-- Right: Model list -->
            <div
              ref="modelListRef"
              class="model-list"
            >
              <div
                v-if="isLoading"
                class="loading-state"
              >
                <span class="loading-spinner" />
                <span>Loading models...</span>
              </div>

              <div
                v-else-if="filteredModels.length === 0"
                class="empty-state"
              >
                <span>No models found</span>
              </div>

              <div
                v-for="(model, index) in filteredModels"
                v-else
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
                  <span
                    v-if="hasTools(model)"
                    class="badge tools"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                    </svg>
                    Tools
                  </span>
                  <span
                    v-if="hasReasoning(model)"
                    class="badge reasoning"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                      />
                      <path d="M12 16v-4M12 8h.01" />
                    </svg>
                    Reasoning
                  </span>
                  <span
                    v-if="hasImageOutput(model)"
                    class="badge image"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <rect
                        x="3"
                        y="3"
                        width="18"
                        height="18"
                        rx="2"
                        ry="2"
                      />
                      <circle
                        cx="8.5"
                        cy="8.5"
                        r="1.5"
                      />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    Image output
                  </span>
                  <span
                    v-if="hasNativeImageGeneration(model)"
                    class="badge image-gen"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M12 3v18M3 12h18" />
                      <path d="M5 5l14 14M19 5L5 19" />
                    </svg>
                    Image generation
                  </span>
                  <span
                    v-if="hasVision(model)"
                    class="badge vision"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle
                        cx="12"
                        cy="12"
                        r="3"
                      />
                    </svg>
                    Image input
                  </span>
                  <span
                    v-if="hasSpeed(model)"
                    class="badge speed"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
                    </svg>
                    Speed
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
        isCustom: settingsStore.isCustomProvider(p.id),
      }
    })
    // User-added custom providers stay visible even before any models are
    // selected — otherwise a freshly-added provider would silently disappear
    // from the picker until the user remembers to go pick a model in Settings.
    // Built-ins keep the modelCount > 0 filter so the picker doesn't list
    // every provider the user hasn't configured.
    .filter(p => p.enabled && (p.isCustom || p.modelCount > 0))
    .filter(p => {
      if (!query) return true
      // Filter providers by name or if any of their models match
      return p.name.toLowerCase().includes(query)
    })
})

// Build the displayable model list for a provider directly from the store —
// reactive on both the cached metadata (providerModels) and settings.selectedModels,
// so adding/removing a model in Settings shows up here without a manual refresh.
function buildSelectedModels(providerId: string): OpenRouterModel[] {
  const all = settingsStore.getCachedModels(providerId)
  const ids = settingsStore.settings?.ai?.providers?.[providerId]?.selectedModels ?? []
  if (ids.length === 0) return []
  return ids.map((id) => {
    const found = all.find((m) => m.id === id)
    const displayName = settingsStore.getModelDisplayName(id) || (found?.name ?? id)
    if (found) {
      return { ...found, name: displayName }
    }
    if (providerId === 'codex') {
      return buildCodexFallbackModel(id, displayName)
    }
    // Placeholder for models not (yet) in the registry — keeps the entry visible
    // and selectable even if metadata hasn't loaded.
    return {
      id,
      name: displayName,
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
    }
  })
}

function buildCodexFallbackModel(id: string, name: string): OpenRouterModel {
  return {
    id,
    name,
    context_length: 0,
    architecture: {
      modality: 'text+image->text',
      input_modalities: ['text', 'image'],
      output_modalities: ['text'],
      tokenizer: 'unknown',
    },
    pricing: { prompt: '0', completion: '0', request: '0', image: '0' },
    top_provider: { context_length: 0, max_completion_tokens: 0, is_moderated: false },
    supported_parameters: ['tools', 'reasoning'],
    providerMetadata: {
      codex: {
        defaultReasoningEffort: 'medium',
        supportedReasoningEfforts: [
          { effort: 'minimal', name: 'Minimal' },
          { effort: 'low', name: 'Low' },
          { effort: 'medium', name: 'Medium' },
          { effort: 'high', name: 'High' },
          { effort: 'xhigh', name: 'X High' },
        ],
        supportsReasoningSummaries: true,
        serviceTiers: [],
        nativeTools: ['image_generation'],
      },
    },
  }
}

// Get models for selected provider — fully reactive.
const filteredModels = computed(() => {
  const list = buildSelectedModels(selectedProviderId.value)
  const query = searchQuery.value.toLowerCase()
  if (!query) return list
  return list.filter((m) =>
    m.id.toLowerCase().includes(query) ||
    m.name.toLowerCase().includes(query) ||
    m.description?.toLowerCase().includes(query)
  )
})

// Warm-load registry metadata (capabilities, context_length, etc.) so the
// reactive list above gets enriched once data is in the store.
async function loadModelsForProvider(providerId: string) {
  try {
    await settingsStore.fetchModelsForProvider(providerId)
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

// Handle provider hover — switch immediately; the reactive computed handles
// rendering whether or not metadata has finished loading.
function handleProviderHover(providerId: string) {
  if (providerId !== selectedProviderId.value) {
    selectedProviderId.value = providerId
    focusedIndex.value = -1
  }
  loadModelsForProvider(providerId)
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
  const codexMetadata = model.providerMetadata?.codex as Record<string, unknown> | undefined
  return model.supported_parameters?.includes('tools') || !!codexMetadata
}

function hasReasoning(model: OpenRouterModel): boolean {
  const codexMetadata = model.providerMetadata?.codex as Record<string, unknown> | undefined
  return model.supported_parameters?.includes('reasoning') ||
    Array.isArray(codexMetadata?.supportedReasoningEfforts) ||
    codexMetadata?.supportsReasoningSummaries === true
}

function hasImageOutput(model: OpenRouterModel): boolean {
  return model.architecture?.output_modalities?.includes('image') || false
}

function hasNativeImageGeneration(model: OpenRouterModel): boolean {
  const codexMetadata = model.providerMetadata?.codex as Record<string, unknown> | undefined
  return Array.isArray(codexMetadata?.nativeTools) &&
    codexMetadata.nativeTools.includes('image_generation')
}

function hasSpeed(model: OpenRouterModel): boolean {
  const codexMetadata = model.providerMetadata?.codex as Record<string, unknown> | undefined
  return (Array.isArray(codexMetadata?.serviceTiers) && codexMetadata.serviceTiers.length > 0) ||
    (Array.isArray(codexMetadata?.additionalSpeedTiers) && codexMetadata.additionalSpeedTiers.length > 0)
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
  z-index: var(--z-max);
}

.model-selector-panel {
  position: fixed;
  width: 480px;
  height: 400px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: var(--radius-md, 12px);
  box-shadow: var(--shadow-elevated, 0 8px 32px rgba(0, 0, 0, 0.4));
  z-index: var(--z-max);
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
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
}

.search-icon {
  color: var(--ui-text-muted-fg, var(--muted));
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 14px;
}

.search-input::placeholder {
  color: var(--ui-text-muted-fg, var(--muted));
}

.search-hint {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--ui-state-hover-bg, var(--hover));
  border-radius: 4px;
  color: var(--ui-text-muted-fg, var(--muted));
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
  border-right: 1px solid var(--ui-border-default-border, var(--border));
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
  background-color: var(--ui-state-hover-bg, var(--hover));
}

.provider-item.active {
  background-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 15%, transparent);
}

.provider-item.active .provider-name {
  color: var(--ui-text-primary-fg, var(--text));
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
  color: var(--ui-text-muted-fg, var(--muted));
  background: var(--ui-state-hover-bg, var(--hover));
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
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 13px;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--ui-border-default-border, var(--border));
  border-top-color: var(--ui-accent-primary-fg, var(--accent));
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
  background-color: var(--ui-state-hover-bg, var(--hover));
}

.model-card.focused {
  background-color: var(--ui-state-hover-bg, var(--hover));
  border-color: var(--ui-border-default-border, var(--border));
}

.model-card.active {
  background-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
  border-color: var(--ui-accent-primary-fg, var(--accent));
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
  color: var(--ui-text-primary-fg, var(--text));
}

.model-card.active .model-name {
  color: var(--ui-text-primary-fg, var(--text));
  font-weight: 600;
}

.context-length {
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--muted));
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
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 15%, transparent);
  color: var(--ui-accent-primary-fg, var(--accent));
}

.badge.reasoning {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 15%, transparent);
  color: var(--ui-accent-primary-fg, var(--accent));
}

.badge.image {
  background: color-mix(in srgb, var(--ui-status-success-fg, var(--color-success)) 15%, transparent);
  color: var(--ui-status-success-fg, var(--text-success));
}

.badge.image-gen {
  background: color-mix(in srgb, var(--ui-status-success-fg, var(--color-success)) 15%, transparent);
  color: var(--ui-status-success-fg, var(--text-success));
}

.badge.vision {
  background: color-mix(in srgb, var(--ui-status-warning-fg, var(--color-warning)) 15%, transparent);
  color: var(--ui-status-warning-fg, var(--text-warning));
}

.badge.speed {
  background: color-mix(in srgb, var(--ui-status-warning-fg, var(--color-warning)) 15%, transparent);
  color: var(--ui-status-warning-fg, var(--text-warning));
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

</style>
