<template>
  <div :class="['tool-inline', statusClass, { expanded: isExpanded, 'needs-confirm': toolCall.requiresConfirmation }]">
    <!-- Main Row (always visible) -->
    <div
      class="tool-row"
      @click="toggleExpand"
    >
      <!-- Status indicator -->
      <span class="status-indicator">
        <span
          v-if="toolCall.status === 'input-streaming'"
          class="flowing-text"
        >Streaming</span>
        <span
          v-else-if="toolCall.status === 'executing'"
          class="flowing-text"
        >Running</span>
        <span
          v-else-if="toolCall.status === 'completed'"
          class="status-done"
        >✓</span>
        <span
          v-else-if="toolCall.status === 'failed'"
          class="status-error"
        >✗</span>
        <span
          v-else-if="toolCall.requiresConfirmation"
          class="flowing-text"
        >Confirm</span>
        <span
          v-else
          class="status-pending"
        >○</span>
      </span>

      <!-- Tool name -->
      <span class="tool-name">{{ toolCall.toolName }}</span>

      <!-- Command/Args preview -->
      <span class="tool-preview">{{ previewText }}</span>

      <!-- Spacer -->
      <div class="spacer" />

      <!-- Status text -->
      <span
        v-if="!toolCall.requiresConfirmation"
        class="status-text"
      >
        {{ statusText }}
        <span
          v-if="executionTime"
          class="exec-time"
        >{{ executionTime }}</span>
      </span>

      <!-- Confirmation buttons (stop propagation to prevent expand) -->
      <div
        v-if="toolCall.requiresConfirmation"
        class="confirm-buttons"
        @click.stop
      >
        <AllowSplitButton @confirm="(response) => $emit('confirm', toolCall, response)" />
        <button
          class="btn-inline btn-reject"
          title="Reject (D/Esc)"
          @click="$emit('reject', toolCall)"
        >
          Reject <kbd>D</kbd>
        </button>
      </div>

      <!-- Expand indicator -->
      <svg
        v-if="hasExpandableContent"
        :class="['expand-icon', { rotated: isExpanded }]"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>

    <!-- Streaming content for write/edit tools -->
    <Transition name="slide">
      <div
        v-if="streamingContentInfo && (streamingContentInfo.filePath || streamingContentInfo.content)"
        class="streaming-content"
      >
        <div class="streaming-header">
          <span class="streaming-path">{{ streamingContentInfo.filePath || 'Parsing...' }}</span>
          <span class="streaming-indicator flowing-text">Writing...</span>
        </div>
        <pre
          v-if="streamingContentInfo.content"
          class="streaming-code"
        ><code>{{ streamingContentInfo.content }}</code></pre>
      </div>
    </Transition>

    <!-- Expanded content -->
    <Transition name="slide">
      <div
        v-if="isExpanded && hasExpandableContent"
        class="tool-details"
      >
        <!-- Live output for executing -->
        <div
          v-if="toolCall.status === 'executing' && toolCall.result"
          class="detail-section live"
        >
          <pre>{{ truncateOutput(String(toolCall.result)) }}</pre>
        </div>

        <!-- Arguments (if not just command) -->
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

// For write/edit tools during streaming, extract and show file content
const streamingContentInfo = computed(() => {
  if (props.toolCall.status !== 'input-streaming' || !props.toolCall.streamingArgs) {
    return null
  }

  const toolName = props.toolCall.toolName?.toLowerCase()
  if (toolName !== 'write' && toolName !== 'edit') {
    return null
  }

  const args = props.toolCall.streamingArgs
  const result: { filePath: string; content: string } = { filePath: '', content: '' }

  // Extract file_path
  const pathMatch = args.match(/"file_path"\s*:\s*"([^"]*)"?/)
  if (pathMatch) {
    result.filePath = pathMatch[1]
  }

  // Extract content (for write tool)
  if (toolName === 'write') {
    const contentMatch = args.match(/"content"\s*:\s*"/)
    if (contentMatch) {
      // Get everything after "content": "
      const startIdx = contentMatch.index! + contentMatch[0].length
      let content = args.slice(startIdx)
      // Unescape JSON string (basic unescaping)
      content = content
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
      // Remove trailing incomplete quote if present
      if (content.endsWith('"')) {
        content = content.slice(0, -1)
      }
      result.content = content
    }
  }

  // Extract new_string (for edit tool)
  if (toolName === 'edit') {
    const newStringMatch = args.match(/"new_string"\s*:\s*"/)
    if (newStringMatch) {
      const startIdx = newStringMatch.index! + newStringMatch[0].length
      let content = args.slice(startIdx)
      content = content
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
      if (content.endsWith('"')) {
        content = content.slice(0, -1)
      }
      result.content = content
    }
  }

  // Show if we have any info (filePath or content) - don't require both
  return result
})

// Preview text - command or first arg (no truncation, CSS handles wrapping)
const previewText = computed(() => {
  // For input-streaming status
  if (props.toolCall.status === 'input-streaming') {
    if (props.toolCall.streamingArgs) {
      const toolName = props.toolCall.toolName?.toLowerCase()
      if (toolName === 'write' || toolName === 'edit') {
        // Extract file_path for preview
        const pathMatch = props.toolCall.streamingArgs.match(/"file_path"\s*:\s*"([^"]*)"?/)
        if (pathMatch) {
          return pathMatch[1]
        }
      }
      // For other tools, show truncated streaming args
      const args = props.toolCall.streamingArgs
      return args.length > 100 ? '...' + args.slice(-100) : args
    }
    // No streaming args yet, just show generating indicator
    return ''
  }

  const args = props.toolCall.arguments
  if (!args) return ''

  // For bash, show command
  if (args.command) {
    return String(args.command)
  }

  // For file operations, show path (check multiple possible field names)
  const pathField = args.path || args.file_path || args.filePath
  if (pathField) {
    return String(pathField)
  }

  // For glob/grep patterns
  if (args.pattern) {
    return String(args.pattern)
  }

  // Default: stringify first value
  const firstVal = Object.values(args)[0]
  if (firstVal) {
    return String(firstVal)
  }

  return ''
})

// Check for non-command args
const hasNonCommandArgs = computed(() => {
  const args = props.toolCall.arguments
  if (!args) return false
  return Object.keys(args).filter(k => k !== 'command').length > 0
})

// Check if there's content to expand
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

// Status text
const statusText = computed(() => {
  switch (props.toolCall.status) {
    case 'input-streaming': return ''  // 直接显示 streaming-content，不需要状态文本
    case 'pending': return 'Pending'
    case 'executing': return 'Executing'
    case 'completed': return '✓'
    case 'failed': return '✗'
    case 'cancelled': return 'Cancelled'
    default: return ''
  }
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

function truncateOutput(output: string, maxLines: number = 8): string {
  const lines = output.split('\n')
  if (lines.length <= maxLines) return output
  return '...\n' + lines.slice(-maxLines).join('\n')
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

.tool-inline:hover {
  background: rgba(255, 255, 255, 0.03);
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

/* Main row */
.tool-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  min-height: 32px;
  flex-wrap: wrap;
}

/* Status indicator - unified flowing text animation */
.status-indicator {
  font-size: 11px;
  font-weight: 600;
  min-width: 60px;
  flex-shrink: 0;
}

.status-indicator .status-done {
  color: #22c55e;
}

.status-indicator .status-error {
  color: #ef4444;
}

.status-indicator .status-pending {
  color: #6b7280;
}

/* Tool name */
.tool-name {
  font-weight: 500;
  color: var(--text-secondary, #888);
  word-break: break-word;
}

/* Preview */
.tool-preview {
  color: var(--text-primary, #e5e5e5);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  min-width: 0;
  flex: 1;
}

.spacer {
  flex: 1;
  min-width: 8px;
}

/* Status text */
.status-text {
  font-size: 12px;
  color: var(--text-tertiary, #666);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-completed .status-text {
  color: #22c55e;
}

.status-failed .status-text {
  color: #ef4444;
}

.status-executing .status-text {
  color: #3b82f6;
}

.status-input-streaming .status-text {
  color: #a855f7;
}

.exec-time {
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

/* Compact buttons on small screens */
@media (max-width: 500px) {
  .confirm-buttons {
    gap: 3px;
  }
  .btn-inline {
    padding: 4px 6px;
    font-size: 11px;
  }
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

/* Keyboard shortcut hints */
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

.detail-section.live {
  border-left: 2px solid #3b82f6;
  padding-left: 8px;
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

/* Slide animation */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
}

.slide-enter-to,
.slide-leave-from {
  max-height: 300px;
}

/* Streaming content for write/edit tools */
.streaming-content {
  padding: 8px 10px 10px 34px;
  border-left: 2px solid #a855f7;
  margin-left: 10px;
}

.streaming-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.streaming-path {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 11px;
  color: var(--text-secondary, #999);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.streaming-indicator {
  font-size: 11px;
  font-weight: 500;
}

.streaming-code {
  margin: 0;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(168, 85, 247, 0.08);
  border: 1px solid rgba(168, 85, 247, 0.15);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-primary, #e5e5e5);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}

.streaming-code code {
  font-family: inherit;
}

/* Light theme */
html[data-theme='light'] .tool-inline:hover {
  background: rgba(0, 0, 0, 0.03);
}

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

html[data-theme='light'] .streaming-code {
  background: rgba(147, 51, 234, 0.06);
  border-color: rgba(147, 51, 234, 0.15);
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
