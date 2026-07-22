<template>
  <ol class="segment-list">
    <li
      v-for="(segment, index) in segments"
      :key="segment.id"
      :class="['segment-item', { 'is-goal': segment.origin === 'goal', clickable }]"
    >
      <component
        :is="clickable ? 'button' : 'div'"
        :type="clickable ? 'button' : undefined"
        class="segment-row"
        :disabled="clickable && !segment.startMessageId ? true : undefined"
        @click="clickable && emit('jump', segment)"
      >
        <span class="item-index">{{ index + 1 }}</span>
        <span class="item-body">
          <span class="item-head">
            <span class="item-title">{{ segment.title }}</span>
            <span
              v-if="segment.outcome"
              :class="['item-outcome', `outcome-${segment.outcome}`]"
            >{{ outcomeLabel(segment.outcome) }}</span>
          </span>
          <span
            v-if="segment.detail"
            class="item-detail"
          >{{ segment.detail }}</span>
          <span
            v-if="segment.files.length"
            class="item-files"
          >{{ fileSummary(segment.files) }}</span>
          <span
            v-else-if="segment.kind === 'question'"
            class="item-files item-muted"
          >discussion only</span>
        </span>
      </component>
    </li>
  </ol>
</template>

<script setup lang="ts">
import type { SessionSegment, SessionSegmentFile, SessionSegmentOutcome } from '@/types'

interface Props {
  segments: SessionSegment[]
  /** Render rows as buttons that jump to where the segment started. */
  clickable?: boolean
}

withDefaults(defineProps<Props>(), { clickable: false })

const emit = defineEmits<{ jump: [segment: SessionSegment] }>()

const OUTCOME_LABELS: Record<SessionSegmentOutcome, string> = {
  complete: 'done',
  abandoned: 'dropped',
  blocked: 'blocked',
  budget_limited: 'out of budget',
  paused: 'paused',
}

function outcomeLabel(outcome: SessionSegmentOutcome): string {
  return OUTCOME_LABELS[outcome] ?? outcome
}

function basename(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] || filePath
}

/** Basenames only: full paths blow the width and add nothing at this size. */
function fileSummary(files: SessionSegmentFile[]): string {
  const names = files.slice(0, 4).map(file => basename(file.path))
  const rest = files.length - names.length
  return rest > 0 ? `${names.join(' · ')} · +${rest}` : names.join(' · ')
}
</script>

<style scoped>
.segment-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.segment-row {
  display: flex;
  gap: 7px;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
}

.segment-item.clickable .segment-row {
  cursor: pointer;
  border-radius: var(--radius-xs, 4px);
  padding: 2px 4px;
  margin: -2px -4px;
  transition: background var(--duration-fast) var(--ease-default);
}

.segment-item.clickable .segment-row:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 10%, transparent);
}

/* A segment with no anchor cannot be jumped to; say so by going inert rather
   than offering a click that does nothing. */
.segment-item.clickable .segment-row:disabled {
  cursor: default;
  opacity: 0.6;
}

.item-index {
  flex: 0 0 auto;
  min-width: 12px;
  font-family: var(--type-mono-font, monospace);
  font-size: 10px;
  line-height: 1.8;
  color: var(--ui-text-muted-fg, var(--muted));
}

/* goal 段是事实投影而非推断,给一道朱砂标出来 */
.segment-item.is-goal .item-index {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.item-body {
  display: block;
  min-width: 0;
  flex: 1 1 auto;
}

.item-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.item-title {
  font-weight: 500;
  min-width: 0;
  /* Wraps rather than truncating: a title cut at "Fix translation cards stuck
     to left…" loses the part that identifies which bug it was. */
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.item-outcome {
  flex-shrink: 0;
  font-family: var(--type-mono-font, monospace);
  font-size: 9.5px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ui-text-muted-fg, var(--muted));
}

.outcome-blocked,
.outcome-budget_limited {
  color: var(--ui-status-danger-fg, var(--danger-color));
}

.outcome-paused {
  color: var(--ui-status-warning-fg, var(--warning-color));
}

.item-detail {
  display: -webkit-box;
  margin-top: 1px;
  color: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 78%, transparent);
  overflow: hidden;
  /* Four lines, not two: an `update` folds several turns together, so the
     detail is where the substance accumulates. The host scrolls, so the clamp
     only stops one segment from crowding out the rest. */
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
}

.item-files {
  display: -webkit-box;
  margin-top: 2px;
  font-family: var(--type-mono-font, monospace);
  font-size: 10px;
  color: var(--ui-text-muted-fg, var(--muted));
  overflow: hidden;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-all;
}

.item-muted {
  font-style: italic;
}
</style>
