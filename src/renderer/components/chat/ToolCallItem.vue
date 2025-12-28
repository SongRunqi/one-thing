<template>
  <div :class="['tool-inline', statusClass, { expanded: isExpanded, 'needs-confirm': toolCall.requiresConfirmation }]">
    <!-- Main Row (always visible) -->
    <div class="tool-row" @click="toggleExpand">
      <!-- Status dot -->
      <div class="status-dot">
        <div v-if="toolCall.status === 'executing'" class="dot spinning"></div>
        <div v-else-if="toolCall.status === 'completed'" class="dot success"></div>
        <div v-else-if="toolCall.status === 'failed'" class="dot error"></div>
        <div v-else-if="toolCall.requiresConfirmation" class="dot warning"></div>
        <div v-else class="dot pending"></div>
      </div>

      <!-- Tool name -->
      <span class="tool-name">{{ toolCall.toolName }}</span>

      <!-- Command/Args preview -->
      <span class="tool-preview">{{ previewText }}</span>

      <!-- Spacer -->
      <div class="spacer"></div>

      <!-- Status text -->
      <span v-if="!toolCall.requiresConfirmation" class="status-text">
        {{ statusText }}
        <span v-if="executionTime" class="exec-time">{{ executionTime }}</span>
      </span>

      <!-- Confirmation buttons (stop propagation to prevent expand) -->
      <div v-if="toolCall.requiresConfirmation" class="confirm-buttons" @click.stop>
        <button class="btn-inline btn-allow" @click="$emit('confirm', toolCall, 'once')">允许</button>
        <button class="btn-inline btn-always" @click="$emit('confirm', toolCall, 'always')">永久</button>
        <button class="btn-inline btn-reject" @click="$emit('reject', toolCall)">拒绝</button>
      </div>

      <!-- Expand indicator -->
      <svg v-if="hasExpandableContent" :class="['expand-icon', { rotated: isExpanded }]" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </div>

    <!-- Expanded content -->
    <Transition name="slide">
      <div v-if="isExpanded && hasExpandableContent" class="tool-details">
        <!-- Live output for executing -->
        <div v-if="toolCall.status === 'executing' && toolCall.result" class="detail-section live">
          <pre>{{ truncateOutput(String(toolCall.result)) }}</pre>
        </div>

        <!-- Arguments (if not just command) -->
        <div v-if="hasNonCommandArgs" class="detail-section">
          <div class="detail-label">参数</div>
          <pre>{{ formatNonCommandArgs() }}</pre>
        </div>

        <!-- Result -->
        <div v-if="toolCall.result && toolCall.status !== 'executing'" class="detail-section">
          <div class="detail-label">结果</div>
          <pre>{{ formatResult(toolCall.result) }}</pre>
        </div>

        <!-- Error -->
        <div v-if="toolCall.error" class="detail-section error">
          <pre>{{ toolCall.error }}</pre>
        </div>
      </div>
    </Transition>
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
  confirm: [toolCall: ToolCall, response: 'once' | 'always']
  reject: [toolCall: ToolCall]
}>()

const isExpanded = ref(false)

const statusClass = computed(() => `status-${props.toolCall.status}`)

// Preview text - command or first arg (no truncation, CSS handles wrapping)
const previewText = computed(() => {
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
    case 'pending': return '等待'
    case 'executing': return '执行中'
    case 'completed': return '✓'
    case 'failed': return '✗'
    case 'cancelled': return '已取消'
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

/* Status dot */
.status-dot {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot.pending {
  background: #6b7280;
}

.dot.spinning {
  width: 10px;
  height: 10px;
  border: 2px solid rgba(59, 130, 246, 0.3);
  border-top-color: #3b82f6;
  background: transparent;
  animation: spin 0.8s linear infinite;
}

.dot.success {
  background: #22c55e;
}

.dot.error {
  background: #ef4444;
}

.dot.warning {
  background: var(--fx-yellow, #D0A215);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
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

.btn-allow {
  color: var(--text-success, #879A39);
  border-color: rgba(135, 154, 57, 0.3);
  background: rgba(135, 154, 57, 0.08);
}

.btn-allow:hover {
  background: rgba(135, 154, 57, 0.15);
  border-color: rgba(135, 154, 57, 0.5);
}

.btn-always {
  color: var(--accent, #4385BE);
  border-color: rgba(67, 133, 190, 0.3);
  background: rgba(67, 133, 190, 0.08);
}

.btn-always:hover {
  background: rgba(67, 133, 190, 0.15);
  border-color: rgba(67, 133, 190, 0.5);
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

.detail-section.error {
  border-left: 2px solid #ef4444;
  padding-left: 8px;
}

.detail-section.error pre {
  color: #ef4444;
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

html[data-theme='light'] .btn-allow {
  color: #66800B;
  border-color: rgba(102, 128, 11, 0.3);
  background: rgba(102, 128, 11, 0.08);
}

html[data-theme='light'] .btn-allow:hover {
  background: rgba(102, 128, 11, 0.15);
  border-color: rgba(102, 128, 11, 0.5);
}

html[data-theme='light'] .btn-always {
  color: #205EA6;
  border-color: rgba(32, 94, 166, 0.3);
  background: rgba(32, 94, 166, 0.08);
}

html[data-theme='light'] .btn-always:hover {
  background: rgba(32, 94, 166, 0.15);
  border-color: rgba(32, 94, 166, 0.5);
}

html[data-theme='light'] .btn-reject {
  color: #878580;
}

html[data-theme='light'] .btn-reject:hover {
  color: #AF3029;
  background: rgba(175, 48, 41, 0.08);
}
</style>
