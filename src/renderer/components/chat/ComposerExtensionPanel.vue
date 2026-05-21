<template>
  <Transition name="composer-extension">
    <section
      v-if="visible"
      class="composer-extension-panel"
      @mousedown.stop
      @click.stop
    >
      <header class="composer-extension-header">
        <div class="composer-extension-title">
          <slot name="icon" />
          <span>{{ title }}</span>
        </div>
        <div class="composer-extension-status">
          <Loader2
            v-if="loading"
            class="composer-extension-spinner"
            :size="14"
          />
          <span
            v-else-if="count !== undefined"
            class="composer-extension-count"
          >
            {{ count }}
          </span>
        </div>
      </header>

      <div
        v-if="error"
        class="composer-extension-message"
      >
        {{ error }}
      </div>
      <div
        v-else-if="loading && !count"
        class="composer-extension-message"
      >
        <Loader2
          class="composer-extension-spinner"
          :size="15"
        />
        <span>{{ loadingText }}</span>
      </div>
      <div
        v-else-if="!count"
        class="composer-extension-message"
      >
        {{ emptyText }}
      </div>
      <div
        v-else
        class="composer-extension-body"
      >
        <slot />
      </div>
    </section>
  </Transition>
</template>

<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'

withDefaults(defineProps<{
  visible: boolean
  title: string
  count?: number
  loading?: boolean
  error?: string | null
  emptyText?: string
  loadingText?: string
}>(), {
  count: undefined,
  loading: false,
  error: null,
  emptyText: 'No matches',
  loadingText: 'Loading...',
})
</script>

<style scoped>
.composer-extension-panel {
  position: relative;
  z-index: calc(var(--z-dropdown) + 1);
  width: calc(100% - 20px);
  margin: 0 auto -1px;
  border: 0.5px solid color-mix(in srgb, rgba(var(--accent-rgb), 0.30) 30%, var(--border));
  border-bottom-color: rgba(var(--accent-rgb), 0.18);
  border-radius: 14px 14px 8px 8px;
  background: rgba(var(--bg-rgb, 30, 30, 35), 0.66);
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.10), 0 0 0 0.5px rgba(var(--accent-rgb), 0.06);
  backdrop-filter: blur(24px) saturate(1.16);
  -webkit-backdrop-filter: blur(24px) saturate(1.16);
  overflow: hidden;
}

.composer-extension-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 36px;
  padding: 8px 12px 7px;
  border-bottom: 0.5px solid rgba(var(--accent-rgb), 0.12);
}

.composer-extension-title,
.composer-extension-status {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.composer-extension-title {
  gap: 8px;
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
}

.composer-extension-title :deep(svg) {
  color: var(--accent);
  flex-shrink: 0;
}

.composer-extension-status {
  color: var(--muted);
  flex-shrink: 0;
}

.composer-extension-count {
  min-width: 22px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(var(--accent-rgb), 0.10);
  color: var(--text-muted, var(--muted));
  font-size: 11px;
  font-weight: 600;
}

.composer-extension-body {
  max-height: min(304px, 38vh);
  overflow-y: auto;
  padding: 6px;
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--accent-rgb), 0.32) transparent;
}

.composer-extension-body::-webkit-scrollbar {
  width: 4px;
}

.composer-extension-body::-webkit-scrollbar-track {
  background: transparent;
}

.composer-extension-body::-webkit-scrollbar-thumb {
  background: rgba(var(--accent-rgb), 0.28);
  border-radius: 999px;
}

.composer-extension-message {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 18px;
  color: var(--text-muted, var(--muted));
  font-size: 13px;
  text-align: center;
}

.composer-extension-spinner {
  animation: composer-extension-spin 0.9s linear infinite;
}

:deep(.composer-extension-list) {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

:deep(.composer-extension-row) {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  min-height: 38px;
  padding: 6px 8px;
  border-radius: 8px;
  color: var(--text);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-default), color var(--duration-fast) var(--ease-default);
}

:deep(.composer-extension-row:hover),
:deep(.composer-extension-row.selected) {
  background: rgba(var(--accent-rgb), 0.10);
}

:deep(.composer-extension-row-icon) {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: rgba(var(--accent-rgb), 0.08);
  color: var(--muted);
}

:deep(.composer-extension-row.selected .composer-extension-row-icon) {
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.16);
}

:deep(.composer-extension-row-main) {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

:deep(.composer-extension-row-title),
:deep(.composer-extension-row-description),
:deep(.composer-extension-row-meta) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.composer-extension-row-title) {
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
}

:deep(.composer-extension-row-description) {
  color: var(--text-muted, var(--muted));
  font-size: 11px;
  line-height: 1.25;
  opacity: 0.72;
}

:deep(.composer-extension-row-meta) {
  max-width: 150px;
  color: var(--text-muted, var(--muted));
  font-size: 11px;
  opacity: 0.62;
}

:deep(.composer-extension-row.selected .composer-extension-row-meta) {
  color: var(--accent);
  opacity: 0.9;
}

.composer-extension-enter-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.composer-extension-leave-active {
  transition: opacity 0.11s ease, transform 0.11s ease;
}

.composer-extension-enter-from,
.composer-extension-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@keyframes composer-extension-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 480px) {
  .composer-extension-panel {
    width: calc(100% - 8px);
    border-radius: 12px 12px 7px 7px;
  }

  .composer-extension-body {
    max-height: min(260px, 42vh);
  }

  :deep(.composer-extension-row) {
    grid-template-columns: 26px minmax(0, 1fr);
  }

  :deep(.composer-extension-row-meta) {
    display: none;
  }
}
</style>
