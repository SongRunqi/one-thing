<template>
  <section class="detail-section">
    <div class="section-header">
      <h3 class="section-title">
        Models <span class="count-badge">{{ selectedCount }} selected</span>
      </h3>
      <button
        class="refresh-btn"
        :disabled="isLoading"
        @click="$emit('refresh')"
      >
        <svg
          :class="{ spinning: isLoading }"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M23 4v6h-6M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
        </svg>
        {{ isLoading ? 'Loading...' : 'Refresh' }}
      </button>
    </div>

    <div
      v-if="error"
      class="error-message"
    >
      {{ error }}
    </div>

    <!-- Search box -->
    <div
      v-if="models.length > 0"
      class="model-search"
    >
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
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Model List -->
    <div
      v-if="filteredModels.length > 0"
      class="model-list"
    >
      <label
        v-for="model in filteredModels"
        :key="model.id"
        :class="['model-row', { selected: isModelSelected(model.id) }]"
        @click="$emit('toggle', model.id)"
      >
        <span class="model-checkbox">
          <svg
            v-if="isModelSelected(model.id)"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </span>
        <span class="model-name">{{ model.name || model.id }}</span>
        <span class="model-caps">
          <Eye
            v-if="hasVision(model)"
            :size="12"
            title="Vision"
          />
          <Image
            v-if="hasImageGeneration(model)"
            :size="12"
            title="Image Generation"
          />
          <Wrench
            v-if="hasTools(model)"
            :size="12"
            title="Tool Use"
          />
          <Brain
            v-if="hasReasoning(model)"
            :size="12"
            title="Reasoning"
          />
        </span>
        <span class="model-context">{{ formatContextLength(model.context_length) }}</span>
      </label>
    </div>

    <!-- No results -->
    <div
      v-else-if="searchQuery"
      class="no-results"
    >
      No models match "{{ searchQuery }}"
    </div>

    <!-- Add custom model -->
    <div
      v-else
      class="add-model-section"
    >
      <div class="add-model-row">
        <input
          :value="newModelInput"
          type="text"
          class="form-input"
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
      <p class="form-hint">
        Enter model name or click Refresh to fetch available models
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Eye, Image, Wrench, Brain } from 'lucide-vue-next'
import type { OpenRouterModel } from '@/types'

interface Props {
  models: OpenRouterModel[]
  filteredModels: OpenRouterModel[]
  selectedCount: number
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

defineProps<Props>()
defineEmits<Emits>()
</script>

<style scoped>
.detail-section {
  margin-bottom: 20px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.section-header .section-title {
  margin-bottom: 0;
}

.count-badge {
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
}

/* Refresh Button */
.refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.refresh-btn:hover:not(:disabled) {
  background: var(--hover);
  color: var(--text-primary);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.refresh-btn svg.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Model Search */
.model-search {
  position: relative;
  margin-bottom: 8px;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}

.search-input {
  width: 100%;
  padding: 8px 32px 8px 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--hover);
  color: var(--text-primary);
  font-size: 13px;
  transition: all 0.15s ease;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-clear:hover {
  background: var(--hover);
  color: var(--text-primary);
}

/* Model List */
.model-list {
  border-radius: 8px;
  overflow: hidden;
  max-height: 280px;
  overflow-y: auto;
}

.model-list::-webkit-scrollbar {
  width: 6px;
}

.model-list::-webkit-scrollbar-track {
  background: transparent;
}

.model-list::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 3px;
  transition: background 0.2s;
}

.model-list:hover::-webkit-scrollbar-thumb {
  background: var(--border);
}

.model-list::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

.model-row {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  gap: 10px;
  border-radius: 6px;
  margin-bottom: 2px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.1s ease;
}

.model-row:last-child {
  margin-bottom: 0;
}

.model-row:hover {
  background: var(--hover);
}

.model-row.selected {
  background: rgba(59, 130, 246, 0.08);
}

.model-checkbox {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.model-row.selected .model-checkbox {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.model-name {
  flex: 1;
  font-weight: 500;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-caps {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  color: var(--text-muted);
}

.model-context {
  color: var(--text-muted);
  font-size: 11px;
  min-width: 40px;
  text-align: right;
  flex-shrink: 0;
}

.no-results {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.error-message {
  padding: 10px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 6px;
  color: #ef4444;
  font-size: 12px;
  margin-bottom: 12px;
}

/* Add Model Section */
.add-model-section {
  padding: 16px;
  background: var(--hover);
  border-radius: 8px;
}

.add-model-row {
  display: flex;
  gap: 8px;
}

.add-model-row .form-input {
  flex: 1;
}

.form-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--hover);
  color: var(--text-primary);
  font-size: 13px;
  transition: all 0.15s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.add-model-btn {
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-model-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.add-model-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 6px;
}
</style>
