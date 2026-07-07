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
}

.process-rail-header {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 3px 4px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--ui-text-muted-fg, var(--text-muted, var(--muted)));
  /* Process summary is chrome: UI sans, not the reading font. */
  font-family: var(--font-sans, inherit);
  font-size: 12.5px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
}

.process-rail-header:hover {
  color: var(--ui-text-primary-fg, var(--text));
  background: var(--ui-state-hover-bg, var(--hover));
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

.process-rail-body {
  margin: 4px 0 4px 3px;
  padding-left: 14px;
  border-left: 2px solid var(--ui-border-subtle-border, var(--ui-border-default-border, var(--border)));
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.process-rail.is-solo .process-rail-body {
  margin-top: 0;
  margin-bottom: 0;
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

/* Thought full text: indent + tinted block, no quote line. Sans — process
   content is chrome, not reading matter. */
.process-rail-body :deep(.inline-reasoning-content) {
  border-left: none;
  margin: 2px 0 6px 22px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--ui-state-hover-bg, var(--hover)) 55%, transparent);
  border-radius: 6px;
  font-family: var(--font-sans, inherit);
  font-size: 12.5px;
  line-height: 1.65;
}

/* Tool detail pane (command / output / diff): indent + code surface,
   no left border. */
.process-rail-body :deep(.tool-step-details) {
  border-left: none;
  margin: 2px 0 6px 22px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--ui-surface-code-block-bg, var(--bg-code-block)) 60%, transparent);
  border-radius: 6px;
}

/* Semantic stripes inside detail panes (thinking / summary / error /
   rejection) keep their tinted backgrounds; the stripe would be a third
   line, so it goes. */
.process-rail-body :deep(.tool-step-details .thinking),
.process-rail-body :deep(.tool-step-details .summary),
.process-rail-body :deep(.tool-step-details .error-text),
.process-rail-body :deep(.tool-step-details .rejection-text) {
  border-left: none;
  border-radius: 4px;
  padding-left: 8px;
}

/* Timeline row rhythm: uniform 24px rows; icon and text share a vertical
   center (the row's default flex-start top-aligns the 18px icon against
   22px text and reads as misaligned). */
.process-rail-body :deep(.operation-row) {
  min-height: 24px;
  align-items: center;
}
</style>
