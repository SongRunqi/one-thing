<template>
  <div
    class="streaming-table-markdown"
    v-html="renderedHtml"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/composables/useMarkdownRenderer'

const props = defineProps<{
  content: string
}>()

const renderedHtml = computed(() => renderMarkdown(props.content, false, { streaming: true }))
</script>

<style scoped>
.streaming-table-markdown {
  display: contents;
}
</style>
