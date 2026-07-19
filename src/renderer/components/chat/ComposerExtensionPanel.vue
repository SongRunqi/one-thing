<template>
  <Transition name="composer-extension">
    <section
      v-if="visible"
      :class="['composer-extension-panel', { 'command-palette-panel': variant === 'command' }]"
      :aria-label="title"
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
            {{ countLabel ?? count }}
          </span>
        </div>
      </header>

      <!-- Fixed chrome between header and the scrolling body (e.g. the model
           picker's search + provider filter rows). -->
      <slot name="subheader" />

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

      <footer
        v-if="variant === 'command'"
        class="composer-extension-hints"
        aria-hidden="true"
      >
        <span>↑↓ move</span>
        <span>⏎ run</span>
        <span>tab complete</span>
        <span>esc dismiss</span>
      </footer>
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
  /* Floating overlay shell, shared by every picker variant. Speaks the same
     popover language as the toolbar dropdowns (.inputbox-select-dropdown):
     same surface, border mix, radius and shadow. */
  --composer-extension-surface: var(--ui-surface-menu-bg, var(--ui-surface-overlay-bg, var(--ui-composer-overlay-bg)));
  --composer-extension-divider: color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 24%, transparent);
  --composer-extension-row-hover: var(--ui-state-hover-bg, var(--hover));
  --composer-extension-row-selected: var(--ui-state-selected-bg, var(--bg-selected, var(--ui-state-hover-bg, var(--hover))));
  --composer-extension-row-selected-hover: var(--ui-state-selected-hover-bg, var(--ui-state-active-bg, var(--composer-extension-row-selected)));

  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 9px);
  z-index: calc(var(--z-dropdown) + 1);
  width: 100%;
  margin: 0;
  border: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 76%, var(--ui-text-primary-fg, var(--text)) 8%);
  border-radius: 12px;
  background: var(--composer-extension-surface);
  background-clip: padding-box;
  box-shadow:
    0 18px 46px rgba(0, 0, 0, 0.34),
    0 0 0 1px rgba(255, 255, 255, 0.03),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transform-origin: bottom center;
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
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 2px;
  text-transform: uppercase;
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
  overscroll-behavior: contain;
  padding: 6px;
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

.composer-extension-hints {
  display: flex;
  gap: 18px;
  margin: 0 18px;
  padding: 7px 0 8px;
  border-top: 1px solid var(--composer-extension-divider);
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.5px;
}

:deep(.composer-extension-list) {
  display: flex;
  flex-direction: column;
  gap: 0;
}

:deep(.composer-extension-row) {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) minmax(42px, 156px);
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 4px 8px;
  border-radius: 8px;
  color: var(--ui-text-primary-fg, var(--text));
  cursor: pointer;
  transition:
    background 0.12s var(--ease-default),
    color 0.12s var(--ease-default);
}

:deep(.composer-extension-row:hover) {
  background: var(--composer-extension-row-hover);
}

:deep(.composer-extension-row.selected) {
  background: var(--composer-extension-row-selected);
}

:deep(.composer-extension-row.selected:hover) {
  background: var(--composer-extension-row-selected-hover);
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

/* Command palette follows the ledger mockup
   (docs/design/command-palette/inkline-four-options.html, 案一 · 账页):
   every entry sits on a ruled accent line, a vertical binding rule
   separates the kind margin from the entry, and a dotted leader bridges
   command → description. Selecting an entry "books" it — kind and title
   gain ink, ⏎ lands at the line's end — no background fill anywhere. */
.command-palette-panel {
  --command-palette-row-height: 34px;
  --command-palette-accent: var(--ui-accent-primary-fg, var(--accent));
  --command-palette-rule: color-mix(in srgb, var(--command-palette-accent) 22%, transparent);
  --command-palette-margin-col: 52px;

  border-color: color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 42%, transparent);
  border-radius: 6px;
  box-shadow: 0 22px 48px rgba(0, 0, 0, 0.5);
}

/* Binding rule: one vertical accent hairline spanning header, list and
   hints, fixed in place while the list scrolls beneath it. Suppressed in
   message states (empty / loading / error) where it would cross the text. */
.command-palette-panel:has(.composer-extension-body)::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--command-palette-margin-col);
  border-left: 1px solid color-mix(in srgb, var(--command-palette-accent) 45%, transparent);
  pointer-events: none;
}

.command-palette-panel .composer-extension-header {
  min-height: var(--command-palette-row-height);
  padding: 4px 16px 4px calc(var(--command-palette-margin-col) + 12px);
  border-bottom: 1px solid var(--command-palette-rule);
}

.command-palette-panel .composer-extension-count {
  height: auto;
  min-width: 0;
  padding: 0;
  border-radius: 0;
  background: none;
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
}

.command-palette-panel .composer-extension-body {
  max-height: min(calc(var(--command-palette-row-height) * 6), 30vh, 286px);
  padding: 0;
  scrollbar-gutter: stable;
}

.command-palette-panel :deep(.command-palette-list) {
  position: relative;
  gap: 0;
}

/* No scroll-margin/scroll-padding: keyboard navigation aligns the selected
   row flush with the scrollport edge, so at the boundary the highlight stays
   pinned in the first/last visible slot and the content pages by one row.
   No transition either: paging scrolls instantly, and a fading highlight
   would ride along with the old row for ~120ms before settling. */
.command-palette-panel :deep(.composer-extension-row) {
  grid-template-columns: var(--command-palette-margin-col) minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 12px;
  min-height: var(--command-palette-row-height);
  padding: 8px 16px 8px 0;
  border-bottom: 1px solid var(--command-palette-rule);
  border-radius: 0;
  transition: none;
}

/* The hints footer's top rule takes over under the last entry. */
.command-palette-panel :deep(.composer-extension-row:last-child) {
  border-bottom: none;
}

.command-palette-panel :deep(.composer-extension-row:hover),
.command-palette-panel :deep(.composer-extension-row.selected),
.command-palette-panel :deep(.composer-extension-row.selected:hover) {
  background: none;
}

.command-palette-panel :deep(.command-kind) {
  align-self: center;
  overflow: hidden;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  font-family: var(--font-mono, monospace);
  font-size: 9.5px;
  letter-spacing: 0.4px;
  line-height: 1;
  text-align: center;
  text-transform: uppercase;
}

.command-palette-panel :deep(.composer-extension-row:hover .command-kind) {
  color: var(--ui-text-muted-fg, var(--muted));
}

.command-palette-panel :deep(.composer-extension-row.selected .command-kind) {
  color: var(--command-palette-accent);
  font-weight: 650;
}

.command-palette-panel :deep(.composer-extension-row-icon) {
  display: none;
}

.command-palette-panel :deep(.composer-extension-row-main) {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 0;
  overflow: hidden;
}

.command-palette-panel :deep(.composer-extension-row-title) {
  flex: none;
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.15;
}

.command-palette-panel :deep(.composer-extension-row.selected .composer-extension-row-title) {
  font-weight: 700;
}

.command-palette-panel :deep(.command-hit) {
  color: var(--command-palette-accent);
}

/* Dotted leader bridging entry name → description, ledger style. */
.command-palette-panel :deep(.command-leader) {
  flex: 1 1 28px;
  min-width: 28px;
  align-self: center;
  margin: 0 10px;
  border-bottom: 1px dotted color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 42%, transparent);
  transform: translateY(2px);
}

.command-palette-panel :deep(.composer-extension-row-description) {
  flex: 0 1 auto;
  color: var(--ui-text-muted-fg, var(--text-muted, var(--muted)));
  font-size: 12px;
  line-height: 1.15;
  opacity: 0.72;
}

.command-palette-panel :deep(.composer-extension-row:hover .composer-extension-row-description) {
  opacity: 0.9;
}

.command-palette-panel :deep(.composer-extension-row.selected .composer-extension-row-description) {
  color: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));
  opacity: 1;
}

.command-palette-panel :deep(.composer-extension-row-kbd) {
  justify-self: end;
  min-width: 1.5em;
  color: var(--command-palette-accent);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.15;
  text-align: right;
}

.command-palette-panel .composer-extension-hints {
  margin: 0;
  padding: 7px 16px 8px calc(var(--command-palette-margin-col) + 12px);
  border-top: 1px solid var(--command-palette-rule);
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

@keyframes composer-extension-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 480px) {
  .composer-extension-panel {
    border-radius: 6px;
  }

  .composer-extension-body {
    max-height: min(220px, 38vh);
  }

  .command-palette-panel {
    --command-palette-margin-col: 44px;
  }

  .command-palette-panel .composer-extension-body {
    max-height: min(calc(var(--command-palette-row-height) * 4), 34vh);
  }

  :deep(.composer-extension-row) {
    grid-template-columns: 22px minmax(0, 1fr);
  }

  .command-palette-panel :deep(.composer-extension-row) {
    grid-template-columns: var(--command-palette-margin-col) minmax(0, 1fr);
  }

  :deep(.composer-extension-row-meta),
  .command-palette-panel :deep(.composer-extension-row-kbd) {
    display: none;
  }
}
</style>
