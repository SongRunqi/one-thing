<template>
  <section class="detail-section">
    <div class="section-header">
      <h3 class="section-label">
        Available models
        <span class="count-badge">{{ selectedCount }} selected</span>
      </h3>
      <Button
        unstyled
        native-type="button"
        class="refresh-btn"
        :disabled="isLoading"
        @click="$emit('refresh')"
      >
        <RefreshCw
          :size="13"
          :class="{ spinning: isLoading }"
        />
      </Button>
    </div>

    <ErrorNote
      v-if="error"
      class="error-message"
      :message="error"
    />

    <!-- Modal, not a second-level page: replacing the list left no trace of
         where you came from, and an inline expansion re-introduces the
         variable-height row the windowing is happier without. -->
    <ModelConfigDialog
      v-if="configModel"
      :model="configModel"
      :is-selected="isModelSelected(configModel.id)"
      :is-active="configModel.id === activeModelId"
      :capability-keys="CAPABILITY_KEYS"
      :capability-override="modelCapabilities[configModel.id]"
      :context-override="contextLengths[configModel.id] ?? null"
      :registry-context-length="configModel.context_length || configModel.top_provider?.context_length || 0"
      :max-output-override="maxOutputs[configModel.id] ?? null"
      :model-limit="modelLimitOf(configModel)"
      :default-max-output="defaultMaxOutputOf(configModel)"
      :rename-model="renameModel"
      :format-tokens="formatContextLength"
      @back="closeConfig"
      @toggle="$emit('toggle', configModel.id)"
      @set-active="$emit('select-active', configModel.id)"
      @update-context-length="$emit('update-context-length', configModel!.id, $event)"
      @update-max-output="$emit('update-max-output', configModel!.id, $event)"
      @update-capability="(key, value) => $emit('update-capability', configModel!.id, key, value)"
      @reset-capabilities="$emit('reset-capabilities', configModel!.id)"
    />

    <div class="settings-group">
      <div class="model-toolbar">
        <Input
          class="model-search-field"
          input-class="search-input"
          type="text"
          size="small"
          :model-value="searchQuery"
          placeholder="搜索模型"
          :spellcheck="false"
          aria-label="Search models"
          @update:model-value="$emit('update:searchQuery', $event)"
        >
          <template #prefix>
            <Search :size="13" />
          </template>
          <template
            v-if="searchQuery"
            #suffix
          >
            <Button
              unstyled
              native-type="button"
              class="search-clear"
              aria-label="Clear search"
              @click="$emit('update:searchQuery', '')"
            >
              <X :size="12" />
            </Button>
          </template>
        </Input>

        <div class="add-model-row">
          <Input
            ref="addModelInputRef"
            class="add-model-input"
            input-class="add-model-input-native"
            type="text"
            size="small"
            :model-value="newModelInput"
            placeholder="添加模型 ID，例如 qwen3.8-max"
            :spellcheck="false"
            aria-label="Add model by id"
            @update:model-value="$emit('update:newModelInput', $event)"
            @keydown.enter.prevent="submitCustomModel"
          />
          <Button
            unstyled
            native-type="button"
            class="add-model-btn"
            :disabled="!newModelInput.trim()"
            @click="submitCustomModel"
          >
            <Plus :size="13" />
            添加
          </Button>
        </div>
      </div>

      <ModelList
        v-if="entries.length > 0"
        ref="listRef"
        :entries="entries"
        :height="listHeight"
        :row-height="ROW_HEIGHT"
        :highlight-id="highlightId"
        :format-tokens="formatContextLength"
        @toggle="$emit('toggle', $event)"
        @set-active="$emit('select-active', $event)"
        @open-config="openConfig"
      />
      <p
        v-else
        class="model-empty"
      >
        {{ searchQuery ? '没有匹配的模型。' : '还没有模型，点右上角刷新，或在上面手动添加一个 ID。' }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Provider model management.
 *
 * Shape: a windowed list of models, and a second-level page for configuring
 * one. Deliberately NOT a table — the previous VirtualTable version needed
 * 738px of fixed pixel columns inside a ~610px pane, so it scrolled sideways
 * and took the model name (the only thing identifying a row) with it. Row
 * windowing is still required (OpenRouter ships 337 models); column windowing
 * never bought anything here.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { Eye, Image, Wrench, Brain, AudioLines, RefreshCw, Search, X, Plus } from 'lucide-vue-next'
import Button from '@/components/common/Button.vue'
import Input from '@/components/common/Input.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import type { OpenRouterModel, ModelCapabilityOverride } from '@/types'
import ModelList from './ModelList.vue'
import ModelConfigDialog from './ModelConfigDialog.vue'
import type { ModelCapabilityBadge, ModelListEntry } from './model-list-entry'

const CAPABILITY_KEYS: Array<{ key: keyof ModelCapabilityOverride; label: string }> = [
  { key: 'tools', label: '工具调用' },
  { key: 'vision', label: '图像输入' },
  { key: 'reasoning', label: '推理' },
  { key: 'imageOutput', label: '图像输出' },
  { key: 'audio', label: '音频' },
]

const ROW_HEIGHT = 52
const LIST_HEIGHT = 364
const HIGHLIGHT_MS = 1600

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
  contextLengths: Record<string, number>
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

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'toggle', modelId: string): void
  (e: 'update:searchQuery', value: string): void
  (e: 'update:newModelInput', value: string): void
  (e: 'add-custom'): void
  (e: 'update-max-output', modelId: string, value: number | null): void
  (e: 'update-context-length', modelId: string, value: number | null): void
  (e: 'update-capability', modelId: string, key: keyof ModelCapabilityOverride, value: boolean | null): void
  (e: 'reset-capabilities', modelId: string): void
  (e: 'select-active', modelId: string): void
}>()

const listRef = ref<InstanceType<typeof ModelList> | null>(null)
const addModelInputRef = ref<{ focus: () => void } | null>(null)
const configModelId = ref<string | null>(null)
const highlightId = ref<string | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | null = null

/** Ids present in selectedModels but absent from the fetched catalog. */
const customIds = computed(() => {
  const known = new Set(props.models.map(model => model.id))
  return new Set(props.selectedModelsList.filter(id => !known.has(id)))
})

function synthesizeCustomModel(modelId: string): OpenRouterModel {
  return {
    id: modelId,
    name: modelId,
    description: '',
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

function modelLimitOf(model: OpenRouterModel): number {
  return model.top_provider?.max_completion_tokens ?? 0
}

function defaultMaxOutputOf(model: OpenRouterModel): number {
  const limit = modelLimitOf(model)
  return limit > 0 ? Math.max(1, Math.floor(limit / 2)) : 0
}

function capabilityBadges(model: OpenRouterModel): ModelCapabilityBadge[] {
  const badges: ModelCapabilityBadge[] = []
  if (props.hasVision(model)) badges.push({ key: 'vision', label: '图像输入', icon: Eye })
  if (props.hasImageGeneration(model)) badges.push({ key: 'imageOutput', label: '图像输出', icon: Image })
  if (props.hasTools(model)) badges.push({ key: 'tools', label: '工具调用', icon: Wrench })
  if (props.hasReasoning(model)) badges.push({ key: 'reasoning', label: '推理', icon: Brain })
  if (model.architecture?.input_modalities?.includes('audio')) {
    badges.push({ key: 'audio', label: '音频', icon: AudioLines })
  }
  return badges
}

function toEntry(model: OpenRouterModel): ModelListEntry {
  const contextOverride = props.contextLengths[model.id]
  const outputOverride = props.maxOutputs[model.id]
  return {
    model,
    selected: props.isModelSelected(model.id),
    isActive: model.id === props.activeModelId,
    isCustom: customIds.value.has(model.id),
    capabilities: capabilityBadges(model),
    contextLength:
      contextOverride ?? (model.context_length || model.top_provider?.context_length || 0),
    contextOverridden: contextOverride != null,
    maxOutput: outputOverride ?? defaultMaxOutputOf(model),
    outputOverridden: outputOverride != null,
  }
}

/**
 * Ordering: hand-added first, then selected, then the rest. A model you just
 * typed in used to land at the bottom of 337 rows with no feedback — for the
 * OpenRouter-sized catalogs that is indistinguishable from "nothing happened".
 * Search flattens the grouping, since then the query is the ordering intent.
 */
const entries = computed<ModelListEntry[]>(() => {
  const catalog = props.models.length > 0 ? props.filteredModels : []
  const synthesized = [...customIds.value]
    .filter(id => !props.searchQuery || id.toLowerCase().includes(props.searchQuery.toLowerCase()))
    .map(id => synthesizeCustomModel(id))

  const all = [...synthesized, ...catalog].map(toEntry)
  if (props.searchQuery) return all

  const rank = (entry: ModelListEntry) => (entry.isCustom ? 0 : entry.selected ? 1 : 2)
  return all
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => rank(a.entry) - rank(b.entry) || a.index - b.index)
    .map(({ entry }) => entry)
})

const listHeight = computed(() =>
  Math.min(LIST_HEIGHT, Math.max(ROW_HEIGHT, entries.value.length * ROW_HEIGHT)),
)

const configModel = computed<OpenRouterModel | null>(() => {
  if (!configModelId.value) return null
  return entries.value.find(entry => entry.model.id === configModelId.value)?.model ?? null
})

function openConfig(modelId: string) {
  configModelId.value = modelId
}

function closeConfig() {
  configModelId.value = null
}

/** Renaming inside the config page keeps the page open on the new id. */
watch(() => props.selectedModelsList, () => {
  if (configModelId.value && !configModel.value) closeConfig()
})

function flashModel(modelId: string) {
  highlightId.value = modelId
  if (highlightTimer) clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => {
    highlightId.value = null
    highlightTimer = null
  }, HIGHLIGHT_MS)
  void nextTick(() => listRef.value?.scrollToModel(modelId))
}

function submitCustomModel() {
  const modelId = props.newModelInput.trim()
  if (!modelId) return
  emit('add-custom')
  window.requestAnimationFrame(() => addModelInputRef.value?.focus())
  void nextTick(() => flashModel(modelId))
}

watch(() => props.searchQuery, () => {
  void nextTick(() => listRef.value?.scrollToTop())
})
</script>

<style scoped>
.detail-section {
  display: flex;
  flex-direction: column;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.section-label {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  color: var(--settings-ink, var(--ui-text-primary-fg));
  font-size: 13px;
  font-weight: 560;
}
.count-badge {
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  font-size: 11px;
  font-weight: 400;
}
.refresh-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid transparent;
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  transition:
    color var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default);
}
.refresh-btn:hover:not(:disabled) {
  border-color: var(--settings-rule, var(--ui-border-default-border));
  color: var(--settings-ink, var(--ui-text-primary-fg));
}
.refresh-btn :deep(.spinning) {
  animation: provider-models-spin 1s linear infinite;
}
@keyframes provider-models-spin {
  to {
    transform: rotate(360deg);
  }
}

.error-message {
  margin-bottom: 10px;
}

.model-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}
.model-search-field {
  width: 100%;
}
.search-clear {
  display: inline-flex;
  align-items: center;
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  transition: color var(--duration-fast) var(--ease-default);
}
.search-clear:hover {
  color: var(--settings-ink, var(--ui-text-primary-fg));
}
.add-model-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.add-model-input {
  flex: 1 1 auto;
  min-width: 0;
}
.add-model-btn {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 4px;
  padding: 3px 10px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border));
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
  font-size: 12px;
  transition:
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default);
}
.add-model-btn:hover:not(:disabled) {
  border-color: var(--settings-ink-3, var(--ui-text-muted-fg));
  color: var(--settings-ink, var(--ui-text-primary-fg));
}
.add-model-btn:disabled {
  opacity: 0.45;
}

.model-empty {
  padding: 20px 0;
  margin: 0;
  border-top: 1px solid var(--settings-rule, var(--ui-border-default-border));
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  font-size: 12px;
  text-align: center;
}
</style>
