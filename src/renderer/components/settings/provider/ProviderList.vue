<template>
  <aside class="provider-list">
    <div
      v-for="provider in providers"
      :key="provider.id"
      :class="['provider-item', { active: viewingProvider === provider.id }]"
      @click="$emit('switch', provider.id)"
    >
      <ProviderIcon
        :provider="provider.id"
        :size="18"
      />
      <span class="provider-name">{{ provider.name }}</span>
      <span
        v-if="isProviderEnabled(provider.id)"
        class="enabled-indicator"
        title="Enabled in chat"
      />
      <button
        v-if="isUserCustomProvider(provider.id)"
        class="provider-edit-btn"
        title="Edit provider"
        @click.stop="$emit('edit', provider.id)"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
    </div>

    <div class="provider-list-divider" />
    <button
      class="add-provider-btn"
      @click="$emit('add')"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span>Add Custom</span>
    </button>
  </aside>
</template>

<script setup lang="ts">
import type { ProviderInfo } from '@/types'
import ProviderIcon from '../ProviderIcon.vue'

interface Props {
  providers: ProviderInfo[]
  viewingProvider: string
  isProviderEnabled: (providerId: string) => boolean
  isUserCustomProvider: (providerId: string) => boolean
}

interface Emits {
  (e: 'switch', providerId: string): void
  (e: 'edit', providerId: string): void
  (e: 'add'): void
}

defineProps<Props>()
defineEmits<Emits>()
</script>

<style scoped>
/* Left: Provider List */
.provider-list {
  width: 200px;
  min-width: 200px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.provider-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  transition: all 0.15s ease;
  position: relative;
}

.provider-item:hover {
  background: var(--hover);
}

.provider-item.active {
  background: var(--accent);
  color: white;
}

.provider-item.active .provider-edit-btn {
  color: rgba(255, 255, 255, 0.7);
}

.provider-item.active .provider-edit-btn:hover {
  color: white;
  background: rgba(255, 255, 255, 0.15);
}

.provider-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.enabled-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}

.provider-item.active .enabled-indicator {
  background: rgba(255, 255, 255, 0.5);
}

.provider-edit-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.15s ease;
}

.provider-item:hover .provider-edit-btn {
  opacity: 1;
}

.provider-edit-btn:hover {
  background: var(--hover);
  color: var(--accent);
}

.provider-list-divider {
  height: 1px;
  background: var(--border);
  margin: 8px 0;
}

.add-provider-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-provider-btn:hover {
  background: rgba(59, 130, 246, 0.1);
}
</style>
