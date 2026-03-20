<template>
  <section class="detail-section">
    <!-- Section header (outside group) -->
    <div class="section-header">
      <h3 class="section-label">Models <span class="count-badge">{{ selectedCount }} selected</span></h3>
      <button
        class="refresh-btn"
        @click="$emit('refresh')"
        :disabled="isLoading"
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
          <path d="M23 4v6h-6M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
        </svg>
        {{ isLoading ? 'Loading...' : models.length === 0 ? 'Fetch Models' : 'Refresh' }}
      </button>
    </div>

    <div v-if="error" class="error-message">{{ error }}</div>

    <!-- Models group container -->
    <div class="settings-group">
      <!-- Search row -->
      <div v-if="models.length > 0" class="search-row">
        <svg class="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          :value="searchQuery"
          type="text"
          class="search-input"
          placeholder="Search models..."
          @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
        />
        <button
          v-if="searchQuery"
          class="search-clear"
          @click="$emit('update:searchQuery', '')"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Selected models (always shown) -->
      <div v-if="selectedModelsList.length > 0 && models.length === 0" class="model-list-static">
        <label
          v-for="modelId in selectedModelsList"
          :key="modelId"
          class="model-row selected"
        >
          <span class="model-check checked">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </span>
          <span class="model-name">{{ modelId }}</span>
        </label>
      </div>

      <!-- Model rows (virtual scroll, shown after fetch) -->
      <template v-if="models.length > 0">
        <div v-if="filteredModels.length > 0" class="model-list" @scroll="onScroll" ref="listRef">
          <div :style="{ paddingTop: topPad + 'px', paddingBottom: bottomPad + 'px' }">
            <label
              v-for="model in visibleModels"
              :key="model.id"
              class="model-row"
              @click="$emit('toggle', model.id)"
            >
              <span :class="['model-check', { checked: isModelSelected(model.id) }]">
                <svg v-if="isModelSelected(model.id)" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </span>
              <span class="model-name">{{ model.name || model.id }}</span>
              <span class="model-caps">
                <Eye v-if="hasVision(model)" :size="11" />
                <Image v-if="hasImageGeneration(model)" :size="11" />
                <Wrench v-if="hasTools(model)" :size="11" />
                <Brain v-if="hasReasoning(model)" :size="11" />
              </span>
              <span class="model-ctx">{{ formatContextLength(model.context_length) }}</span>
            </label>
          </div>
        </div>

        <!-- No results -->
        <div v-else-if="searchQuery" class="empty-row">
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
        />
        <button class="add-model-btn" @click="$emit('add-custom')" :disabled="!newModelInput.trim()">
          Add
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Eye, Image, Wrench, Brain } from 'lucide-vue-next'
import type { OpenRouterModel } from '@/types'

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
}

const props = defineProps<Props>()
defineEmits<Emits>()

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
  margin-bottom: 8px;
}

.section-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 0 2px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.count-badge {
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  text-transform: none;
  letter-spacing: 0;
}

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  font-size: 11px;
  color: var(--muted);
  cursor: pointer;
  transition: color 0.1s ease;
}

.refresh-btn:hover:not(:disabled) {
  color: var(--text);
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
  background: rgba(128, 128, 128, 0.06);
  border-radius: 10px;
  overflow: hidden;
}

/* ── Search row ── */
.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.1);
}

.search-icon {
  color: var(--muted);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  outline: none;
}

.search-input::placeholder {
  color: var(--muted);
}

.search-clear {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  border-radius: 3px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-clear:hover {
  color: var(--text);
}

/* ── Model list (virtual scroll container) ── */
.model-list {
  height: 240px;
  overflow-y: auto;
}

.model-list::-webkit-scrollbar { width: 4px; }
.model-list::-webkit-scrollbar-track { background: transparent; }
.model-list::-webkit-scrollbar-thumb { background: transparent; border-radius: 2px; }
.model-list:hover::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.25); }

.model-row {
  display: flex;
  align-items: center;
  padding: 7px 12px;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  height: 34px;
  box-sizing: border-box;
  border-bottom: 1px solid rgba(128, 128, 128, 0.06);
  transition: background 0.08s ease;
}

.model-row:last-child {
  border-bottom: none;
}

.model-row:hover {
  background: rgba(128, 128, 128, 0.06);
}

.model-check {
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--border);
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.model-check.checked {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.model-name {
  flex: 1;
  font-weight: 450;
  color: var(--text);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-caps {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  color: var(--muted);
}

.model-ctx {
  color: var(--muted);
  font-size: 11px;
  min-width: 32px;
  text-align: right;
  flex-shrink: 0;
}

.empty-row {
  padding: 20px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}

.error-message {
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.08);
  border-radius: 8px;
  color: #ef4444;
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
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.1s ease;
}

.fetch-btn:hover:not(:disabled) {
  background: rgba(128, 128, 128, 0.1);
}

.fetch-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Add model ── */
.add-model-row {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
}

.add-model-input {
  flex: 1;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  outline: none;
}

.add-model-input::placeholder {
  color: var(--muted);
}

.add-model-btn {
  padding: 4px 12px;
  border: none;
  border-radius: 6px;
  background: var(--accent);
  color: white;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.add-model-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
