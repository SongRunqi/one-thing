<template>
  <div class="steps-panel" v-if="steps && steps.length > 0">
    <div
      v-for="step in steps"
      :key="step.id"
      class="step-card"
      :class="stepCardClass(step)"
    >
      <!-- Header Row -->
      <div class="step-header" @click="toggleExpand(step.id)">
        <div class="step-icon">
          <component :is="getStepIcon(step)" />
        </div>
        <div class="step-info">
          <div class="step-title-row">
            <span class="step-title">{{ step.title }}</span>
          </div>
          <div class="step-preview" v-if="getPreview(step)">{{ getPreview(step) }}</div>
        </div>
        <div class="step-status-area">
          <!-- Status indicator -->
          <div class="step-status" :class="step.status">
            <div v-if="step.status === 'running'" class="status-spinner"></div>
            <svg v-else-if="step.status === 'completed'" class="status-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <svg v-else-if="step.status === 'failed'" class="status-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            <svg v-else-if="step.status === 'awaiting-confirmation'" class="status-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span class="status-text">{{ getStatusText(step) }}</span>
          </div>
          <!-- Expand chevron -->
          <svg
            v-if="hasExpandableContent(step)"
            class="expand-chevron"
            :class="{ expanded: expandedSteps.has(step.id) }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      <!-- Expandable Content -->
      <Transition name="expand">
        <div v-if="shouldShowContent(step)" class="step-content">
          <!-- Confirmation UI -->
          <div v-if="step.status === 'awaiting-confirmation'" class="step-confirmation">
            <div class="confirmation-warning">
              <div class="warning-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span>这是一个可能危险的命令</span>
              </div>
              <div class="command-preview" v-if="step.toolCall?.arguments?.command">
                <code>{{ step.toolCall.arguments.command }}</code>
              </div>
            </div>
            <div class="confirmation-actions">
              <button class="confirm-btn" @click.stop="handleConfirm(step)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                确认执行
              </button>
              <button class="reject-btn" @click.stop="handleReject(step)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                取消
              </button>
            </div>
          </div>

          <!-- Thinking section -->
          <div v-if="step.thinking && expandedSteps.has(step.id)" class="detail-section thinking">
            <div class="detail-header">💭 思考</div>
            <div class="thinking-content">{{ step.thinking }}</div>
          </div>

          <!-- Tool Agent Result -->
          <div v-if="step.toolAgentResult && expandedSteps.has(step.id)" class="tool-agent-result">
            <div class="agent-result-header">
              <span :class="['agent-status', step.toolAgentResult.success ? 'success' : 'failed']">
                {{ step.toolAgentResult.success ? 'Success' : 'Failed' }}
              </span>
              <span class="agent-stats">{{ step.toolAgentResult.toolCallCount }} tool calls</span>
            </div>
            <div class="agent-summary">{{ step.toolAgentResult.summary }}</div>
            <div v-if="step.toolAgentResult.filesModified?.length" class="agent-files">
              <div class="detail-header">Files Modified</div>
              <ul class="files-list">
                <li v-for="file in step.toolAgentResult.filesModified" :key="file">{{ file }}</li>
              </ul>
            </div>
            <div v-if="step.toolAgentResult.errors?.length" class="agent-errors">
              <div class="detail-header">Errors</div>
              <ul class="errors-list">
                <li v-for="(error, idx) in step.toolAgentResult.errors" :key="idx">{{ error }}</li>
              </ul>
            </div>
          </div>

          <!-- Arguments (only when expanded manually) -->
          <div v-if="expandedSteps.has(step.id) && step.toolCall?.arguments && Object.keys(step.toolCall.arguments).length > 0" class="detail-section">
            <div class="detail-header">参数</div>
            <ResultBlock :content="formatArgs(step.toolCall.arguments)" label="Arguments" />
          </div>

          <!-- Result (using new ResultBlock) -->
          <ResultBlock
            v-if="step.result && expandedSteps.has(step.id)"
            :content="step.result"
            label="结果"
          />

          <!-- Summary -->
          <div v-if="step.summary && expandedSteps.has(step.id)" class="detail-section summary">
            <div class="detail-header">📝 分析</div>
            <div class="summary-content">{{ step.summary }}</div>
          </div>

          <!-- Error (using new ErrorBlock, auto-show when failed) -->
          <ErrorBlock
            v-if="step.error"
            :error="step.error"
          />
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { h, type FunctionalComponent } from 'vue'
import type { Step, ToolCall } from '@/types'
import ResultBlock from './ResultBlock.vue'
import ErrorBlock from './ErrorBlock.vue'

const props = defineProps<{
  steps: Step[]
}>()

const emit = defineEmits<{
  confirm: [toolCall: ToolCall]
  reject: [toolCall: ToolCall]
}>()

const expandedSteps = ref<Set<string>>(new Set())

// Auto-expand failed steps and steps awaiting confirmation
watch(() => props.steps, (steps) => {
  for (const step of steps) {
    // Auto-expand failed steps
    if (step.status === 'failed' && step.error && !expandedSteps.value.has(step.id)) {
      expandedSteps.value.add(step.id)
      expandedSteps.value = new Set(expandedSteps.value)
    }
    // Auto-expand awaiting confirmation
    if (step.status === 'awaiting-confirmation' && !expandedSteps.value.has(step.id)) {
      expandedSteps.value.add(step.id)
      expandedSteps.value = new Set(expandedSteps.value)
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

function hasExpandableContent(step: Step): boolean {
  return !!(
    step.thinking ||
    (step.toolCall?.arguments && Object.keys(step.toolCall.arguments).length > 0) ||
    step.result ||
    step.summary ||
    step.error ||
    step.toolAgentResult ||
    step.status === 'awaiting-confirmation'
  )
}

function shouldShowContent(step: Step): boolean {
  // Always show for awaiting-confirmation (needs buttons)
  if (step.status === 'awaiting-confirmation') return true
  // Always show error when failed
  if (step.status === 'failed' && step.error) return true
  // Otherwise only when expanded
  return expandedSteps.value.has(step.id)
}

function stepCardClass(step: Step): Record<string, boolean> {
  return {
    'step-running': step.status === 'running',
    'step-completed': step.status === 'completed',
    'step-failed': step.status === 'failed',
    'step-awaiting': step.status === 'awaiting-confirmation',
    [`step-type-${step.type}`]: true,
  }
}

function getStatusText(step: Step): string {
  if (step.status === 'running') return '执行中'
  if (step.status === 'awaiting-confirmation') return '待确认'
  if (step.status === 'failed') return '失败'
  if (step.status === 'completed') {
    // Calculate and display duration
    const duration = getDuration(step)
    if (duration) return duration
    return '完成'
  }
  return ''
}

function getDuration(step: Step): string | null {
  // For now, we don't have endTime stored, so we can't calculate duration
  // This would need backend support to track end time
  // For demonstration, we could use a placeholder
  return null
}

function getPreview(step: Step): string {
  // For bash commands, show the command
  if (step.toolCall?.arguments?.command) {
    const cmd = step.toolCall.arguments.command as string
    // Truncate long commands
    const maxLen = 60
    if (cmd.length > maxLen) {
      return cmd.substring(0, maxLen) + '...'
    }
    return cmd
  }

  // For file operations, show the path
  if (step.toolCall?.arguments?.path) {
    const path = step.toolCall.arguments.path as string
    // Truncate long paths
    const maxLen = 50
    if (path.length > maxLen) {
      return '...' + path.substring(path.length - maxLen)
    }
    return path
  }

  // Show thinking preview
  if (step.thinking) {
    const firstLine = step.thinking.split('\n')[0].trim()
    const maxLen = 50
    if (firstLine.length > maxLen) {
      return '💭 ' + firstLine.substring(0, maxLen) + '...'
    }
    return '💭 ' + firstLine
  }

  // Show summary preview
  if (step.summary) {
    const firstLine = step.summary.split('\n')[0].trim()
    const maxLen = 50
    if (firstLine.length > maxLen) {
      return '📝 ' + firstLine.substring(0, maxLen) + '...'
    }
    return '📝 ' + firstLine
  }

  return step.description || ''
}

function handleConfirm(step: Step) {
  if (step.toolCall) {
    emit('confirm', step.toolCall)
  }
}

function handleReject(step: Step) {
  if (step.toolCall) {
    emit('reject', step.toolCall)
  }
}

function formatArgs(args: Record<string, any>): string {
  // For bash commands, show the command directly
  if (args.command && Object.keys(args).length === 1) {
    return args.command
  }
  return JSON.stringify(args, null, 2)
}

// Icon components for different step types
const SkillIcon: FunctionalComponent = () =>
  h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('path', { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' })
  ])

const CommandIcon: FunctionalComponent = () =>
  h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('polyline', { points: '4 17 10 11 4 5' }),
    h('line', { x1: '12', y1: '19', x2: '20', y2: '19' })
  ])

const FileReadIcon: FunctionalComponent = () =>
  h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
    h('polyline', { points: '14 2 14 8 20 8' }),
    h('line', { x1: '16', y1: '13', x2: '8', y2: '13' }),
    h('line', { x1: '16', y1: '17', x2: '8', y2: '17' }),
    h('polyline', { points: '10 9 9 9 8 9' })
  ])

const FileWriteIcon: FunctionalComponent = () =>
  h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('path', { d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }),
    h('path', { d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' })
  ])

const ToolIcon: FunctionalComponent = () =>
  h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('path', { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' })
  ])

const ThinkingIcon: FunctionalComponent = () =>
  h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('circle', { cx: '12', cy: '12', r: '10' }),
    h('path', { d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3' }),
    h('line', { x1: '12', y1: '17', x2: '12.01', y2: '17' })
  ])

const ToolAgentIcon: FunctionalComponent = () =>
  h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('rect', { x: '3', y: '3', width: '18', height: '18', rx: '2', ry: '2' }),
    h('circle', { cx: '8.5', cy: '8.5', r: '1.5' }),
    h('circle', { cx: '15.5', cy: '8.5', r: '1.5' }),
    h('path', { d: 'M9 14s.5 2 3 2 3-2 3-2' })
  ])

function getStepIcon(step: Step): FunctionalComponent {
  switch (step.type) {
    case 'skill-read':
      return SkillIcon
    case 'command':
      return CommandIcon
    case 'file-read':
      return FileReadIcon
    case 'file-write':
      return FileWriteIcon
    case 'tool-call':
      return ToolIcon
    case 'thinking':
      return ThinkingIcon
    case 'tool-agent':
      return ToolAgentIcon
    default:
      return CommandIcon
  }
}
</script>

<style scoped>
.steps-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* Card Design */
.step-card {
  background: var(--step-card-bg, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--step-card-border, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.step-card:hover {
  background: var(--step-card-hover, rgba(255, 255, 255, 0.05));
}

/* Running state */
.step-card.step-running {
  border-color: rgba(59, 130, 246, 0.4);
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.1);
}

/* Failed state */
.step-card.step-failed {
  border-color: rgba(239, 68, 68, 0.4);
}

/* Awaiting confirmation state */
.step-card.step-awaiting {
  border-color: rgba(245, 158, 11, 0.4);
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.1);
}

/* Header Row */
.step-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
}

.step-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary, #888);
  margin-top: 1px;
}

.step-icon svg {
  width: 100%;
  height: 100%;
}

/* Step type colors */
.step-type-skill-read .step-icon { color: var(--color-purple, #a855f7); }
.step-type-command .step-icon { color: var(--color-green, #22c55e); }
.step-type-file-read .step-icon { color: var(--color-blue, #3b82f6); }
.step-type-file-write .step-icon { color: var(--color-orange, #f97316); }
.step-type-tool-call .step-icon { color: var(--color-cyan, #06b6d4); }
.step-type-tool-agent .step-icon { color: var(--color-pink, #ec4899); }

/* Info area (title + preview) */
.step-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.step-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #fff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.step-preview {
  font-size: 11px;
  color: var(--text-tertiary, #666);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

/* Status Area */
.step-status-area {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.step-status {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
}

.step-status.running {
  color: var(--color-blue, #3b82f6);
}

.step-status.completed {
  color: var(--color-green, #22c55e);
}

.step-status.failed {
  color: var(--color-red, #ef4444);
}

.step-status.awaiting-confirmation {
  color: var(--color-warning, #f59e0b);
}

.status-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(59, 130, 246, 0.25);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.status-check,
.status-x,
.status-warning {
  width: 14px;
  height: 14px;
}

.status-text {
  white-space: nowrap;
}

.expand-chevron {
  width: 14px;
  height: 14px;
  color: var(--text-tertiary, #666);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.expand-chevron.expanded {
  transform: rotate(180deg);
}

/* Expandable Content */
.step-content {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding: 10px 12px;
}

/* Expand animation */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease-out;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

/* Confirmation section */
.step-confirmation {
  margin-bottom: 8px;
}

.confirmation-warning {
  margin-bottom: 10px;
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
}

.command-preview code {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  color: rgb(251, 191, 36);
  word-break: break-all;
}

.confirmation-actions {
  display: flex;
  gap: 8px;
}

.confirm-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
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
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
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

/* Detail sections */
.detail-section {
  margin-bottom: 10px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-header {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary, #888);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

/* Thinking section */
.thinking-content {
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(147, 51, 234, 0.1);
  border-left: 3px solid rgba(147, 51, 234, 0.5);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary, #fff);
  white-space: pre-wrap;
  word-break: break-word;
}

/* Summary section */
.summary-content {
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(34, 197, 94, 0.1);
  border-left: 3px solid rgba(34, 197, 94, 0.5);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary, #fff);
  white-space: pre-wrap;
  word-break: break-word;
}

/* Tool Agent result */
.tool-agent-result {
  margin-bottom: 10px;
}

.agent-result-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.agent-status {
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.agent-status.success {
  background: rgba(34, 197, 94, 0.15);
  color: rgb(34, 197, 94);
}

.agent-status.failed {
  background: rgba(239, 68, 68, 0.15);
  color: rgb(239, 68, 68);
}

.agent-stats {
  font-size: 11px;
  color: var(--text-secondary, #888);
}

.agent-summary {
  padding: 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.2);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-primary, #fff);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.agent-files,
.agent-errors {
  margin-top: 10px;
}

.files-list,
.errors-list {
  margin: 4px 0 0 0;
  padding-left: 20px;
}

.files-list li,
.errors-list li {
  font-size: 11px;
  margin: 2px 0;
}

.files-list li {
  color: var(--color-blue, #3b82f6);
}

.errors-list li {
  color: rgb(239, 68, 68);
}

/* Light theme */
html[data-theme='light'] .step-card {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.08);
}

html[data-theme='light'] .step-card:hover {
  background: rgba(0, 0, 0, 0.04);
}

html[data-theme='light'] .step-card.step-running {
  border-color: rgba(59, 130, 246, 0.3);
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.08);
}

html[data-theme='light'] .step-card.step-failed {
  border-color: rgba(239, 68, 68, 0.3);
}

html[data-theme='light'] .step-card.step-awaiting {
  border-color: rgba(245, 158, 11, 0.3);
}

html[data-theme='light'] .step-content {
  border-top-color: rgba(0, 0, 0, 0.06);
}

html[data-theme='light'] .command-preview {
  background: rgba(0, 0, 0, 0.06);
}

html[data-theme='light'] .thinking-content {
  background: rgba(147, 51, 234, 0.08);
}

html[data-theme='light'] .summary-content {
  background: rgba(34, 197, 94, 0.08);
}

html[data-theme='light'] .agent-summary {
  background: rgba(0, 0, 0, 0.04);
}
</style>
