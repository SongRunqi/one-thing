<template>
  <div class="diff-preview">
    <div
      ref="diffContentRef"
      class="diff-content"
      :class="{ fixed: shouldUseFixedHeight }"
    >
      <div
        v-if="!hideHeader"
        class="diff-header"
      >
        <button
          class="diff-file-path"
          type="button"
          :title="diff.filePath"
          @click.stop="emit('open-file', diff.filePath)"
          @keydown.stop
        >
          {{ displayFileName }}
        </button>
        <span class="diff-stats">
          <span class="additions">+{{ diff.additions || 0 }}</span>
          <span class="deletions">-{{ diff.deletions || 0 }}</span>
        </span>
        <span
          v-if="status === 'executing'"
          class="diff-status-badge applying"
        >Applying</span>
        <span
          v-else-if="status === 'completed'"
          class="diff-status-badge"
        >Applied</span>
      </div>
      <template
        v-for="(line, idx) in lines"
        :key="idx"
      >
        <div
          v-if="!(line.class === 'diff-hunk' && idx === 0)"
          :class="['diff-line', line.class]"
        >
          <span
            v-if="diff.deletions"
            class="line-number old"
          >{{ line.oldNum || '' }}</span>
          <span class="line-number new">{{ line.newNum || '' }}</span>
          <span class="line-prefix">{{ line.prefix }}</span>
          <span
            class="line-content"
            :class="{ 'line-deleted-text': line.class === 'diff-del' }"
          >{{ line.content }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ToolDiffData, ToolDiffLine } from '@/stores/helpers/tool-step-view'
import type { ToolRenderStatus } from '@/stores/helpers/tool-status'
import { basename } from '@/stores/helpers/tool-preview'

const props = defineProps<{
  diff: ToolDiffData
  lines: ToolDiffLine[]
  status: ToolRenderStatus
  hideHeader?: boolean
}>()

const emit = defineEmits<{
  'open-file': [filePath: string]
}>()

const diffContentRef = ref<HTMLElement | null>(null)
const displayFileName = computed(() => basename(props.diff.filePath) || props.diff.filePath || 'file')
const isLive = computed(() =>
  props.status === 'streaming-input' || props.status === 'executing',
)
const shouldUseFixedHeight = computed(() =>
  isLive.value || props.status === 'awaiting-confirmation',
)

function scrollToBottom() {
  if (!diffContentRef.value) return
  diffContentRef.value.scrollTop = diffContentRef.value.scrollHeight
}

watch(
  () => [props.lines, props.diff.additions, props.diff.deletions, props.status],
  async () => {
    if (!isLive.value) return
    await nextTick()
    scrollToBottom()
  },
  { deep: true, flush: 'post' },
)

defineExpose({
  scrollToBottom,
})
</script>

<style scoped>
.diff-preview {
  margin-top: 2px;
}

.diff-content {
  background: var(--bg-code-block);
  border: 1px solid var(--border-code);
  border-radius: var(--radius-sm, 8px);
  max-height: 240px;
  overflow-y: auto;
  font-size: var(--font-size-sm, 12px);
  line-height: var(--line-height-normal, 1.5);
  font-family: var(--font-mono);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-elevated) 40%, transparent);
}

.diff-content.fixed {
  height: clamp(168px, 28vh, 260px);
  max-height: clamp(168px, 28vh, 260px);
  overscroll-behavior: contain;
}

.diff-header {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: 7px 10px;
  background: var(--bg-code-header);
  border-bottom: 1px solid var(--border-code);
}

.diff-file-path {
  border: 0;
  padding: 0;
  background: transparent;
  font-size: var(--font-size-sm, 12px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--text-code-block);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.diff-file-path:hover {
  color: var(--text-link);
  text-decoration: underline;
}

.diff-stats {
  display: flex;
  gap: var(--space-2, 8px);
  font-size: var(--font-size-xs, 11px);
  font-weight: var(--font-weight-semibold, 600);
}

.additions {
  color: var(--text-success);
}

.deletions {
  color: var(--text-error);
}

.diff-status-badge {
  font-size: 10px;
  font-weight: var(--font-weight-semibold, 600);
  padding: 2px 6px;
  border-radius: var(--radius-full, 999px);
  background: color-mix(in srgb, var(--color-success) 12%, transparent);
  color: var(--text-success);
  border: 1px solid color-mix(in srgb, var(--border-success) 18%, transparent);
  flex-shrink: 0;
}

.diff-status-badge.applying {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 20%, transparent);
  animation: applyingPulse 1.4s ease-in-out infinite;
}

@keyframes applyingPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

.diff-line {
  display: flex;
  white-space: pre;
  padding: 1px 10px 1px 0;
  min-height: 21px;
  align-items: center;
}

.line-number {
  width: 42px;
  text-align: right;
  padding-right: 10px;
  color: var(--text-faint);
  user-select: none;
  flex-shrink: 0;
  font-size: var(--font-size-xs, 11px);
}

.line-number.old {
  border-right: 1px solid var(--border-subtle);
}

.line-prefix {
  width: 18px;
  min-width: 18px;
  text-align: center;
  user-select: none;
  flex-shrink: 0;
  font-weight: 600;
}

.line-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  padding-right: var(--space-2, 8px);
}

.line-deleted-text {
  text-decoration: line-through;
  opacity: 0.7;
}

.diff-add {
  background: var(--diff-add-bg);
  color: var(--diff-add-text);
}

.diff-add .line-prefix {
  color: var(--text-success);
}

.diff-add .line-number {
  color: rgba(var(--color-success-rgb), 0.6);
}

.diff-del {
  background: var(--diff-del-bg);
  color: var(--diff-del-text);
}

.diff-del .line-prefix {
  color: var(--text-error);
}

.diff-del .line-number {
  color: rgba(var(--color-danger-rgb), 0.6);
}

.diff-hunk {
  color: var(--diff-hunk-text);
  background: var(--diff-hunk-bg);
  padding: 4px 0;
  justify-content: center;
}
</style>
