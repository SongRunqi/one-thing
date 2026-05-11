<template>
  <div
    v-if="shouldShowDeferredPlainText"
    class="markdown-deferred"
  >
    {{ displayedContent }}
  </div>
  <template v-else>
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
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { renderMarkdown } from '@/composables/useMarkdownRenderer'
import { parseStreamingMarkdown, type MarkdownSegment } from '@/composables/parseStreamingMarkdown'
import { advanceSmoothStreamingText } from '@/composables/smoothStreamingText'
import StreamingCodeBlock from './StreamingCodeBlock.vue'
import StreamingTableBlock from './StreamingTableBlock.vue'
import { enqueueMarkdownHydration } from './deferredMarkdownHydration'
import {
  cacheMarkdownHtml,
  cacheSegments,
  getCachedMarkdownHtml,
  getCachedSegments,
} from './markdownRenderCache'

interface Props {
  content: string
  isUser?: boolean
  isStreaming?: boolean
}

const props = defineProps<Props>()

const DEFER_MARKDOWN_CHAR_THRESHOLD = 4000

const displayedContent = ref(props.content)
const effectiveStreaming = computed(() =>
  Boolean(!props.isUser && (props.isStreaming || displayedContent.value !== props.content)),
)
const useStableAssistantPipeline = computed(() => !props.isUser)
const markdownHydrated = ref(true)
let hydrationToken = 0

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
  scheduleDeferredMarkdownHydration()
}

function revealDisplayedContent(ts: number) {
  pendingFrame = null
  const elapsed = lastRevealTs > 0 ? ts - lastRevealTs : 16
  lastRevealTs = ts

  const next = advanceSmoothStreamingText(displayedContent.value, props.content, elapsed)
  displayedContent.value = next

  if (next !== props.content) {
    scheduleDisplayedContent()
  } else {
    scheduleDeferredMarkdownHydration()
  }
}

function scheduleDisplayedContent() {
  if (pendingFrame !== null) return
  pendingFrame = raf(revealDisplayedContent)
}

function isContentFullyCached(): boolean {
  const streaming = useStableAssistantPipeline.value
  const segKey = `${streaming ? '1' : '0'}:${contentCacheKey(displayedContent.value)}`
  const cachedSegments = getCachedSegments(segKey)
  if (!cachedSegments) return false
  for (const seg of cachedSegments) {
    if (seg.type !== 'markdown') continue
    const mdKey = `${props.isUser ? 'user' : 'assistant'}:${streaming ? '1' : '0'}:${seg.key}:${contentCacheKey(seg.content)}`
    if (getCachedMarkdownHtml(mdKey) === undefined) return false
  }
  return true
}

function shouldDeferMarkdown(): boolean {
  if (props.isUser || props.isStreaming) return false
  if (props.content.length <= DEFER_MARKDOWN_CHAR_THRESHOLD) return false
  // Cache hit means render cost is ~free — skip the deferral so revisits don't flash raw text.
  return !isContentFullyCached()
}

function scheduleDeferredMarkdownHydration() {
  hydrationToken++
  const token = hydrationToken

  if (!shouldDeferMarkdown()) {
    markdownHydrated.value = true
    return
  }

  markdownHydrated.value = false
  enqueueMarkdownHydration(() => {
    if (token !== hydrationToken) return
    markdownHydrated.value = true
  })
}

const shouldShowDeferredPlainText = computed(() =>
  !markdownHydrated.value && displayedContent.value.length > 0,
)

function contentCacheKey(content: string): string {
  let hash = 2166136261
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${content.length}:${hash >>> 0}`
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

scheduleDeferredMarkdownHydration()

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
  const streaming = useStableAssistantPipeline.value
  const cacheKey = `${streaming ? '1' : '0'}:${contentCacheKey(displayedContent.value)}`
  const cached = getCachedSegments(cacheKey)
  if (cached) return cached

  const started = performance.now()
  const parsed = parseStreamingMarkdown(displayedContent.value, { streaming })
  cacheSegments(cacheKey, parsed)
  const elapsed = performance.now() - started
  if (elapsed > 16) {
    console.info('[Perf][Markdown][segments]', {
      elapsedMs: Math.round(elapsed),
      chars: displayedContent.value.length,
      segments: parsed.length,
    })
  }
  return parsed
})

function renderMd(key: string, content: string): string {
  const streaming = useStableAssistantPipeline.value
  const cacheKey = `${props.isUser ? 'user' : 'assistant'}:${streaming ? '1' : '0'}:${key}:${contentCacheKey(content)}`
  const cached = getCachedMarkdownHtml(cacheKey)
  if (cached) return cached

  const started = performance.now()
  const html = renderMarkdown(content, props.isUser ?? false, { streaming })
  cacheMarkdownHtml(cacheKey, html)
  const elapsed = performance.now() - started
  if (elapsed > 16) {
    console.info('[Perf][Markdown][html]', {
      elapsedMs: Math.round(elapsed),
      chars: content.length,
      isUser: !!props.isUser,
      streaming,
    })
  }
  return html
}

onBeforeUnmount(() => {
  hydrationToken++
  cancelPendingFrame()
})
</script>

<style scoped>
/* Transparent wrapper so .content :deep(...) descendant selectors still
   match the rendered markdown children, and margin collapsing around
   paragraphs / code blocks behaves like the old single-blob v-html. */
.md-segment {
  display: contents;
}

.markdown-deferred {
  white-space: pre-wrap;
  word-break: break-word;
}

.stream-caret {
  display: block;
  width: 1px;
  height: 1px;
  overflow: hidden;
  pointer-events: none;
}
</style>
