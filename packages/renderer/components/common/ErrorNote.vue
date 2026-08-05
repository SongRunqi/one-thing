<template>
  <div :class="noteClasses">
    <span
      v-if="resolvedLabel"
      class="error-note-legend"
    >
      <span class="tag">{{ resolvedTag }}</span>
      <span class="zh">{{ resolvedLabel }}</span>
    </span>

    <p
      v-if="hasBody"
      class="error-note-body"
    >
      <slot>{{ message }}</slot>
    </p>

    <pre
      v-if="details"
      class="error-note-raw"
    >{{ details }}</pre>

    <div
      v-if="slots.actions"
      class="error-note-actions"
    >
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue'

defineOptions({
  name: 'ErrorNote',
})

const props = withDefaults(defineProps<{
  /** Single-line failure copy. Ignored when the default slot is used. */
  message?: string
  /** Raw/technical detail, rendered monospace in a scroll-capped block. */
  details?: string
  /** Legend text. Only `block` shows a legend; pass '' to suppress it. */
  label?: string
  variant?: 'inline' | 'block'
  tone?: 'danger' | 'warning'
  size?: 'sm' | 'md'
}>(), {
  message: undefined,
  details: undefined,
  label: undefined,
  variant: 'inline',
  tone: 'danger',
  size: 'md',
})

const slots = useSlots()

const noteClasses = computed(() => [
  'error-note',
  `is-${props.variant}`,
  `tone-${props.tone}`,
  `size-${props.size}`,
])

const hasBody = computed(() => Boolean(slots.default) || Boolean(props.message))

/** Inline notes are a bare rule of text — the legend belongs to `block` only. */
const resolvedLabel = computed(() => {
  if (props.variant !== 'block') return ''
  if (props.label !== undefined) return props.label
  return props.tone === 'warning' ? '警告' : '出错了'
})

const resolvedTag = computed(() => props.tone === 'warning' ? 'WARN' : 'ERROR')
</script>

<style scoped>
/* The house ledger rule: a 2px ink stroke in the margin, zero fill, zero
   radius. Every failure state in the app reads as the same mark — only the
   density changes between `inline` and `block`. */
.error-note {
  --err-ink: var(--ui-status-danger-fg);

  min-width: 0;
  border-left: 2px solid var(--err-ink);
  padding-left: 8px;
  background: transparent;
  border-radius: 0;
  /* Failure copy is chrome, not content — always UI sans, even inside the
     message list where --font-body carries the user's reading font. */
  font-family: var(--font-sans, inherit);
  color: var(--err-ink);
  overflow-wrap: anywhere;
}

.tone-warning {
  --err-ink: var(--ui-status-warning-fg, var(--color-warning));
}

.size-md {
  font-size: 12px;
  line-height: 1.5;
}

.size-sm {
  font-size: 11px;
  line-height: 1.45;
}

.is-inline {
  padding-top: 2px;
  padding-bottom: 2px;
}

.is-block {
  padding-top: 6px;
  padding-bottom: 6px;
}

.error-note-legend {
  display: flex;
  gap: 0.75em;
  align-items: baseline;
  margin-bottom: 4px;
  user-select: none;
}

.error-note-legend .tag {
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--err-ink);
}

.error-note-legend .zh {
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-primary-fg);
}

.error-note-body {
  margin: 0;
}

.error-note-raw {
  margin: 4px 0 0;
  max-height: 240px;
  overflow: auto;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--ui-text-muted-fg);
}

.error-note-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed var(--ui-border-default-border, var(--border-color));
}
</style>
