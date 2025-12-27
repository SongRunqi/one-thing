<template>
  <div class="steps-panel" v-if="steps && steps.length > 0">
    <div
      v-for="step in steps"
      :key="step.id"
      :class="['step-inline', stepClass(step), { expanded: expandedSteps.has(step.id) }]"
    >
      <!-- Main Row -->
      <div class="step-row" @click="toggleExpand(step.id)">
        <!-- Status dot -->
        <div class="status-dot">
          <div v-if="step.status === 'running'" class="dot spinning"></div>
          <div v-else-if="step.status === 'completed'" class="dot success"></div>
          <div v-else-if="step.status === 'failed'" class="dot error"></div>
          <div v-else-if="step.status === 'awaiting-confirmation'" class="dot warning"></div>
          <div v-else class="dot pending"></div>
        </div>

        <!-- Step title -->
        <span class="step-title">{{ step.title }}</span>

        <!-- Preview -->
        <span class="step-preview">{{ getPreview(step) }}</span>

        <!-- Spacer -->
        <div class="spacer"></div>

        <!-- Status / Buttons -->
        <template v-if="step.status === 'awaiting-confirmation'">
          <div class="confirm-buttons" @click.stop>
            <button class="btn-inline btn-allow" @click="handleConfirm(step, 'once')">允许</button>
            <button class="btn-inline btn-always" @click="handleConfirm(step, 'always')">永久</button>
            <button class="btn-inline btn-reject" @click="handleReject(step)">拒绝</button>
          </div>
        </template>
        <span v-else class="status-text" :class="step.status">
          {{ getStatusText(step) }}
        </span>

        <!-- Expand icon -->
        <svg
          v-if="hasExpandableContent(step)"
          :class="['expand-icon', { rotated: expandedSteps.has(step.id) }]"
          width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      <!-- Expanded Content -->
      <Transition name="slide">
        <div v-if="shouldShowContent(step)" class="step-details">
          <!-- Live output for running -->
          <div v-if="step.status === 'running' && step.result" class="detail-section live">
            <pre>{{ truncateOutput(step.result) }}</pre>
          </div>

          <!-- Thinking -->
          <div v-if="step.thinking && expandedSteps.has(step.id)" class="detail-section">
            <div class="detail-label">💭 思考</div>
            <pre class="thinking">{{ step.thinking }}</pre>
          </div>

          <!-- Tool Agent Result -->
          <div v-if="step.toolAgentResult && expandedSteps.has(step.id)" class="detail-section">
            <div class="agent-header">
              <span :class="['agent-badge', step.toolAgentResult.success ? 'success' : 'failed']">
                {{ step.toolAgentResult.success ? '成功' : '失败' }}
              </span>
              <span class="agent-stats">{{ step.toolAgentResult.toolCallCount }} 次调用</span>
            </div>
            <pre>{{ step.toolAgentResult.summary }}</pre>
          </div>

          <!-- Arguments -->
          <div v-if="expandedSteps.has(step.id) && step.toolCall?.arguments && hasNonCommandArgs(step)" class="detail-section">
            <div class="detail-label">参数</div>
            <pre>{{ formatArgs(step.toolCall.arguments) }}</pre>
          </div>

          <!-- Result -->
          <div v-if="step.result && expandedSteps.has(step.id) && step.status !== 'running'" class="detail-section">
            <div class="detail-label">结果</div>
            <pre>{{ step.result }}</pre>
          </div>

          <!-- Summary -->
          <div v-if="step.summary && expandedSteps.has(step.id)" class="detail-section">
            <div class="detail-label">📝 分析</div>
            <pre class="summary">{{ step.summary }}</pre>
          </div>

          <!-- Error -->
          <div v-if="step.error" class="detail-section error">
            <pre>{{ step.error }}</pre>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Step, ToolCall } from '@/types'

const props = defineProps<{
  steps: Step[]
}>()

const emit = defineEmits<{
  confirm: [toolCall: ToolCall, response: 'once' | 'always']
  reject: [toolCall: ToolCall]
}>()

const expandedSteps = ref<Set<string>>(new Set())

// Auto-expand failed and awaiting-confirmation steps
watch(() => props.steps, (steps) => {
  for (const step of steps) {
    if ((step.status === 'failed' && step.error) || step.status === 'awaiting-confirmation') {
      if (!expandedSteps.value.has(step.id)) {
        expandedSteps.value.add(step.id)
        expandedSteps.value = new Set(expandedSteps.value)
      }
    }
  }
}, { deep: true, immediate: true })

function toggleExpand(stepId: string) {
  if (expandedSteps.value.has(stepId)) {
    expandedSteps.value.delete(stepId)
  } else {
    expandedSteps.value.add(stepId)
  }
  expandedSteps.value = new Set(expandedSteps.value)
}

function stepClass(step: Step): Record<string, boolean> {
  return {
    'status-running': step.status === 'running',
    'status-completed': step.status === 'completed',
    'status-failed': step.status === 'failed',
    'needs-confirm': step.status === 'awaiting-confirmation',
  }
}

function hasExpandableContent(step: Step): boolean {
  return !!(
    step.thinking ||
    (step.toolCall?.arguments && Object.keys(step.toolCall.arguments).length > 0) ||
    step.result ||
    step.summary ||
    step.error ||
    step.toolAgentResult
  )
}

function shouldShowContent(step: Step): boolean {
  if (step.status === 'awaiting-confirmation') return false // buttons are inline
  if (step.status === 'failed' && step.error) return true
  if (step.status === 'running' && step.result) return true
  return expandedSteps.value.has(step.id)
}

function getStatusText(step: Step): string {
  if (step.status === 'running') return '执行中'
  if (step.status === 'failed') return '✗'
  if (step.status === 'completed') return '✓'
  return ''
}

function getPreview(step: Step): string {
  // For bash commands - title already contains the command, skip preview
  if (step.toolCall?.arguments?.command) {
    return ''
  }
  // For file operations
  if (step.toolCall?.arguments?.path) {
    const path = step.toolCall.arguments.path as string
    return path.length > 40 ? '...' + path.slice(-37) : path
  }
  return ''
}

function hasNonCommandArgs(step: Step): boolean {
  const args = step.toolCall?.arguments
  if (!args) return false
  return Object.keys(args).filter(k => k !== 'command').length > 0
}

function handleConfirm(step: Step, response: 'once' | 'always') {
  if (step.toolCall) {
    emit('confirm', step.toolCall, response)
  }
}

function handleReject(step: Step) {
  if (step.toolCall) {
    emit('reject', step.toolCall)
  }
}

function formatArgs(args: Record<string, any>): string {
  if (args.command && Object.keys(args).length === 1) {
    return args.command
  }
  const filtered = Object.fromEntries(
    Object.entries(args).filter(([k]) => k !== 'command')
  )
  return JSON.stringify(filtered, null, 2)
}

function truncateOutput(output: string, maxLines: number = 8): string {
  const lines = output.split('\n')
  if (lines.length <= maxLines) return output
  return '...\n' + lines.slice(-maxLines).join('\n')
}
</script>

<style scoped>
.steps-panel {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Inline step row */
.step-inline {
  font-size: 13px;
  border-radius: 6px;
  background: transparent;
  transition: background 0.15s ease;
}

.step-inline:hover {
  background: rgba(255, 255, 255, 0.03);
}

.step-inline.needs-confirm {
  background: rgba(208, 162, 21, 0.06);
  border: 1px solid rgba(208, 162, 21, 0.15);
  border-radius: var(--radius-sm, 8px);
}

.step-inline.needs-confirm:hover {
  background: rgba(208, 162, 21, 0.1);
  border-color: rgba(208, 162, 21, 0.25);
}

/* Main row */
.step-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  min-height: 32px;
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

.dot.pending { background: #6b7280; }
.dot.success { background: #22c55e; }
.dot.error { background: #ef4444; }
.dot.warning {
  background: #f59e0b;
  animation: pulse 1.5s infinite;
}

.dot.spinning {
  width: 10px;
  height: 10px;
  border: 2px solid rgba(59, 130, 246, 0.3);
  border-top-color: #3b82f6;
  background: transparent;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Step title */
.step-title {
  font-weight: 500;
  color: var(--text-secondary, #888);
  flex-shrink: 0;
}

/* Preview */
.step-preview {
  color: var(--text-primary, #e5e5e5);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.spacer { flex: 1; }

/* Status text */
.status-text {
  font-size: 12px;
  color: var(--text-tertiary, #666);
  flex-shrink: 0;
}

.status-text.running { color: #3b82f6; }
.status-text.completed { color: #22c55e; }
.status-text.failed { color: #ef4444; }

/* Confirm buttons */
.confirm-buttons {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.btn-inline {
  padding: 4px 10px;
  border-radius: var(--radius-sm, 8px);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
  background: transparent;
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
.step-details {
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

pre.thinking {
  background: rgba(147, 51, 234, 0.1);
  border-left: 2px solid rgba(147, 51, 234, 0.5);
}

pre.summary {
  background: rgba(34, 197, 94, 0.1);
  border-left: 2px solid rgba(34, 197, 94, 0.5);
}

/* Agent result */
.agent-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.agent-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 3px;
  text-transform: uppercase;
}

.agent-badge.success {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.agent-badge.failed {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.agent-stats {
  font-size: 11px;
  color: var(--text-tertiary, #666);
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
  max-height: 400px;
}

/* Light theme */
html[data-theme='light'] .step-inline:hover {
  background: rgba(0, 0, 0, 0.03);
}

html[data-theme='light'] .step-inline.needs-confirm {
  background: rgba(173, 131, 1, 0.06);
  border-color: rgba(173, 131, 1, 0.15);
}

html[data-theme='light'] .step-inline.needs-confirm:hover {
  background: rgba(173, 131, 1, 0.1);
  border-color: rgba(173, 131, 1, 0.25);
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

html[data-theme='light'] .detail-section pre {
  background: rgba(0, 0, 0, 0.04);
}
</style>
