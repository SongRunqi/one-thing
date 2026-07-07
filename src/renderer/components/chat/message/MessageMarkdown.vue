<template>
  <StreamingMarkdown
    v-if="live"
    :content="content"
    :is-user="isUser"
    :is-streaming="isStreaming"
  />
  <StaticMarkdown
    v-else
    :content="content"
    :is-user="isUser"
  />
</template>

<script setup lang="ts">
import StreamingMarkdown from './StreamingMarkdown.vue'
import StaticMarkdown from './StaticMarkdown.vue'

defineProps<{
  content: string
  isUser: boolean
  /** Render through the incremental StreamingMarkdown pipeline. */
  live: boolean
  isStreaming: boolean
}>()
</script>
