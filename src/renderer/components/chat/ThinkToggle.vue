<template>
  <div
    v-if="visible"
    ref="rootRef"
    class="thinking-control"
  >
    <Tooltip :text="tooltipText">
      <button
        ref="selectorRef"
        :class="['think-select', { active: selectionActive, open: panelOpen }]"
        type="button"
        aria-haspopup="listbox"
        :aria-expanded="panelOpen"
        @click.stop="togglePanel"
        @keydown="handleSelectorKeydown"
      >
        <Brain :size="14" />
        <span class="think-value">{{ currentSelectionLabel }}</span>
        <ChevronDown
          class="think-chevron"
          :size="13"
        />
      </button>
    </Tooltip>

    <Teleport to="body">
      <div
        v-if="panelOpen"
        ref="panelRef"
        class="think-panel"
        :style="panelStyle"
        role="listbox"
        tabindex="-1"
        @keydown="handlePanelKeydown"
      >
        <div
          v-for="group in optionGroups"
          :key="group.key"
          class="think-group"
        >
          <div class="think-section-label">
            {{ group.label }}
          </div>
          <button
            v-for="option in group.options"
            :key="optionKey(option)"
            :class="['think-option', { selected: isOptionSelected(option), active: isOptionActive(option) }]"
            type="button"
            role="option"
            :aria-selected="isOptionSelected(option)"
            @click.stop="selectOption(option)"
          >
            <span class="think-option-text">{{ option.label }}</span>
            <Check
              v-if="isOptionSelected(option)"
              :size="13"
            />
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Brain, Check, ChevronDown } from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import { useSessionsStore } from '@/stores/sessions'
import type { AIProvider, OpenRouterModel, ThinkingEffort } from '../../../shared/ipc'
import Tooltip from '../common/Tooltip.vue'

interface Props {
  sessionId?: string
}

interface EffortOption {
  value: ThinkingEffort
  label: string
  description?: string
}

interface ServiceTierOption {
  value: string
  label: string
  description?: string
}

type ThinkOption =
  | { kind: 'off'; label: string; description?: string }
  | { kind: 'on'; label: string; description?: string }
  | { kind: 'effort'; value: ThinkingEffort; label: string; description?: string }
  | { kind: 'speed'; value: string | null; label: string; description?: string }

interface ThinkOptionGroup {
  key: 'thinking' | 'speed'
  label: string
  options: ThinkOption[]
}

interface CodexModelMetadata {
  defaultReasoningEffort?: ThinkingEffort
  supportedReasoningEfforts?: Array<{
    effort?: ThinkingEffort
    value?: ThinkingEffort
    name?: ThinkingEffort
    reasoningEffort?: ThinkingEffort
    reasoning_effort?: ThinkingEffort
    description?: string
  }>
  serviceTiers?: Array<string | {
    id?: string
    value?: string
    name?: string
    label?: string
    description?: string
  }>
}

const props = defineProps<Props>()

const settingsStore = useSettingsStore()
const sessionsStore = useSessionsStore()

const rootRef = ref<HTMLElement | null>(null)
const selectorRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const panelOpen = ref(false)
const activeOptionIndex = ref(0)
const panelStyle = ref<Record<string, string>>({})

const THINKING_PAIRS: Record<string, { normal: string; thinking: string }> = {
  deepseek: { normal: 'deepseek-chat', thinking: 'deepseek-reasoner' },
}

const DEEPSEEK_EFFORT_OPTIONS: EffortOption[] = [
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
]

const CODEX_FALLBACK_EFFORT_OPTIONS: EffortOption[] = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'X High' },
]

const EFFORT_LABELS: Record<ThinkingEffort, string> = {
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'X High',
  max: 'Max',
}

const PANEL_WIDTH = 160
const PANEL_GAP = 6
const PANEL_MARGIN = 8
const OPTION_HEIGHT = 30
const SECTION_LABEL_HEIGHT = 22
const PANEL_VERTICAL_PADDING = 8

const currentSession = computed(() => {
  const sid = props.sessionId
  if (!sid) return null
  return sessionsStore.sessions.find((s) => s.id === sid) || null
})

const currentProvider = computed(() => {
  const session = currentSession.value
  if (session?.lastProvider) return session.lastProvider
  return settingsStore.settings?.ai?.provider || ''
})

const currentModel = computed(() => {
  const session = currentSession.value
  if (session?.lastModel) return session.lastModel
  return settingsStore.settings?.ai?.providers?.[currentProvider.value]?.model || ''
})

const cachedModelInfo = computed<OpenRouterModel | undefined>(() => {
  if (!currentProvider.value || !currentModel.value) return undefined
  return settingsStore
    .getCachedModels(currentProvider.value)
    .find((model) => model.id === currentModel.value)
})

const codexMetadata = computed<CodexModelMetadata>(() => {
  return (cachedModelInfo.value?.providerMetadata?.codex ?? {}) as CodexModelMetadata
})

const isCodexProvider = computed(() => currentProvider.value === 'codex')

const isNativeThinkingModel = computed(() => {
  if (isCodexProvider.value && currentModel.value) return true
  if (currentProvider.value !== 'deepseek') return false
  return /(^|[^a-z])v4/.test(currentModel.value.toLowerCase())
})

const nativeThinkingEnabled = computed(() => {
  const map =
    settingsStore.settings?.ai?.providers?.[currentProvider.value]?.thinkingByModel
  return map?.[currentModel.value] !== false
})

const pair = computed(() => {
  if (isNativeThinkingModel.value) return null
  return THINKING_PAIRS[currentProvider.value] || null
})

const visible = computed(() => isNativeThinkingModel.value || !!pair.value)

const thinking = computed(() => {
  if (isNativeThinkingModel.value) return nativeThinkingEnabled.value
  if (!pair.value) return false
  return currentModel.value === pair.value.thinking
})

const codexEffortOptions = computed<EffortOption[]>(() => {
  const levels = codexMetadata.value.supportedReasoningEfforts
  if (!Array.isArray(levels) || levels.length === 0) {
    return CODEX_FALLBACK_EFFORT_OPTIONS
  }

  const seen = new Set<ThinkingEffort>()
  const options: EffortOption[] = []
  for (const level of levels) {
    const value = normalizeEffort(level.effort ?? level.reasoningEffort ?? level.reasoning_effort ?? level.value ?? level.name)
    if (!value || value === 'max' || seen.has(value)) continue
    seen.add(value)
    options.push({
      value,
      label: EFFORT_LABELS[value],
      description: typeof level.description === 'string' ? level.description : undefined,
    })
  }
  return options.length > 0 ? options : CODEX_FALLBACK_EFFORT_OPTIONS
})

const effortOptions = computed<EffortOption[]>(() => {
  if (isCodexProvider.value) return codexEffortOptions.value
  return DEEPSEEK_EFFORT_OPTIONS
})

const defaultEffort = computed<ThinkingEffort>(() => {
  if (isCodexProvider.value) {
    const metadataDefault = normalizeEffort(codexMetadata.value.defaultReasoningEffort)
    return metadataDefault && metadataDefault !== 'max' ? metadataDefault : 'medium'
  }
  return 'high'
})

const currentEffort = computed<ThinkingEffort>(() => {
  const map =
    settingsStore.settings?.ai?.providers?.[currentProvider.value]?.thinkingEffortByModel
  const stored = normalizeEffort(map?.[currentModel.value])
  const mapped = isCodexProvider.value && stored === 'max' ? 'high' : stored
  const allowed = effortOptions.value.some((option) => option.value === mapped)
  if (mapped && allowed) return mapped
  return defaultEffort.value
})

const currentEffortLabel = computed(() => {
  return effortOptions.value.find((option) => option.value === currentEffort.value)?.label
    ?? EFFORT_LABELS[currentEffort.value]
})

const codexServiceTierOptions = computed<ServiceTierOption[]>(() => {
  if (!isCodexProvider.value) return []
  const tiers = codexMetadata.value.serviceTiers
  if (!Array.isArray(tiers) || tiers.length === 0) return []

  const seen = new Set<string>()
  const options: ServiceTierOption[] = []
  for (const tier of tiers) {
    const value = typeof tier === 'string' ? tier : tier.id ?? tier.value ?? tier.name
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    const label = typeof tier !== 'string'
      ? tier.label ?? tier.name ?? titleCaseServiceTier(trimmed)
      : titleCaseServiceTier(trimmed)
    options.push({
      value: trimmed,
      label,
      description: typeof tier !== 'string' ? tier.description : undefined,
    })
  }
  return options
})

const currentServiceTier = computed<string | null>(() => {
  if (!isCodexProvider.value) return null
  const map =
    settingsStore.settings?.ai?.providers?.[currentProvider.value]?.serviceTierByModel
  const value = map?.[currentModel.value]?.trim()
  if (!value || value.toLowerCase() === 'auto') return null
  return value
})

const currentServiceTierLabel = computed(() => {
  if (!currentServiceTier.value) return null
  return codexServiceTierOptions.value.find((option) => option.value === currentServiceTier.value)?.label
    ?? titleCaseServiceTier(currentServiceTier.value)
})

const currentSelectionLabel = computed(() => {
  const thinkingLabel = !thinking.value
    ? 'Off'
    : isNativeThinkingModel.value
      ? currentEffortLabel.value
      : 'On'
  return currentServiceTierLabel.value
    ? `${thinkingLabel} · ${currentServiceTierLabel.value}`
    : thinkingLabel
})

const selectionActive = computed(() => thinking.value || !!currentServiceTier.value)

const speedOptions = computed<ThinkOption[]>(() => {
  if (!isCodexProvider.value) return []
  const serviceOptions = codexServiceTierOptions.value
  if (serviceOptions.length === 0 && !currentServiceTier.value) return []
  const hasCurrentTier = serviceOptions.some((option) => option.value === currentServiceTier.value)
  return [
    { kind: 'speed', value: null, label: 'Auto' },
    ...serviceOptions.map((option) => ({
      kind: 'speed' as const,
      value: option.value,
      label: option.label,
      description: option.description,
    })),
    ...(currentServiceTier.value && !hasCurrentTier
      ? [{
        kind: 'speed' as const,
        value: currentServiceTier.value,
        label: titleCaseServiceTier(currentServiceTier.value),
      }]
      : []),
  ]
})

const tooltipText = computed(() => {
  if (!currentModel.value) return isCodexProvider.value ? 'Choose thinking and speed' : 'Choose thinking mode'
  return isCodexProvider.value
    ? `Choose thinking and speed for ${currentModel.value}`
    : `Choose thinking mode for ${currentModel.value}`
})

const thinkingOptions = computed<ThinkOption[]>(() => {
  if (isNativeThinkingModel.value) {
    return [
      { kind: 'off', label: 'Off' },
      ...effortOptions.value.map((option) => ({ kind: 'effort' as const, ...option })),
    ]
  }
  return [
    { kind: 'off', label: 'Off' },
    { kind: 'on', label: 'On' },
  ]
})

const optionGroups = computed<ThinkOptionGroup[]>(() => {
  const groups: ThinkOptionGroup[] = [
    { key: 'thinking', label: 'Thinking', options: thinkingOptions.value },
  ]
  if (speedOptions.value.length > 0) {
    groups.push({ key: 'speed', label: 'Speed', options: speedOptions.value })
  }
  return groups
})

const flatOptions = computed<ThinkOption[]>(() => optionGroups.value.flatMap((group) => group.options))

function normalizeEffort(value: unknown): ThinkingEffort | null {
  if (
    value === 'minimal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh' ||
    value === 'max'
  ) {
    return value
  }
  return null
}

function titleCaseServiceTier(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ') || value
}

function optionKey(option: ThinkOption): string {
  if (option.kind === 'effort') return `effort-${option.value}`
  if (option.kind === 'speed') return `speed-${option.value ?? 'auto'}`
  return option.kind
}

function isOptionSelected(option: ThinkOption): boolean {
  if (option.kind === 'off') return !thinking.value
  if (option.kind === 'on') return thinking.value && !isNativeThinkingModel.value
  if (option.kind === 'speed') return option.value === currentServiceTier.value
  return thinking.value && currentEffort.value === option.value
}

function isOptionActive(option: ThinkOption): boolean {
  const active = flatOptions.value[activeOptionIndex.value]
  return !!active && optionKey(option) === optionKey(active)
}

function setActiveOptionToCurrent(): void {
  const index = flatOptions.value.findIndex(isOptionSelected)
  activeOptionIndex.value = index >= 0 ? index : 0
}

function togglePanel(): void {
  if (panelOpen.value) {
    closePanel()
  } else {
    openPanel()
  }
}

function openPanel(): void {
  setActiveOptionToCurrent()
  panelOpen.value = true
  nextTick(() => {
    updatePanelPosition()
    panelRef.value?.focus()
  })
}

function closePanel(): void {
  panelOpen.value = false
}

function moveActiveOption(delta: number): void {
  const count = flatOptions.value.length
  if (count === 0) return
  activeOptionIndex.value = (activeOptionIndex.value + delta + count) % count
}

async function selectOption(option: ThinkOption): Promise<void> {
  if (option.kind === 'off') {
    await setThinkingEnabled(false)
  } else if (option.kind === 'on') {
    await setThinkingEnabled(true)
  } else if (option.kind === 'speed') {
    await setCodexServiceTier(option.value)
  } else {
    await setNativeThinkingEffort(option.value)
  }
  closePanel()
  selectorRef.value?.focus()
}

async function setThinkingEnabled(enabled: boolean): Promise<void> {
  if (isNativeThinkingModel.value) {
    await setNativeThinkingEnabled(enabled)
    return
  }
  if (pair.value) {
    await setLegacyPairThinking(enabled)
  }
}

async function setNativeThinkingEnabled(enabled: boolean, effort?: ThinkingEffort): Promise<void> {
  const provider = currentProvider.value as AIProvider
  const model = currentModel.value
  if (!provider || !model) return

  const settings = settingsStore.settings
  if (!settings) return

  const cfg = settings.ai.providers[provider] ?? {
    apiKey: '',
    model: '',
    selectedModels: [],
  }
  const thinkingMap = { ...(cfg.thinkingByModel ?? {}) }
  thinkingMap[model] = enabled

  const nextConfig = { ...cfg, thinkingByModel: thinkingMap }
  if (effort) {
    nextConfig.thinkingEffortByModel = {
      ...(cfg.thinkingEffortByModel ?? {}),
      [model]: isCodexProvider.value && effort === 'max' ? 'high' : effort,
    }
  }

  settingsStore.settings = {
    ...settings,
    ai: {
      ...settings.ai,
      providers: {
        ...settings.ai.providers,
        [provider]: nextConfig,
      },
    },
  }
  await settingsStore.saveSettings(settingsStore.settings)
}

async function setNativeThinkingEffort(effort: ThinkingEffort): Promise<void> {
  await setNativeThinkingEnabled(true, effort)
}

async function setCodexServiceTier(serviceTier: string | null): Promise<void> {
  const provider = currentProvider.value as AIProvider
  const model = currentModel.value
  if (provider !== 'codex' || !model) return

  const settings = settingsStore.settings
  if (!settings) return

  const cfg = settings.ai.providers[provider] ?? {
    apiKey: '',
    model: '',
    selectedModels: [],
  }
  const serviceTierMap = { ...(cfg.serviceTierByModel ?? {}) }
  if (serviceTier) {
    serviceTierMap[model] = serviceTier
  } else {
    delete serviceTierMap[model]
  }

  settingsStore.settings = {
    ...settings,
    ai: {
      ...settings.ai,
      providers: {
        ...settings.ai.providers,
        [provider]: {
          ...cfg,
          serviceTierByModel: serviceTierMap,
        },
      },
    },
  }
  await settingsStore.saveSettings(settingsStore.settings)
}

async function setLegacyPairThinking(enabled: boolean): Promise<void> {
  if (!pair.value) return

  const target = enabled ? pair.value.thinking : pair.value.normal
  const provider = currentProvider.value as AIProvider

  settingsStore.updateModel(target, provider)

  const sid = props.sessionId || sessionsStore.currentSessionId
  if (sid) {
    await window.electronAPI.updateSessionModel(sid, provider, target)
    const session = sessionsStore.sessions.find((s) => s.id === sid)
    if (session) {
      session.lastProvider = provider
      session.lastModel = target
    }
  }
}

function updatePanelPosition(): void {
  const anchor = selectorRef.value
  if (!anchor) return

  const rect = anchor.getBoundingClientRect()
  const optionCount = Math.max(flatOptions.value.length, 1)
  const groupCount = Math.max(optionGroups.value.length, 1)
  const panelHeight =
    optionCount * OPTION_HEIGHT +
    groupCount * SECTION_LABEL_HEIGHT +
    PANEL_VERTICAL_PADDING
  const width = PANEL_WIDTH
  const left = Math.min(
    Math.max(rect.left, PANEL_MARGIN),
    Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN),
  )

  const canOpenBelow = window.innerHeight - rect.bottom >= panelHeight + PANEL_GAP + PANEL_MARGIN
  const top = canOpenBelow
    ? rect.bottom + PANEL_GAP
    : Math.max(PANEL_MARGIN, rect.top - panelHeight - PANEL_GAP)

  panelStyle.value = {
    position: 'fixed',
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    width: `${width}px`,
  }
}

function handleSelectorKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!panelOpen.value) openPanel()
    else moveActiveOption(event.key === 'ArrowDown' ? 1 : -1)
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (!panelOpen.value) openPanel()
    else {
      const option = flatOptions.value[activeOptionIndex.value]
      if (option) void selectOption(option)
    }
  } else if (event.key === 'Escape') {
    closePanel()
  }
}

async function handlePanelKeydown(event: KeyboardEvent): Promise<void> {
  if (event.key === 'Escape') {
    event.preventDefault()
    closePanel()
    selectorRef.value?.focus()
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveActiveOption(event.key === 'ArrowDown' ? 1 : -1)
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const option = flatOptions.value[activeOptionIndex.value]
    if (option) await selectOption(option)
  }
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!panelOpen.value) return
  const target = event.target as Node | null
  if (target && (rootRef.value?.contains(target) || panelRef.value?.contains(target))) return
  closePanel()
}

function handleViewportChange(): void {
  if (panelOpen.value) updatePanelPosition()
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
  window.addEventListener('resize', handleViewportChange)
  window.addEventListener('scroll', handleViewportChange, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
})
</script>

<style scoped>
.thinking-control,
.think-panel {
  --think-accent: var(--ui-message-thinking-fg, var(--text-ai-thinking, var(--accent)));
  --think-accent-border: color-mix(in srgb, var(--think-accent) 50%, transparent);
  --think-accent-bg: color-mix(in srgb, var(--think-accent) 10%, transparent);
  --think-accent-bg-strong: color-mix(in srgb, var(--think-accent) 18%, transparent);
}

.thinking-control {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  flex-shrink: 0;
}

.think-select {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  max-width: 160px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 14px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease,
    transform 0.15s ease;
}

.think-select:hover {
  color: var(--ui-text-primary-fg, var(--text));
  background: var(--ui-state-hover-bg, var(--hover));
}

.think-select:active {
  transform: scale(0.97);
}

.think-select.active {
  color: var(--ui-text-primary-fg, var(--text));
  border-color: var(--think-accent-border);
  background: var(--think-accent-bg);
}

.think-select.active:hover,
.think-select.open {
  background: var(--think-accent-bg-strong);
}

.think-value {
  color: var(--ui-text-primary-fg, var(--text));
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.think-select:not(.active) .think-value {
  color: var(--ui-text-muted-fg, var(--muted));
}

.think-chevron {
  flex: 0 0 auto;
  transition: transform 0.15s ease;
}

.think-select.open .think-chevron {
  transform: rotate(180deg);
}

.think-panel {
  z-index: 10000;
  padding: 4px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-app-bg, var(--bg));
  box-shadow: var(--shadow-lg, 0 10px 28px color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 18%, transparent));
  outline: none;
}

.think-group + .think-group {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--ui-border-default-border, var(--border));
}

.think-section-label {
  height: 22px;
  padding: 5px 8px 3px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
  text-transform: uppercase;
}

.think-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}

.think-option-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.think-option:hover,
.think-option.active {
  background: var(--ui-state-hover-bg, var(--hover));
}

.think-option.selected {
  color: var(--ui-text-primary-fg, var(--text));
}

@media (max-width: 600px) {
  .think-select {
    max-width: 112px;
    padding: 0 8px;
  }
}
</style>
