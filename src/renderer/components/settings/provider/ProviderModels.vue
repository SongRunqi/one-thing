<template>
  <section class="detail-section">
    <!-- Section header (outside group) -->
    <div class="section-header">
      <h3 class="section-label">
        Models <span class="count-badge">{{ selectedCount }} selected</span>
      </h3>
      <button
        class="refresh-btn"
        :disabled="isLoading"
        @click="$emit('refresh')"
      >
        <svg
          :class="{ spinning: isLoading }"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M23 4v6h-6M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
        </svg>
        {{ isLoading ? 'Loading...' : models.length === 0 ? 'Fetch Models' : 'Refresh' }}
      </button>
    </div>

    <div
      v-if="error"
      class="error-message"
    >
      {{ error }}
    </div>

    <!-- Models group container -->
    <div class="settings-group">
      <!-- Search row -->
      <div
        v-if="models.length > 0"
        class="search-row"
      >
        <svg
          class="search-icon"
          width="13"
          height="13"
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
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          :value="searchQuery"
          type="text"
          class="search-input"
          placeholder="Search models..."
          @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
        >
        <button
          v-if="searchQuery"
          class="search-clear"
          @click="$emit('update:searchQuery', '')"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Selected models (always shown) -->
      <div
        v-if="selectedModelsList.length > 0 && models.length === 0"
        class="model-list-static"
      >
        <label
          v-for="modelId in selectedModelsList"
          :key="modelId"
          class="model-row selected"
        >
          <span class="model-check checked">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
          <span class="model-name">{{ modelId }}</span>
        </label>
      </div>

      <!-- Model rows (virtual scroll, shown after fetch) -->
      <template v-if="models.length > 0">
        <div
          v-if="filteredModels.length > 0"
          ref="listRef"
          class="model-list"
          @scroll="onScroll"
        >
          <div :style="{ paddingTop: topPad + 'px', paddingBottom: bottomPad + 'px' }">
            <div
              v-for="model in visibleModels"
              :key="model.id"
              :class="['model-row', { 'is-active': model.id === activeModelId }]"
              :title="`Click to configure ${model.id}`"
              @click="$emit('select-active', model.id)"
            >
              <span
                :class="['model-check', { checked: isModelSelected(model.id) }]"
                role="checkbox"
                tabindex="0"
                :aria-checked="isModelSelected(model.id)"
                :title="isModelSelected(model.id) ? 'Deselect' : 'Select'"
                @click.stop="$emit('toggle', model.id)"
                @keydown.space.prevent="$emit('toggle', model.id)"
                @keydown.enter.prevent="$emit('toggle', model.id)"
              >
                <svg
                  v-if="isModelSelected(model.id)"
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              <span class="model-name">{{ model.name || model.id }}</span>
              <button
                class="model-caps-edit"
                :class="{ 'has-override': hasCapabilityOverride(model.id) }"
                :title="capabilityEditTitle(model.id)"
                type="button"
                @click.stop="(e) => toggleCapabilityEditor(model.id, e.currentTarget as HTMLElement)"
              >
                <SlidersHorizontal :size="11" />
              </button>
              <Teleport
                v-if="capabilityEditorOpenFor === model.id"
                to="body"
              >
                <div
                  ref="capabilityPopoverRef"
                  class="model-caps-popover"
                  :style="popoverStyle"
                  @click.stop
                >
                  <div class="model-caps-popover-head">
                    <span>Edit model</span>
                    <button
                      type="button"
                      class="model-caps-close"
                      title="Close"
                      @click="closeCapabilityEditor"
                    >
                      ×
                    </button>
                  </div>

                  <label class="model-caps-id-label">Model ID</label>
                  <div class="model-caps-id-row">
                    <input
                      v-model.trim="modelIdDraft"
                      class="model-caps-id-input"
                      type="text"
                      spellcheck="false"
                      autocapitalize="off"
                      autocorrect="off"
                      @keydown.enter.prevent="commitRename(model.id)"
                      @keydown.esc.prevent="closeCapabilityEditor"
                    >
                    <button
                      type="button"
                      class="model-caps-id-save"
                      :disabled="!modelIdDraft || modelIdDraft === model.id"
                      @click="commitRename(model.id)"
                    >
                      Save
                    </button>
                  </div>
                  <p
                    v-if="renameError"
                    class="model-caps-id-error"
                  >
                    {{ renameError }}
                  </p>

                  <div class="model-caps-section-label">
                    <span>Capabilities</span>
                    <button
                      v-if="hasCapabilityOverride(model.id)"
                      type="button"
                      class="model-caps-reset"
                      @click="onResetCapabilities(model.id)"
                    >
                      Reset
                    </button>
                  </div>
                  <div
                    v-for="cap in CAPABILITY_KEYS"
                    :key="cap.key"
                    class="model-caps-row"
                  >
                    <span class="model-caps-row-label">
                      <component
                        :is="cap.icon"
                        :size="12"
                      />
                      {{ cap.label }}
                    </span>
                    <div class="model-caps-tristate">
                      <button
                        v-for="opt in TRISTATE_OPTIONS"
                        :key="opt.value === undefined ? 'auto' : String(opt.value)"
                        type="button"
                        :class="['tristate-btn', { active: getCapabilityState(model.id, cap.key) === opt.value }]"
                        :title="opt.title"
                        @click="onUpdateCapability(model.id, cap.key, opt.value)"
                      >
                        {{ opt.label }}
                      </button>
                    </div>
                  </div>
                  <p class="model-caps-popover-hint">
                    Auto = use the bundled models.dev metadata. Override for hand-added models.
                  </p>
                </div>
              </Teleport>
              <span
                class="model-caps"
                @click.stop
              >
                <Tooltip
                  v-if="hasVision(model)"
                  text="Image input"
                >
                  <Eye :size="12" />
                </Tooltip>
                <Tooltip
                  v-if="hasImageGeneration(model)"
                  text="Image generation"
                >
                  <Image :size="12" />
                </Tooltip>
                <Tooltip
                  v-if="hasTools(model)"
                  text="Tool calling"
                >
                  <Wrench :size="12" />
                </Tooltip>
                <Tooltip
                  v-if="hasReasoning(model)"
                  text="Reasoning model"
                >
                  <Brain :size="12" />
                </Tooltip>
              </span>
              <Tooltip
                v-if="model.context_length"
                :text="`Context window: ${model.context_length.toLocaleString()} tokens`"
              >
                <span class="model-ctx">
                  <ArrowDownToLine
                    :size="10"
                    class="ctx-icon"
                  />{{ formatContextLength(model.context_length) }}
                </span>
              </Tooltip>
              <span
                v-else
                class="model-ctx"
              >{{ formatContextLength(model.context_length) }}</span>
              <Tooltip
                :text="getMaxOutputTooltip(model)"
              >
                <span
                  class="model-out-wrap"
                  :class="{ overridden: maxOutputs[model.id] != null }"
                  @click.stop
                >
                  <ArrowUpFromLine
                    :size="10"
                    class="out-icon"
                  />
                  <NumberStepper
                    class="model-out-stepper"
                    size="compact"
                    :model-value="getMaxOutputValue(model)"
                    :min="1"
                    :max="getModelMaxLimit(model) || undefined"
                    :step="getModelMaxOutputStep(model)"
                    :aria-label="`max output for ${model.name || model.id}`"
                    @click.stop
                    @update:model-value="onMaxOutStep(model.id, $event)"
                  />
                  <button
                    v-if="maxOutputs[model.id] != null"
                    class="model-out-clear"
                    type="button"
                    title="Reset to default (half of model limit)"
                    @click.stop="emit('update-max-output', model.id, null)"
                  >×</button>
                </span>
              </Tooltip>
            </div>
          </div>
        </div>

        <!-- No results -->
        <div
          v-else-if="searchQuery"
          class="empty-row"
        >
          No models match "{{ searchQuery }}"
        </div>
      </template>

      <!-- Add custom model -->
      <div class="add-model-row">
        <input
          :value="newModelInput"
          type="text"
          class="add-model-input"
          placeholder="Enter model ID (e.g., gpt-4o)"
          @input="$emit('update:newModelInput', ($event.target as HTMLInputElement).value)"
          @keydown.enter="$emit('add-custom')"
        >
        <button
          class="add-model-btn"
          :disabled="!newModelInput.trim()"
          @click="$emit('add-custom')"
        >
          Add
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { Eye, Image, Wrench, Brain, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, AudioLines } from 'lucide-vue-next'
import type { OpenRouterModel, ModelCapabilityOverride } from '@/types'
import Tooltip from '@/components/common/Tooltip.vue'
import NumberStepper from '../NumberStepper.vue'

// Capability keys exposed in the per-model override editor.
// Order here drives the popover order.
const CAPABILITY_KEYS: Array<{
  key: keyof ModelCapabilityOverride
  label: string
  icon: any
}> = [
  { key: 'tools', label: 'Tools', icon: Wrench },
  { key: 'vision', label: 'Image input', icon: Eye },
  { key: 'reasoning', label: 'Reasoning', icon: Brain },
  { key: 'imageOutput', label: 'Image output', icon: Image },
  { key: 'audio', label: 'Audio', icon: AudioLines },
]

// Tri-state button options. `undefined` = "auto / use models.dev default".
const TRISTATE_OPTIONS: Array<{
  value: boolean | undefined
  label: string
  title: string
}> = [
  { value: undefined, label: 'Auto', title: 'Defer to models.dev metadata' },
  { value: true, label: 'On', title: 'Force enabled' },
  { value: false, label: 'Off', title: 'Force disabled' },
]

const ROW_HEIGHT = 34
const CONTAINER_HEIGHT = 240
const BUFFER = 5

interface Props {
  models: OpenRouterModel[]
  filteredModels: OpenRouterModel[]
  selectedCount: number
  selectedModelsList: string[]
  searchQuery: string
  newModelInput: string
  isLoading: boolean
  error: string
  maxOutputs: Record<string, number>
  modelCapabilities: Record<string, ModelCapabilityOverride>
  renameModel: (oldId: string, newId: string) => { ok: boolean; reason?: string }
  activeModelId: string
  isModelSelected: (modelId: string) => boolean
  hasVision: (model: OpenRouterModel) => boolean
  hasImageGeneration: (model: OpenRouterModel) => boolean
  hasTools: (model: OpenRouterModel) => boolean
  hasReasoning: (model: OpenRouterModel) => boolean
  formatContextLength: (contextLength: number) => string
}

interface Emits {
  (e: 'refresh'): void
  (e: 'toggle', modelId: string): void
  (e: 'update:searchQuery', value: string): void
  (e: 'update:newModelInput', value: string): void
  (e: 'add-custom'): void
  (e: 'update-max-output', modelId: string, value: number | null): void
  (e: 'update-capability', modelId: string, key: keyof ModelCapabilityOverride, value: boolean | null): void
  (e: 'reset-capabilities', modelId: string): void
  (e: 'select-active', modelId: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Hard upper bound for the model: from models.dev's `limit.output`. Used as
// the cap on any user-entered value.
function getModelMaxLimit(model: OpenRouterModel): number {
  return model.top_provider?.max_completion_tokens ?? 0
}

// Suggested default — half the model's hard limit. This matches the backend
// resolution in tool-loop.ts when the user hasn't set an override.
function getDefaultMaxOutput(model: OpenRouterModel): number {
  const limit = getModelMaxLimit(model)
  if (limit <= 0) return 0
  return Math.max(1, Math.floor(limit / 2))
}

function getMaxOutputValue(model: OpenRouterModel): number {
  return (props.maxOutputs[model.id] ?? getDefaultMaxOutput(model)) || 1
}

function getModelMaxOutputStep(model: OpenRouterModel): number {
  const limit = getModelMaxLimit(model)
  if (limit <= 1024) return 1
  if (limit <= 8192) return 64
  if (limit <= 32_768) return 128
  if (limit <= 131_072) return 256
  return 1024
}

function getMaxOutputTooltip(model: OpenRouterModel): string {
  const limit = getModelMaxLimit(model)
  const def = getDefaultMaxOutput(model)
  const override = props.maxOutputs[model.id]
  const limitLine = limit > 0
    ? `Model limit: ${limit.toLocaleString()} tokens (from models.dev)`
    : 'No model limit available'
  const defLine = def > 0
    ? `Default when unset: ${def.toLocaleString()} (half of limit)`
    : ''
  if (override != null) {
    return [
      `Override: ${override.toLocaleString()} tokens`,
      limitLine,
      defLine,
      'Clear the field to use the default.',
    ].filter(Boolean).join('\n')
  }
  return [
    'Max output tokens (per-model)',
    limitLine,
    defLine,
    'Edit or step to override; values above the limit are capped.',
  ].filter(Boolean).join('\n')
}

function onMaxOutStep(modelId: string, value: number) {
  const limit = getModelMaxLimit(findModel(modelId))
  const capped = limit > 0 ? Math.min(Math.floor(value), limit) : Math.floor(value)
  emit('update-max-output', modelId, Math.max(1, capped))
}

function findModel(modelId: string): OpenRouterModel {
  return props.filteredModels.find((m) => m.id === modelId)
    ?? props.models.find((m) => m.id === modelId)
    ?? ({ id: modelId } as OpenRouterModel)
}

// ── Capability override editor ───────────────────────────
// Only one popover can be open at a time. Re-clicking the same row closes it.
// The popover is teleported to <body> with fixed positioning so it can't be
// clipped by the virtualized model list's overflow container.
const capabilityEditorOpenFor = ref<string | null>(null)
const capabilityPopoverRef = ref<HTMLElement | HTMLElement[] | null>(null)
const modelIdDraft = ref('')
const renameError = ref('')
const popoverStyle = ref<Record<string, string>>({})
const POPOVER_WIDTH = 280

function placePopover(trigger: HTMLElement) {
  const rect = trigger.getBoundingClientRect()
  // Anchor below-right; clamp inside viewport with an 8px gutter.
  let left = rect.left
  if (left + POPOVER_WIDTH > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - POPOVER_WIDTH - 8)
  }
  popoverStyle.value = {
    position: 'fixed',
    top: `${Math.round(rect.bottom + 6)}px`,
    left: `${Math.round(left)}px`,
    width: `${POPOVER_WIDTH}px`,
  }
}

function toggleCapabilityEditor(modelId: string, trigger?: HTMLElement) {
  if (capabilityEditorOpenFor.value === modelId) {
    closeCapabilityEditor()
    return
  }
  capabilityEditorOpenFor.value = modelId
  modelIdDraft.value = modelId
  renameError.value = ''
  if (trigger) placePopover(trigger)
}

function closeCapabilityEditor() {
  capabilityEditorOpenFor.value = null
  modelIdDraft.value = ''
  renameError.value = ''
}

function commitRename(oldId: string) {
  const next = modelIdDraft.value.trim()
  if (!next || next === oldId) {
    closeCapabilityEditor()
    return
  }
  // Parent provides validation + storage write synchronously via prop.
  const result = props.renameModel(oldId, next)
  if (!result.ok) {
    renameError.value =
      result.reason === 'duplicate'
        ? `Another model with id "${next}" already exists.`
        : result.reason === 'empty'
          ? 'Model id cannot be empty.'
          : 'Could not rename model.'
    return
  }
  // Move the popover focus to the new id so it stays open after rename.
  capabilityEditorOpenFor.value = next
  modelIdDraft.value = next
  renameError.value = ''
}

function onPopoverOutsideClick(e: MouseEvent) {
  if (!capabilityEditorOpenFor.value) return
  const popovers = Array.isArray(capabilityPopoverRef.value)
    ? capabilityPopoverRef.value
    : capabilityPopoverRef.value
      ? [capabilityPopoverRef.value]
      : []
  const target = e.target as Node | null
  if (!target) return
  // Don't close when the click came from the trigger button itself —
  // toggleCapabilityEditor handles that case (and would race with us).
  if (target instanceof HTMLElement && target.closest('.model-caps-edit')) return
  for (const el of popovers) {
    if (el && el.contains(target)) return
  }
  closeCapabilityEditor()
}

function onPopoverEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && capabilityEditorOpenFor.value) {
    closeCapabilityEditor()
  }
}

watch(capabilityEditorOpenFor, (id) => {
  if (id) {
    document.addEventListener('mousedown', onPopoverOutsideClick)
    document.addEventListener('keydown', onPopoverEsc)
  } else {
    document.removeEventListener('mousedown', onPopoverOutsideClick)
    document.removeEventListener('keydown', onPopoverEsc)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onPopoverOutsideClick)
  document.removeEventListener('keydown', onPopoverEsc)
})

function hasCapabilityOverride(modelId: string): boolean {
  const entry = props.modelCapabilities[modelId]
  if (!entry) return false
  return Object.values(entry).some((v) => v !== undefined)
}

function getCapabilityState(
  modelId: string,
  key: keyof ModelCapabilityOverride,
): boolean | undefined {
  return props.modelCapabilities[modelId]?.[key]
}

function capabilityEditTitle(modelId: string): string {
  return hasCapabilityOverride(modelId)
    ? 'Edit capability overrides (custom)'
    : 'Override model capabilities'
}

function onUpdateCapability(
  modelId: string,
  key: keyof ModelCapabilityOverride,
  value: boolean | undefined,
) {
  // null = clear override (back to auto). The store side normalizes null → delete.
  emit('update-capability', modelId, key, value === undefined ? null : value)
}

function onResetCapabilities(modelId: string) {
  emit('reset-capabilities', modelId)
  capabilityEditorOpenFor.value = null
}

const listRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)

const startIndex = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - BUFFER))
const endIndex = computed(() => Math.min(
  props.filteredModels.length,
  Math.ceil((scrollTop.value + CONTAINER_HEIGHT) / ROW_HEIGHT) + BUFFER
))

const visibleModels = computed(() => props.filteredModels.slice(startIndex.value, endIndex.value))
const topPad = computed(() => startIndex.value * ROW_HEIGHT)
const bottomPad = computed(() => Math.max(0, (props.filteredModels.length - endIndex.value) * ROW_HEIGHT))

function onScroll(e: Event) {
  scrollTop.value = (e.target as HTMLElement).scrollTop
}

// Reset scroll when search query or model list changes
watch(() => props.searchQuery, () => {
  scrollTop.value = 0
  if (listRef.value) listRef.value.scrollTop = 0
})

watch(() => props.filteredModels.length, () => {
  scrollTop.value = 0
  if (listRef.value) listRef.value.scrollTop = 0
})
</script>

<style scoped>
.detail-section {
  margin-bottom: 20px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 12px;
}

.section-label {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px;
  font-weight: 650;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 0 2px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.count-badge {
  font-size: 11px;
  font-weight: 560;
  color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  text-transform: none;
  letter-spacing: 0;
}

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 9px;
  border: 1px solid var(--settings-rule-soft, transparent);
  border-radius: 7px;
  background: var(--settings-paper, transparent);
  font-size: 11px;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  cursor: pointer;
  transition: color 0.1s ease;
}

.refresh-btn:hover:not(:disabled) {
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  border-color: var(--settings-rule, transparent);
}

.refresh-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.refresh-btn svg.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ── Group container ── */
.settings-group {
  border: 1px solid var(--settings-rule, rgba(128, 128, 128, 0.1));
  background: var(--settings-paper, color-mix(in srgb, var(--settings-paper-2, transparent) 44%, transparent));
  border-radius: 12px;
  overflow: hidden;
}

/* ── Search row ── */
.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 0 16px;
  border-bottom: 1px solid var(--settings-rule-soft, rgba(128, 128, 128, 0.1));
}

.search-icon {
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  font-size: 13px;
  outline: none;
}

.search-input::placeholder {
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
}

.search-clear {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  border-radius: 3px;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-clear:hover {
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
}

/* ── Model list (virtual scroll container) ── */
.model-list {
  height: 300px;
  overflow-y: auto;
}

.model-list::-webkit-scrollbar { width: 8px; }
.model-list::-webkit-scrollbar-track { background: transparent; }
.model-list::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 8px;
  background: color-mix(in srgb, var(--settings-ink, var(--ui-text-primary-fg, #000)) 16%, transparent);
  background-clip: padding-box;
}

.model-row {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 0 16px;
  gap: 10px;
  font-size: 14px;
  height: 44px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--settings-rule-soft, rgba(128, 128, 128, 0.06));
  transition: background 0.08s ease;
  cursor: pointer;
}

.model-row:last-child {
  border-bottom: none;
}

.model-row:hover {
  background: var(--settings-paper-2, color-mix(in srgb, var(--settings-paper, transparent) 68%, transparent));
}

/* Active model: the one whose temperature / max-output the sliders below
   are configuring. Marked with a left accent stripe + light tint. */
.model-row.is-active {
  background: var(--settings-accent-tint, color-mix(in srgb, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 8%, transparent));
}

.model-row.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 2px;
  border-radius: 2px;
  background: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.model-row.is-active:hover {
  background: color-mix(in srgb, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 11%, transparent);
}

.model-row.is-active .model-name {
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text-primary)));
  font-weight: 600;
}

/* Checkbox is now the only click target for selection.
   Larger invisible hit area via padding + negative margin so users don't
   need pixel-perfect aim, while the visual square stays compact. */
.model-check {
  width: 14px;
  height: 14px;
  padding: 4px;
  margin: -4px;
  border: 1.5px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  background-clip: content-box;
  transition: border-color 0.12s ease, background-color 0.12s ease;
}

.model-check:hover {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.model-check:focus-visible {
  outline: 2px solid var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  outline-offset: 2px;
}

.model-check.checked {
  background: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) content-box;
  border-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  color: var(--ui-action-primary-fg, var(--text-btn-primary, var(--settings-paper)));
}

.model-name {
  flex: 1;
  font-weight: 450;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-caps {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
}

.model-ctx {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  min-width: 36px;
  text-align: right;
  flex-shrink: 0;
}

.ctx-icon { opacity: 0.55; }

/* Per-model max-output cell: arrow icon + input + clear (×).
   Wrapped in a single bordered pill so it reads as one control distinct
   from the context-length number. */
.model-out-wrap {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 22px;
  padding: 0 4px 0 6px;
  border: 1px solid var(--settings-rule-soft, rgba(128, 128, 128, 0.18));
  border-radius: 6px;
  background: var(--settings-paper, rgba(128, 128, 128, 0.04));
  flex-shrink: 0;
  transition: border-color 0.12s ease, background 0.12s ease;
}

.model-out-wrap:hover {
  border-color: var(--settings-rule, rgba(128, 128, 128, 0.4));
  background: var(--settings-paper-2, rgba(128, 128, 128, 0.08));
}

.model-out-wrap:focus-within {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  background: color-mix(in srgb, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 7%, transparent);
}

.model-out-wrap.overridden {
  border-color: color-mix(in srgb, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 45%, transparent);
  background: color-mix(in srgb, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 8%, transparent);
}

.out-icon {
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  opacity: 0.7;
  flex-shrink: 0;
}

.model-out-wrap.overridden .out-icon {
  color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  opacity: 1;
}

.model-out-stepper {
  border: 0;
  background: transparent;
}

.model-out-clear {
  width: 14px;
  height: 14px;
  padding: 0;
  margin-left: 2px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.12s ease, color 0.12s ease;
}

.model-out-clear:hover {
  background: color-mix(in srgb, var(--ui-status-danger-fg, var(--text-error, var(--color-danger))) 18%, transparent);
  color: var(--ui-status-danger-fg, var(--text-error, var(--color-danger)));
}

.empty-row {
  padding: 20px;
  text-align: center;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  font-size: 13px;
}

.error-message {
  padding: 8px 12px;
  background: color-mix(in srgb, var(--ui-status-danger-fg, var(--text-error, var(--color-danger))) 8%, transparent);
  border-radius: 8px;
  color: var(--ui-status-danger-fg, var(--text-error, var(--color-danger)));
  font-size: 12px;
  margin-bottom: 8px;
}

/* ── Static selected models (before fetch) ── */
.model-list-static {
  max-height: 200px;
  overflow-y: auto;
}

/* ── Fetch button ── */
.fetch-row {
  padding: 12px;
  display: flex;
  justify-content: center;
}

.fetch-btn {
  padding: 6px 16px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 7px;
  background: var(--settings-paper, transparent);
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.1s ease;
}

.fetch-btn:hover:not(:disabled) {
  background: var(--settings-paper-2, rgba(128, 128, 128, 0.1));
}

.fetch-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Add model ── */
.add-model-row {
  display: flex;
  gap: 8px;
  min-width: 0;
  min-height: 52px;
  padding: 0 16px;
  border-top: 1px solid var(--settings-rule-soft, rgba(128, 128, 128, 0.08));
}

.add-model-input {
  flex: 1;
  padding: 6px 8px;
  border: none;
  background: transparent;
  min-width: 0;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  font-size: 13px;
  outline: none;
}

.add-model-input::placeholder {
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
}

.add-model-btn {
  padding: 4px 12px;
  border: none;
  border-radius: 7px;
  background: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  color: var(--ui-action-primary-fg, var(--text-btn-primary, var(--settings-paper)));
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.add-model-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Per-model capability override editor — trigger button (stays in-flow) */
.model-caps-edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: 4px;
  padding: 0;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 4px;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.model-caps-edit:hover {
  background: var(--settings-paper-2, var(--ui-state-hover-bg, var(--hover)));
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
}
.model-caps-edit.has-override {
  border-color: color-mix(in srgb, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 40%, transparent);
  color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}
</style>

<!--
  Popover styles need to be unscoped: <Teleport to="body"> moves the
  popover out of this component's data-v scope, so scoped selectors
  wouldn't match. Keep these rules global and prefixed with
  `.model-caps-popover ` so they don't leak.
-->
<style>
/* Popover lives at <body> via Teleport; position is set inline. */
.model-caps-popover {
  z-index: 1000;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg-panel)));
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.model-caps-popover-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 0 4px 4px;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
}

.model-caps-reset {
  border: none;
  background: transparent;
  color: var(--ui-accent-primary-fg, var(--accent));
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}
.model-caps-reset:hover {
  text-decoration: underline;
}

.model-caps-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 4px;
}

.model-caps-row-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ui-text-primary-fg, var(--text));
}

.model-caps-tristate {
  display: inline-flex;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 6px;
  overflow: hidden;
}

.tristate-btn {
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
  border-right: 1px solid var(--ui-border-default-border, var(--border));
  transition: background 0.12s ease, color 0.12s ease;
}
.tristate-btn:last-child {
  border-right: none;
}
.tristate-btn:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}
.tristate-btn.active {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 15%, transparent);
  color: var(--ui-text-primary-fg, var(--text));
}

.model-caps-popover-hint {
  margin: 4px 4px 0;
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--muted));
  line-height: 1.4;
}

.model-caps-close {
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 16px;
  line-height: 1;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  text-transform: none;
  letter-spacing: 0;
}
.model-caps-close:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.model-caps-id-label {
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 4px 4px 2px;
}

.model-caps-id-row {
  display: flex;
  gap: 6px;
  padding: 0 4px;
}

.model-caps-id-input {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 6px;
  background: var(--ui-surface-app-bg, var(--bg, transparent));
  color: var(--ui-text-primary-fg, var(--text));
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  outline: none;
}
.model-caps-id-input:focus {
  border-color: var(--ui-accent-primary-fg, var(--accent));
}

.model-caps-id-save {
  height: 26px;
  padding: 0 10px;
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 18%, transparent);
  color: var(--ui-accent-primary-fg, var(--accent));
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.model-caps-id-save:hover {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 28%, transparent);
}
.model-caps-id-save:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.model-caps-id-error {
  margin: 4px 4px 0;
  font-size: 11px;
  color: var(--ui-status-danger-fg, var(--text-error, var(--color-danger)));
  line-height: 1.3;
}

.model-caps-section-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 8px 4px 2px;
  border-top: 1px solid var(--ui-border-default-border, var(--border));
  margin-top: 4px;
}
</style>
