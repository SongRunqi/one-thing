<template>
  <div
    class="process-rail"
    :class="{ 'is-open': expanded, 'is-solo': solo }"
  >
    <button
      v-if="!solo"
      type="button"
      class="process-rail-header"
      :aria-expanded="expanded"
      @click.stop="toggle"
    >
      <svg
        class="process-rail-chevron"
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <polyline points="9 6 15 12 9 18" />
      </svg>
      <span class="process-rail-summary">{{ summary }}</span>
      <span
        v-if="failedCount > 0"
        class="process-rail-failed"
      >
        <span
          class="process-rail-failed-dot"
          aria-hidden="true"
        />
        {{ failedCount }} 失败
      </span>
      <span
        v-if="streaming"
        class="process-rail-live"
        aria-hidden="true"
      />
    </button>
    <div
      v-if="expanded || solo"
      class="process-rail-body"
      role="list"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/**
 * Groups a run of "process" parts (reasoning + tool steps) behind a single
 * summary line, indented on a rail. The rail's own left border is the ONLY
 * vertical line in the whole process area — nested content (thought bodies,
 * tool details) expresses hierarchy with indent + tinted surfaces, enforced
 * by the :deep overrides below.
 *
 * Auto-open while streaming, auto-collapse when the stream ends; a manual
 * toggle wins until the next stream boundary. `solo` (single-step process)
 * skips the summary header entirely and always shows the row.
 */
interface Props {
  summary: string
  streaming?: boolean
  solo?: boolean
  failedCount?: number
}

const props = withDefaults(defineProps<Props>(), {
  streaming: false,
  solo: false,
  failedCount: 0,
})

const userToggled = ref<boolean | null>(null)

const expanded = computed(() => userToggled.value ?? Boolean(props.streaming))

function toggle() {
  userToggled.value = !expanded.value
}

watch(() => Boolean(props.streaming), () => {
  // Stream boundary (start or end): return control to the automatic
  // behavior — open while live, collapsed once settled.
  userToggled.value = null
})
</script>

<style scoped>
.process-rail {
  margin: 2px 0;
  /* @container queries inside the steps resolve against the rail (the
     timeline's own container-type is cancelled below: its style containment
     would trap the ledger counter, so the container role moves up here —
     one level above the counter scope on the body). */
  container-type: inline-size;
}

/* The header is the frame's top edge in BOTH states: a dashed rule runs
   through the summary (10px stub left, fill right). Expanding only attaches
   the body's remaining three sides below — the header box never changes, so
   the label cannot shift; no knockout background needed either. */
.process-rail-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-height: 24px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: none;
  color: var(--ui-text-muted-fg, var(--text-muted, var(--muted)));
  /* Process summary is chrome: UI sans, not the reading font. */
  font-family: var(--font-sans, inherit);
  font-size: 12.5px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
}

/* Hover: text brightens only — no background band in either state. */
.process-rail-header:hover {
  color: var(--ui-text-primary-fg, var(--text));
}

.process-rail-header::before,
.process-rail-header::after {
  content: '';
  align-self: center;
  border-top: 1px dashed color-mix(in srgb, var(--ui-border-strong-border, var(--ui-border-default-border, var(--border))) 55%, transparent);
}

.process-rail-header::before {
  flex: 0 0 10px;
}

.process-rail-header::after {
  flex: 1 1 auto;
}

.process-rail-chevron {
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.process-rail.is-open .process-rail-chevron {
  transform: rotate(90deg);
}

.process-rail-summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1.8px;
  text-transform: uppercase;
}

.process-rail-failed {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--ui-status-danger-fg, var(--text-error));
}

.process-rail-failed-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ui-status-danger-fg, var(--text-error));
}

.process-rail-live {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ui-accent-primary-fg, var(--accent));
  animation: process-rail-pulse 1.2s ease-in-out infinite;
}

@keyframes process-rail-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .process-rail-live {
    animation: none;
  }

  .process-rail-chevron {
    transition: none;
  }
}

/* Blueprint group frame: the header's dashed rule is the top edge; the body
   supplies the other three sides, pulled up so its side borders meet the
   rule at the header's vertical center (24px header → −12px). */
.process-rail-body {
  position: relative;
  margin: -12px 0 4px;
  padding: 18px 12px 8px;
  border: 1px dashed color-mix(in srgb, var(--ui-border-strong-border, var(--ui-border-default-border, var(--border))) 55%, transparent);
  border-top: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  /* Ledger numbering runs across the whole group, not per step-timeline.
     No containment here: it would trap the counter (see .process-rail). */
  counter-reset: tool-fig;
}

.process-rail-body :deep(.tool-activity-timeline) {
  counter-reset: none;
}

/* Solo (single step): no frame — the step's own figure frame is enough. */
.process-rail.is-solo .process-rail-body {
  margin: 0;
  padding: 0;
  border: none;
}

/* ========================================================================
   Flat-timeline overrides — "one container, one line".
   Scoped to .process-rail-body so components keep their own styling
   everywhere outside the rail.
   ======================================================================== */

/* Neutralize block margins the children bring along; the body's 2px gap
   owns the rhythm. */
.process-rail-body :deep(.tool-activity-timeline),
.process-rail-body :deep(.inline-reasoning) {
  margin: 0;
}

/* Thought full text: outlined blueprint block — no fills, no quote line.
   Sans — process content is chrome, not reading matter. */
.process-rail-body :deep(.inline-reasoning-content) {
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border)) 60%, transparent);
  margin: 2px 0 6px 22px;
  padding: 8px 10px;
  background: transparent;
  border-radius: 0;
  font-family: var(--font-sans, inherit);
  font-size: 12.5px;
  line-height: 1.65;
}

/* Tool detail pane: the figure frame styles itself (ToolStepDetails);
   the rail only positions it. */
.process-rail-body :deep(.tool-step-details) {
  margin: 8px 0 8px 22px;
}

/* Timeline row rhythm: uniform 24px rows; icon and text share a vertical
   center (the row's default flex-start top-aligns the 18px icon against
   22px text and reads as misaligned). */
.process-rail-body :deep(.operation-row) {
  min-height: 24px;
  align-items: center;
}
</style>
