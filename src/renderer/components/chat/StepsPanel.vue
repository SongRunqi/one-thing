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
            <button class="btn-inline btn-allow" @click="handleConfirm(step, 'once')">Allow</button>
            <button class="btn-inline btn-always" @click="handleConfirm(step, 'always')">Always</button>
            <button class="btn-inline btn-reject" @click="handleReject(step)">Reject</button>
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
          <!-- Streaming diff preview (during input-streaming for edit/write tools) -->
          <div v-if="getStreamingContent(step)" class="detail-section streaming-diff">
            <div class="streaming-header">
              <span class="streaming-path">{{ getStreamingContent(step)?.filePath || 'Parsing...' }}</span>
              <span class="streaming-indicator">
                <svg class="streaming-spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 11-6.219-8.56"/>
                </svg>
                Writing...
              </span>
            </div>
            <pre v-if="getStreamingContent(step)?.content" class="streaming-code"><code>{{ getStreamingContent(step)?.content }}</code></pre>
          </div>

          <!-- Diff preview for edit tool (awaiting-confirmation or completed) -->
          <div v-if="(step.status === 'awaiting-confirmation' || step.status === 'completed') && getDiffFromStep(step)" class="detail-section diff-preview">
            <div class="detail-label">Changes</div>
            <div class="diff-content">
              <!-- File header inside code block (IDE style) -->
              <div class="diff-header">
                <span class="diff-file-path">{{ getDiffFromStep(step)?.filePath }}</span>
                <span class="diff-stats">
                  <span class="additions">+{{ getDiffFromStep(step)?.additions || 0 }}</span>
                  <span class="deletions">-{{ getDiffFromStep(step)?.deletions || 0 }}</span>
                </span>
                <span v-if="step.status === 'completed'" class="diff-status-badge">Applied</span>
              </div>
              <!-- Diff lines -->
              <div v-for="(line, idx) in getVisibleDiffLines(step)" :key="idx" :class="['diff-line', line.class]">
                <span class="line-number old">{{ line.oldNum || '' }}</span>
                <span class="line-number new">{{ line.newNum || '' }}</span>
                <span class="line-prefix">{{ line.prefix }}</span>
                <span class="line-content" :class="{ 'line-deleted-text': line.class === 'diff-del' }">{{ line.content }}</span>
              </div>
            </div>
          </div>

          <!-- Live output for running -->
          <div v-if="step.status === 'running' && step.result" class="detail-section live">
            <pre>{{ truncateOutput(step.result) }}</pre>
          </div>

          <!-- Thinking -->
          <div v-if="step.thinking && expandedSteps.has(step.id)" class="detail-section">
            <div class="detail-label">💭 Thinking</div>
            <pre class="thinking">{{ step.thinking }}</pre>
          </div>

          <!-- Tool Agent Result -->
          <div v-if="step.toolAgentResult && expandedSteps.has(step.id)" class="detail-section">
            <div class="agent-header">
              <span :class="['agent-badge', step.toolAgentResult.success ? 'success' : 'failed']">
                {{ step.toolAgentResult.success ? 'Success' : 'Failed' }}
              </span>
              <span class="agent-stats">{{ step.toolAgentResult.toolCallCount }} calls</span>
            </div>
            <pre>{{ step.toolAgentResult.summary }}</pre>
          </div>

          <!-- Arguments (hidden for edit tool) -->
          <div v-if="expandedSteps.has(step.id) && step.toolCall?.arguments && hasArgs(step) && step.toolCall?.toolName !== 'edit'" class="detail-section">
            <div class="detail-label">Arguments</div>
            <pre>{{ formatArgs(step.toolCall.arguments) }}</pre>
          </div>

          <!-- Result -->
          <div v-if="step.result && expandedSteps.has(step.id) && step.status !== 'running'" class="detail-section">
            <div class="detail-label">Result</div>
            <pre>{{ formatResult(step.result) }}</pre>
          </div>

          <!-- Summary -->
          <div v-if="step.summary && expandedSteps.has(step.id)" class="detail-section">
            <div class="detail-label">📝 Analysis</div>
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

// Diff line type for VS Code-style display
interface DiffLine {
  class: string
  prefix: string
  content: string
  oldNum?: number | string
  newNum?: number | string
}

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
  // If user manually collapsed, respect that
  if (userCollapsedSteps.value.has(step.id)) return false

  if (step.status === 'failed' && step.error) return true
  if (step.status === 'running' && step.result) return true
  // Always show content for awaiting-confirmation (e.g., edit diff preview)
  if (step.status === 'awaiting-confirmation') return true
  // Show streaming content for edit/write tools during input-streaming
  if (step.status === 'running' && step.toolCall?.status === 'input-streaming') return true
  return expandedSteps.value.has(step.id)
}

function getStatusText(step: Step): string {
  if (step.status === 'running') return 'Running'
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

// Get streaming content for edit/write tools during input-streaming
function getStreamingContent(step: Step): { filePath: string; content: string } | null {
  if (step.status !== 'running') return null
  if (step.toolCall?.status !== 'input-streaming') return null
  if (!step.toolCall.streamingArgs) return null

  const toolName = step.toolCall.toolName?.toLowerCase()
  if (toolName !== 'write' && toolName !== 'edit') return null

  const args = step.toolCall.streamingArgs
  const result = { filePath: '', content: '' }

  // Extract file_path
  const pathMatch = args.match(/"file_path"\s*:\s*"([^"]*)"?/)
  if (pathMatch) result.filePath = pathMatch[1]

  // Extract content (for write tool)
  if (toolName === 'write') {
    const contentMatch = args.match(/"content"\s*:\s*"/)
    if (contentMatch) {
      const startIdx = contentMatch.index! + contentMatch[0].length
      let content = args.slice(startIdx)
      // Unescape JSON string
      content = content
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
      if (content.endsWith('"')) content = content.slice(0, -1)
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
      if (content.endsWith('"')) content = content.slice(0, -1)
      result.content = content
    }
  }

  return (result.filePath || result.content) ? result : null
}

// Extract diff from step - priority: toolCall.changes > step.result
function getDiffFromStep(step: Step): { diff: string; additions: number; deletions: number; filePath: string } | null {
  // Priority 1: Get from toolCall.changes (new way)
  if (step.toolCall?.changes?.diff) {
    return {
      diff: step.toolCall.changes.diff,
      additions: step.toolCall.changes.additions || 0,
      deletions: step.toolCall.changes.deletions || 0,
      filePath: step.toolCall.changes.filePath || '',
    }
  }

  // Fallback: Get from step.result (legacy way)
  if (!step.result) return null
  try {
    const parsed = JSON.parse(step.result)
    // Check direct diff field (permission metadata format)
    if (parsed.diff) {
      return {
        diff: parsed.diff,
        additions: parsed.additions || 0,
        deletions: parsed.deletions || 0,
        filePath: parsed.filePath || '',
      }
    }
    // Check nested metadata.diff field (tool result format)
    if (parsed.metadata?.diff) {
      return {
        diff: parsed.metadata.diff,
        additions: parsed.metadata.additions || 0,
        deletions: parsed.metadata.deletions || 0,
        filePath: parsed.metadata.filePath || '',
      }
    }
  } catch {
    // Not JSON or no diff field
  }
  return null
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

    // Parse hunk header - show as ellipsis indicator
    if (line.startsWith('@@')) {
      const parsed = parseHunkHeader(line)
      if (parsed) {
        oldLineNum = parsed.oldStart
        newLineNum = parsed.newStart
        inHunk = true
        // Show ellipsis to indicate skipped unchanged code
        result.push({
          class: 'diff-hunk',
          prefix: '',
          content: '⋯',
          oldNum: '',
          newNum: '',
        })
      }
      continue
    }

    if (!inHunk) continue

    const lineClass = getDiffLineClass(line)
    const prefix = line.charAt(0) || ' '
    const content = line.slice(1)

    if (lineClass === 'diff-del') {
      result.push({
        class: lineClass,
        prefix,
        content,
        oldNum: oldLineNum,
        newNum: '',
      })
      oldLineNum++
    } else if (lineClass === 'diff-add') {
      result.push({
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

// Get visible diff lines - always show all lines (no collapsing)
function getVisibleDiffLines(step: Step): DiffLine[] {
  const diffData = getDiffFromStep(step)
  if (!diffData) return []

  return parseDiffWithLineNumbers(diffData.diff)
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
  font-size: var(--message-font-size, 14px);
  line-height: var(--message-line-height, 1.6);
  border-radius: 6px;
  background: transparent;
  transition: background 0.15s ease;
}

.step-inline:hover {
  background: var(--bg-hover);
}

.step-inline.needs-confirm {
  background: rgba(var(--color-warning-rgb), 0.06);
  border: 1px solid rgba(var(--color-warning-rgb), 0.15);
  border-radius: var(--radius-sm, 8px);
}

.step-inline.needs-confirm:hover {
  background: rgba(var(--color-warning-rgb), 0.1);
  border-color: rgba(var(--color-warning-rgb), 0.25);
}

/* Main row */
.step-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  min-height: 32px;
  user-select: none;
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

.dot.pending { background: var(--text-muted); }
.dot.success { background: var(--text-success); }
.dot.error { background: var(--text-error); }
.dot.warning {
  background: var(--text-warning);
  animation: pulse 1.5s infinite;
}

.dot.spinning {
  width: 10px;
  height: 10px;
  border: 2px solid rgba(var(--accent-rgb), 0.3);
  border-top-color: var(--accent);
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
  background: var(--bg-elevated);
  color: var(--text-secondary);
  flex-shrink: 0;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

/* Step title */
.step-title {
  font-size: var(--message-font-size, 14px);
  font-weight: 500;
  color: var(--text-secondary);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Preview */
.step-preview {
  color: var(--text-primary);
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
  color: var(--text-muted);
  flex-shrink: 0;
}

.status-text.running { color: var(--accent); }
.status-text.completed { color: var(--text-success); }
.status-text.failed { color: var(--text-error); }

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
  color: var(--text-success);
  border-color: rgba(var(--color-success-rgb), 0.3);
  background: rgba(var(--color-success-rgb), 0.08);
}

.btn-allow:hover {
  background: rgba(var(--color-success-rgb), 0.15);
  border-color: rgba(var(--color-success-rgb), 0.5);
}

.btn-always {
  color: var(--accent);
  border-color: rgba(var(--accent-rgb), 0.3);
  background: rgba(var(--accent-rgb), 0.08);
}

.btn-always:hover {
  background: rgba(var(--accent-rgb), 0.15);
  border-color: rgba(var(--accent-rgb), 0.5);
}

.btn-reject {
  color: var(--text-muted);
  border-color: transparent;
  background: transparent;
}

.btn-reject:hover {
  color: var(--text-error);
  background: rgba(var(--color-danger-rgb), 0.08);
}

/* Expand icon */
.expand-icon {
  color: var(--text-muted);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.expand-icon.rotated {
  transform: rotate(180deg);
}

/* Expanded details */
.step-details {
  padding: 0 10px 8px 34px;
  font-size: var(--message-font-size, 14px);
}

.detail-section {
  margin-top: 6px;
}

.detail-section.live {
  border-left: 2px solid var(--accent);
  padding-left: 8px;
}

.detail-section.error {
  border-left: 2px solid var(--text-error);
  padding-left: 8px;
}

.detail-section.error pre {
  color: var(--text-error);
}

.detail-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.detail-section pre {
  margin: 0;
  padding: 8px 10px;
  border-radius: 4px;
  background: var(--bg-code-block);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

pre.thinking {
  background: rgba(var(--accent-rgb), 0.1);
  border-left: 2px solid rgba(var(--accent-rgb), 0.5);
}

pre.summary {
  background: rgba(var(--color-success-rgb), 0.1);
  border-left: 2px solid rgba(var(--color-success-rgb), 0.5);
}

/* Diff preview for edit tool confirmation */
.diff-preview {
  margin-top: 8px;
}

.diff-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-subtle);
  border-radius: 8px 8px 0 0;
  margin: -4px 0 0 0;
}

.diff-stats {
  display: flex;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.diff-stats .additions {
  color: var(--text-success);
}

.diff-stats .deletions {
  color: var(--text-error);
}

.diff-file-path {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
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
  background: rgba(var(--color-success-rgb), 0.15);
  color: var(--text-success);
  flex-shrink: 0;
}

.diff-content {
  background: var(--bg-code-block);
  border-radius: 0 0 8px 8px;
  padding: 0;
  max-height: 400px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.5;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
}

.diff-line {
  display: flex;
  white-space: pre;
  padding: 1px 12px 1px 0;
  min-height: 22px;
  align-items: center;
  transition: background 0.1s ease;
}

.diff-line:hover {
  background: var(--bg-hover);
}

.line-number {
  width: 44px;
  min-width: 44px;
  text-align: right;
  padding-right: 12px;
  color: var(--text-faint);
  user-select: none;
  flex-shrink: 0;
  font-size: 12px;
}

.line-number.old {
  border-right: 1px solid var(--border-subtle);
}

.line-prefix {
  width: 20px;
  min-width: 20px;
  text-align: center;
  color: inherit;
  user-select: none;
  flex-shrink: 0;
  font-weight: 600;
}

.line-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  padding-right: 8px;
}

.line-deleted-text {
  text-decoration: line-through;
  opacity: 0.7;
}

.diff-add {
  background: var(--diff-add-bg);
  color: var(--diff-add-text);
}

.diff-add .line-prefix {
  color: var(--text-success);
}

.diff-add .line-number {
  color: rgba(var(--color-success-rgb), 0.6);
}

.diff-del {
  background: var(--diff-del-bg);
  color: var(--diff-del-text);
}

.diff-del .line-prefix {
  color: var(--text-error);
}

.diff-del .line-number {
  color: rgba(var(--color-danger-rgb), 0.6);
}

.diff-hunk {
  color: var(--diff-hunk-text);
  background: var(--diff-hunk-bg);
  padding: 4px 0;
  justify-content: center;
}

.diff-hunk .line-content {
  font-size: 16px;
  text-align: center;
  letter-spacing: 4px;
  opacity: 0.5;
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
  background: rgba(var(--color-success-rgb), 0.15);
  color: var(--text-success);
}

.agent-badge.failed {
  background: rgba(var(--color-danger-rgb), 0.15);
  color: var(--text-error);
}

.agent-stats {
  font-size: 11px;
  color: var(--text-muted);
}

/* Streaming diff preview */
.streaming-diff {
  margin-top: 8px;
  border-left: 2px solid var(--accent);
  padding-left: 10px;
}

.streaming-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.streaming-path {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.streaming-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--accent);
  font-weight: 500;
  flex-shrink: 0;
}

.streaming-spinner {
  animation: spin 1s linear infinite;
}

.streaming-code {
  background: rgba(var(--accent-rgb), 0.08);
  border: 1px solid rgba(var(--accent-rgb), 0.15);
  border-radius: 6px;
  padding: 10px 12px;
  margin: 0;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}

.streaming-code code {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  background: transparent;
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

/* Light theme - handled by CSS variables (--diff-*, --text-*, --accent-*, --color-*-rgb) */
/* All color overrides removed - CSS variables automatically adapt to dark/light modes */
</style>
