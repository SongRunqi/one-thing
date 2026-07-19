<template>
  <section class="detail-section">
    <!-- Section header (outside group) -->
    <div class="section-header">
      <!-- Not "Models": the sidebar anchor for the Models ledger matches
           h3 text by prefix, and a second "Models" heading would be ambiguous. -->
      <h3 class="section-label">
        Available models <span class="count-badge">{{ selectedCount }} selected</span>
      </h3>
      <Button
        unstyled
        class="refresh-btn"
        native-type="button"
        :disabled="isLoading"
        @click="$emit('refresh')"
      >
        <RefreshCw
          :class="{ spinning: isLoading }"
          :size="12"
        />
        {{ isLoading ? 'Loading...' : models.length === 0 ? 'Fetch Models' : 'Refresh' }}
      </Button>
    </div>

    <div
      v-if="error"
      class="error-message"
    >
      {{ error }}
    </div>

    <!-- Models group container -->
    <div class="settings-group">
      <div class="model-toolbar">
        <Input
          v-if="models.length > 0"
          class="model-search-field"
          input-class="search-input"
          type="search"
          size="small"
          :prefix-icon="Search"
          :model-value="searchQuery"
          placeholder="Search models"
          aria-label="Search models"
          @update:model-value="$emit('update:searchQuery', $event)"
        >
          <template #suffix>
            <Button
              v-if="searchQuery"
              unstyled
              class="search-clear"
              native-type="button"
              title="Clear search"
              @click="$emit('update:searchQuery', '')"
            >
              <X :size="12" />
            </Button>
          </template>
        </Input>

        <div class="add-model-row">
          <Input
            ref="addModelInputRef"
            :model-value="newModelInput"
            type="text"
            class="add-model-input"
            input-class="add-model-input-native"
            size="small"
            placeholder="Add model ID, e.g. gpt-4o"
            :spellcheck="false"
            aria-label="Add model ID"
            @update:model-value="$emit('update:newModelInput', $event)"
            @keydown.enter.prevent="submitCustomModel"
          />
          <Button
            unstyled
            class="add-model-btn"
            native-type="button"
            :disabled="!newModelInput.trim()"
            @click="submitCustomModel"
          >
            <Plus :size="13" />
            Add
          </Button>
        </div>
      </div>

      <VirtualTable
        v-if="shouldShowModelTable"
        ref="tableRef"
        class="model-list"
        row-key="id"
        :data="modelTableRows"
        :columns="modelTableColumns"
        :height="modelTableHeight"
        :row-height="ROW_HEIGHT"
        :header-height="30"
        :overscan="BUFFER"
        :show-header="models.length > 0"
        empty-text=""
        :row-class-name="modelRowClassName"
        :get-row-aria-label="modelRowAriaLabel"
        @row-click="handleModelRowClick"
      >
        <template #cell-select="{ row }">
          <span
            :class="['model-check', { checked: isModelSelected(row.id) }]"
            role="checkbox"
            tabindex="0"
            :aria-checked="isModelSelected(row.id)"
            :title="isModelSelected(row.id) ? 'Deselect' : 'Select'"
            @click.stop="$emit('toggle', row.id)"
            @keydown.space.prevent="$emit('toggle', row.id)"
            @keydown.enter.prevent="$emit('toggle', row.id)"
          >
            <Check
              v-if="isModelSelected(row.id)"
              :size="11"
            />
          </span>
        </template>

        <template #cell-model="{ row }">
          <span class="model-identity">
            <span class="model-primary">{{ row.name || row.id }}</span>
            <span
              v-if="row.isSelectedOnly || (row.name && row.name !== row.id)"
              class="model-secondary"
            >{{ row.isSelectedOnly ? 'Selected custom model' : row.id }}</span>
          </span>
        </template>

        <template #cell-capabilities="{ row }">
          <span
            class="model-capabilities"
            @click.stop
          >
            <span
              v-if="row.id === activeModelId"
              class="model-active-pill"
            >Active</span>
            <Tooltip
              v-if="hasVision(row)"
              text="Image input"
            >
              <Eye :size="12" />
            </Tooltip>
            <Tooltip
              v-if="hasImageGeneration(row)"
              text="Image generation"
            >
              <Image :size="12" />
            </Tooltip>
            <Tooltip
              v-if="hasTools(row)"
              text="Tool calling"
            >
              <Wrench :size="12" />
            </Tooltip>
            <Tooltip
              v-if="hasReasoning(row)"
              text="Reasoning model"
            >
              <Brain :size="12" />
            </Tooltip>
          </span>
        </template>

        <template #cell-context="{ row }">
          <Tooltip
            v-if="row.context_length"
            :text="`Context window: ${row.context_length.toLocaleString()} tokens`"
          >
            <span class="model-ctx">
              <ArrowDownToLine
                :size="10"
                class="ctx-icon"
              />{{ formatContextLength(row.context_length) }}
            </span>
          </Tooltip>
          <span
            v-else
            class="model-ctx"
          >{{ formatContextLength(row.context_length) }}</span>
        </template>

        <template #cell-output="{ row }">
          <Tooltip :text="getMaxOutputTooltip(row)">
            <span
              class="model-out-wrap"
              :class="{ overridden: maxOutputs[row.id] != null }"
              @click.stop
            >
              <ArrowUpFromLine
                :size="10"
                class="out-icon"
              />
              <InputNumber
                class="model-out-stepper"
                size="small"
                :model-value="getMaxOutputValue(row)"
                :min="1"
                :max="getModelMaxLimit(row) || undefined"
                :step="getModelMaxOutputStep(row)"
                :aria-label="`max output for ${row.name || row.id}`"
                @click.stop
                @update:model-value="onMaxOutStep(row.id, $event)"
              />
              <Button
                v-if="maxOutputs[row.id] != null"
                unstyled
                class="model-out-clear"
                native-type="button"
                title="Reset to default (half of model limit)"
                @click.stop="emit('update-max-output', row.id, null)"
              >×</Button>
            </span>
          </Tooltip>
        </template>

        <template #cell-actions="{ row }">
          <Button
            unstyled
            class="model-caps-edit"
            :class="{ 'has-override': hasCapabilityOverride(row.id) }"
            :title="capabilityEditTitle(row.id)"
            native-type="button"
            @click.stop="(e) => toggleCapabilityEditor(row.id, e.currentTarget as HTMLElement)"
          >
            <SlidersHorizontal :size="13" />
          </Button>
          <Teleport
            v-if="capabilityEditorOpenFor === row.id"
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
                <Button
                  unstyled
                  native-type="button"
                  class="model-caps-close"
                  title="Close"
                  @click="closeCapabilityEditor"
                >
                  ×
                </Button>
              </div>

              <label class="model-caps-id-label">Model ID</label>
              <div class="model-caps-id-row">
                <Input
                  class="model-caps-id-control"
                  input-class="model-caps-id-input"
                  type="text"
                  size="small"
                  :model-value="modelIdDraft"
                  spellcheck="false"
                  autocomplete="off"
                  aria-label="Model ID"
                  @update:model-value="modelIdDraft = $event.trim()"
                  @keydown.enter.prevent="commitRename(row.id)"
                  @keydown.esc.prevent="closeCapabilityEditor"
                />
                <Button
                  unstyled
                  native-type="button"
                  class="model-caps-id-save"
                  :disabled="!modelIdDraft || modelIdDraft === row.id"
                  @click="commitRename(row.id)"
                >
                  Save
                </Button>
              </div>
              <p
                v-if="renameError"
                class="model-caps-id-error"
              >
                {{ renameError }}
              </p>

              <div class="model-caps-section-label">
                <span>Capabilities</span>
                <Button
                  v-if="hasCapabilityOverride(row.id)"
                  unstyled
                  native-type="button"
                  class="model-caps-reset"
                  @click="onResetCapabilities(row.id)"
                >
                  Reset
                </Button>
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
                  <Button
                    v-for="opt in TRISTATE_OPTIONS"
                    :key="opt.value === undefined ? 'auto' : String(opt.value)"
                    unstyled
                    native-type="button"
                    :class="['tristate-btn', { active: getCapabilityState(row.id, cap.key) === opt.value }]"
                    :title="opt.title"
                    @click="onUpdateCapability(row.id, cap.key, opt.value)"
                  >
                    {{ opt.label }}
                  </Button>
                </div>
              </div>
              <p class="model-caps-popover-hint">
                Auto = use the bundled models.dev metadata. Override for hand-added models.
              </p>
            </div>
          </Teleport>
        </template>

        <template #empty>
          <span
            v-if="searchQuery"
            class="empty-row"
          >
            No models match "{{ searchQuery }}"
          </span>
        </template>
      </VirtualTable>
    </div>
  </section>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { Eye, Image, Wrench, Brain, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, AudioLines, RefreshCw, Search, X, Plus, Check } from 'lucide-vue-next'
import type { OpenRouterModel, ModelCapabilityOverride } from '@/types'
import Tooltip from '@/components/common/Tooltip.vue'
import InputNumber from '@/components/common/InputNumber.vue'
import Input from '@/components/common/Input.vue'
import VirtualTable from '@/components/common/VirtualTable.vue'
import type {
  VirtualTableColumn,
  VirtualTableRef,
  VirtualTableRowContext,
} from '@/components/common/virtual-table/types'

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

const ROW_HEIGHT = 44
const CONTAINER_HEIGHT = 308
const BUFFER = 5
const HEADER_HEIGHT = 30

interface ModelTableRow extends OpenRouterModel {
  isSelectedOnly?: boolean
}

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
const tableRef = ref<VirtualTableRef | null>(null)

const modelTableRows = computed<ModelTableRow[]>(() => {
  if (props.models.length > 0) return props.filteredModels as ModelTableRow[]
  return props.selectedModelsList.map(createSelectedOnlyModel)
})

const shouldShowModelTable = computed(() =>
  props.models.length > 0 || props.selectedModelsList.length > 0
)

const modelTableHeight = computed(() => {
  if (props.models.length > 0) return HEADER_HEIGHT + CONTAINER_HEIGHT
  return Math.min(Math.max(modelTableRows.value.length * ROW_HEIGHT, ROW_HEIGHT), 242)
})

const fullModelColumns: VirtualTableColumn<ModelTableRow>[] = [
  { key: 'select', title: '', width: 32, className: 'model-select-cell', headerClassName: 'model-select-head' },
  { key: 'model', field: 'id', title: 'Model', width: 292, className: 'model-name-cell' },
  { key: 'capabilities', title: 'Capabilities', width: 142, className: 'model-capabilities-cell' },
  { key: 'context', title: 'Context', width: 86, align: 'right', headerAlign: 'right', className: 'model-context-cell' },
  { key: 'output', title: 'Output', width: 150, align: 'right', headerAlign: 'right', className: 'model-output-cell' },
  { key: 'actions', title: '', width: 36, align: 'right', className: 'model-action-cell' },
]

const selectedOnlyColumns: VirtualTableColumn<ModelTableRow>[] = [
  { key: 'select', title: '', width: 32, className: 'model-select-cell' },
  { key: 'model', field: 'id', title: 'Model', width: 480, className: 'model-name-cell' },
  { key: 'capabilities', title: '', width: 120, className: 'model-capabilities-cell' },
]

const modelTableColumns = computed(() =>
  props.models.length > 0 ? fullModelColumns : selectedOnlyColumns
)

function createSelectedOnlyModel(modelId: string): ModelTableRow {
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
    isSelectedOnly: true,
  }
}

function modelRowClassName({ row }: VirtualTableRowContext<ModelTableRow>) {
  return {
    'model-row': true,
    selected: props.isModelSelected(row.id),
    'is-active': row.id === props.activeModelId,
  }
}

function modelRowAriaLabel({ row }: VirtualTableRowContext<ModelTableRow>) {
  return `Click to configure ${row.id}`
}

function handleModelRowClick(row: ModelTableRow) {
  emit('select-active', row.id)
}

// Hard upper bound for the model: from models.dev's `limit.output`. Used as
// the cap on any user-entered value.
function getModelMaxLimit(model: OpenRouterModel): number {
  return model.top_provider?.max_completion_tokens ?? 0
}

// Suggested default — half the model's hard limit. This matches backend stream
// parameter resolution when the user hasn't set an override.
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

const addModelInputRef = ref<{ focus: () => void } | null>(null)

function submitCustomModel() {
  if (!props.newModelInput.trim()) return
  emit('add-custom')
  window.requestAnimationFrame(() => {
    addModelInputRef.value?.focus()
  })
}

// Reset scroll when search query or model list changes
watch(() => props.searchQuery, () => {
  resetModelTableScroll()
})

watch(() => props.filteredModels.length, () => {
  resetModelTableScroll()
})

function resetModelTableScroll() {
  void nextTick(() => {
    tableRef.value?.scrollToTop()
  })
}
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

/* Typography comes from the settings :deep(.section-label) layer; only layout lives here. */
.section-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.count-badge {
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  font-weight: 560;
  color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  text-transform: none;
  letter-spacing: 0;
}

/* Text action: mono small, hover pulls an accent underline. */
.refresh-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  border: none;
  background: transparent;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  cursor: pointer;
  transition: color 0.1s ease;
}

.refresh-btn:hover:not(:disabled) {
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.refresh-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.refresh-btn .spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ── Group container ──
   .settings-group chrome (border/fill/radius) is zeroed by the settings :deep() layer. */

/* ── Model toolbar ── */
.model-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--settings-rule-soft, var(--ui-border-subtle-border, var(--border-subtle)));
}

.model-search-field {
  flex: 1 1 280px;
  min-width: 0;
}

.model-search-field :deep(.app-input-control) {
  min-height: 32px;
  gap: 8px;
  padding: 0 9px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 0;
  background: transparent;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  transition: border-color 0.12s ease;
  box-shadow: none;
}

.model-search-field.is-focused :deep(.app-input-control) {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  background: transparent;
  box-shadow: none;
}

.model-search-field :deep(.search-input) {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  font-size: 13px;
}

.model-search-field :deep(.search-input::-webkit-search-cancel-button) {
  appearance: none;
}

.model-search-field :deep(.search-input::placeholder),
.add-model-input :deep(.add-model-input-native::placeholder) {
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
}

.search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  cursor: pointer;
  transition: color 0.12s ease;
}

.search-clear:hover {
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
}

.add-model-row {
  display: inline-flex;
  align-items: center;
  flex: 0 1 370px;
  min-width: 0;
  gap: 8px;
}

.model-toolbar > .add-model-row:only-child {
  flex-basis: 440px;
  max-width: 100%;
}

.add-model-input {
  flex: 1;
  min-width: 0;
}

.add-model-input :deep(.app-input-control) {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 0;
  background: transparent;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  transition: border-color 0.12s ease;
  box-shadow: none;
}

.add-model-input :deep(.add-model-input-native) {
  font-size: 13px;
}

.add-model-input.is-focused :deep(.app-input-control) {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  background: transparent;
  box-shadow: none;
}

/* Primary action: accent line + accent ink, never a filled block. */
.add-model-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  border-radius: 0;
  background: transparent;
  color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: box-shadow 0.12s ease, opacity 0.12s ease;
}

.add-model-btn:hover:not(:disabled) {
  background: transparent;
  box-shadow: inset 0 -2px 0 var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.add-model-btn:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

/* ── Model list: hairline-separated ledger rows, hover/active live in the left rule ── */
.model-list {
  --virtual-table-bg: transparent;
  --virtual-table-head-bg: var(--settings-paper, transparent);
  --virtual-table-row-bg: transparent;
  --virtual-table-row-hover-bg: transparent;
  --virtual-table-border: var(--settings-rule-soft, var(--ui-border-subtle-border, var(--border-subtle)));
  --virtual-table-strong-border: var(--settings-rule-soft, var(--ui-border-subtle-border, var(--border-subtle)));
  --virtual-table-fg: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  --virtual-table-muted-fg: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  --virtual-table-accent: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));

  min-width: 0;
}

.model-list :deep(.virtual-table-viewport) {
  border: 0;
  border-radius: 0;
  background: transparent;
}

.model-list :deep(.virtual-table-header) {
  border-bottom-color: var(--settings-rule-soft, var(--ui-border-subtle-border, var(--border-subtle)));
}

.model-list :deep(.virtual-table-header-cell) {
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  font-size: 10.5px;
  font-weight: 620;
  line-height: 1;
  letter-spacing: 0;
}

.model-list :deep(.virtual-table-cell) {
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  font-size: 13px;
}

.model-list :deep(.virtual-table-cell-content) {
  padding: 0 10px;
}

.model-list :deep(.model-select-cell .virtual-table-cell-content),
.model-list :deep(.model-select-head .virtual-table-cell-content) {
  justify-content: center;
  padding: 0 8px;
}

.model-list :deep(.model-context-cell .virtual-table-cell-content),
.model-list :deep(.model-output-cell .virtual-table-cell-content),
.model-list :deep(.model-action-cell .virtual-table-cell-content) {
  justify-content: flex-end;
}

.model-list :deep(.virtual-table-row.model-row) {
  cursor: pointer;
}

.model-list :deep(.virtual-table-row.model-row:hover) {
  box-shadow: inset 2px 0 0 var(--settings-rule, var(--ui-border-default-border, var(--border)));
}

.model-list :deep(.virtual-table-row.model-row.selected .model-primary),
.model-list :deep(.virtual-table-row.model-row.is-active .model-primary) {
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text-primary)));
  font-weight: 620;
}

.model-list :deep(.virtual-table-row.model-row.is-active) {
  box-shadow: inset 2px 0 0 var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

/* Drafting checkbox: square outline; checked = accent line + accent tick, no fill. */
.model-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: center;
  width: 16px;
  height: 16px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 0;
  background: transparent;
  color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  cursor: pointer;
  transition: border-color 0.12s ease;
}

.model-check:hover {
  border-color: var(--settings-ink-3, var(--ui-text-muted-fg, var(--text-muted)));
}

.model-check:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--settings-ink, var(--ui-text-primary-fg, var(--text))) 24%, transparent);
  outline-offset: 2px;
}

.model-check.checked {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  background: transparent;
}

.model-check svg {
  stroke-width: 3;
}

.model-identity {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.model-primary,
.model-secondary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-primary {
  color: var(--settings-ink-2, var(--ui-text-primary-fg, var(--text)));
  font-weight: 470;
}

.model-secondary {
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  font-size: 10.5px;
}

.model-capabilities {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 5px;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
}

.model-capabilities :deep(.tooltip-wrapper) {
  color: inherit;
}

.model-capabilities svg {
  opacity: 0.82;
}

/* Outlined ring, zero fill — accent marks the active binding. */
.model-active-pill {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  height: 18px;
  padding: 0 7px;
  border: 1px solid color-mix(in srgb, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 65%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-weight: 560;
  letter-spacing: 0;
  white-space: nowrap;
}

.model-ctx {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  min-width: 44px;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.ctx-icon,
.out-icon {
  opacity: 0.62;
  flex-shrink: 0;
}

.model-out-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  height: 26px;
  max-width: 100%;
  min-width: 0;
  padding: 0 5px 0 6px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 0;
  background: transparent;
  transition: border-color 0.12s ease;
}

.model-out-wrap:hover {
  border-color: var(--settings-ink-3, var(--ui-text-muted-fg, var(--text-muted)));
  background: transparent;
}

.model-out-wrap:focus-within {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  background: transparent;
  box-shadow: none;
}

.model-out-wrap.overridden {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  background: transparent;
}

.model-out-wrap.overridden .out-icon {
  color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  opacity: 1;
}

.model-out-wrap :deep(.app-input-number.model-out-stepper) {
  --app-input-number-height: 22px;
  --app-input-number-control-width: 20px;
  --app-input-number-padding-x: 3px;
  --app-input-number-font-size: 11px;

  flex: 1 1 auto;
  min-width: 0;
  min-height: 22px;
  border: 0;
  background: transparent;
  box-shadow: none;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-variant-numeric: tabular-nums;
}

.model-out-wrap :deep(.app-input-number.model-out-stepper:focus-within) {
  border-color: transparent;
  box-shadow: none;
}

.model-out-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: color 0.12s ease;
}

.model-out-clear:hover {
  color: var(--ui-status-danger-fg, var(--text-error, var(--color-danger)));
}

.model-caps-edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: end;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.model-caps-edit:hover {
  border-color: var(--settings-rule, var(--ui-border-default-border, var(--border)));
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
}

.model-caps-edit:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--settings-ink, var(--ui-text-primary-fg, var(--text))) 24%, transparent);
  outline-offset: 2px;
}

.model-caps-edit.has-override {
  border-color: color-mix(in srgb, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 65%, transparent);
  color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.empty-row {
  padding: 22px 16px;
  text-align: center;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  font-size: 13px;
}

/* Error held by a left rule, no filled block. */
.error-message {
  padding: 2px 0 2px 8px;
  border-left: 2px solid var(--ui-status-danger-fg, var(--text-error, var(--color-danger)));
  background: transparent;
  color: var(--ui-status-danger-fg, var(--text-error, var(--color-danger)));
  font-size: 12px;
  margin-bottom: 8px;
  word-break: break-word;
}

@media (max-width: 720px) {
  .model-search-field,
  .add-model-row {
    flex-basis: 100%;
    min-width: 0;
  }
}
</style>

<!--
  Popover styles need to be unscoped: <Teleport to="body"> moves the
  popover out of this component's data-v scope, so scoped selectors
  wouldn't match. Keep these rules global and prefixed with
  `.model-caps-popover ` so they don't leak.
-->
<style>
/* Popover lives at <body> via Teleport; position is set inline.
   Paper dialog in the ledger language: 1px rule + hard-offset ink shadow, no radii, no glow. */
.model-caps-popover {
  z-index: 1000;
  background: var(--ui-surface-app-bg, var(--bg));
  border: 1px solid var(--ui-border-strong-border, var(--border-strong, var(--border)));
  border-radius: 0;
  box-shadow: 4px 4px 0 color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 24%, transparent);
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
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}
.model-caps-reset:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
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
  border-radius: 0;
}

.tristate-btn {
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
  border-right: 1px solid var(--ui-border-default-border, var(--border));
  transition: color 0.12s ease, box-shadow 0.12s ease;
}
.tristate-btn:last-child {
  border-right: none;
}
.tristate-btn:hover {
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
}
.tristate-btn.active {
  background: transparent;
  color: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: inset 0 -2px 0 var(--ui-accent-primary-fg, var(--accent));
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
  cursor: pointer;
  text-transform: none;
  letter-spacing: 0;
  transition: color 0.12s ease;
}
.model-caps-close:hover {
  background: transparent;
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

.model-caps-id-control {
  flex: 1;
  min-width: 0;
}

/* Underline input: the line is the control. */
.model-caps-id-control .app-input-control {
  min-height: 26px;
  padding: 0 2px;
  border: none;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 0;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  box-shadow: none;
  transition: border-color 0.12s ease;
}

.model-caps-id-control .model-caps-id-input {
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 12px;
}

.model-caps-id-control.is-focused .app-input-control {
  border-bottom-color: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: none;
}

.model-caps-id-save {
  height: 26px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--ui-accent-primary-fg, var(--accent));
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.12s ease;
}
.model-caps-id-save:hover:not(:disabled) {
  text-decoration: underline;
  text-underline-offset: 3px;
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
