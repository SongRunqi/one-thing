<template>
  <div
    :class="['search-result-item', { selected }]"
    @click="$emit('select')"
    @mouseenter="$emit('hover')"
  >
    <div class="result-icon">
      <MessageSquare
        v-if="result.type === 'chat'"
        :size="16"
      />
      <File
        v-else-if="result.type === 'file'"
        :size="16"
      />
      <CalendarDays
        v-else-if="result.type === 'daily'"
        :size="16"
      />
      <NotebookPen
        v-else-if="result.type === 'prompt'"
        :size="16"
      />
      <FileText
        v-else-if="result.type === 'message'"
        :size="16"
      />
      <Zap
        v-else-if="result.type === 'action'"
        :size="16"
      />
    </div>
    <div class="result-body">
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
        v-if="result.subtitle"
        class="result-subtitle"
      >{{ result.subtitle }}</span>
      <span
        v-if="result.detail"
        class="result-detail"
      >{{ result.detail }}</span>
    </div>
    <span
      v-if="result.shortcut"
      class="result-shortcut"
    >{{ result.shortcut }}</span>
    <span
      v-else-if="result.timestamp"
      class="result-time"
    >{{ formatTime(result.timestamp) }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MessageSquare, File, FileText, Zap, CalendarDays, NotebookPen } from 'lucide-vue-next'
import type { SearchResult } from '@shared/ipc/search'

const props = defineProps<{
  result: SearchResult
  selected: boolean
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

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`
  return new Date(ts).toLocaleDateString()
}
</script>

<style scoped>
.search-result-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  cursor: pointer;
  border-radius: 6px;
  margin: 0 6px;
}

.search-result-item.selected {
  background: var(--hover);
}

.result-icon {
  flex-shrink: 0;
  color: var(--muted);
  display: flex;
  align-items: center;
}

.search-result-item.selected .result-icon {
  color: var(--accent);
}

.result-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.result-title {
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-subtitle {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-detail {
  font-size: 11px;
  color: color-mix(in srgb, var(--muted) 78%, transparent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-title mark {
  background: color-mix(in srgb, var(--accent) 26%, transparent);
  color: inherit;
  border-radius: 3px;
  padding: 0 1px;
}

.result-shortcut {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono, monospace);
}

.result-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--muted);
}
</style>
