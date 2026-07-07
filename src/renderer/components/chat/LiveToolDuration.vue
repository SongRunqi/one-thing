<template>
  <span
    v-if="text"
    class="live-tool-duration"
  >{{ separator }}{{ text }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatToolDuration } from '@/stores/helpers/tool-activity-view'
import { useDurationTicker } from '@/composables/useDurationTicker'

/**
 * Self-ticking duration text for a running tool call. Isolating the tick in
 * this leaf keeps StepsPanel's activity/group/timeline computeds from
 * rebuilding on every clock update.
 */
const props = withDefaults(defineProps<{
  startTime?: number
  /** Rendered before the duration when the surrounding meta already has content. */
  separator?: string
}>(), {
  startTime: undefined,
  separator: '',
})

const now = useDurationTicker()

const text = computed(() => {
  if (!props.startTime) return ''
  return formatToolDuration(Math.max(0, now.value - props.startTime))
})
</script>
