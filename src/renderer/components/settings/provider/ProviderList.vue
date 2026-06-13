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
      <Button
        v-if="isUserCustomProvider(provider.id)"
        unstyled
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
      </Button>
    </div>

    <div class="provider-list-divider" />
    <Button
      unstyled
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
    </Button>
  </aside>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
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
  width: 240px;
  min-width: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 12px;
  background: var(--settings-paper, var(--ui-surface-app-bg, var(--bg)));
  overflow: hidden;
  position: sticky;
  top: 0;
  align-self: flex-start;
}

.provider-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 0 14px;
  border: 0;
  border-bottom: 1px solid var(--settings-rule-soft, rgba(128, 128, 128, 0.08));
  border-radius: 0;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--settings-ink-2, var(--ui-text-primary-fg, var(--text-primary)));
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.provider-item:last-of-type {
  border-bottom: 0;
}

.provider-item:hover {
  background: var(--settings-paper-2, var(--ui-state-hover-bg, var(--hover)));
}

.provider-item.active {
  border-color: transparent;
  background: var(--settings-accent-tint, var(--settings-paper-2));
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text-primary)));
  box-shadow: none;
}

.provider-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 2px;
  border-radius: 2px;
  background: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.provider-item.active .provider-edit-btn {
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--text-muted)));
}

.provider-item.active .provider-edit-btn:hover {
  color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  background: var(--settings-paper-2, var(--ui-state-hover-bg, var(--bg-hover)));
}

.provider-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.enabled-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  flex-shrink: 0;
}

.provider-item.active .enabled-indicator {
  background: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.provider-edit-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--text-muted)));
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
  background: var(--settings-paper-2, var(--ui-state-hover-bg, var(--hover)));
  color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.provider-list-divider {
  height: 1px;
  background: var(--settings-rule-soft, var(--ui-border-default-border, var(--border)));
  margin: 0;
}

.add-provider-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 0 14px;
  border: 0;
  background: transparent;
  border-radius: 0;
  color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-provider-btn:hover {
  background: var(--settings-paper-2, color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent));
}
</style>
