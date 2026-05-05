<template>
  <!-- Novelty tool: render with a dedicated animated component -->
  <FartCallItem
    v-if="toolCall.toolName === 'fart'"
    :tool-call="toolCall"
  />
  <ToolCallRow
    v-else
    :tool-call="toolCall"
    :expanded="isExpanded"
    :has-details="hasExpandableContent"
    @toggle-expand="isExpanded = !isExpanded"
    @confirm="(tc, r) => emit('confirm', tc, r)"
    @reject="(tc) => emit('reject', tc)"
  >
    <template #meta>
      <span
        v-if="executionTime"
        class="exec-time"
      >{{ executionTime }}</span>
    </template>
    <template #details>
      <!-- Arguments (excluding bash command which goes in preview) -->
      <div
        v-if="hasNonCommandArgs"
        class="detail-section"
      >
        <div class="detail-label">
          Arguments
        </div>
        <pre>{{ formatNonCommandArgs() }}</pre>
      </div>

      <!-- Result -->
      <div
        v-if="toolCall.result && toolCall.status !== 'executing'"
        class="detail-section"
      >
        <div class="detail-label">
          Result
        </div>
        <pre>{{ formatResult(toolCall.result) }}</pre>
      </div>

      <!-- Error -->
      <div
        v-if="toolCall.error"
        class="detail-section error"
      >
        <div class="detail-label">
          Error
        </div>
        <pre class="error-text">{{ toolCall.error }}</pre>
      </div>
    </template>
  </ToolCallRow>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ToolCall } from '@/types'
import FartCallItem from './FartCallItem.vue'
import ToolCallRow from './ToolCallRow.vue'

interface Props {
  toolCall: ToolCall
}

const props = defineProps<Props>()

const emit = defineEmits<{
  confirm: [toolCall: ToolCall, response: 'once' | 'session' | 'workspace' | 'always']
  reject: [toolCall: ToolCall]
}>()

const isExpanded = ref(false)

const hasNonCommandArgs = computed(() => {
  const args = props.toolCall.arguments
  if (!args) return false
  return Object.keys(args).filter(k => k !== 'command').length > 0
})

const hasExpandableContent = computed(() => {
  return hasNonCommandArgs.value ||
         props.toolCall.result !== undefined ||
         !!props.toolCall.error
})

const executionTime = computed(() => {
  const { startTime, endTime } = props.toolCall
  if (startTime && endTime) {
    const ms = endTime - startTime
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
  }
  return null
})

function formatNonCommandArgs(): string {
  const args = props.toolCall.arguments
  if (!args) return ''
  const filtered = Object.fromEntries(
    Object.entries(args).filter(([k]) => k !== 'command'),
  )
  return JSON.stringify(filtered, null, 2)
}

function formatResult(result: unknown): string {
  if (typeof result === 'string') return result
  return JSON.stringify(result, null, 2)
}
</script>

<style scoped>
.exec-time {
  font-size: 11px;
  color: var(--text-tertiary, #666);
  flex-shrink: 0;
  opacity: 0.7;
}

.detail-section {
  margin-top: 6px;
}

.detail-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary, #666);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.detail-section pre {
  margin: 0;
  padding: 8px 10px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.2);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-primary, #e5e5e5);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.detail-section.error pre {
  border-left: 3px solid #ef4444;
}

.error-text {
  color: #ef4444;
}

html[data-theme='light'] .detail-section pre {
  background: rgba(0, 0, 0, 0.04);
}
</style>
