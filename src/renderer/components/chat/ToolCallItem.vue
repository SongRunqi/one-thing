<template>
  <FartCallItem
    v-if="toolCall.toolName === 'fart'"
    :tool-call="toolCall"
  />
  <ToolStepItem
    v-else
    :view="view"
    :expanded="isExpanded"
    @toggle-expand="isExpanded = !isExpanded"
    @confirm="(tc, response) => emit('confirm', tc, response)"
    @reject="(tc) => emit('reject', tc)"
    @open-file="(filePath) => emit('open-file', filePath)"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Step, ToolCall } from '@/types'
import { buildToolStepView } from '@/stores/helpers/tool-step-view'
import FartCallItem from './FartCallItem.vue'
import ToolStepItem from './ToolStepItem.vue'

const props = defineProps<{
  toolCall: ToolCall
}>()

const emit = defineEmits<{
  confirm: [toolCall: ToolCall, response: 'once']
  reject: [toolCall: ToolCall]
  'open-file': [filePath: string]
}>()

const isExpanded = ref(false)

const view = computed(() => {
  const step: Step = {
    id: props.toolCall.id,
    type: props.toolCall.toolName?.toLowerCase() === 'bash' ? 'command' : 'tool-call',
    title: props.toolCall.toolName || 'tool',
    status: props.toolCall.status === 'completed'
      ? 'completed'
      : props.toolCall.status === 'failed'
        ? 'failed'
        : props.toolCall.status === 'cancelled'
          ? 'cancelled'
          : 'running',
    timestamp: props.toolCall.timestamp,
    toolCallId: props.toolCall.id,
    toolCall: props.toolCall,
    result: typeof props.toolCall.result === 'string'
      ? props.toolCall.result
      : props.toolCall.result === undefined
        ? undefined
        : JSON.stringify(props.toolCall.result),
    error: props.toolCall.error,
  }
  return buildToolStepView(step)
})
</script>
