<template>
  <div :class="['tool-call', statusClass, { 'requires-confirmation': toolCall.requiresConfirmation }]">
    <div class="tool-header">
      <div class="tool-icon">
        <!-- Warning icon for confirmation required -->
        <svg v-if="toolCall.requiresConfirmation" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <svg v-else-if="toolCall.status === 'pending'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <svg v-else-if="toolCall.status === 'executing'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
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
        <span :class="['tool-status', { 'has-dots': toolCall.status === 'pending' || toolCall.status === 'executing' }]">
          {{ statusText }}<span v-if="toolCall.status === 'pending' || toolCall.status === 'executing'" class="animated-dots"><span>.</span><span>.</span><span>.</span></span>
        </span>
      </div>
      <!-- Confirmation buttons for dangerous commands -->
      <template v-if="toolCall.requiresConfirmation">
        <button
          class="confirm-btn"
          @click="$emit('confirm', toolCall)"
          title="Confirm and execute"
        >
          Confirm
        </button>
        <button
          class="reject-btn"
          @click="$emit('reject', toolCall)"
          title="Reject command"
        >
          Reject
        </button>
      </template>
      <button
        v-else-if="toolCall.status === 'pending'"
        class="execute-btn"
        @click="$emit('execute', toolCall)"
        title="Execute tool"
      >
        Run
      </button>
    </div>

    <!-- Confirmation warning for dangerous commands -->
    <div v-if="toolCall.requiresConfirmation" class="confirmation-warning">
      <div class="warning-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span>This command requires your confirmation</span>
      </div>
      <div class="command-preview">
        <code>{{ toolCall.arguments.command }}</code>
      </div>
      <div class="warning-hint">
        This is a potentially dangerous command that may modify or delete files.
      </div>
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
  confirm: [toolCall: ToolCall]
  reject: [toolCall: ToolCall]
}>()

const argumentsExpanded = ref(false)
const resultExpanded = ref(false) // Default to collapsed

const statusClass = computed(() => {
  return `status-${props.toolCall.status}`
})

// Calculate execution time with appropriate precision
const executionTime = computed(() => {
  const { startTime, endTime } = props.toolCall
  if (startTime && endTime) {
    const ms = endTime - startTime
    if (ms < 1000) {
      // Show milliseconds for very fast executions
      return `${ms}ms`
    } else {
      // Show seconds with 1 decimal for longer executions
      return `${(ms / 1000).toFixed(1)}s`
    }
  }
  return null
})

const statusText = computed(() => {
  // Check for confirmation required first
  if (props.toolCall.requiresConfirmation) {
    return 'Awaiting Confirmation'
  }

  // Format execution time suffix (unit already included in executionTime)
  const timeSuffix = executionTime.value ? ` (${executionTime.value})` : ''

  switch (props.toolCall.status) {
    case 'pending':
      return 'Waiting'
    case 'executing':
      return 'Calling'
    case 'completed':
      return `Completed${timeSuffix}`
    case 'failed':
      return `Failed${timeSuffix}`
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
  border-left-color: rgba(59, 130, 246, 0.6);
  background: transparent;
}

.tool-call.status-completed:hover {
  background: rgba(59, 130, 246, 0.04);
}

.tool-call.status-failed {
  border-left-color: rgba(239, 68, 68, 0.6);
  background: rgba(239, 68, 68, 0.04);
}

/* Confirmation required state */
.tool-call.requires-confirmation {
  border-left-color: rgba(245, 158, 11, 0.8);
  background: rgba(245, 158, 11, 0.08);
}

.tool-call.requires-confirmation .tool-icon svg {
  color: rgb(245, 158, 11);
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
  color: rgb(59, 130, 246);
}

.status-failed .tool-icon svg {
  color: rgb(239, 68, 68);
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

/* Status colors for pending/executing */
.status-pending .tool-status {
  color: rgb(251, 191, 36);
}

.status-executing .tool-status {
  color: rgb(59, 130, 246);
}

/* Animated dots */
.animated-dots {
  display: inline-block;
  margin-left: 1px;
}

.animated-dots span {
  opacity: 0;
  animation: dot-fade 1.4s infinite;
}

.animated-dots span:nth-child(1) {
  animation-delay: 0s;
}

.animated-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.animated-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dot-fade {
  0%, 20% {
    opacity: 0;
  }
  40% {
    opacity: 1;
  }
  60%, 100% {
    opacity: 0;
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

/* Confirmation buttons */
.confirm-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: none;
  background: rgb(34, 197, 94);
  color: white;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.confirm-btn:hover {
  background: rgb(22, 163, 74);
}

.reject-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid rgba(239, 68, 68, 0.5);
  background: transparent;
  color: rgb(239, 68, 68);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.reject-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgb(239, 68, 68);
}

/* Confirmation warning box */
.confirmation-warning {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.warning-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  color: rgb(245, 158, 11);
  margin-bottom: 8px;
}

.command-preview {
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.3);
  margin-bottom: 8px;
}

.command-preview code {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  color: rgb(251, 191, 36);
  word-break: break-all;
}

.warning-hint {
  font-size: 11px;
  color: var(--muted);
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
  background: rgba(59, 130, 246, 0.05);
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
