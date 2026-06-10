<template>
  <ToolStepDetails
    :view="detailView"
    :wrap="true"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ToolActivityView } from '@/stores/helpers/tool-activity-view'
import { buildDetailedToolStepView } from '@/stores/helpers/tool-activity-view'
import ToolStepDetails from './ToolStepDetails.vue'

const props = defineProps<{
  activity: ToolActivityView
}>()

const detailView = computed(() => buildDetailedToolStepView(props.activity))
</script>
