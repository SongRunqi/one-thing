<template>
  <template
    v-for="seg in segments"
    :key="seg.key"
  >
    <div
      v-if="seg.type === 'markdown'"
      class="md-segment"
      v-html="renderMd(seg.content)"
    />
    <StreamingCodeBlock
      v-else
      :lang="seg.lang"
      :content="seg.content"
      :complete="seg.complete"
    />
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/composables/useMarkdownRenderer'
import { parseStreamingMarkdown, type MarkdownSegment } from '@/composables/parseStreamingMarkdown'
import StreamingCodeBlock from './StreamingCodeBlock.vue'

interface Props {
  content: string
  isUser?: boolean
}

const props = defineProps<Props>()

/**
 * User messages don't get markdown parsing (they render as escaped text
 * with line-break conversion). Assistant messages are split into
 * markdown + fenced-code segments; the latter go to StreamingCodeBlock
 * so they get stable DOM across streaming updates.
 */
const segments = computed<MarkdownSegment[]>(() => {
  if (props.isUser) {
    return [{ type: 'markdown', key: 'user-md', content: props.content }]
  }
  return parseStreamingMarkdown(props.content)
})

function renderMd(content: string): string {
  return renderMarkdown(content, props.isUser ?? false)
}
</script>

<style scoped>
/* Transparent wrapper so .content :deep(...) descendant selectors still
   match the rendered markdown children, and margin collapsing around
   paragraphs / code blocks behaves like the old single-blob v-html. */
.md-segment {
  display: contents;
}
</style>
