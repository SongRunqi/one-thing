<template>
  <div
    class="static-markdown"
    v-html="html"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ensureMarkdownDomHandlers, renderMarkdown, renderPlainTextWithMentions } from '@/composables/useMarkdownRenderer'
import { cacheMarkdownHtml, getCachedMarkdownHtml } from './markdownRenderCache'

/**
 * Lightweight markdown renderer for messages that are not streaming.
 *
 * StreamingMarkdown owns the segment-by-segment pipeline (parseStreamingMarkdown
 * + StreamingCodeBlock + StreamingTableBlock) because it has to keep DOM stable
 * across partial-token updates and keep the open code fence from flashing.
 * None of that matters for messages loaded from history or already-completed
 * messages — they only need one markdown-it pass + one v-html injection.
 *
 * Cache is shared with StreamingMarkdown's mdCache but uses a `static:` prefix
 * so the per-segment streaming entries don't collide with the full-message entry.
 */

interface Props {
  content: string
  isUser?: boolean
}

const props = defineProps<Props>()

function contentCacheKey(content: string): string {
  let hash = 2166136261
  for (let i = 0; i < content.length; i += 1) {
    hash ^= content.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `${content.length}:${hash >>> 0}`
}

const html = computed(() => {
  const content = props.content ?? ''
  if (props.isUser) {
    return renderPlainTextWithMentions(content)
  }
  const key = `static:${contentCacheKey(content)}`
  const cached = getCachedMarkdownHtml(key)
  // 缓存命中不走 renderMarkdown,所以那些一次性的 DOM 观察器要在这里补装 ——
  // 否则一屏全命中的会话里,复制按钮/提及升格/代码折叠全都不会发生。
  if (cached) {
    ensureMarkdownDomHandlers()
    return cached
  }
  const rendered = renderMarkdown(content, false, { streaming: false })
  cacheMarkdownHtml(key, rendered)
  return rendered
})
</script>

<style scoped>
/* Match StreamingMarkdown's .md-segment behavior so the wrapper doesn't
   interfere with the parent's margin-collapse / descendant selectors. */
.static-markdown {
  display: contents;
}
</style>
