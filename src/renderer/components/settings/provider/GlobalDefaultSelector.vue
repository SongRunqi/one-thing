<template>
  <div class="global-default-section">
    <div class="global-default-header">
      <svg
        class="default-icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
      <span class="default-label">Default Model</span>
    </div>
    <div class="global-default-selectors">
      <div class="selector-group">
        <label class="selector-label">Provider</label>
        <select
          class="global-select"
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
      <div class="selector-group">
        <label class="selector-label">Model</label>
        <select
          class="global-select"
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
/* Global Default Section */
.global-default-section {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 16px;
  background: linear-gradient(135deg,
    rgba(var(--accent-rgb), 0.08) 0%,
    rgba(var(--accent-rgb), 0.02) 100%
  );
  border: 1px solid rgba(var(--accent-rgb), 0.15);
  border-radius: 10px;
  flex-shrink: 0;
}

.global-default-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.default-icon {
  color: var(--accent);
}

.default-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.global-default-selectors {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.selector-group {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.selector-group:last-child {
  flex: 1;
  min-width: 0;
}

.selector-group .selector-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.global-select {
  padding: 6px 28px 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  transition: all 0.15s ease;
  min-width: 0;
  max-width: 100%;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.selector-group:first-child .global-select {
  min-width: 120px;
}

.selector-group:last-child .global-select {
  flex: 1;
  min-width: 0;
}

.global-select:hover {
  border-color: var(--accent);
}

.global-select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.1);
}

.global-select option {
  padding: 8px;
  background: var(--bg);
  color: var(--text-primary);
}
</style>
