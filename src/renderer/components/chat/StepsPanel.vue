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

        <!-- Tool name badge -->
        <span v-if="step.toolCall?.toolName" class="tool-badge">{{ step.toolCall.toolName }}</span>

        <!-- Step title -->
        <span class="step-title">{{ truncateTitle(step.title) }}</span>

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
          <!-- Diff preview for edit tool (awaiting-confirmation or completed) -->
          <div v-if="(step.status === 'awaiting-confirmation' || step.status === 'completed') && getDiffFromStep(step)" class="detail-section diff-preview">
            <div class="diff-header">
              <span class="diff-file-path">{{ getDiffFromStep(step)?.filePath }}</span>
              <span class="diff-stats">
                <span class="additions">+{{ getDiffFromStep(step)?.additions || 0 }}</span>
                <span class="deletions">-{{ getDiffFromStep(step)?.deletions || 0 }}</span>
              </span>
              <span v-if="step.status === 'completed'" class="diff-status-badge">已应用</span>
            </div>
            <div class="diff-content">
              <template v-for="(line, idx) in getVisibleDiffLines(step)" :key="idx">
                <div v-if="line.type === 'collapse'" class="diff-collapse" @click="toggleDiffExpand(step.id)">
                  <span class="collapse-icon">{{ isDiffExpanded(step.id) ? '▼' : '▶' }}</span>
                  <span>{{ line.text }}</span>
                </div>
                <div v-else :class="['diff-line', line.class]">
                  <span class="line-number old">{{ line.oldNum || '' }}</span>
                  <span class="line-number new">{{ line.newNum || '' }}</span>
                  <span class="line-prefix">{{ line.prefix }}</span>
                  <span class="line-content" :class="{ 'line-deleted-text': line.class === 'diff-del' }">{{ line.content }}</span>
                </div>
              </template>
            </div>
          </div>

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
          <div v-if="expandedSteps.has(step.id) && step.toolCall?.arguments && hasArgs(step)" class="detail-section">
            <div class="detail-label">参数</div>
            <pre>{{ formatArgs(step.toolCall.arguments) }}</pre>
          </div>

          <!-- Result -->
          <div v-if="step.result && expandedSteps.has(step.id) && step.status !== 'running'" class="detail-section">
            <div class="detail-label">结果</div>
            <pre>{{ formatResult(step.result) }}</pre>
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
// Track steps that user has manually collapsed - don't auto-expand these
const userCollapsedSteps = ref<Set<string>>(new Set())
// Track which diffs are fully expanded (not collapsed)
const expandedDiffs = ref<Set<string>>(new Set())

// Diff line type for VS Code-style display
interface DiffLine {
  type: 'line' | 'collapse'
  class: string
  prefix: string
  content: string
  text?: string
  oldNum?: number | string
  newNum?: number | string
}

// Maximum lines to show before collapsing
const MAX_VISIBLE_LINES = 20
const CONTEXT_LINES = 3 // Lines to show before/after collapse

// Auto-expand failed and awaiting-confirmation steps (unless user manually collapsed)
watch(() => props.steps, (steps) => {
  for (const step of steps) {
    if ((step.status === 'failed' && step.error) || step.status === 'awaiting-confirmation') {
      // Only auto-expand if user hasn't manually collapsed it
      if (!expandedSteps.value.has(step.id) && !userCollapsedSteps.value.has(step.id)) {
        expandedSteps.value.add(step.id)
        expandedSteps.value = new Set(expandedSteps.value)
      }
    }
  }
}, { deep: true, immediate: true })

function toggleExpand(stepId: string) {
  if (expandedSteps.value.has(stepId)) {
    expandedSteps.value.delete(stepId)
    // Mark as user-collapsed to prevent auto-expand from overriding
    userCollapsedSteps.value.add(stepId)
    userCollapsedSteps.value = new Set(userCollapsedSteps.value)
  } else {
    expandedSteps.value.add(stepId)
    // Remove from user-collapsed since user is expanding it
    userCollapsedSteps.value.delete(stepId)
    userCollapsedSteps.value = new Set(userCollapsedSteps.value)
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
  if (step.status === 'failed' && step.error) return true
  if (step.status === 'running' && step.result) return true
  // Always show content for awaiting-confirmation (e.g., edit diff preview)
  if (step.status === 'awaiting-confirmation') return true
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

function hasArgs(step: Step): boolean {
  const args = step.toolCall?.arguments
  if (!args) return false
  return Object.keys(args).length > 0
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
  // For bash, show command directly without label
  if (args.command) {
    return args.command
  }

  // For file operations, show path directly
  const pathField = args.path || args.file_path || args.filePath
  if (pathField) {
    return pathField
  }

  // For pattern-based tools (glob, grep)
  if (args.pattern) {
    return args.pattern
  }

  // For other tools, show key: value format
  const lines: string[] = []
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      lines.push(`${key}: ${value}`)
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`)
    }
  }
  return lines.join('\n')
}

function truncateTitle(title: string, maxLen: number = 50): string {
  if (!title) return ''
  if (title.length <= maxLen) return title
  return title.slice(0, maxLen) + '...'
}

function formatResult(result: string): string {
  // Try to parse as JSON and extract output
  try {
    const parsed = JSON.parse(result)
    // If it has output field, use that
    if (parsed.output !== undefined) {
      return String(parsed.output)
    }
    // If it has data field with output
    if (parsed.data?.output !== undefined) {
      return String(parsed.data.output)
    }
    // Otherwise return formatted JSON
    return JSON.stringify(parsed, null, 2)
  } catch {
    // Not JSON, return as-is
    return result
  }
}

function truncateOutput(output: string, maxLines: number = 8): string {
  const lines = output.split('\n')
  if (lines.length <= maxLines) return output
  return '...\n' + lines.slice(-maxLines).join('\n')
}

// Extract diff from step.result for edit tool confirmation
function getDiffFromStep(step: Step): { diff: string; additions: number; deletions: number; filePath: string } | null {
  if (!step.result) return null
  try {
    const parsed = JSON.parse(step.result)
    if (parsed.diff) {
      return {
        diff: parsed.diff,
        additions: parsed.additions || 0,
        deletions: parsed.deletions || 0,
        filePath: parsed.filePath || '',
      }
    }
  } catch {
    // Not JSON or no diff field
  }
  return null
}

// Split diff into lines for display
function getDiffLines(diff: string): string[] {
  return diff.split('\n')
}

// Get CSS class for diff line based on its prefix
function getDiffLineClass(line: string): string {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'diff-add'
  if (line.startsWith('-') && !line.startsWith('---')) return 'diff-del'
  if (line.startsWith('@@')) return 'diff-hunk'
  return ''
}

// Parse hunk header to get starting line numbers
function parseHunkHeader(line: string): { oldStart: number; newStart: number } | null {
  const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
  if (match) {
    return { oldStart: parseInt(match[1], 10), newStart: parseInt(match[2], 10) }
  }
  return null
}

// Parse diff into lines with line numbers
function parseDiffWithLineNumbers(diff: string): DiffLine[] {
  const rawLines = diff.split('\n')
  const result: DiffLine[] = []
  let oldLineNum = 0
  let newLineNum = 0
  let inHunk = false

  for (const line of rawLines) {
    // Skip file headers
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('Index:') || line.startsWith('diff ')) {
      continue
    }

    // Parse hunk header
    if (line.startsWith('@@')) {
      const parsed = parseHunkHeader(line)
      if (parsed) {
        oldLineNum = parsed.oldStart
        newLineNum = parsed.newStart
        inHunk = true
      }
      result.push({
        type: 'line',
        class: 'diff-hunk',
        prefix: '',
        content: line,
        oldNum: '...',
        newNum: '...',
      })
      continue
    }

    if (!inHunk) continue

    const lineClass = getDiffLineClass(line)
    const prefix = line.charAt(0) || ' '
    const content = line.slice(1)

    if (lineClass === 'diff-del') {
      result.push({
        type: 'line',
        class: lineClass,
        prefix,
        content,
        oldNum: oldLineNum,
        newNum: '',
      })
      oldLineNum++
    } else if (lineClass === 'diff-add') {
      result.push({
        type: 'line',
        class: lineClass,
        prefix,
        content,
        oldNum: '',
        newNum: newLineNum,
      })
      newLineNum++
    } else {
      // Context line
      result.push({
        type: 'line',
        class: '',
        prefix,
        content,
        oldNum: oldLineNum,
        newNum: newLineNum,
      })
      oldLineNum++
      newLineNum++
    }
  }

  return result
}

// Get visible diff lines with optional collapsing
function getVisibleDiffLines(step: Step): DiffLine[] {
  const diffData = getDiffFromStep(step)
  if (!diffData) return []

  const allLines = parseDiffWithLineNumbers(diffData.diff)

  // If expanded or short enough, show all
  if (expandedDiffs.value.has(step.id) || allLines.length <= MAX_VISIBLE_LINES) {
    return allLines
  }

  // Collapse: show first CONTEXT_LINES, collapse indicator, last CONTEXT_LINES
  const result: DiffLine[] = []
  const collapsedCount = allLines.length - CONTEXT_LINES * 2

  // First lines
  result.push(...allLines.slice(0, CONTEXT_LINES))

  // Collapse indicator
  result.push({
    type: 'collapse',
    class: '',
    prefix: '',
    content: '',
    text: `展开更多 (${collapsedCount} 行)`,
  })

  // Last lines
  result.push(...allLines.slice(-CONTEXT_LINES))

  return result
}

// Toggle diff expand/collapse
function toggleDiffExpand(stepId: string) {
  if (expandedDiffs.value.has(stepId)) {
    expandedDiffs.value.delete(stepId)
  } else {
    expandedDiffs.value.add(stepId)
  }
  expandedDiffs.value = new Set(expandedDiffs.value)
}

// Check if diff is expanded
function isDiffExpanded(stepId: string): boolean {
  return expandedDiffs.value.has(stepId)
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

/* Tool badge */
.tool-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(100, 100, 100, 0.2);
  color: var(--text-secondary, #888);
  flex-shrink: 0;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

/* Step title */
.step-title {
  font-weight: 500;
  color: var(--text-secondary, #888);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.spacer { flex: 0; }

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

/* Diff preview for edit tool confirmation */
.diff-preview {
  margin-top: 8px;
}

.diff-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.diff-stats {
  display: flex;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.diff-stats .additions {
  color: #22c55e;
}

.diff-stats .deletions {
  color: #ef4444;
}

.diff-file-path {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  color: var(--text-secondary, #888);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.diff-status-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  flex-shrink: 0;
}

.diff-content {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  padding: 4px 0;
  max-height: 300px;
  overflow-y: auto;
  font-size: 12px;
  line-height: 1.6;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
}

.diff-line {
  display: flex;
  white-space: pre;
  padding: 0 8px;
  min-height: 20px;
}

.line-number {
  width: 36px;
  min-width: 36px;
  text-align: right;
  padding-right: 8px;
  color: var(--text-tertiary, #666);
  user-select: none;
  flex-shrink: 0;
  font-size: 11px;
  opacity: 0.6;
}

.line-number.old {
  border-right: 1px solid rgba(128, 128, 128, 0.2);
}

.line-prefix {
  width: 16px;
  min-width: 16px;
  text-align: center;
  color: inherit;
  user-select: none;
  flex-shrink: 0;
}

.line-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.line-deleted-text {
  text-decoration: line-through;
  opacity: 0.8;
}

.diff-collapse {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  margin: 4px 8px;
  background: rgba(100, 100, 100, 0.15);
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-secondary, #888);
  transition: background 0.15s ease;
}

.diff-collapse:hover {
  background: rgba(100, 100, 100, 0.25);
}

.collapse-icon {
  font-size: 10px;
  opacity: 0.7;
}

.diff-add {
  background: rgba(34, 197, 94, 0.12);
  color: #4ade80;
}

.diff-add .line-prefix {
  color: #22c55e;
}

.diff-del {
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
}

.diff-del .line-prefix {
  color: #ef4444;
}

.diff-hunk {
  color: #60a5fa;
  opacity: 0.8;
  padding: 4px 8px;
  margin-top: 4px;
}

.diff-hunk .line-content {
  font-size: 11px;
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

html[data-theme='light'] .diff-content {
  background: rgba(0, 0, 0, 0.04);
}

html[data-theme='light'] .diff-file-path {
  color: var(--text-secondary, #666);
}

html[data-theme='light'] .diff-status-badge {
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
}

html[data-theme='light'] .line-number {
  color: var(--text-tertiary, #999);
}

html[data-theme='light'] .line-number.old {
  border-right-color: rgba(0, 0, 0, 0.1);
}

html[data-theme='light'] .diff-collapse {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-secondary, #666);
}

html[data-theme='light'] .diff-collapse:hover {
  background: rgba(0, 0, 0, 0.1);
}

html[data-theme='light'] .diff-add {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

html[data-theme='light'] .diff-add .line-prefix {
  color: #16a34a;
}

html[data-theme='light'] .diff-del {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

html[data-theme='light'] .diff-del .line-prefix {
  color: #dc2626;
}

html[data-theme='light'] .diff-hunk {
  color: #2563eb;
}
</style>
