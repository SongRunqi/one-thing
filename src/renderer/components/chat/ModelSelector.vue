<template>
  <div
    ref="selectorRef"
    class="model-selector"
    :class="{ compact: isCompact }"
    :style="modelSelectorStyle"
    @click.stop
  >
    <Select
      class="model-select"
      size="small"
      filterable
      teleported
      placement="top"
      popper-class="inputbox-select-dropdown model-select-dropdown"
      default-first-option
      :model-value="modelSelectValue"
      :options="modelSelectOptions"
      :filter-method="filterModelOption"
      :placeholder="displayName || 'Select model'"
      :aria-label="displayName || 'Select model'"
      :title="displayName || 'Select model'"
      :popper-style="modelDropdownStyle"
      no-data-text="No models configured"
      no-match-text="No models found"
      @change="handleModelChange"
      @visible-change="handleVisibleChange"
    >
      <template #prefix>
        <ProviderIcon
          :provider="currentProvider"
          :size="18"
        />
      </template>

      <template #label>
        <span class="model-text">{{ displayName }}</span>
      </template>

      <template #option="{ option }">
        <span class="model-option">
          <span class="model-option-main">
            <span class="model-option-name">{{ modelOptionName(option) }}</span>
            <span class="model-option-id">{{ modelOptionId(option) }}</span>
          </span>
          <span class="model-option-meta">
            <span
              v-if="modelOptionContext(option)"
              class="model-context"
            >
              {{ modelOptionContext(option) }}
            </span>
            <span
              v-for="capability in modelOptionCompactCapabilities(option)"
              :key="capability"
              class="model-badge"
            >
              {{ capability }}
            </span>
          </span>
        </span>
      </template>
    </Select>
  </div>
</template>

<script setup lang="ts">
import Select from '@/components/common/Select.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type StyleValue } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useSessionsStore } from '@/stores/sessions'
import type { AIProvider, OpenRouterModel } from '../../../shared/ipc'
import type { SelectModelValue, SelectNormalizedOption, SelectOptionLike } from '@/components/common/select'
import ProviderIcon from '../settings/ProviderIcon.vue'
import { resolveProviderModelSelection } from '@/stores/helpers/provider-model'

interface Props {
  sessionId?: string
}

interface ModelSelectOption {
  value: string
  label: string
  providerId: string
  providerName: string
  modelId: string
  modelName: string
  description?: string
  contextLength: number
  capabilities: string[]
}

const props = defineProps<Props>()

const settingsStore = useSettingsStore()
const sessionsStore = useSessionsStore()

const MODEL_SELECTOR_MIN_WIDTH = 112
const MODEL_SELECTOR_MAX_WIDTH = 420
const MODEL_SELECTOR_CHROME_WIDTH = 72
const MODEL_TEXT_FALLBACK_FONT = '520 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

const selectorRef = ref<HTMLElement | null>(null)
const isCompact = ref(false)
const measuredModelText = ref({ label: '', width: 0 })
let resizeObserver: ResizeObserver | null = null
let modelTextMeasureCanvas: HTMLCanvasElement | null = null

const modelDropdownStyle = computed<StyleValue>(() => ({
  width: 'min(340px, calc(100vw - 24px))',
  maxHeight: '224px',
}))

const currentSession = computed(() => {
  const sid = props.sessionId
  if (!sid) return null
  return sessionsStore.getSessionItem(sid) || null
})

const currentSelection = computed(() => resolveProviderModelSelection({
  settings: settingsStore.settings,
  session: currentSession.value,
  providers: settingsStore.availableProviders,
  getCachedModels: providerId => settingsStore.getCachedModels(providerId),
}))

const currentProvider = computed(() => (currentSelection.value.providerId || 'claude') as AIProvider)

const currentModel = computed(() => currentSelection.value.model)

const displayName = computed(() => {
  if (!currentModel.value) return 'Select model'
  return settingsStore.getModelDisplayName(currentModel.value)
})

const modelSelectorStyle = computed<StyleValue>(() => {
  const label = displayName.value
  const measuredWidth = measuredModelText.value.label === label
    ? measuredModelText.value.width
    : 0

  return {
    '--model-selector-width': isCompact.value
      ? '34px'
      : `${modelSelectorWidth(label, measuredWidth)}px`,
  }
})

const modelSelectValue = computed(() => {
  if (!currentProvider.value || !currentModel.value) return ''
  return makeModelValue(currentProvider.value, currentModel.value)
})

const visibleProviders = computed(() => {
  const settings = settingsStore.settings
  const providers = settingsStore.availableProviders || []
  if (!settings?.ai?.providers) return []

  return providers.filter((provider) => {
    const config = settings.ai.providers[provider.id]
    const isCurrent = provider.id === currentProvider.value
    const isCustom = settingsStore.isCustomProvider(provider.id)
    const selectedModels = config?.selectedModels || []
    const customDefaultModel = isCustom ? config?.model : ''
    const hasModels = selectedModels.length > 0 || (isCurrent && !!currentModel.value) || !!customDefaultModel
    return config?.enabled !== false && hasModels
  })
})

const modelSelectOptions = computed<SelectOptionLike[]>(() => {
  return visibleProviders.value
    .map((provider) => {
      const options = buildProviderModelOptions(provider.id, provider.name)
      return {
        label: provider.name,
        options,
      }
    })
    .filter((group) => group.options.length > 0)
})

watch(
  currentProvider,
  (provider) => {
    if (!provider) return
    void loadModelsForProvider(provider)
  },
  { immediate: true },
)

watch(
  displayName,
  () => {
    void updateMeasuredModelTextWidth()
  },
  { immediate: true },
)

function checkCompactMode() {
  if (!selectorRef.value) return

  const parent = selectorRef.value.closest('.toolbar-left') as HTMLElement | null
  if (!parent) {
    isCompact.value = window.innerWidth < 550
    return
  }

  const parentRect = parent.getBoundingClientRect()
  const siblings = Array.from(parent.children) as HTMLElement[]
  const usedWidth = siblings
    .filter((sibling) => sibling !== selectorRef.value)
    .reduce((total, sibling) => total + sibling.getBoundingClientRect().width + 4, 0)

  isCompact.value = parentRect.width - usedWidth < 120
}

onMounted(() => {
  void updateMeasuredModelTextWidth()

  if (document.fonts) {
    void document.fonts.ready.then(() => updateMeasuredModelTextWidth())
  }

  checkCompactMode()

  const parent = selectorRef.value?.closest('.toolbar-left')
  if (parent) {
    resizeObserver = new ResizeObserver(checkCompactMode)
    resizeObserver.observe(parent)
  }

  window.addEventListener('resize', checkCompactMode)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkCompactMode)
  resizeObserver?.disconnect()
  resizeObserver = null
})

function buildProviderModelOptions(providerId: string, providerName: string): ModelSelectOption[] {
  const config = settingsStore.settings?.ai?.providers?.[providerId]
  const selectedModels = config?.selectedModels || []
  const ids = [...selectedModels]

  if (providerId === currentProvider.value && currentModel.value && !ids.includes(currentModel.value)) {
    ids.unshift(currentModel.value)
  }

  if (settingsStore.isCustomProvider(providerId) && config?.model && !ids.includes(config.model)) {
    ids.unshift(config.model)
  }

  const cachedModels = settingsStore.getCachedModels(providerId)
  return ids.map((id) => {
    const model = cachedModels.find((item) => item.id === id)
    const modelName = settingsStore.getModelDisplayName(id) || model?.name || id
    return {
      value: makeModelValue(providerId, id),
      label: modelName,
      providerId,
      providerName,
      modelId: id,
      modelName,
      description: model?.description,
      contextLength: model?.context_length || 0,
      capabilities: capabilityLabels(providerId, model),
    }
  })
}

async function updateMeasuredModelTextWidth() {
  const label = displayName.value
  await nextTick()

  const width = measureModelTextWidth(label)
  measuredModelText.value = { label, width }

  await nextTick()
  checkCompactMode()
}

function measureModelTextWidth(label: string): number {
  const text = label.trim() || 'Select model'
  const context = getModelTextMeasureContext()
  if (!context) return estimateModelTextWidth(text)

  context.font = getModelTextFont()
  const width = Math.ceil(context.measureText(text).width)
  return Number.isFinite(width) && width > 0 ? width : estimateModelTextWidth(text)
}

function getModelTextMeasureContext(): CanvasRenderingContext2D | null {
  if (!modelTextMeasureCanvas) {
    modelTextMeasureCanvas = document.createElement('canvas')
  }
  return modelTextMeasureCanvas.getContext('2d')
}

function getModelTextFont(): string {
  const textElement = selectorRef.value?.querySelector<HTMLElement>('.model-text')
  if (!textElement) return MODEL_TEXT_FALLBACK_FONT

  const styles = window.getComputedStyle(textElement)
  if (styles.font) return styles.font

  return `${styles.fontWeight || 520} ${styles.fontSize || '13px'} ${styles.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'}`
}

function estimateModelTextWidth(text: string): number {
  const visualLength = Array.from(text).reduce((total, char) => {
    if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(char)) return total + 1.7
    if (/[A-Z0-9]/.test(char)) return total + 1.05
    if (/[-_./]/.test(char)) return total + 0.65
    if (char === ' ') return total + 0.45
    return total + 0.9
  }, 0)

  return Math.ceil(visualLength * 7.8)
}

function modelSelectorWidth(label: string, measuredTextWidth = 0): number {
  const text = label.trim() || 'Select model'
  const textWidth = measuredTextWidth > 0 ? measuredTextWidth : estimateModelTextWidth(text)
  return Math.round(Math.max(
    MODEL_SELECTOR_MIN_WIDTH,
    Math.min(MODEL_SELECTOR_MAX_WIDTH, textWidth + MODEL_SELECTOR_CHROME_WIDTH),
  ))
}

function makeModelValue(provider: string, model: string): string {
  return JSON.stringify([provider, model])
}

function parseModelValue(value: string): { provider: string; model: string } | null {
  try {
    const parsed = JSON.parse(value)
    if (
      Array.isArray(parsed) &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string'
    ) {
      return { provider: parsed[0], model: parsed[1] }
    }
  } catch {
    return null
  }
  return null
}

async function handleModelChange(value: SelectModelValue) {
  if (Array.isArray(value) || typeof value !== 'string') return
  const selection = parseModelValue(value)
  if (!selection) return

  if (selection.provider !== currentProvider.value) {
    settingsStore.updateAIProvider(selection.provider as AIProvider)
  }
  settingsStore.updateModel(selection.model, selection.provider as AIProvider)

  const effectiveSessionId = props.sessionId || sessionsStore.currentSessionId
  if (effectiveSessionId) {
    await sessionsStore.updateSessionModel(effectiveSessionId, selection.provider, selection.model)
  }
}

function handleVisibleChange(visible: boolean) {
  if (!visible) return
  for (const provider of visibleProviders.value) {
    void loadModelsForProvider(provider.id)
  }
}

async function loadModelsForProvider(providerId: string) {
  try {
    await settingsStore.fetchModelsForProvider(providerId)
  } catch (error) {
    console.warn('[ModelSelector] failed to load provider models:', error)
  }
}

function filterModelOption(query: string, option?: SelectNormalizedOption): boolean {
  const item = asModelOption(option?.raw)
  if (!item) return false
  const normalized = query.toLowerCase()
  return [
    item.modelName,
    item.modelId,
    item.providerName,
    item.description || '',
    ...item.capabilities,
  ].some((part) => part.toLowerCase().includes(normalized))
}

function asModelOption(option: SelectOptionLike | undefined): ModelSelectOption | null {
  if (!option || typeof option !== 'object' || Array.isArray(option)) return null
  const candidate = option as Partial<ModelSelectOption>
  if (typeof candidate.modelId !== 'string' || typeof candidate.modelName !== 'string') return null
  return candidate as ModelSelectOption
}

function modelOptionName(option: SelectOptionLike): string {
  return asModelOption(option)?.modelName || ''
}

function modelOptionId(option: SelectOptionLike): string {
  const item = asModelOption(option)
  if (!item || item.modelId === item.modelName) return ''
  return item.modelId
}

function modelOptionContext(option: SelectOptionLike): string {
  const length = asModelOption(option)?.contextLength || 0
  if (!length) return ''
  if (length >= 1000000) return `${(length / 1000000).toFixed(1)}M`
  if (length >= 1000) return `${Math.round(length / 1000)}K`
  return String(length)
}

function modelOptionCapabilities(option: SelectOptionLike): string[] {
  return asModelOption(option)?.capabilities || []
}

function modelOptionCompactCapabilities(option: SelectOptionLike): string[] {
  return modelOptionCapabilities(option).slice(0, 2)
}

function capabilityLabels(providerId: string, model?: OpenRouterModel): string[] {
  if (providerId === 'codex' && !model) {
    return ['Tools', 'Reasoning', 'Image input', 'Image generation']
  }

  const labels: string[] = []
  const codexMetadata = model?.providerMetadata?.codex as Record<string, unknown> | undefined

  if (model?.supported_parameters?.includes('tools') || !!codexMetadata) {
    labels.push('Tools')
  }
  if (
    model?.supported_parameters?.includes('reasoning') ||
    Array.isArray(codexMetadata?.supportedReasoningEfforts) ||
    codexMetadata?.supportsReasoningSummaries === true
  ) {
    labels.push('Reasoning')
  }
  if (model?.architecture?.input_modalities?.includes('image')) {
    labels.push('Image input')
  }
  if (model?.architecture?.output_modalities?.includes('image')) {
    labels.push('Image output')
  }
  if (Array.isArray(codexMetadata?.nativeTools) && codexMetadata.nativeTools.includes('image_generation')) {
    labels.push('Image generation')
  }
  if (
    (Array.isArray(codexMetadata?.serviceTiers) && codexMetadata.serviceTiers.length > 0) ||
    (Array.isArray(codexMetadata?.additionalSpeedTiers) && codexMetadata.additionalSpeedTiers.length > 0)
  ) {
    labels.push('Speed')
  }

  return labels
}
</script>

<style scoped>
.model-selector {
  min-width: 0;
  width: var(--model-selector-width, 168px);
  flex: 0 0 var(--model-selector-width, 168px);
}

.model-selector.compact {
  width: 34px;
  flex-basis: 34px;
}

.model-select {
  width: 100%;
}

.model-select :deep(.app-select-control) {
  min-height: 30px;
  gap: 5px;
  padding: 3px 6px;
  border-color: transparent;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
}

.model-select :deep(.app-select-control:hover),
.model-select.is-open :deep(.app-select-control) {
  border-color: transparent;
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
  box-shadow: none;
}

.model-selector.compact :deep(.app-select-selection),
.model-selector.compact :deep(.app-select-suffix) {
  display: none;
}

.model-selector.compact :deep(.app-select-control) {
  justify-content: center;
  padding: 3px;
}

.model-text {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 13px;
  font-weight: 520;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-option {
  min-width: 0;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.model-option-main {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.model-option-name,
.model-option-id {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-option-name {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12px;
  font-weight: 600;
}

.model-option-id {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10.5px;
}

.model-option-meta {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex-wrap: nowrap;
  max-width: 128px;
  overflow: hidden;
}

.model-context,
.model-badge {
  flex: 0 0 auto;
  padding: 1px 5px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 650;
  line-height: 1.4;
}

.model-context {
  color: var(--ui-text-muted-fg, var(--muted));
  background: var(--ui-state-hover-bg, var(--hover));
  font-family: var(--font-mono, monospace);
}

.model-badge {
  color: var(--ui-accent-primary-fg, var(--accent));
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 12%, transparent);
}

:global(.model-select-dropdown) {
  max-width: min(340px, calc(100vw - 24px));
  padding: 4px;
}

:global(.model-select-dropdown .app-select-option) {
  min-height: 28px;
  padding: 2px 7px;
}

:global(.model-select-dropdown .app-select-group-label) {
  padding: 6px 7px 3px;
  font-size: 10px;
}
</style>
