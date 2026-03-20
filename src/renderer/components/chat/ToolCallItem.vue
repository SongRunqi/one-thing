<template>
  <div :class="['tool-inline', statusClass, { expanded: isExpanded, 'needs-confirm': toolCall.requiresConfirmation }]">
    <!-- Main Row: always single-line, fixed height -->
    <div class="tool-row" @click="toggleExpand">
      <!-- Status indicator (in-place "page flip" transition) -->
      <span class="status-indicator">
        <Transition name="status-swap" mode="out-in">
          <span v-if="toolCall.status === 'input-streaming'" key="streaming" class="status-streaming flowing-text">⟳</span>
          <span v-else-if="toolCall.status === 'executing'" key="executing" class="status-exec flowing-text">⏳</span>
          <span v-else-if="toolCall.status === 'completed'" key="completed" class="status-done">✓</span>
          <span v-else-if="toolCall.status === 'failed'" key="failed" class="status-error">✗</span>
          <span v-else-if="toolCall.requiresConfirmation" key="confirm" class="status-confirm flowing-text">⏳</span>
          <span v-else key="pending" class="status-pending">○</span>
        </Transition>
      </span>

      <!-- Tool name -->
      <span class="tool-name">{{ toolCall.toolName }}</span>

      <!-- Preview text: args summary, truncated to single line -->
      <span class="tool-preview">{{ previewText }}</span>

      <!-- Spacer -->
      <div class="spacer"></div>

      <!-- Confirmation buttons -->
      <div v-if="toolCall.requiresConfirmation" class="confirm-buttons" @click.stop>
        <AllowSplitButton @confirm="(response) => $emit('confirm', toolCall, response)" />
        <button class="btn-inline btn-reject" @click="$emit('reject', toolCall)" title="Reject (D/Esc)">
          Reject <kbd>D</kbd>
        </button>
      </div>

      <!-- Execution time -->
      <span v-if="executionTime" class="exec-time">{{ executionTime }}</span>

      <!-- Expand indicator -->
      <svg v-if="hasExpandableContent" :class="['expand-icon', { rotated: isExpanded }]" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </div>

    <!-- Expanded details (user-initiated only, never auto-collapse) -->
    <Transition name="slide">
      <div v-if="isExpanded && hasExpandableContent" class="tool-details">
        <!-- Arguments -->
        <div v-if="hasNonCommandArgs" class="detail-section">
          <div class="detail-label">Arguments</div>
          <pre>{{ formatNonCommandArgs() }}</pre>
        </div>

        <!-- Result -->
        <div v-if="toolCall.result && toolCall.status !== 'executing'" class="detail-section">
          <div class="detail-label">Result</div>
          <pre>{{ formatResult(toolCall.result) }}</pre>
        </div>

        <!-- Error -->
        <div v-if="toolCall.error" class="detail-section error">
          <div class="detail-label">Error</div>
          <pre class="error-text">{{ toolCall.error }}</pre>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ToolCall } from '@/types'
import AllowSplitButton from '../common/AllowSplitButton.vue'

interface Props {
  toolCall: ToolCall
  showArguments?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showArguments: true,
})

defineEmits<{
  execute: [toolCall: ToolCall]
  confirm: [toolCall: ToolCall, response: 'once' | 'session' | 'workspace' | 'always']
  reject: [toolCall: ToolCall]
}>()

const isExpanded = ref(false)

const statusClass = computed(() => `status-${props.toolCall.status}`)

// Preview text — single-line summary of what the tool is doing
const previewText = computed(() => {
  // During input-streaming, show streaming args preview
  if (props.toolCall.status === 'input-streaming') {
    if (props.toolCall.streamingArgs) {
      const toolName = props.toolCall.toolName?.toLowerCase()
      // For file tools, extract file_path
      if (toolName === 'write' || toolName === 'edit' || toolName === 'read') {
        const pathMatch = props.toolCall.streamingArgs.match(/"file_path"\s*:\s*"([^"]*)"?/)
        if (pathMatch) return pathMatch[1]
      }
      // For other tools, show tail of streaming args
      const args = props.toolCall.streamingArgs
      return args.length > 80 ? '...' + args.slice(-80) : args
    }
    return ''
  }

  const args = props.toolCall.arguments
  if (!args) return ''

  // Bash: show command
  if (args.command) return String(args.command)

  // File operations: show path
  const pathField = args.path || args.file_path || args.filePath
  if (pathField) return String(pathField)

  // Patterns
  if (args.pattern) return String(args.pattern)

  // Default: first value
  const firstVal = Object.values(args)[0]
  return firstVal ? String(firstVal) : ''
})

// Non-command arguments exist
const hasNonCommandArgs = computed(() => {
  const args = props.toolCall.arguments
  if (!args) return false
  return Object.keys(args).filter(k => k !== 'command').length > 0
})

// Has expandable content (args, result, or error)
const hasExpandableContent = computed(() => {
  return hasNonCommandArgs.value ||
         props.toolCall.result !== undefined ||
         props.toolCall.error
})

// Execution time
const executionTime = computed(() => {
  const { startTime, endTime } = props.toolCall
  if (startTime && endTime) {
    const ms = endTime - startTime
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
  }
  return null
})

function toggleExpand() {
  if (hasExpandableContent.value) {
    isExpanded.value = !isExpanded.value
  }
}

function formatNonCommandArgs(): string {
  const args = props.toolCall.arguments
  if (!args) return ''
  const filtered = Object.fromEntries(
    Object.entries(args).filter(([k]) => k !== 'command')
  )
  return JSON.stringify(filtered, null, 2)
}

function formatResult(result: any): string {
  if (typeof result === 'string') return result
  return JSON.stringify(result, null, 2)
}
</script>

<style scoped>
.tool-inline {
  font-size: 13px;
  border-radius: 6px;
  background: transparent;
  transition: background 0.15s ease;
  margin: 2px 0;
}


.tool-inline.needs-confirm {
  background: rgba(208, 162, 21, 0.06);
  border: 1px solid rgba(208, 162, 21, 0.15);
  border-radius: var(--radius-sm, 8px);
}

.tool-inline.needs-confirm:hover {
  background: rgba(208, 162, 21, 0.1);
  border-color: rgba(208, 162, 21, 0.25);
}

/* Main row — fixed height, single line, no wrapping */
.tool-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  height: 32px;
  overflow: hidden;
}

/* Status indicator */
.status-indicator {
  font-size: 13px;
  font-weight: 600;
  width: 16px;
  flex-shrink: 0;
  text-align: center;
}

.status-done { color: #22c55e; }
.status-error { color: #ef4444; }
.status-pending { color: #6b7280; }
.status-exec { color: #3b82f6; }
.status-streaming { color: #a855f7; }
.status-confirm { color: #d0a215; }

/* Tool name */
.tool-name {
  font-weight: 600;
  color: var(--text-secondary, #888);
  flex-shrink: 0;
  font-size: 12px;
}

/* Preview — single line, truncated */
.tool-preview {
  color: var(--text-primary, #e5e5e5);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
  opacity: 0.7;
}

.spacer {
  flex: 0 0 4px;
}

/* Execution time */
.exec-time {
  font-size: 11px;
  color: var(--text-tertiary, #666);
  flex-shrink: 0;
  opacity: 0.7;
}

/* Confirm buttons */
.confirm-buttons {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  align-items: center;
}

.btn-inline {
  padding: 4px 8px;
  border-radius: var(--radius-sm, 8px);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
  background: transparent;
  white-space: nowrap;
}

.btn-reject {
  color: var(--text-muted, #9F9D96);
  border-color: transparent;
  background: transparent;
}

.btn-reject:hover {
  color: var(--text-error, #D14D41);
  background: rgba(209, 77, 65, 0.08);
}

.btn-inline kbd {
  display: inline-block;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  padding: 0 4px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 10px;
  margin-left: 4px;
  vertical-align: middle;
  line-height: 1.4;
}

/* Expand icon */
.expand-icon {
  color: var(--text-tertiary, #666);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.expand-icon.rotated {
  transform: rotate(180deg);
}

/* Expanded details */
.tool-details {
  padding: 0 10px 8px 34px;
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

/* Slide transition for details */
.slide-enter-active {
  transition: opacity 0.2s ease;
}
.slide-leave-active {
  transition: opacity 0.15s ease;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}

/* Status swap (in-place "page flip") */
.status-swap-enter-active {
  transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.status-swap-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.status-swap-enter-from {
  opacity: 0;
  transform: scale(0.5);
}
.status-swap-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

/* Executing pulse */
.tool-inline.status-executing .status-indicator {
  animation: executingPulse 2s ease-in-out infinite;
}

@keyframes executingPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* Light theme */

html[data-theme='light'] .tool-inline.needs-confirm {
  background: rgba(173, 131, 1, 0.06);
  border-color: rgba(173, 131, 1, 0.15);
}

html[data-theme='light'] .tool-inline.needs-confirm:hover {
  background: rgba(173, 131, 1, 0.1);
  border-color: rgba(173, 131, 1, 0.25);
}

html[data-theme='light'] .detail-section pre {
  background: rgba(0, 0, 0, 0.04);
}

html[data-theme='light'] .btn-reject {
  color: #878580;
}

html[data-theme='light'] .btn-reject:hover {
  color: #AF3029;
  background: rgba(175, 48, 41, 0.08);
}

html[data-theme='light'] .btn-inline kbd {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.1);
}
</style>
