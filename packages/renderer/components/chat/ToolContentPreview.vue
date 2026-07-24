<template>
  <div class="tool-content-preview">
    <div
      ref="contentRef"
      class="preview-content"
      :class="{ fixed: shouldUseFixedHeight, wrap }"
      @scroll="handlePanelScroll"
      @wheel="handlePanelWheel"
    >
      <div class="preview-lines">
        <div
          v-if="hiddenLineCount > 0"
          class="preview-line line-elided"
        >
          <span class="line-text">{{ hiddenLineCount }} earlier lines</span>
        </div>
        <div
          v-for="(line, index) in visibleLines"
          :key="`${index}:${line.kind}`"
          class="preview-line"
          :class="`line-${line.kind}`"
          data-preview-line
        >
          <span class="line-text">{{ line.text }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ToolPreviewLine } from '@/stores/helpers/tool-step-view'
import type { ToolRenderStatus } from '@/stores/helpers/tool-status'
import { chainWheelToScrollableAncestor } from '@/utils/scroll-chain'

const props = defineProps<{
  lines: ToolPreviewLine[]
  status: ToolRenderStatus
  /** Soft-wrap long lines instead of horizontal scrolling */
  wrap?: boolean
}>()

const contentRef = ref<HTMLElement | null>(null)
const isPanelFollowing = ref(true)
const isLive = computed(() =>
  props.status === 'streaming-input' || props.status === 'executing',
)
const shouldUseFixedHeight = computed(() =>
  isLive.value || props.status === 'awaiting-confirmation',
)

// While streaming, only the tail is rendered — the panel follows the bottom
// anyway, and re-rendering thousands of rows per appended line is wasted work.
const LIVE_TAIL_LINES = 200
const hiddenLineCount = computed(() =>
  isLive.value ? Math.max(0, props.lines.length - LIVE_TAIL_LINES) : 0,
)
const visibleLines = computed(() =>
  hiddenLineCount.value > 0 ? props.lines.slice(-LIVE_TAIL_LINES) : props.lines,
)

function isAtPanelBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 1
}

function handlePanelScroll() {
  const element = contentRef.value
  if (!element) return
  isPanelFollowing.value = isAtPanelBottom(element)
}

function handlePanelWheel(event: WheelEvent) {
  const element = contentRef.value
  if (!element) return
  if (isLive.value && event.deltaY < 0) {
    isPanelFollowing.value = false
  }
  chainWheelToScrollableAncestor(event, element)
}

function scrollToBottom() {
  const element = contentRef.value
  if (!element || !isPanelFollowing.value) return
  element.scrollTop = element.scrollHeight
  isPanelFollowing.value = true
}

watch(
  () => [props.lines.length, props.status],
  async () => {
    if (!isLive.value) return
    await nextTick()
    scrollToBottom()
  },
  { flush: 'post' },
)

watch(
  () => props.status,
  () => {
    isPanelFollowing.value = true
  },
)

defineExpose({
  scrollToBottom,
})
</script>

<style scoped>
.tool-content-preview {
  margin: 0;
  overflow: hidden;
  background: transparent;
  /* Blueprint section cut: the preview is a ruled figure inside the frame. */
  border: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 60%, transparent);
  border-radius: 0;
}

.preview-content {
  background: transparent;
  border: 0;
  max-height: 220px;
  overflow: auto;
  overscroll-behavior: contain;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-body);
  font-weight: 400;
  line-height: var(--tool-code-line-height);
}

.preview-content.wrap {
  overflow-x: hidden;
}

.preview-content.fixed {
  height: clamp(148px, 24vh, 220px);
  max-height: clamp(148px, 24vh, 220px);
}

/* Inner track sized to the widest line so every row can fill the full scroll
   width, not just the viewport. */
.preview-lines {
  width: max-content;
  min-width: 100%;
}

.preview-content.wrap .preview-lines {
  width: auto;
  min-width: 0;
}

.preview-line {
  display: flex;
  align-items: stretch;
  white-space: pre;
  width: 100%;
  min-height: calc(var(--tool-font-size-body) * var(--tool-code-line-height));
  /* Deliberately no --diff-* colours: nothing here is a diff, so nothing may
     borrow the add/delete palette that stands for ground truth. */
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
}

.line-text {
  flex: 1 1 auto;
  min-width: max-content;
  padding: 0 12px 0 10px;
}

.preview-content.wrap .line-text {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* The content a write is about to put on disk. */
.line-content {
  color: var(--ui-tool-text-args-fg, var(--text-tool-args, var(--tool-soft)));
}

/* An edit's replacement pair. `old` is what the model expects to find — it is
   not a deletion, so it reads as quiet, not red. */
.line-old {
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  opacity: 0.72;
}

.line-new {
  color: var(--ui-tool-text-args-fg, var(--text-tool-args, var(--tool-soft)));
}

.line-label {
  min-height: 0;
  padding-top: 4px;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-size: calc(var(--tool-font-size-body) * 0.85);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.7;
}

.line-label .line-text {
  min-width: 0;
}

.line-elided {
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  opacity: 0.6;
}
</style>
