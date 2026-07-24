<template>
  <ol class="segment-list">
    <li
      v-for="(segment, index) in segments"
      :key="segment.id"
      :class="['segment-item', { 'is-goal': segment.origin === 'goal', clickable: rowsAct, 'is-open': expandable && isOpen(segment.id, index) }]"
    >
      <component
        :is="rowsAct ? 'button' : 'div'"
        :type="rowsAct ? 'button' : undefined"
        class="segment-row"
        :disabled="clickable && !expandable && !segment.startMessageId ? true : undefined"
        :aria-expanded="expandable ? isOpen(segment.id, index) : undefined"
        @click="handleRowClick(segment, index)"
      >
        <span class="item-index">{{ index + 1 }}</span>
        <span class="item-body">
          <span class="item-head">
            <span class="item-title">{{ segment.title }}</span>
            <span
              v-if="segment.outcome"
              :class="['item-outcome', `outcome-${segment.outcome}`]"
            >{{ outcomeLabel(segment.outcome) }}</span>
            <span
              v-if="expandable"
              class="item-caret"
              aria-hidden="true"
            >{{ isOpen(segment.id, index) ? '−' : '+' }}</span>
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
      <ol
        v-if="expandable && isOpen(segment.id, index)"
        class="topic-messages"
      >
        <li
          v-if="messagesOf(segment.id).length === 0"
          class="topic-message-empty"
        >
          no user messages recorded
        </li>
        <li
          v-for="message in messagesOf(segment.id)"
          :key="message.id"
          class="topic-message-item"
        >
          <button
            type="button"
            class="topic-message-row"
            @click="emit('jumpMessage', message.id)"
          >
            <span
              class="topic-message-tick"
              aria-hidden="true"
            />
            <span class="topic-message-text">{{ message.preview }}</span>
          </button>
        </li>
      </ol>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { SessionSegment, SessionSegmentFile, SessionSegmentOutcome } from '@/types'

/** The slice of a user-message marker the nested list needs. */
export interface SegmentUserMessage {
  id: string
  preview: string
}

interface Props {
  segments: SessionSegment[]
  /** Render rows as buttons that jump to where the segment started. */
  clickable?: boolean
  /**
   * User messages grouped per segment id. When present, topic rows expand to
   * show them (click toggles, the messages are the jump targets) instead of
   * jumping themselves.
   */
  messagesBySegment?: Record<string, SegmentUserMessage[]>
}

const props = withDefaults(defineProps<Props>(), {
  clickable: false,
  messagesBySegment: undefined,
})

const emit = defineEmits<{
  jump: [segment: SessionSegment]
  jumpMessage: [messageId: string]
}>()

const expandable = computed(() => props.messagesBySegment !== undefined)
const rowsAct = computed(() => props.clickable || expandable.value)

/**
 * Explicit user choices only; anything untouched follows the default of "the
 * newest topic is open". Keyed by segment id so a list refresh (same session,
 * new segments appended) keeps the user's folds while the new tail opens.
 */
const toggled = ref(new Map<string, boolean>())

// A disjoint id set means a different session's list, not a refresh — stale
// fold state would randomly apply to unrelated topics.
watch(() => props.segments, (next, prev) => {
  if (!prev?.length || !toggled.value.size) return
  const ids = new Set(next.map(segment => segment.id))
  if (!prev.some(segment => ids.has(segment.id))) toggled.value = new Map()
})

function isOpen(segmentId: string, index: number): boolean {
  return toggled.value.get(segmentId) ?? index === props.segments.length - 1
}

function messagesOf(segmentId: string): SegmentUserMessage[] {
  return props.messagesBySegment?.[segmentId] ?? []
}

function handleRowClick(segment: SessionSegment, index: number): void {
  if (expandable.value) {
    toggled.value.set(segment.id, !isOpen(segment.id, index))
    return
  }
  if (props.clickable) emit('jump', segment)
}

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

/* 展开指示:账页里的加减号,不用图标 */
.item-caret {
  flex: 0 0 auto;
  margin-left: auto;
  font-family: var(--type-mono-font, monospace);
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--muted));
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

/* —— 展开后的 user message 子列表:缩进到题名列,画一根边线 —— */
.topic-messages {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 4px 0 0;
  padding: 0 0 0 19px;
  list-style: none;
}

.topic-message-item {
  min-width: 0;
}

.topic-message-row {
  display: flex;
  gap: 7px;
  align-items: baseline;
  width: 100%;
  padding: 2px 4px;
  margin: 0 -4px;
  border: none;
  border-radius: var(--radius-xs, 4px);
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-default);
}

.topic-message-row:hover {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 10%, transparent);
}

.topic-message-tick {
  flex: 0 0 auto;
  width: 7px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 65%, transparent);
  transform: translateY(-3px);
}

.topic-message-text {
  min-width: 0;
  font-size: 11.5px;
  line-height: 1.35;
  color: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 84%, transparent);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.topic-message-empty {
  padding: 2px 0;
  font-size: 11px;
  font-style: italic;
  color: var(--ui-text-muted-fg, var(--muted));
}
</style>
