<template>
  <div
    ref="selectorRef"
    class="model-selector"
    :class="{ compact: isCompact }"
    @click.stop
  >
    <button
      ref="triggerRef"
      type="button"
      class="model-trigger"
      :class="{ 'is-open': open }"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-label="displayName || 'Select model'"
      :title="displayName || 'Select model'"
      @click="toggleFlyout"
    >
      <ProviderIcon
        v-if="isCompact"
        :provider="currentProvider"
        :size="16"
      />
      <span
        v-else
        class="model-text"
      >{{ displayName }}</span>
      <ChevronDown
        v-if="!isCompact"
        class="model-trigger-caret"
        :size="11"
        :stroke-width="2"
      />
    </button>

    <!-- The flyout lives in .composer-anchor next to the command/file pickers:
         the toolbar cell clips (.toolbar-left is overflow:hidden), and the
         anchor is what keeps flyouts glued to the composer's top edge at the
         composer's full width. Vue keeps this teleported subtree in the
         component's style scope. -->
    <Teleport
      v-if="flyoutAnchor"
      :to="flyoutAnchor"
    >
      <ComposerExtensionPanel
        :visible="open"
        class="model-flyout"
        title="Model"
        :count="filteredCount"
        empty-text="No models found"
        empty-hint="Pick models per provider in Settings"
      >
        <template #subheader>
          <div class="model-flyout-search">
            <SearchIcon
              :size="12"
              :stroke-width="2"
            />
            <input
              ref="searchRef"
              v-model="query"
              type="text"
              placeholder="Search models…"
              spellcheck="false"
              aria-label="Search models"
              @input="focusIdx = 0"
              @keydown="handleSearchKeydown"
            >
          </div>
          <div
            class="model-flyout-providers"
            role="tablist"
            aria-label="Providers"
          >
            <button
              type="button"
              class="provider-cell"
              :class="{ on: providerFilter === 'all' }"
              @click="setProviderFilter('all')"
            >
              All<span class="provider-cell-count">{{ totalModelCount }}</span>
            </button>
            <button
              v-for="provider in visibleProviders"
              :key="provider.id"
              type="button"
              class="provider-cell"
              :class="{ on: providerFilter === provider.id }"
              @click="setProviderFilter(provider.id)"
            >
              {{ providerLabel(provider) }}<span class="provider-cell-count">{{ providerOptions.get(provider.id)?.length || 0 }}</span>
            </button>
          </div>
        </template>

        <div
          ref="listRef"
          class="model-flyout-list"
          role="listbox"
          aria-label="Models"
        >
          <template
            v-for="group in filteredGroups"
            :key="group.providerId"
          >
            <div
              v-if="providerFilter === 'all'"
              class="model-group-label"
              aria-hidden="true"
            >
              <span>{{ group.providerName }}</span>
              <span class="model-group-rule" />
            </div>
            <div
              v-for="entry in group.options"
              :key="`${group.providerId}:${entry.option.modelId}`"
              class="model-row"
              :class="{ current: isCurrent(entry.option), focused: entry.index === focusIdx }"
              :data-model-index="entry.index"
              role="option"
              :aria-selected="isCurrent(entry.option)"
              @click="selectOption(entry.option)"
              @mouseenter="focusIdx = entry.index"
            >
              <span
                class="model-dot"
                aria-hidden="true"
              />
              <span class="model-main">
                <span class="model-line">
                  <span class="model-name">{{ entry.option.modelName }}</span>
                  <span
                    v-if="entry.option.modelId !== entry.option.modelName"
                    class="model-id"
                  >{{ entry.option.modelId }}</span>
                  <span
                    v-if="formatContext(entry.option.contextLength)"
                    class="model-context"
                  >{{ formatContext(entry.option.contextLength) }}</span>
                </span>
                <span
                  v-if="entry.option.capabilities.length"
                  class="model-badges"
                >
                  <span
                    v-for="capability in entry.option.capabilities"
                    :key="capability"
                    class="model-badge"
                  >{{ capability }}</span>
                </span>
              </span>
            </div>
          </template>
        </div>
      </ComposerExtensionPanel>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ChevronDown, Search as SearchIcon } from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import { useSessionsStore } from '@/stores/sessions'
import type { AIProvider, OpenRouterModel } from '@shared/ipc'
import { providerFamilyDisplayName } from '@shared/provider-families'
import ProviderIcon from '../settings/ProviderIcon.vue'
import ComposerExtensionPanel from './ComposerExtensionPanel.vue'
import { isProviderConfigEnabled, resolveProviderModelSelection } from '@/stores/helpers/provider-model'

interface Props {
  sessionId?: string
}

interface ModelPickerOption {
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

const selectorRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const flyoutAnchor = ref<HTMLElement | null>(null)
const isCompact = ref(false)
let resizeObserver: ResizeObserver | null = null

const open = ref(false)
const query = ref('')
const providerFilter = ref<'all' | string>('all')
const focusIdx = ref(0)

const currentSession = computed(() => {
  const sid = props.sessionId
  if (!sid) return null
  return sessionsStore.getSessionItem(sid) || null
})

const currentSelection = computed(() => resolveProviderModelSelection({
  settings: settingsStore.settings,
  session: currentSession.value,
}))

const currentProvider = computed(() => (currentSelection.value.providerId || 'claude') as AIProvider)

const currentModel = computed(() => currentSelection.value.model)

const displayName = computed(() => {
  if (!currentModel.value) return 'Select model'
  return settingsStore.getModelDisplayName(currentModel.value)
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
    return isProviderConfigEnabled(config) && hasModels
  })
})

const providerOptions = computed(() => {
  const map = new Map<string, ModelPickerOption[]>()
  for (const provider of visibleProviders.value) {
    map.set(provider.id, buildProviderModelOptions(provider.id, providerLabel(provider)))
  }
  return map
})

const totalModelCount = computed(() => {
  let total = 0
  for (const options of providerOptions.value.values()) total += options.length
  return total
})

const filteredGroups = computed(() => {
  const normalized = query.value.trim().toLowerCase()
  let index = 0
  return visibleProviders.value
    .filter(provider => providerFilter.value === 'all' || provider.id === providerFilter.value)
    .map(provider => ({
      providerId: provider.id,
      providerName: providerLabel(provider),
      options: (providerOptions.value.get(provider.id) || [])
        .filter(option => matchesQuery(option, normalized))
        .map(option => ({ option, index: index++ })),
    }))
    .filter(group => group.options.length > 0)
})

const filteredFlat = computed(() => filteredGroups.value.flatMap(group => group.options.map(entry => entry.option)))

const filteredCount = computed(() => filteredFlat.value.length)

watch(
  currentProvider,
  (provider) => {
    if (!provider) return
    void loadModelsForProvider(provider)
  },
  { immediate: true },
)

/** ErrorCard "切换模型…" dispatches this event; scroll into view, pulse, open. */
function handleOpenModelSelectorEvent(event: Event) {
  const detail = (event as CustomEvent<{ sessionId?: string }>).detail
  if (detail?.sessionId && props.sessionId && detail.sessionId !== props.sessionId) return
  const el = selectorRef.value
  if (!el) return
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  el.classList.remove('attention-pulse')
  // restart the animation on repeated clicks
  void el.offsetWidth
  el.classList.add('attention-pulse')
  if (!open.value) void openFlyout()
  window.setTimeout(() => el.classList.remove('attention-pulse'), 1600)
}

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
  // Same anchor the command/file/path pickers render into. Without one
  // (isolated mounts, tests) the flyout is simply unavailable.
  flyoutAnchor.value = selectorRef.value?.closest('.composer-anchor') as HTMLElement | null

  checkCompactMode()

  const parent = selectorRef.value?.closest('.toolbar-left')
  if (parent) {
    resizeObserver = new ResizeObserver(checkCompactMode)
    resizeObserver.observe(parent)
  }

  window.addEventListener('resize', checkCompactMode)
  window.addEventListener('onething:open-model-selector', handleOpenModelSelectorEvent)
  document.addEventListener('mousedown', handleDocumentMousedown)
  document.addEventListener('keydown', handleDocumentKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkCompactMode)
  window.removeEventListener('onething:open-model-selector', handleOpenModelSelectorEvent)
  document.removeEventListener('mousedown', handleDocumentMousedown)
  document.removeEventListener('keydown', handleDocumentKeydown, true)
  resizeObserver?.disconnect()
  resizeObserver = null
})

function providerLabel(provider: { id: string; name: string }): string {
  return providerFamilyDisplayName(provider.id, provider.name)
}

function buildProviderModelOptions(providerId: string, providerName: string): ModelPickerOption[] {
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

function matchesQuery(option: ModelPickerOption, normalized: string): boolean {
  if (!normalized) return true
  return [
    option.modelName,
    option.modelId,
    option.providerName,
    option.description || '',
    ...option.capabilities,
  ].some((part) => part.toLowerCase().includes(normalized))
}

function isCurrent(option: ModelPickerOption): boolean {
  return option.providerId === currentProvider.value && option.modelId === currentModel.value
}

function formatContext(length: number): string {
  if (!length) return ''
  if (length >= 1000000) return `${(length / 1000000).toFixed(1)}M`
  if (length >= 1000) return `${Math.round(length / 1000)}K`
  return String(length)
}

function toggleFlyout() {
  if (open.value) {
    closeFlyout()
  } else {
    void openFlyout()
  }
}

async function openFlyout() {
  open.value = true
  query.value = ''
  providerFilter.value = 'all'
  for (const provider of visibleProviders.value) {
    void loadModelsForProvider(provider.id)
  }
  await nextTick()
  const currentIndex = filteredFlat.value.findIndex(isCurrent)
  focusIdx.value = currentIndex >= 0 ? currentIndex : 0
  scrollFocusedIntoView()
  searchRef.value?.focus()
}

function closeFlyout() {
  open.value = false
}

function setProviderFilter(filter: 'all' | string) {
  providerFilter.value = filter
  focusIdx.value = 0
  searchRef.value?.focus()
}

function cycleProviderFilter(backwards: boolean) {
  const order: Array<'all' | string> = ['all', ...visibleProviders.value.map(provider => provider.id)]
  const current = order.indexOf(providerFilter.value)
  const next = (current + (backwards ? order.length - 1 : 1)) % order.length
  setProviderFilter(order[next])
}

async function selectOption(option: ModelPickerOption) {
  await settingsStore.saveAIProviderDefault(option.providerId as AIProvider, option.modelId)

  closeFlyout()

  const effectiveSessionId = props.sessionId || sessionsStore.currentSessionId
  if (effectiveSessionId) {
    await sessionsStore.updateSessionModel(effectiveSessionId, option.providerId, option.modelId)
  }
}

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    focusIdx.value = Math.min(focusIdx.value + 1, filteredFlat.value.length - 1)
    scrollFocusedIntoView()
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    focusIdx.value = Math.max(focusIdx.value - 1, 0)
    scrollFocusedIntoView()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const option = filteredFlat.value[focusIdx.value]
    if (option) void selectOption(option)
  } else if (event.key === 'Tab') {
    event.preventDefault()
    cycleProviderFilter(event.shiftKey)
  }
}

function scrollFocusedIntoView() {
  void nextTick(() => {
    const row = listRef.value?.querySelector<HTMLElement>(`[data-model-index="${focusIdx.value}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  })
}

/* The panel shell stops mousedown propagation, so anything that reaches the
   document is outside the flyout; the trigger keeps its own toggle. */
function handleDocumentMousedown(event: MouseEvent) {
  if (!open.value) return
  const target = event.target as Node | null
  if (target && selectorRef.value?.contains(target)) return
  closeFlyout()
}

/* Capture-phase so the flyout wins the Escape before the editor's own
   escape handling reacts. */
function handleDocumentKeydown(event: KeyboardEvent) {
  if (!open.value || event.key !== 'Escape') return
  event.stopPropagation()
  closeFlyout()
  triggerRef.value?.focus()
}

async function loadModelsForProvider(providerId: string) {
  try {
    await settingsStore.fetchModelsForProvider(providerId)
  } catch (error) {
    console.warn('[ModelSelector] failed to load provider models:', error)
  }
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
  display: flex;
  align-items: stretch;
}

.model-selector.attention-pulse {
  animation: model-selector-pulse 0.8s ease-out 2;
  border-radius: 8px;
}

@keyframes model-selector-pulse {
  0% {
    box-shadow: 0 0 0 0 var(--ui-border-focus, rgba(96, 130, 214, 0.55));
  }
  100% {
    box-shadow: 0 0 0 6px transparent;
  }
}

/* Ghost control: resident ~4% surface signals "clickable" without a
   border; hover raises to full hover strength. The toolbar cell-fill
   rules in InputBox.vue stretch it edge-to-edge inside the toolbar. */
.model-trigger {
  min-width: 0;
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 6px;
  border: none;
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-state-hover-bg, var(--hover)) 45%, transparent);
  color: var(--ui-text-muted-fg, var(--muted));
  font: inherit;
  cursor: pointer;
  transition: color 0.16s ease, background 0.16s ease;
}

.model-trigger:hover,
.model-trigger.is-open {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

/* Suppress the focus ring — the model cell is a subtle text label, not a
   form input; its hover / is-open affordances are enough. A lingering
   focus ring after click looks stuck. */
.model-trigger:focus,
.model-trigger:focus-visible {
  outline: none;
}

.model-trigger-caret {
  flex-shrink: 0;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  transition: transform 0.15s ease;
}

/* Compact trigger: the provider mark joins the ink palette — a full-color
   brand logo would be the only saturated pixel in the mono toolbar. */
.model-selector.compact .model-trigger :deep(svg) {
  filter: grayscale(1) contrast(1.1) opacity(0.75);
}

.model-trigger.is-open .model-trigger-caret {
  transform: rotate(180deg);
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

/* ————— MODEL flyout (teleported into .composer-anchor) ————— */

/* 画线风:方角,不用共享 shell 的 12px 圆角。 */
.model-flyout.composer-extension-panel {
  border-radius: 0;
}

.model-flyout :deep(.composer-extension-body) {
  max-height: min(304px, 40vh);
}

.model-flyout-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 0.5px solid var(--composer-extension-divider);
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
}

.model-flyout-search input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  font-family: inherit;
  font-size: 12.5px;
}

.model-flyout-search input::placeholder {
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
}

/* Provider filter: 画线 tabs on the ruled line — the active tab draws an
   ink stroke over the row's own rule instead of filling the cell. */
.model-flyout-providers {
  display: flex;
  align-items: stretch;
  min-height: 28px;
  border-bottom: 0.5px solid var(--composer-extension-divider);
  overflow-x: auto;
  /* NO `scrollbar-width` here: in Chromium, setting the standard property
     disables ::-webkit-scrollbar styling entirely and resurrects the fat
     native bar. The hairline below is the whole affordance. */
}

/* Rest: invisible. Hovering the row surfaces a 3px ink hairline — enough
   "more tabs this way" without a resident chrome strip. */
.model-flyout-providers::-webkit-scrollbar {
  height: 3px;
}

.model-flyout-providers::-webkit-scrollbar-thumb {
  background: transparent;
}

.model-flyout-providers:hover::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 55%, transparent);
}

.model-flyout-providers::-webkit-scrollbar-track {
  background: transparent;
}

.provider-cell {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 0.12s ease;
}

.provider-cell::after {
  content: '';
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: -0.5px;
  height: 1.5px;
  background: currentColor;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.provider-cell:hover {
  color: var(--ui-text-primary-fg, var(--text));
}

.provider-cell:hover::after {
  opacity: 0.3;
}

.provider-cell.on {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.provider-cell.on::after {
  opacity: 1;
}

.provider-cell-count {
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  font-weight: 500;
  letter-spacing: 0;
}

.model-flyout-list {
  display: flex;
  flex-direction: column;
}

.model-group-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px 3px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 650;
  letter-spacing: 1.6px;
  text-transform: uppercase;
}

.model-group-rule {
  flex: 1;
  height: 1px;
  background: var(--composer-extension-divider);
}

/* 画线风:行无底色无圆角,行与行之间一道极淡点线 —— 相邻的选中行与
   hover 行不再是两块底色粘在一起,靠行首圈点区分。
   圈点与 AgentSelector 同记号:hover/键盘焦点空心浮现,当前填实。 */
.model-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-height: 32px;
  padding: 6px 8px;
  border-radius: 0;
  cursor: pointer;
}

.model-row + .model-row {
  border-top: 1px dotted color-mix(in srgb, var(--ui-border-default-border, var(--border)) 62%, transparent);
}

.model-dot {
  flex: 0 0 auto;
  box-sizing: border-box;
  width: 7px;
  height: 7px;
  margin-top: 4px;
  border: 1.5px solid var(--ui-accent-primary-fg, var(--accent));
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.model-row.focused .model-dot {
  opacity: 0.45;
}

.model-row.current .model-dot {
  background: var(--ui-accent-primary-fg, var(--accent));
  opacity: 1;
}

.model-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.model-line {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.model-name {
  color: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));
  font-size: 12.25px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.12s ease;
}

.model-row.focused .model-name {
  color: var(--ui-text-primary-fg, var(--text));
}

.model-row.current .model-name {
  color: var(--ui-accent-primary-fg, var(--accent));
  font-weight: 600;
}

.model-id {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10.5px;
  opacity: 0.75;
}

/* 侧栏注记:context 长度与能力 badge 都不再是药丸底色,
   一律 mono 小字大写(同 agent-row-meta 记号),用留白而非填色分隔。 */
.model-context {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.08em;
  line-height: 1.4;
}

/* Capabilities: wrapping (not truncation) keeps every badge visible at any
   composer width. */
.model-badges {
  display: flex;
  flex-wrap: wrap;
  column-gap: 10px;
  row-gap: 2px;
}

.model-badge {
  flex: 0 0 auto;
  white-space: nowrap;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  font-family: var(--font-mono, monospace);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.08em;
  line-height: 1.4;
  text-transform: uppercase;
}

.model-row.current .model-badge {
  color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 72%, var(--ui-text-muted-fg, var(--muted)) 28%);
}
</style>
