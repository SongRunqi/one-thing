<template>
  <div :class="['tool-call', statusClass]">
    <div class="tool-header">
      <div class="tool-icon">
        <svg v-if="toolCall.status === 'pending'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <svg v-else-if="toolCall.status === 'executing'" class="spinning" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        <svg v-else-if="toolCall.status === 'completed'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <svg v-else-if="toolCall.status === 'failed'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M12 8v8"/>
          <path d="M8 12h8"/>
        </svg>
      </div>
      <div class="tool-info">
        <span class="tool-name">{{ toolCall.toolName }}</span>
        <span :class="['tool-status', { flowing: toolCall.status === 'executing' }]">{{ statusText }}</span>
      </div>
      <button
        v-if="toolCall.status === 'pending'"
        class="execute-btn"
        @click="$emit('execute', toolCall)"
        title="Execute tool"
      >
        Run
      </button>
    </div>

    <div v-if="showArguments && Object.keys(toolCall.arguments).length > 0" class="tool-arguments">
      <div class="arguments-header" @click="toggleArguments">
        <span>Arguments</span>
        <svg :class="['chevron', { expanded: argumentsExpanded }]" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div v-if="argumentsExpanded" class="arguments-content">
        <pre>{{ JSON.stringify(toolCall.arguments, null, 2) }}</pre>
      </div>
    </div>

    <div v-if="toolCall.result !== undefined" class="tool-result">
      <div class="result-header" @click="toggleResult">
        <span>Result</span>
        <svg :class="['chevron', { expanded: resultExpanded }]" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div v-if="resultExpanded" class="result-content">
        <pre>{{ formatResult(toolCall.result) }}</pre>
      </div>
    </div>

    <div v-if="toolCall.error" class="tool-error">
      <span class="error-icon">!</span>
      <span class="error-text">{{ toolCall.error }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ToolCall } from '@/types'

interface Props {
  toolCall: ToolCall
  showArguments?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showArguments: true,
})

defineEmits<{
  execute: [toolCall: ToolCall]
}>()

const argumentsExpanded = ref(false)
const resultExpanded = ref(false) // Default to collapsed

const statusClass = computed(() => {
  return `status-${props.toolCall.status}`
})

const statusText = computed(() => {
  switch (props.toolCall.status) {
    case 'pending':
      return 'Pending'
    case 'executing':
      return 'Running...'
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    default:
      return props.toolCall.status
  }
})

function toggleArguments() {
  argumentsExpanded.value = !argumentsExpanded.value
}

function toggleResult() {
  resultExpanded.value = !resultExpanded.value
}

function formatResult(result: any): string {
  if (typeof result === 'string') {
    return result
  }
  return JSON.stringify(result, null, 2)
}
</script>

<style scoped>
.tool-call {
  margin: 0;
  margin-bottom: 6px;
  padding: 12px 14px;
  border-radius: 10px;
  background: transparent;
  border: none;
  border-left: 3px solid transparent;
  font-size: 13px;
  transition: background 0.15s ease;
}

.tool-call:last-child {
  margin-bottom: 0;
}

.tool-call:hover {
  background: rgba(255, 255, 255, 0.03);
}

.tool-call.status-pending {
  border-left-color: rgba(251, 191, 36, 0.6);
  background: transparent;
}

.tool-call.status-pending:hover {
  background: rgba(251, 191, 36, 0.04);
}

.tool-call.status-executing {
  border-left-color: rgba(59, 130, 246, 0.6);
  background: rgba(59, 130, 246, 0.04);
}

.tool-call.status-completed {
  border-left-color: rgba(16, 163, 127, 0.6);
  background: transparent;
}

.tool-call.status-completed:hover {
  background: rgba(16, 163, 127, 0.04);
}

.tool-call.status-failed {
  border-left-color: rgba(239, 68, 68, 0.6);
  background: rgba(239, 68, 68, 0.04);
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tool-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
}

.tool-icon svg {
  color: var(--muted);
}

.status-pending .tool-icon svg {
  color: rgb(251, 191, 36);
}

.status-executing .tool-icon svg {
  color: rgb(59, 130, 246);
}

.status-completed .tool-icon svg {
  color: rgb(16, 163, 127);
}

.status-failed .tool-icon svg {
  color: rgb(239, 68, 68);
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.tool-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tool-name {
  font-weight: 500;
  color: var(--text);
}

.tool-status {
  font-size: 12px;
  color: var(--muted);
}

/* Flowing animation for executing state */
.tool-status.flowing {
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

.execute-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: none;
  background: var(--accent);
  color: white;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.execute-btn:hover {
  background: #0d8e6f;
}

.tool-arguments,
.tool-result {
  margin-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 8px;
}

.arguments-header,
.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  font-size: 12px;
  color: var(--muted);
  padding: 4px 0;
}

.arguments-header:hover,
.result-header:hover {
  color: var(--text);
}

.chevron {
  transition: transform 0.15s ease;
}

.chevron.expanded {
  transform: rotate(180deg);
}

.arguments-content,
.result-content {
  margin-top: 6px;
}

.arguments-content pre,
.result-content pre {
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.2);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
}

.tool-error {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.1);
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.error-icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgb(239, 68, 68);
  color: white;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.error-text {
  font-size: 12px;
  color: rgb(239, 68, 68);
}

/* Light theme */
html[data-theme='light'] .tool-call {
  background: transparent;
}

html[data-theme='light'] .tool-call:hover {
  background: rgba(0, 0, 0, 0.02);
}

html[data-theme='light'] .tool-call.status-pending:hover {
  background: rgba(251, 191, 36, 0.05);
}

html[data-theme='light'] .tool-call.status-executing {
  background: rgba(59, 130, 246, 0.05);
}

html[data-theme='light'] .tool-call.status-completed:hover {
  background: rgba(16, 163, 127, 0.05);
}

html[data-theme='light'] .tool-call.status-failed {
  background: rgba(239, 68, 68, 0.05);
}

html[data-theme='light'] .tool-icon {
  background: rgba(0, 0, 0, 0.05);
}

html[data-theme='light'] .tool-arguments,
html[data-theme='light'] .tool-result {
  border-top-color: rgba(0, 0, 0, 0.06);
}

html[data-theme='light'] .arguments-content pre,
html[data-theme='light'] .result-content pre {
  background: rgba(0, 0, 0, 0.04);
}
</style>
