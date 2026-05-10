<template>
  <template
    v-for="seg in segments"
    :key="seg.key"
  >
    <div
      v-if="seg.type === 'markdown'"
      class="md-segment"
      v-html="renderMd(seg.key, seg.content)"
    />
    <StreamingCodeBlock
      v-else-if="seg.type === 'code'"
      :key="seg.key"
      :lang="seg.lang"
      :content="seg.content"
      :complete="seg.complete"
      :is-streaming="effectiveStreaming"
    />
    <StreamingTableBlock
      v-else
      :key="seg.key"
      :content="seg.content"
    />
  </template>
  <span
    v-if="effectiveStreaming && !isUser"
    class="stream-caret"
    data-stream-caret
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { renderMarkdown } from '@/composables/useMarkdownRenderer'
import { parseStreamingMarkdown, type MarkdownSegment } from '@/composables/parseStreamingMarkdown'
import { advanceSmoothStreamingText } from '@/composables/smoothStreamingText'
import StreamingCodeBlock from './StreamingCodeBlock.vue'
import StreamingTableBlock from './StreamingTableBlock.vue'

interface Props {
  content: string
  isUser?: boolean
  isStreaming?: boolean
}

const props = defineProps<Props>()
const displayedContent = ref(props.content)
const effectiveStreaming = computed(() =>
  Boolean(!props.isUser && (props.isStreaming || displayedContent.value !== props.content)),
)
const useStableAssistantPipeline = computed(() => !props.isUser)

const raf = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number
const caf = typeof cancelAnimationFrame === 'function'
  ? cancelAnimationFrame
  : (id: number) => clearTimeout(id)

let pendingFrame: number | null = null
let lastRevealTs = 0

function cancelPendingFrame() {
  if (pendingFrame === null) return
  caf(pendingFrame)
  pendingFrame = null
}

function commitDisplayedContent() {
  cancelPendingFrame()
  displayedContent.value = props.content
  lastRevealTs = 0
}

function revealDisplayedContent(ts: number) {
  pendingFrame = null
  const elapsed = lastRevealTs > 0 ? ts - lastRevealTs : 16
  lastRevealTs = ts

  const next = advanceSmoothStreamingText(displayedContent.value, props.content, elapsed)
  displayedContent.value = next

  if (next !== props.content) {
    scheduleDisplayedContent()
  }
}

function scheduleDisplayedContent() {
  if (pendingFrame !== null) return
  pendingFrame = raf(revealDisplayedContent)
}

watch(
  () => props.content,
  () => {
    if (props.isStreaming && !props.isUser) {
      if (!props.content.startsWith(displayedContent.value)) {
        displayedContent.value = props.content
        lastRevealTs = 0
        return
      }
      scheduleDisplayedContent()
    } else {
      commitDisplayedContent()
    }
  },
)

watch(
  () => props.isStreaming,
  (isStreaming) => {
    if (!isStreaming) {
      if (!props.isUser && props.content.startsWith(displayedContent.value)) {
        scheduleDisplayedContent()
      } else {
        commitDisplayedContent()
      }
    }
  },
)

/**
 * User messages don't get markdown parsing (they render as escaped text
 * with line-break conversion). Assistant messages are split into
 * markdown + fenced-code segments; the latter go to StreamingCodeBlock
 * so they get stable DOM across streaming updates.
 */
const segments = computed<MarkdownSegment[]>(() => {
  if (props.isUser) {
    return [{ type: 'markdown', key: 'user-md', content: displayedContent.value, complete: true }]
  }
  return parseStreamingMarkdown(displayedContent.value, { streaming: useStableAssistantPipeline.value })
})

// ── Segment-level markdown render cache ──
// Keyed by segment key (position-based from parseStreamingMarkdown).
// Stable segments (between completed code blocks) hit cache on every
// re-render. Only the trailing segment being streamed misses.
const MD_CACHE_MAX = 32
const mdCache = new Map<string, { content: string; streaming: boolean; html: string }>()

function renderMd(key: string, content: string): string {
  const streaming = useStableAssistantPipeline.value
  const cached = mdCache.get(key)
  if (cached && cached.content === content && cached.streaming === streaming) return cached.html

  const html = renderMarkdown(content, props.isUser ?? false, { streaming })

  // Evict oldest entries when cache is full
  if (mdCache.size >= MD_CACHE_MAX) {
    const firstKey = mdCache.keys().next().value
    if (firstKey !== undefined) mdCache.delete(firstKey)
  }
  mdCache.set(key, { content, streaming, html })
  return html
}

onBeforeUnmount(() => {
  cancelPendingFrame()
  mdCache.clear()
})
</script>

<style scoped>
/* Transparent wrapper so .content :deep(...) descendant selectors still
   match the rendered markdown children, and margin collapsing around
   paragraphs / code blocks behaves like the old single-blob v-html. */
.md-segment {
  display: contents;
}

.stream-caret {
  display: block;
  width: 1px;
  height: 1px;
  overflow: hidden;
  pointer-events: none;
}
</style>
