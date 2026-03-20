<template>
  <div class="default-model-section">
    <h3 class="section-label">Default Model</h3>
    <div class="settings-group">
      <div class="settings-row">
        <span class="row-label">Provider</span>
        <select
          class="row-select"
          :value="currentProvider"
          @change="$emit('update:provider', ($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="provider in enabledProviders"
            :key="provider.id"
            :value="provider.id"
          >
            {{ provider.name }}
          </option>
        </select>
      </div>
      <div class="settings-row">
        <span class="row-label">Model</span>
        <select
          class="row-select"
          :value="currentModel"
          @change="$emit('update:model', ($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="modelId in selectedModels"
            :key="modelId"
            :value="modelId"
          >
            {{ getModelName(modelId) }}
          </option>
        </select>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ProviderInfo } from '@/types'

interface Props {
  enabledProviders: ProviderInfo[]
  currentProvider: string
  currentModel: string
  selectedModels: string[]
  getModelName: (modelId: string) => string
}

interface Emits {
  (e: 'update:provider', providerId: string): void
  (e: 'update:model', modelId: string): void
}

defineProps<Props>()
defineEmits<Emits>()
</script>

<style scoped>
.default-model-section {
  flex-shrink: 0;
}

.section-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 8px 2px;
}

.settings-group {
  background: rgba(128, 128, 128, 0.06);
  border-radius: 10px;
  overflow: hidden;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  padding: 0 14px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.1);
}

.settings-row:last-child {
  border-bottom: none;
}

.row-label {
  font-size: 13px;
  color: var(--text);
}

.row-select {
  padding: 5px 24px 5px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 4px center;
  text-align: right;
}

.row-select:hover {
  color: var(--text);
}

.row-select:focus {
  outline: none;
}

.row-select option {
  background: var(--bg);
  color: var(--text);
  text-align: left;
}
</style>
