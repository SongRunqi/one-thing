<template>
  <Transition name="composer-extension">
    <section
      v-if="visible"
      class="composer-extension-panel"
      :class="{ 'is-floating': floating, 'is-down': placement === 'down' }"
      :aria-label="title"
      @mousedown.stop
      @click.stop
    >
      <header class="composer-extension-header">
        <span class="composer-extension-title">{{ title }}</span>
        <Loader2
          v-if="loading"
          class="composer-extension-spinner"
          :size="10"
        />
        <span
          v-else-if="count !== undefined"
          class="composer-extension-count"
        >
          {{ countLabel ?? count }}
        </span>
      </header>

      <!-- Fixed chrome between the frame label and the scrolling body (e.g. the
           model picker's search + provider filter rows). -->
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
        v-if="hints.length"
        class="composer-extension-hints"
        aria-hidden="true"
      >
        <span
          v-for="hint in hints"
          :key="hint"
        >{{ hint }}</span>
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
  /** Keyboard legend drawn under the list; omit for no footer. */
  hints?: string[]
  /** The panel normally glues itself to the composer's top edge. Set this when
   *  the trigger lives elsewhere (the tab header's agent chip) and the consumer
   *  supplies fixed coordinates itself — only the drawn look stays shared. */
  floating?: boolean
  /** Which way the panel opens, so the entry transition grows from the trigger. */
  placement?: 'up' | 'down'
}>(), {
  count: undefined,
  countLabel: undefined,
  loading: false,
  error: null,
  emptyText: 'No matches',
  emptyHint: '',
  loadingText: 'Loading...',
  hints: () => [],
  floating: false,
  placement: 'up',
})
</script>

<style scoped>
/**
 * One shell and one row grammar for every composer flyout — files, skills,
 * paths, commands. They were forked by a `variant` prop that restyled the
 * command palette end to end; the fork is gone, so a row reads the same
 * wherever it appears and only its content differs.
 *
 * The look is the composer's own (InputBox.vue): a single drawn hairline
 * frame at --radius-xs with zero fill, its label notched into the top edge.
 * Inside, nothing is ruled: no leader lines, no row dividers. Separation is
 * carried by whitespace, a soft tab stop, and ink weight — the whole panel
 * draws exactly two lines, its frame and the hints rule.
 */
.composer-extension-panel {
  --composer-extension-frame: var(--ui-border-strong-border);
  --composer-extension-surface: var(--ui-surface-chat-bg);
  --composer-extension-row-hover: var(--ui-state-hover-bg);
  /* The soft tab stop: descriptions start on one invisible vertical edge, so
     the eye scans a column without a drawn rule to do it. */
  --composer-extension-tab-stop: 152px;

  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 9px);
  z-index: calc(var(--z-dropdown) + 1);
  width: 100%;
  margin: 0;
  padding: 9px 0 4px;
  border: 1px solid color-mix(in srgb, var(--composer-extension-frame) 52%, transparent);
  border-radius: var(--radius-xs, 4px);
  background: var(--composer-extension-surface);
  background-clip: padding-box;
  transform-origin: bottom center;
  /* The frame label hangs above the top border; the body scrolls on its own
     overflow, so nothing here needs clipping. */
  overflow: visible;
}

/* Floating mode: the panel sits inside a Popover, which owns the coordinates
   and the stacking level, so every self-positioning declaration above is
   released and the panel simply fills the layer it was handed. The frame, the
   notched label, the row grammar and the hints rule stay exactly as they are —
   that is the whole point of sharing the shell. (`relative`, not `static`: the
   notched header is absolutely positioned against this box.) */
.composer-extension-panel.is-floating {
  position: relative;
  inset: auto;
  width: auto;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
}

/* The header is not a row — it is the frame's notched tag, sitting on the top
   border and costing the panel no height (same as .composer-frame-label). */
.composer-extension-header {
  position: absolute;
  top: -7px;
  left: 12px;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 6px;
  background: var(--composer-extension-surface);
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 2px;
  line-height: 1.5;
  text-transform: uppercase;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}

.composer-extension-count {
  letter-spacing: 1px;
}

.composer-extension-body {
  max-height: min(268px, 32vh);
  overflow-y: auto;
  overscroll-behavior: contain;
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
  scrollbar-color: color-mix(in srgb, var(--ui-text-muted-fg) 14%, transparent) transparent;
}

.composer-extension-body:hover::-webkit-scrollbar-thumb,
.composer-extension-body:focus-within::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ui-text-muted-fg) 14%, transparent);
}

.composer-extension-body::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--ui-text-muted-fg) 22%, transparent);
}

.composer-extension-message {
  min-height: 34px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 14px 8px;
  color: color-mix(in srgb, var(--ui-text-muted-fg) 84%, transparent);
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
  color: color-mix(in srgb, var(--ui-text-muted-fg) 62%, transparent);
  font-size: 11px;
}

.composer-extension-spinner {
  animation: composer-extension-spin 0.9s linear infinite;
}

/* The panel's only other line. */
.composer-extension-hints {
  display: flex;
  gap: 16px;
  margin-top: 6px;
  padding: 6px 12px 2px;
  border-top: 1px solid color-mix(in srgb, var(--composer-extension-frame) 16%, transparent);
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  font-family: var(--font-mono, monospace);
  font-size: 9.5px;
  letter-spacing: 1px;
}

:deep(.composer-extension-list) {
  display: flex;
  flex-direction: column;
}

/* ——— The shared row: [mark?] [name] [description] [meta] [⏎] ———
   Slot one may be empty (the command palette leaves it out), in which case
   the name simply starts at the left margin instead of holding a column
   open for information that isn't there. */
:deep(.composer-extension-row) {
  display: flex;
  align-items: baseline;
  margin: 0 4px;
  padding: 5px 12px;
  border-radius: 3px;
  color: var(--ui-text-primary-fg);
  cursor: pointer;
}

:deep(.composer-extension-row:hover),
:deep(.composer-extension-row.selected) {
  background: var(--composer-extension-row-hover);
}

/* Slot one — a mark, not a chip: no plate, no fill, just the glyph. */
:deep(.composer-extension-row-icon) {
  flex: none;
  width: 17px;
  margin-right: 8px;
  align-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  line-height: 0;
}

:deep(.composer-extension-row:hover .composer-extension-row-icon),
:deep(.composer-extension-row.selected .composer-extension-row-icon) {
  color: var(--ui-text-muted-fg);
}

/* Slots two and three share a line — the tab stop keeps their boundary
   straight without drawing it. */
:deep(.composer-extension-row-main) {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: baseline;
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
  flex: none;
  min-width: var(--composer-extension-tab-stop);
  padding-right: 14px;
  color: var(--ui-text-muted-fg);
  font-family: var(--font-mono, monospace);
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.2;
}

:deep(.composer-extension-row:hover .composer-extension-row-title),
:deep(.composer-extension-row.selected .composer-extension-row-title) {
  color: var(--ui-text-primary-fg);
}

:deep(.composer-extension-row.selected .composer-extension-row-title) {
  font-weight: 700;
}

:deep(.composer-extension-row-description) {
  flex: 1 1 auto;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  font-size: 11.5px;
  line-height: 1.2;
}

:deep(.composer-extension-row.selected .composer-extension-row-description) {
  color: var(--ui-text-muted-fg);
}

/* Slot four — the shortest true thing about the row (size, source, kind). */
:deep(.composer-extension-row-meta) {
  flex: none;
  margin-left: 14px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  font-family: var(--font-mono, monospace);
  font-size: 9.5px;
  letter-spacing: 0.5px;
  line-height: 1.2;
  text-align: right;
  text-transform: uppercase;
}

/* The ⏎ only belongs to the row you are actually on. */
:deep(.composer-extension-row-kbd) {
  flex: none;
  width: 1.2em;
  margin-left: 10px;
  color: var(--ui-text-muted-fg);
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  line-height: 1.2;
  text-align: right;
  visibility: hidden;
}

:deep(.composer-extension-row.selected .composer-extension-row-kbd) {
  visibility: visible;
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

/* Opening downward reverses the growth direction so the panel still appears to
   come out of its trigger rather than fall toward it. */
.composer-extension-panel.is-down {
  transform-origin: top center;
}

.composer-extension-enter-from.is-down,
.composer-extension-leave-to.is-down {
  transform: translateY(-6px) scale(0.992);
}

@keyframes composer-extension-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 480px) {
  .composer-extension-panel {
    /* A narrow composer cannot afford the full tab stop; descriptions still
       align, just closer in. */
    --composer-extension-tab-stop: 104px;
  }

  .composer-extension-body {
    max-height: min(220px, 38vh);
  }

  :deep(.composer-extension-row-meta) {
    display: none;
  }
}
</style>
