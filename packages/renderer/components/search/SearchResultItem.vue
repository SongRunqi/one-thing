<template>
  <div
    :class="['search-result-item', { selected, 'has-meta': showKind }]"
    @click="$emit('select')"
    @mouseenter="$emit('hover')"
  >
    <div :class="['result-body', { 'has-context': hasContext }]">
      <span
        class="result-title"
      >
        <template
          v-for="(segment, index) in titleSegments"
          :key="index"
        >
          <mark v-if="segment.highlight">{{ segment.text }}</mark>
          <template v-else>{{ segment.text }}</template>
        </template>
      </span>
      <span
        v-if="hasContext"
        class="result-context"
      >
        <span
          v-if="contextSubtitle"
          class="result-subtitle"
        >{{ contextSubtitle }}</span>
        <span
          v-if="contextSubtitle && contextDetail"
          class="result-separator"
        >/</span>
        <span
          v-if="contextDetail"
          class="result-detail"
        >{{ contextDetail }}</span>
      </span>
    </div>
    <div
      v-if="showKind"
      class="result-meta"
    >
      <span
        class="result-kind"
      >{{ kindLabel }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SearchResult } from '@shared/ipc/search'

const props = defineProps<{
  result: SearchResult
  selected: boolean
  showKind?: boolean
}>()

defineEmits<{
  select: []
  hover: []
}>()

const titleSegments = computed(() => {
  const title = props.result.title
  const ranges = props.result.matchRanges || []
  if (ranges.length === 0) return [{ text: title, highlight: false }]

  let cursor = 0
  const segments: Array<{ text: string; highlight: boolean }> = []
  for (const range of ranges) {
    const start = Math.max(0, Math.min(title.length, range.start))
    const end = Math.max(start, Math.min(title.length, range.end))
    if (start > cursor) segments.push({ text: title.slice(cursor, start), highlight: false })
    if (end > start) segments.push({ text: title.slice(start, end), highlight: true })
    cursor = end
  }
  if (cursor < title.length) segments.push({ text: title.slice(cursor), highlight: false })
  return segments
})

const contextSubtitle = computed(() => (
  props.result.type === 'prompt' || props.result.type === 'action' ? '' : props.result.subtitle || ''
))

const contextDetail = computed(() => (
  props.result.type === 'prompt' || props.result.type === 'action' ? '' : props.result.detail || ''
))

const hasContext = computed(() => !!contextSubtitle.value || !!contextDetail.value)

const kindLabel = computed(() => {
  switch (props.result.type) {
    case 'chat':
      return 'Chat'
    case 'message':
      return 'Message'
    case 'action':
      return 'Command'
    case 'file':
      return 'File'
    case 'daily':
      return 'Daily'
    case 'prompt':
      return 'Prompt'
    default:
      return ''
  }
})
</script>

<style scoped>
.search-result-item {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 11px 0 12px;
  cursor: pointer;
  border-radius: 5px;
  margin: 0 3px;
  color: var(--ui-text-primary-fg, var(--text));
  /* No transition: keyboard paging scrolls instantly, and a fading highlight
     would ride along with the old row for ~120ms before settling. */
}

.search-result-item::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 7px;
  bottom: 7px;
  width: 2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 72%, transparent);
  opacity: 0;
}

.search-result-item.has-meta {
  grid-template-columns: minmax(0, 1fr) minmax(34px, auto);
}

.search-result-item.selected {
  background: color-mix(in srgb, var(--ui-state-selected-bg, var(--hover)) 42%, transparent);
}

.search-result-item.selected::before {
  opacity: 0.62;
}

.search-result-item:hover:not(.selected) {
  background: color-mix(in srgb, var(--ui-state-hover-bg, var(--hover)) 24%, transparent);
}

.result-body {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.result-title {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 60%;
  font-size: var(--type-label-size);
  font-weight: 590;
  line-height: var(--type-label-line-height);
  color: var(--ui-text-primary-fg, var(--text));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-body:not(.has-context) .result-title {
  flex: 1 1 auto;
  max-width: 100%;
}

.result-context {
  min-width: 0;
  flex: 1 1 auto;
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 72%, transparent);
  font-size: var(--type-meta-size);
  line-height: var(--type-meta-line-height);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-subtitle,
.result-detail {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-subtitle {
  flex: 0 1 auto;
}

.result-detail {
  flex: 1 1 auto;
  color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 48%, transparent);
}

.result-separator {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 34%, transparent);
}

.search-result-item.selected .result-context,
.search-result-item.selected .result-detail {
  color: color-mix(in srgb, var(--ui-text-secondary-fg, var(--text-secondary, var(--text))) 70%, transparent);
}

.result-meta {
  justify-self: end;
  min-width: 0;
  max-width: 76px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  overflow: hidden;
}

.result-kind {
  min-width: 0;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg-panel))) 34%, transparent);
  font-size: var(--type-micro-size);
  font-weight: 540;
  line-height: var(--type-micro-line-height);
  color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 62%, transparent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-result-item.selected .result-kind {
  background: color-mix(in srgb, var(--ui-state-selected-bg, var(--selection, var(--ui-accent-primary-fg, var(--accent)))) 20%, transparent);
  color: color-mix(in srgb, var(--ui-text-secondary-fg, var(--text-secondary, var(--text))) 66%, transparent);
}

.result-title mark {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 26%, transparent);
  color: inherit;
  border-radius: 3px;
  padding: 0 1px;
}

</style>
