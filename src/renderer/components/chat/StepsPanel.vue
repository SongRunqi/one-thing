<template>
  <div class="steps-panel" v-if="steps && steps.length > 0" :data-depth="depth">
    <template v-for="step in steps" :key="step.id">
      <!-- Regular Step: Standard step rendering -->
      <div
        :class="['step-inline', stepClass(step), { expanded: expandedSteps.has(step.id) }]"
        :style="{ '--depth': depth }"
      >
        <!-- Main Row - Simplified: icon + tool + preview + actions -->
        <div class="step-row" @click="toggleExpand(step.id)">
          <!-- Status icon (single, clear) -->
          <span class="status-icon" :class="step.status">
            <span v-if="step.status === 'running'" class="spinner"></span>
            <span v-else-if="step.status === 'completed'">✓</span>
            <span v-else-if="step.status === 'failed'">✗</span>
            <span v-else-if="step.status === 'cancelled'">—</span>
            <span v-else-if="step.status === 'awaiting-confirmation'">⏳</span>
            <span v-else>○</span>
          </span>

          <!-- Tool name (cmd) -->
          <span class="tool-name">{{ step.toolCall?.toolName || 'tool' }}</span>

          <!-- Param (simplified arguments) -->
          <span class="step-param">{{ getSimplePreview(step) }}</span>

          <!-- Spacer -->
          <span class="spacer"></span>

          <!-- Result preview (right-aligned) -->
          <span v-if="inlineResult(step)" class="step-result">{{ inlineResult(step) }}</span>

          <!-- Right side: error OR buttons OR expand icon -->
          <span v-if="step.status === 'failed' && step.error" class="error-tag">
            {{ truncateError(step.error, 30) }}
          </span>

          <template v-else-if="step.status === 'awaiting-confirmation'">
            <div class="confirm-buttons" @click.stop>
              <AllowSplitButton @confirm="(response) => handleConfirm(step, response)" />
              <button class="btn-reject" @click="handleReject(step)" title="Reject (D/Esc)">Reject</button>
            </div>
          </template>

          <svg
            v-else-if="hasExpandableContent(step)"
            :class="['expand-icon', { rotated: expandedSteps.has(step.id) }]"
            width="12" height="12" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2.5"
          >
            <polyline points="9 6 15 12 9 18"/>
          </svg>
        </div>

        <!-- Expanded Content -->
        <Transition name="slide">
          <div v-if="shouldShowContent(step)" class="step-details">
            <!-- Streaming content preview (during input-streaming for edit/write tools) -->
            <Transition name="streaming-fade" mode="out-in">
              <div v-if="getStreamingContent(step)" key="streaming" class="detail-section diff-preview">
                <div class="diff-content" :ref="(el) => { if (el) scrollToBottom(el as HTMLElement) }">
                  <div v-for="(line, idx) in getStreamingLines(step)" :key="idx" class="diff-line diff-add">
                    <span class="line-number new">{{ idx + 1 }}</span>
                    <span class="line-prefix">+</span>
                    <span class="line-content">{{ line }}</span>
                  </div>
                </div>
              </div>
            </Transition>

            <!-- Diff preview for edit/write tool -->
            <div v-if="step.status !== 'running' && getDiffFromStep(step)" class="detail-section diff-preview">
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
                <!-- Diff lines (skip leading hunk separator) -->
                <template v-for="(line, idx) in getVisibleDiffLines(step)" :key="idx">
                  <div v-if="!(line.class === 'diff-hunk' && idx === 0)" :class="['diff-line', line.class]">
                    <span v-if="getDiffFromStep(step)?.deletions" class="line-number old">{{ line.oldNum || '' }}</span>
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
              <div class="detail-label">💭 Thinking</div>
              <pre class="thinking">{{ step.thinking }}</pre>
            </div>

            <!-- Command (for bash) or Arguments (for other tools, excluding read/write/edit) -->
            <div v-if="expandedSteps.has(step.id) && step.toolCall?.arguments && hasArgs(step) && !['edit', 'read', 'write'].includes(step.toolCall?.toolName || '')" class="detail-section">
              <div class="detail-label">{{ step.toolCall?.toolName === 'bash' ? 'Command' : 'Arguments' }}</div>
              <pre class="code-block">{{ step.toolCall?.toolName === 'bash' ? (step.toolCall.arguments as any).command || '' : formatArgsJson(step.toolCall.arguments) }}</pre>
            </div>

            <!-- Result (hidden when diff preview is already showing) -->
            <div v-if="step.result && expandedSteps.has(step.id) && step.status !== 'running' && !getDiffFromStep(step)" class="detail-section">
              <pre class="code-block">{{ formatResult(step.result) }}</pre>
            </div>

            <!-- Summary -->
            <div v-if="step.summary && expandedSteps.has(step.id)" class="detail-section">
              <div class="detail-label">📝 Analysis</div>
              <pre class="summary">{{ step.summary }}</pre>
            </div>

          </div>
        </Transition>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { Step, ToolCall } from '@/types'
import AllowSplitButton from '../common/AllowSplitButton.vue'

const props = withDefaults(defineProps<{
  steps: Step[]
  depth?: number
  parentCollapsed?: boolean  // When parent step is collapsed, propagate to children
  sessionId?: string  // Session ID for AgentExecutionPanel state management
}>(), {
  depth: 0,
  parentCollapsed: false,
  sessionId: '',
})

const emit = defineEmits<{
  confirm: [toolCall: ToolCall, response: 'once' | 'session' | 'workspace' | 'always']
  reject: [toolCall: ToolCall]
}>()

// ── Expansion Policy (single source of truth) ──────────────
const EXPAND_POLICY = {
  autoExpandTools: new Set(['write', 'read', 'edit']),
  temporaryShowStates: new Set(['awaiting-confirmation']),
}

const expandedSteps = ref<Set<string>>(new Set())
const userCollapsedSteps = ref<Set<string>>(new Set())

// Diff line type for VS Code-style display
interface DiffLine {
  class: string
  prefix: string
  content: string
  oldNum?: number | string
  newNum?: number | string
}

// ── Auto-expand watch (only triggers on step status changes, not streamingArgs) ──
watch(
  () => props.steps.map(s => `${s.id}:${s.status}:${s.toolCall?.status || ''}`).join(','),
  () => {
    let changed = false
    for (const step of props.steps) {
      const toolName = step.toolCall?.toolName?.toLowerCase() || ''
      if (!EXPAND_POLICY.autoExpandTools.has(toolName)) continue
      if (expandedSteps.value.has(step.id)) continue
      if (userCollapsedSteps.value.has(step.id)) continue

      const shouldExpand =
        (step.status === 'running' && step.toolCall?.status === 'input-streaming') ||
        step.status === 'completed'

      if (shouldExpand) {
        expandedSteps.value.add(step.id)
        changed = true
      }
    }
    if (changed) {
      expandedSteps.value = new Set(expandedSteps.value)
    }
  },
  { immediate: true }
)

// Collapse propagation: when parent step is collapsed, reset all expanded states
watch(() => props.parentCollapsed, (collapsed) => {
  if (collapsed) {
    expandedSteps.value = new Set()
  }
})

function toggleExpand(stepId: string) {
  if (expandedSteps.value.has(stepId)) {
    expandedSteps.value.delete(stepId)
    userCollapsedSteps.value.add(stepId)
  } else {
    expandedSteps.value.add(stepId)
    userCollapsedSteps.value.delete(stepId)
  }
  expandedSteps.value = new Set(expandedSteps.value)
  userCollapsedSteps.value = new Set(userCollapsedSteps.value)
}

function stepClass(step: Step): Record<string, boolean> {
  return {
    'status-running': step.status === 'running',
    'status-completed': step.status === 'completed',
    'status-failed': step.status === 'failed',
    'status-cancelled': step.status === 'cancelled',
    'needs-confirm': step.status === 'awaiting-confirmation',
  }
}

function hasExpandableContent(step: Step): boolean {
  return !!(
    step.thinking ||
    (step.toolCall?.arguments && Object.keys(step.toolCall.arguments).length > 0) ||
    step.result ||
    step.summary ||
    step.error
  )
}

// Pure function — no side effects. Expansion state managed by watch + toggleExpand.
function shouldShowContent(step: Step): boolean {
  if (EXPAND_POLICY.temporaryShowStates.has(step.status)) return true
  return expandedSteps.value.has(step.id)
}

function getStatusText(step: Step): string {
  if (step.status === 'running') return 'Running'
  if (step.status === 'failed') return '✗'
  if (step.status === 'completed') return '✓'
  if (step.status === 'cancelled') return 'Cancelled'
  return ''
}

/**
 * Return short result string for inline display, or null if result is too long.
 * Short results (single line, ≤80 chars) are shown directly on the step row.
 */
function inlineResult(step: Step): string | null {
  if (step.status !== 'completed' && step.status !== 'failed') return null
  const raw = step.result
  if (!raw || typeof raw !== 'string') return null

  // Extract the actual output (result is often JSON with .output field)
  let text = raw
  try {
    const parsed = JSON.parse(raw)
    if (parsed.output !== undefined) text = String(parsed.output)
    else if (parsed.data?.output !== undefined) text = String(parsed.data.output)
  } catch { /* not JSON, use raw */ }

  if (!text) return null
  const firstLine = text.split('\n')[0].trim()
  if (!firstLine || firstLine.length > 80) return null
  return firstLine
}

/**
 * Shorten file path for display
 * Shows last 2-3 segments if path is too long
 */
function shortenPath(path: string, maxLen: number = 45): string {
  if (!path) return ''
  if (path.length <= maxLen) return path
  const parts = path.split('/')
  // Try to show filename and parent dir
  if (parts.length >= 2) {
    const short = '.../' + parts.slice(-2).join('/')
    if (short.length <= maxLen) return short
  }
  // Just show filename
  return '.../' + parts[parts.length - 1]
}

/**
 * Get a simple, single-line preview for the step
 * Combines all relevant info into one clean string
 */
function getSimplePreview(step: Step): string {
  const args = step.toolCall?.arguments as Record<string, any> | undefined
  const toolName = step.toolCall?.toolName?.toLowerCase()

  if (!args) return ''

  switch (toolName) {
    case 'read': {
      const path = shortenPath(args.file_path || args.path || '')
      const offset = args.offset as number | undefined
      const limit = args.limit as number | undefined
      if (offset || limit) {
        const start = offset || 1
        const end = limit ? start + limit - 1 : '...'
        return `${path}:${start}-${end}`
      }
      return path
    }

    case 'grep': {
      const pattern = args.pattern as string
      const glob = args.glob || args.type || ''
      const truncPattern = pattern?.length > 20 ? pattern.slice(0, 17) + '...' : pattern
      if (glob) {
        return `"${truncPattern}" in ${glob}`
      }
      return `"${truncPattern}"`
    }

    case 'bash': {
      const cmd = args.command as string
      return cmd?.length > 55 ? cmd.slice(0, 52) + '...' : cmd || ''
    }

    case 'edit': {
      const path = shortenPath(args.file_path || '')
      const changes = step.toolCall?.changes
      if (changes) {
        return `${path} (+${changes.additions} -${changes.deletions})`
      }
      return path
    }

    case 'write': {
      const path = shortenPath(args.file_path || '')
      const content = args.content as string
      if (content) {
        return `${path} (${content.length} chars)`
      }
      return path
    }

    case 'glob': {
      const pattern = args.pattern as string
      const path = args.path as string
      if (path) {
        return `${pattern} in ${shortenPath(path, 25)}`
      }
      return pattern || ''
    }

    case 'web-search':
    case 'websearch': {
      const query = args.query as string
      return query ? `"${query}"` : ''
    }

    default:
      // Fallback: show path or pattern or command
      if (args.file_path || args.path) {
        return shortenPath(args.file_path || args.path)
      }
      if (args.pattern) {
        return `"${args.pattern}"`
      }
      if (args.command) {
        const cmd = args.command as string
        return cmd?.length > 55 ? cmd.slice(0, 52) + '...' : cmd
      }
      return ''
  }
}

// Keep old function for compatibility (can be removed later)
interface ToolPreview {
  primary: string
  secondary?: string
}

function getToolPreview(step: Step): ToolPreview {
  const args = step.toolCall?.arguments as Record<string, any> | undefined
  const toolName = step.toolCall?.toolName?.toLowerCase()

  if (!args) {
    return { primary: step.title || '' }
  }

  switch (toolName) {
    case 'read': {
      const path = shortenPath(args.file_path || args.path || '')
      const offset = args.offset as number | undefined
      const limit = args.limit as number | undefined
      let range = ''
      if (offset || limit) {
        const start = offset || 1
        const end = limit ? start + limit - 1 : '?'
        range = `:${start}-${end}`
      }
      return { primary: path + range }
    }

    case 'grep': {
      const pattern = args.pattern as string
      const glob = args.glob || args.type
      const ctx = args['-C'] || args['-A'] || args['-B']
      const truncatedPattern = pattern?.length > 25 ? pattern.slice(0, 22) + '...' : pattern
      return {
        primary: pattern ? `"${truncatedPattern}"` : '',
        secondary: glob ? `in ${glob}${ctx ? ` (${ctx} ctx)` : ''}` : undefined
      }
    }

    case 'bash': {
      const cmd = args.command as string
      const truncatedCmd = cmd?.length > 50 ? cmd.slice(0, 47) + '...' : cmd
      return { primary: truncatedCmd || '' }
    }

    case 'edit': {
      const path = shortenPath(args.file_path || '')
      const changes = step.toolCall?.changes
      const stats = changes
        ? `+${changes.additions} -${changes.deletions}`
        : ''
      return { primary: path, secondary: stats || undefined }
    }

    case 'write': {
      const path = shortenPath(args.file_path || '')
      const content = args.content as string
      const size = content?.length
      return { primary: path, secondary: size ? `${size} chars` : undefined }
    }

    case 'glob': {
      const pattern = args.pattern as string
      const path = args.path as string
      return {
        primary: pattern || '',
        secondary: path ? `in ${shortenPath(path)}` : undefined
      }
    }

    case 'web-search':
    case 'websearch': {
      const query = args.query as string
      return { primary: query ? `"${query}"` : '' }
    }

    case 'web-fetch':
    case 'webfetch': {
      const url = args.url as string
      return { primary: url ? shortenUrl(url) : '' }
    }

    default:
      // Fallback: try common argument patterns
      if (args.file_path || args.path) {
        return { primary: shortenPath(args.file_path || args.path) }
      }
      if (args.pattern) {
        return { primary: `"${args.pattern}"` }
      }
      if (args.command) {
        const cmd = args.command as string
        return { primary: cmd?.length > 50 ? cmd.slice(0, 47) + '...' : cmd }
      }
      return { primary: '' }
  }
}

/**
 * Shorten URL for display
 */
function shortenUrl(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.length > 20 ? '...' + u.pathname.slice(-17) : u.pathname
    return u.hostname + path
  } catch {
    return url.length > 40 ? url.slice(0, 37) + '...' : url
  }
}

/**
 * Truncate error message for inline display
 */
function truncateError(error: string, maxLen: number = 40): string {
  if (!error) return ''
  // Get first line only
  const firstLine = error.split('\n')[0]
  if (firstLine.length <= maxLen) return firstLine
  return firstLine.slice(0, maxLen - 3) + '...'
}

function hasArgs(step: Step): boolean {
  const args = step.toolCall?.arguments
  if (!args) return false
  return Object.keys(args).length > 0
}

function handleConfirm(step: Step, response: 'once' | 'session' | 'workspace' | 'always') {
  // Use toolCall if available, otherwise construct a fallback from step info
  const toolCall = step.toolCall || {
    id: step.id,
    toolId: step.title?.split(':')[0] || 'unknown',
    toolName: step.title?.split(':')[0] || 'unknown',
    arguments: {},
    status: 'pending' as const,
    timestamp: step.timestamp,
    requiresConfirmation: true,
  }
  emit('confirm', toolCall, response)
}

function handleReject(step: Step) {
  // Use toolCall if available, otherwise construct a fallback from step info
  const toolCall = step.toolCall || {
    id: step.id,
    toolId: step.title?.split(':')[0] || 'unknown',
    toolName: step.title?.split(':')[0] || 'unknown',
    arguments: {},
    status: 'pending' as const,
    timestamp: step.timestamp,
    requiresConfirmation: true,
  }
  emit('reject', toolCall)
}

/**
 * Format arguments as beautified JSON
 * Handles large content fields by truncating them
 */
function formatArgsJson(args: Record<string, any>): string {
  // Create a copy to avoid modifying original
  const displayArgs = { ...args }

  // Truncate large string values (e.g., content in write tool)
  for (const [key, value] of Object.entries(displayArgs)) {
    if (typeof value === 'string' && value.length > 500) {
      displayArgs[key] = value.slice(0, 500) + `... (${value.length} chars total)`
    }
  }

  return JSON.stringify(displayArgs, null, 2)
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

// Auto-scroll streaming diff to bottom
function scrollToBottom(el: HTMLElement) {
  nextTick(() => { el.scrollTop = el.scrollHeight })
}

// Split streaming content into lines for diff-style rendering
function getStreamingLines(step: Step): string[] {
  const info = getStreamingContent(step)
  if (!info?.content) return []
  return info.content.split('\n')
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
  // Remove trailing empty line from split
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
    rawLines.pop()
  }
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

    // Skip "\ No newline at end of file" marker
    if (line.startsWith('\\ ')) continue

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
  gap: 1px;
}


/* Inline step row */
.step-inline {
  font-size: var(--message-font-size, 14px);
  line-height: var(--message-line-height, 1.6);
  border-radius: 6px;
  background: transparent;
  transition: background 0.15s ease;
}


.step-inline.needs-confirm {
  background: transparent;
}


/* Main row - compact layout */
.step-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  height: 32px;
  overflow: hidden;
  user-select: none;
}

/* Status icon - single, clear indicator */
.status-icon {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  flex-shrink: 0;
}

.status-icon.completed { color: var(--text-success); }
.status-icon.failed { color: var(--text-error); }
.status-icon.running { color: var(--accent); }
.status-icon.cancelled { color: var(--text-muted); opacity: 0.6; }
.status-icon.awaiting-confirmation { color: var(--warning); }
.status-icon.pending { color: var(--text-muted); }

/* Spinner for running status */
.status-icon .spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--accent);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Tool name - simple text label */
.tool-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  flex-shrink: 0;
  min-width: 50px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

/* Step param - simplified argument preview */
.step-param {
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
  opacity: 0.8;
}

/* Spacer */
.step-row .spacer {
  flex: 1;
  min-width: 8px;
}

/* Result preview (right-aligned, muted) */
.step-result {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 40%;
  flex-shrink: 1;
  opacity: 0.5;
}

/* Error tag - inline error indicator */
.error-tag {
  font-size: 11px;
  color: var(--text-error);
  background: rgba(var(--color-danger-rgb), 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Confirm buttons */
.confirm-buttons {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  align-items: center;
}

.btn-reject {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
  background: transparent;
  color: var(--text-muted);
}

.btn-reject:hover {
  color: var(--text-error);
  background: rgba(var(--color-danger-rgb), 0.08);
}

/* Expand icon — hidden by default, visible on hover */
.expand-icon {
  color: var(--text-muted);
  flex-shrink: 0;
  transition: transform 0.2s ease, opacity 0.15s ease;
  opacity: 0;
}

.step-inline:hover .expand-icon,
.step-inline.expanded .expand-icon {
  opacity: 1;
}

.expand-icon.rotated {
  transform: rotate(90deg);
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




.detail-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.detail-section pre {
  margin: 0;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.06);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

/* Arguments JSON beautified */
.args-json {
  font-size: 12px;
  line-height: 1.6;
  padding: 10px 12px;
  border-radius: 6px;
  max-height: 250px;
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
  margin-top: 4px;
}

.diff-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 0;
  max-height: 240px;
  overflow: hidden;
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


.line-number {
  width: 44px;
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
  margin-top: 4px;
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
  font-size: 11px;
  font-weight: 500;
  flex-shrink: 0;
}

/* Streaming fade transition - from Writing to Completed/Diff */
.streaming-fade-enter-active {
  animation: streamingFadeIn 0.3s ease;
}

.streaming-fade-leave-active {
  animation: streamingFadeOut 0.2s ease forwards;
}

@keyframes streamingFadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes streamingFadeOut {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-8px);
  }
}

.streaming-code {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 10px 12px;
  margin: 0;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 400px;
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
