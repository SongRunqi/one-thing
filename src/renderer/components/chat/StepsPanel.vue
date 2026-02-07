<template>
  <div class="steps-panel" v-if="steps && steps.length > 0" :data-depth="depth">
    <template v-for="step in steps" :key="step.id">
      <!-- Agent Step: Use AgentExecutionPanel for steps with childSteps -->
      <AgentExecutionPanel
        v-if="isAgentStep(step)"
        :step="step"
        :child-steps="step.childSteps || []"
        :session-id="sessionId"
        @confirm="handleAgentConfirm"
        @reject="handleAgentReject"
      />

      <!-- Regular Step: Standard step rendering -->
      <div
        v-else
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

          <!-- Tool name -->
          <span class="tool-name">{{ step.toolCall?.toolName || 'tool' }}</span>

          <!-- Step title (brief description) -->
          <span class="step-title">{{ truncateTitle(step.title, 40) }}</span>

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
            width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2"
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>

        <!-- Expanded Content -->
        <Transition name="slide">
          <div v-if="shouldShowContent(step)" class="step-details">
            <!-- Streaming diff preview (during input-streaming for edit/write tools) -->
            <Transition name="streaming-fade" mode="out-in">
              <div v-if="getStreamingContent(step)" key="streaming" class="detail-section streaming-diff">
                <div class="streaming-header">
                  <span class="streaming-path">{{ getStreamingContent(step)?.filePath || 'Parsing...' }}</span>
                  <span class="streaming-indicator flowing-text">Writing...</span>
                </div>
                <pre v-if="getStreamingContent(step)?.content" class="streaming-code"><code>{{ getStreamingContent(step)?.content }}</code></pre>
              </div>
            </Transition>

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

            <!-- Arguments - JSON beautified format (hidden for edit tool which shows diff instead) -->
            <div v-if="expandedSteps.has(step.id) && step.toolCall?.arguments && hasArgs(step) && step.toolCall?.toolName !== 'edit'" class="detail-section args-section">
              <div class="detail-label">Arguments</div>
              <pre class="args-json">{{ formatArgsJson(step.toolCall.arguments) }}</pre>
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

          </div>
        </Transition>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Step, ToolCall } from '@/types'
import AgentExecutionPanel from './AgentExecutionPanel.vue'
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

// Collapse propagation: when parent step is collapsed, reset all expanded states in this panel
watch(() => props.parentCollapsed, (collapsed) => {
  if (collapsed) {
    // Clear all expanded steps when parent collapses
    expandedSteps.value = new Set()
    // Don't clear userCollapsedSteps - keep user preferences for when parent re-expands
  }
})

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
    'status-cancelled': step.status === 'cancelled',
    'needs-confirm': step.status === 'awaiting-confirmation',
  }
}

/**
 * Check if a step is an agent step (CustomAgent execution)
 * These steps should be rendered using AgentExecutionPanel instead of default rendering
 *
 * Detection methods:
 * 1. Has childSteps (agent already started executing sub-tools)
 * 2. Tool name is 'custom-agent' (agent just started, no childSteps yet)
 * 3. Step type is 'tool-agent'
 */
function isAgentStep(step: Step): boolean {
  // Method 1: Has childSteps (existing logic)
  if (step.childSteps && step.childSteps.length > 0) return true

  // Method 2: Identify by toolName early (before childSteps appear)
  const toolName = step.toolCall?.toolName?.toLowerCase()
  if (toolName === 'custom-agent' || toolName === 'customagent') return true

  // Method 3: Identify by step type
  if (step.type === 'tool-agent') return true

  return false
}

/**
 * Handle confirm from AgentExecutionPanel
 */
function handleAgentConfirm(step: Step, type: 'once' | 'session' | 'workspace' | 'always') {
  const existingToolCall = step.toolCall as ToolCall | undefined
  const toolCall = existingToolCall || {
    id: step.id,
    toolId: existingToolCall?.toolName || 'unknown',
    toolName: existingToolCall?.toolName || 'unknown',
    arguments: existingToolCall?.arguments || {},
    status: 'pending' as const,
    timestamp: step.timestamp,
    requiresConfirmation: true,
    customAgentPermissionId: (step as any).customAgentPermissionId,
  }
  emit('confirm', toolCall, type)
}

/**
 * Handle reject from AgentExecutionPanel
 */
function handleAgentReject(step: Step) {
  const existingToolCall = step.toolCall as ToolCall | undefined
  const toolCall = existingToolCall || {
    id: step.id,
    toolId: existingToolCall?.toolName || 'unknown',
    toolName: existingToolCall?.toolName || 'unknown',
    arguments: existingToolCall?.arguments || {},
    status: 'pending' as const,
    timestamp: step.timestamp,
    requiresConfirmation: true,
    customAgentPermissionId: (step as any).customAgentPermissionId,
  }
  emit('reject', toolCall)
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
  if (step.status === 'cancelled') return 'Cancelled'
  return ''
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
  // This handles CustomAgent nested steps where toolCall may be constructed differently
  const toolCall = step.toolCall || {
    id: step.id,
    toolId: step.title?.split(':')[0] || 'unknown',
    toolName: step.title?.split(':')[0] || 'unknown',
    arguments: {},
    status: 'pending' as const,
    timestamp: step.timestamp,
    requiresConfirmation: true,
    // Preserve CustomAgent permission ID if present
    customAgentPermissionId: (step as any).customAgentPermissionId,
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
    // Preserve CustomAgent permission ID if present
    customAgentPermissionId: (step as any).customAgentPermissionId,
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

/* Fixed height with scrollbar for root-level panel only */
.steps-panel[data-depth="0"] {
  max-height: 400px;
  overflow-y: auto;
}

/* Custom scrollbar for root-level panel */
.steps-panel[data-depth="0"]::-webkit-scrollbar {
  width: 6px;
}

.steps-panel[data-depth="0"]::-webkit-scrollbar-track {
  background: transparent;
}

.steps-panel[data-depth="0"]::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.steps-panel[data-depth="0"]::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
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

/* Main row - simplified layout */
.step-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  min-height: 36px;
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

/* Step title - brief description */
.step-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
