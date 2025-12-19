<template>
  <div :class="['tool-call-status', statusClass]">
    <!-- Executing: show animated calling status -->
    <template v-if="hasExecuting">
      <svg class="status-icon spinning" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      <span class="status-text flowing">{{ executingText }}</span>
    </template>

    <!-- Completed: show checkmark -->
    <template v-else-if="hasCompleted">
      <svg class="status-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <span class="status-text">{{ completedText }}</span>
    </template>

    <!-- All Failed (no executing, no completed) -->
    <template v-else-if="hasFailed">
      <svg class="status-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      <span class="status-text">{{ failedText }}</span>
    </template>

    <!-- Pending -->
    <template v-else>
      <svg class="status-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      <span class="status-text">{{ pendingText }}</span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ToolCall } from '@/types'

interface Props {
  toolCalls: ToolCall[]
}

const props = defineProps<Props>()

defineEmits<{
  execute: [toolCall: ToolCall]
}>()

// Get unique tool names (dedupe by name for display)
const uniqueToolNames = computed(() => {
  const names = new Set(props.toolCalls.map(tc => tc.toolName))
  return Array.from(names)
})

// Status checks - show the most relevant status
const hasExecuting = computed(() =>
  props.toolCalls.some(tc => tc.status === 'executing')
)

const hasCompleted = computed(() =>
  props.toolCalls.some(tc => tc.status === 'completed')
)

const hasFailed = computed(() =>
  props.toolCalls.some(tc => tc.status === 'failed') && !hasCompleted.value && !hasExecuting.value
)

// CSS class for status
const statusClass = computed(() => {
  if (hasExecuting.value) return 'executing'
  if (hasCompleted.value) return 'completed'
  if (hasFailed.value) return 'failed'
  return 'pending'
})

// Status texts
const executingText = computed(() => {
  const names = uniqueToolNames.value
  if (names.length === 1) {
    return `Calling ${names[0]}...`
  }
  return `Calling ${names.length} tools...`
})

const completedText = computed(() => {
  const names = uniqueToolNames.value
  if (names.length === 1) {
    return `Called ${names[0]}`
  }
  if (names.length <= 2) {
    return `Called ${names.join(', ')}`
  }
  return `Called ${names.length} tools`
})

const failedText = computed(() => {
  const names = uniqueToolNames.value
  if (names.length === 1) {
    return `${names[0]} failed`
  }
  return `Tool calls failed`
})

const pendingText = computed(() => {
  const names = uniqueToolNames.value
  if (names.length === 1) {
    return `Calling ${names[0]}...`
  }
  return `${names.length} tools pending`
})
</script>

<style scoped>
.tool-call-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  margin-top: 4px;
}

.status-icon {
  flex-shrink: 0;
  color: var(--muted);
}

.tool-call-status.executing .status-icon {
  color: rgb(59, 130, 246);
}

.tool-call-status.completed .status-icon {
  color: var(--accent);
}

.tool-call-status.failed .status-icon {
  color: rgb(239, 68, 68);
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.status-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
}

.tool-call-status.failed .status-text {
  color: rgb(239, 68, 68);
}

/* Flowing animation for executing state */
.status-text.flowing {
  background: linear-gradient(
    90deg,
    rgba(59, 130, 246, 0.4) 0%,
    rgba(59, 130, 246, 1) 25%,
    rgba(59, 130, 246, 1) 50%,
    rgba(59, 130, 246, 1) 75%,
    rgba(59, 130, 246, 0.4) 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: flowing-gradient 2.5s ease-in-out infinite;
}

@keyframes flowing-gradient {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
