<template>
  <Transition name="composer-extension">
    <section
      v-if="visible"
      :class="['composer-extension-panel', { 'command-palette-panel': variant === 'command' }]"
      :aria-label="title"
      @mousedown.stop
      @click.stop
    >
      <header
        v-if="variant !== 'command'"
        class="composer-extension-header"
      >
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
            {{ countLabel ?? count }}
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
        <span class="composer-extension-message-title">{{ emptyText }}</span>
        <span
          v-if="emptyHint"
          class="composer-extension-message-hint"
        >
          {{ emptyHint }}
        </span>
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
  emptyHint?: string
  loadingText?: string
  countLabel?: string
  variant?: 'default' | 'command'
}>(), {
  count: undefined,
  countLabel: undefined,
  loading: false,
  error: null,
  emptyText: 'No matches',
  emptyHint: '',
  loadingText: 'Loading...',
  variant: 'default',
})
</script>

<style scoped>
.composer-extension-panel {
  --composer-extension-surface: var(
    --ui-surface-composer-extension-bg,
    color-mix(in srgb, var(--ui-surface-input-bg, var(--bg-input, var(--ui-surface-panel-bg, var(--bg-panel, var(--bg))))) 32%, var(--ui-surface-chat-bg, var(--bg-chat, var(--bg))) 68%)
  );
  --composer-extension-border: var(
    --ui-surface-composer-extension-border,
    color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 42%, transparent)
  );
  --composer-extension-divider: color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 24%, transparent);
  --composer-extension-row-hover: color-mix(in srgb, var(--ui-state-hover-bg, var(--hover, var(--ui-surface-panel-bg, var(--panel)))) 34%, transparent);
  --composer-extension-row-selected: color-mix(in srgb, var(--ui-state-selected-bg, var(--selection, var(--ui-accent-primary-fg, var(--accent)))) 18%, transparent);
  --composer-extension-row-selected-border: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 6%, transparent);

  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% - 0.5px);
  z-index: calc(var(--z-dropdown) + 1);
  width: 100%;
  margin: 0;
  border: 0.5px solid var(--composer-extension-border);
  border-bottom-color: var(--composer-extension-divider);
  border-radius: 10px 10px 4px 4px;
  background: var(--composer-extension-surface);
  box-shadow: var(
    --ui-surface-composer-extension-shadow,
    inset 0 1px 0 color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 1.4%, transparent),
    0 -1px 3px rgba(0, 0, 0, 0.018)
  );
  backdrop-filter: blur(8px) saturate(1.01);
  -webkit-backdrop-filter: blur(8px) saturate(1.01);
  overflow: hidden;
}

.composer-extension-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 29px;
  padding: 4px 10px;
  border-bottom: 0.5px solid var(--composer-extension-divider);
}

.composer-extension-title,
.composer-extension-status {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.composer-extension-title {
  gap: 7px;
  color: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 82%, var(--ui-text-muted-fg, var(--muted)) 18%);
  font-size: 12px;
  font-weight: 620;
}

.composer-extension-title :deep(svg) {
  color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 72%, var(--ui-text-muted-fg, var(--muted)) 28%);
  flex-shrink: 0;
}

.composer-extension-status {
  color: var(--ui-text-muted-fg, var(--muted));
  flex-shrink: 0;
}

.composer-extension-count {
  min-width: 20px;
  height: 19px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-surface-panel-bg, var(--panel)) 58%, transparent);
  color: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted, var(--muted))) 86%, transparent);
  font-size: 11px;
  font-weight: 600;
}

.composer-extension-body {
  max-height: min(232px, 32vh);
  overflow-y: auto;
  padding: 4px;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.composer-extension-body::-webkit-scrollbar {
  width: 3px;
}

.composer-extension-body::-webkit-scrollbar-track {
  background: transparent;
}

.composer-extension-body::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 999px;
}

.composer-extension-body:hover,
.composer-extension-body:focus-within {
  scrollbar-color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 14%, transparent) transparent;
}

.composer-extension-body:hover::-webkit-scrollbar-thumb,
.composer-extension-body:focus-within::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 14%, transparent);
}

.composer-extension-body::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 22%, transparent);
}

.composer-extension-message {
  min-height: 34px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 7px 14px;
  color: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted, var(--muted))) 84%, transparent);
  font-size: 12px;
  text-align: center;
}

.composer-extension-message-title,
.composer-extension-message-hint {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composer-extension-message-hint {
  color: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted, var(--muted))) 62%, transparent);
  font-size: 11px;
}

.composer-extension-spinner {
  animation: composer-extension-spin 0.9s linear infinite;
}

:deep(.composer-extension-list) {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

:deep(.composer-extension-row) {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) minmax(42px, 156px);
  align-items: center;
  gap: 7px;
  min-height: 30px;
  padding: 4px 7px;
  border-radius: 6px;
  border: 0.5px solid transparent;
  color: var(--ui-text-primary-fg, var(--text));
  cursor: pointer;
  transition:
    background var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default);
}

:deep(.composer-extension-row:hover) {
  background: var(--composer-extension-row-hover);
}

:deep(.composer-extension-row.selected) {
  border-color: var(--composer-extension-row-selected-border);
  background: var(--composer-extension-row-selected);
}

:deep(.composer-extension-row-icon) {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-surface-panel-bg, var(--panel)) 38%, transparent);
  color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 76%, transparent);
}

:deep(.composer-extension-row.selected .composer-extension-row-icon) {
  color: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 82%, var(--ui-accent-primary-fg, var(--accent)) 18%);
  background: color-mix(in srgb, var(--ui-surface-panel-bg, var(--panel)) 48%, transparent);
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
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12.25px;
  font-weight: 600;
  line-height: 1.18;
}

:deep(.composer-extension-row-description) {
  color: var(--ui-text-muted-fg, var(--text-muted, var(--muted)));
  font-size: 11px;
  line-height: 1.18;
  opacity: 0.64;
}

:deep(.composer-extension-row-meta) {
  justify-self: end;
  max-width: 100%;
  color: var(--ui-text-muted-fg, var(--text-muted, var(--muted)));
  font-size: 11px;
  line-height: 1.18;
  text-align: right;
  opacity: 0.52;
}

:deep(.composer-extension-row.selected .composer-extension-row-meta) {
  color: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));
  opacity: 0.68;
}

.command-palette-panel {
  --composer-extension-surface: var(
    --ui-surface-composer-menu-bg,
    color-mix(in srgb, var(--ui-surface-input-bg, var(--bg-input, var(--ui-surface-panel-bg, var(--bg-panel, var(--bg))))) 38%, var(--ui-surface-chat-bg, var(--bg-chat, var(--bg))) 62%)
  );
  --composer-extension-border: color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 24%, transparent);
  --composer-extension-row-hover: color-mix(in srgb, var(--ui-state-hover-bg, var(--hover, var(--ui-surface-panel-bg, var(--panel)))) 42%, transparent);
  --composer-extension-row-selected: color-mix(in srgb, var(--ui-state-selected-bg, var(--selection, var(--ui-accent-primary-fg, var(--accent)))) 42%, transparent);
  --composer-extension-row-selected-border: color-mix(in srgb, var(--ui-state-selected-border, var(--ui-accent-primary-fg, var(--accent))) 54%, transparent);
  --command-palette-focus-rail: color-mix(in srgb, var(--ui-state-selected-border, var(--ui-accent-primary-fg, var(--accent))) 86%, transparent);
  --command-palette-edge-fade: linear-gradient(to bottom, var(--composer-extension-surface), transparent);
  --command-palette-row-height: 42px;

  left: 0;
  right: 0;
  bottom: calc(100% + 9px);
  width: 100%;
  border-color: var(--composer-extension-border);
  border-bottom-color: var(--composer-extension-border);
  border-radius: 11px;
  background: var(--composer-extension-surface);
  box-shadow: var(
    --ui-surface-composer-popover-shadow,
    0 8px 18px rgba(0, 0, 0, 0.045),
    inset 0 1px 0 color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 1.4%, transparent)
  );
  backdrop-filter: blur(8px) saturate(1.02);
  -webkit-backdrop-filter: blur(8px) saturate(1.02);
  transform-origin: bottom center;
}

.command-palette-panel::before,
.command-palette-panel::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 10px;
  z-index: 2;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.14s var(--ease-default);
}

.command-palette-panel::before {
  top: 0;
  background: var(--command-palette-edge-fade);
}

.command-palette-panel::after {
  bottom: 0;
  background: linear-gradient(to top, var(--composer-extension-surface), transparent);
}

.command-palette-panel:has(.command-palette-list.is-scrollable:not(.at-scroll-start))::before,
.command-palette-panel:has(.command-palette-list.is-scrollable:not(.at-scroll-end))::after {
  opacity: 0.1;
}

.command-palette-panel:has(.composer-extension-body.is-scrollable:not(.at-scroll-start))::before,
.command-palette-panel:has(.composer-extension-body.is-scrollable:not(.at-scroll-end))::after {
  opacity: 0.1;
}

.command-palette-panel .composer-extension-body {
  position: relative;
  z-index: 1;
  max-height: min(calc(var(--command-palette-row-height) * 5 + 12px), 30vh, 286px);
  padding: 6px 7px;
  scroll-padding-block: 10px;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 0.14s var(--ease-default);
}

.command-palette-panel .composer-extension-body::-webkit-scrollbar {
  width: 8px;
}

.command-palette-panel .composer-extension-body::-webkit-scrollbar-thumb {
  background: transparent;
  border: 3px solid transparent;
  background-clip: padding-box;
}

.command-palette-panel .composer-extension-body:hover,
.command-palette-panel .composer-extension-body:focus-within,
.command-palette-panel .composer-extension-body.is-scrollable:hover {
  scrollbar-color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 34%, transparent) transparent;
}

.command-palette-panel .composer-extension-body.is-navigating {
  scrollbar-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 46%, transparent) transparent;
}

.command-palette-panel .composer-extension-body:hover::-webkit-scrollbar-thumb,
.command-palette-panel .composer-extension-body:focus-within::-webkit-scrollbar-thumb,
.command-palette-panel .composer-extension-body.is-scrollable:hover::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 42%, transparent);
  border: 3px solid transparent;
  background-clip: padding-box;
}

.command-palette-panel .composer-extension-body.is-navigating::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 48%, transparent);
  border: 3px solid transparent;
  background-clip: padding-box;
}

.command-palette-panel :deep(.composer-extension-row) {
  grid-template-columns: minmax(0, 1fr) minmax(42px, 132px);
  gap: 10px;
  min-height: var(--command-palette-row-height);
  padding: 0 10px;
  border-radius: 8px;
  border: 0.5px solid transparent;
  position: relative;
  z-index: 1;
  scroll-margin-block: 8px;
  transition:
    color 0.12s var(--ease-default),
    background 0.12s var(--ease-default),
    border-color 0.12s var(--ease-default),
    box-shadow 0.12s var(--ease-default);
  animation: command-palette-row-in 0.16s ease both;
}

.command-palette-panel :deep(.composer-extension-row:nth-child(2)) {
  animation-delay: 0.012s;
}

.command-palette-panel :deep(.composer-extension-row:nth-child(3)) {
  animation-delay: 0.024s;
}

.command-palette-panel :deep(.composer-extension-row:nth-child(4)) {
  animation-delay: 0.036s;
}

.command-palette-panel :deep(.composer-extension-row:nth-child(n + 5)) {
  animation-delay: 0.048s;
}

.command-palette-panel :deep(.command-palette-list) {
  --command-active-top: 0px;
  --command-active-height: var(--command-palette-row-height);

  position: relative;
  isolation: isolate;
  padding-right: 7px;
  gap: 2px;
}

.command-palette-panel :deep(.command-palette-list.has-active-indicator)::before {
  content: '';
  position: absolute;
  left: 0;
  right: 7px;
  top: 0;
  height: var(--command-active-height);
  border: 0.5px solid var(--composer-extension-row-selected-border);
  border-radius: 8px;
  background: var(--composer-extension-row-selected);
  box-shadow:
    inset 2px 0 0 var(--command-palette-focus-rail),
    inset 0 1px 0 color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 3.5%, transparent);
  opacity: 1;
  pointer-events: none;
  transform: translateY(var(--command-active-top));
  transition:
    transform 0.17s cubic-bezier(0.2, 0.82, 0.18, 1),
    height 0.17s cubic-bezier(0.2, 0.82, 0.18, 1),
    opacity var(--duration-fast) var(--ease-default);
  will-change: transform, height;
  z-index: 0;
}

.command-palette-panel :deep(.composer-extension-row-icon) {
  display: none;
}

.command-palette-panel :deep(.composer-extension-row-main) {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  overflow: hidden;
}

.command-palette-panel :deep(.composer-extension-row-title) {
  max-width: min(24ch, 32vw);
  font-size: 13.25px;
  font-weight: 660;
  line-height: 1;
  transition: color 0.12s var(--ease-default), opacity 0.12s var(--ease-default);
}

.command-palette-panel :deep(.composer-extension-row-description),
.command-palette-panel :deep(.composer-extension-row-meta) {
  font-size: 12.35px;
  line-height: 1;
  transition: color 0.12s var(--ease-default), opacity 0.12s var(--ease-default);
}

.command-palette-panel :deep(.composer-extension-row-description) {
  color: color-mix(in srgb, var(--ui-text-secondary-fg, var(--text-secondary, var(--text))) 88%, var(--ui-text-muted-fg, var(--muted)) 12%);
  opacity: 0.82;
}

.command-palette-panel :deep(.composer-extension-row-meta) {
  max-width: min(100%, 132px);
  color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 88%, transparent);
  opacity: 0.54;
}

.command-palette-panel :deep(.composer-extension-row.selected) {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.command-palette-panel :deep(.composer-extension-row:hover:not(.selected)) {
  border-color: color-mix(in srgb, var(--composer-extension-row-selected-border) 18%, transparent);
  background: var(--composer-extension-row-hover);
}

.command-palette-panel :deep(.composer-extension-row.selected .composer-extension-row-title) {
  color: var(--ui-state-selected-fg, var(--ui-text-primary-fg, var(--text)));
}

.command-palette-panel :deep(.composer-extension-row.selected .composer-extension-row-description) {
  color: color-mix(in srgb, var(--ui-state-selected-fg, var(--ui-text-primary-fg, var(--text))) 62%, var(--ui-text-secondary-fg, var(--text-secondary, var(--text))) 38%);
  opacity: 0.92;
}

.command-palette-panel :deep(.composer-extension-row.selected .composer-extension-row-meta) {
  color: color-mix(in srgb, var(--ui-text-secondary-fg, var(--text-secondary, var(--text))) 86%, var(--ui-text-muted-fg, var(--muted)) 14%);
  opacity: 0.7;
}

@media (prefers-reduced-motion: reduce) {
  .command-palette-panel :deep(.command-palette-list.has-active-indicator)::before {
    transition: none;
  }

  .command-palette-panel :deep(.composer-extension-row) {
    animation: none;
  }
}

.composer-extension-enter-active {
  transition: opacity 0.13s ease, transform 0.18s cubic-bezier(0.2, 0.82, 0.18, 1);
}

.composer-extension-leave-active {
  transition: opacity 0.09s ease, transform 0.09s ease;
}

.composer-extension-enter-from,
.composer-extension-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.992);
}

@keyframes command-palette-row-in {
  from {
    opacity: 0;
    transform: translateY(3px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes composer-extension-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 480px) {
  .composer-extension-panel {
    border-radius: 10px 10px 4px 4px;
  }

  .command-palette-panel {
    border-radius: 10px;
  }

  .composer-extension-body {
    max-height: min(220px, 38vh);
  }

  .command-palette-panel .composer-extension-body {
    max-height: min(calc(var(--command-palette-row-height) * 4 + 12px), 34vh);
  }

  :deep(.composer-extension-row) {
    grid-template-columns: 22px minmax(0, 1fr);
  }

  .command-palette-panel :deep(.composer-extension-row) {
    grid-template-columns: 18px minmax(0, 1fr);
  }

  :deep(.composer-extension-row-meta) {
    display: none;
  }
}
</style>
