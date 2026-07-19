import type { Step, ToolCall } from '@/types'
import {
  buildToolStepView,
  getDiffFromStep,
  getStreamingChangeStats,
  getToolFilePath,
  type ToolDiffData,
  type ToolStepView,
} from './tool-step-view'
import { buildToolPrimaryArg, getFileToolCategory } from './tool-display'
import { basename, shortenPath } from './tool-preview'
import type { ToolRenderStatus } from './tool-status'
import { getStatusLabel, getToolDisplayLabel } from './tool-ui-registry'

export interface ToolActivityView {
  id: string
  step: Step
  toolCall: ToolCall
  toolName: string
  status: ToolRenderStatus
  /** Display label for the row title (`Bash`, `Read`, raw MCP name…). */
  toolLabel: string
  /** Primary argument rendered as `toolLabel(target)`. */
  target: string
  targetMeta: string
  filePath: string
  canOpenFile: boolean
  additions: number
  deletions: number
  stats: string
  duration: string
  statusLabel: string
  errorSummary: string
  isAwaitingConfirmation: boolean
  hasDetails: boolean
  defaultExpanded: boolean
  isFart: boolean
}

export function buildToolActivityViews(steps: Step[], nowMs = Date.now()): ToolActivityView[] {
  return steps.map(step => buildToolActivityView(step, nowMs))
}

function getFileTargetAndMeta(view: ToolStepView, filePath: string): { target: string; meta: string } {
  const fileName = filePath ? basename(filePath) : ''
  const preview = view.preview || ''

  if (preview.startsWith(':') && fileName) {
    return { target: `${fileName}${preview}`, meta: '' }
  }

  if (preview.startsWith(':')) {
    return { target: `Lines ${preview.slice(1)}`, meta: '' }
  }

  if (/^Lines\s+\d+/i.test(preview)) {
    return { target: preview, meta: '' }
  }

  if (fileName && preview.startsWith(fileName)) {
    const meta = preview.slice(fileName.length).trim()
    if (meta.startsWith(':')) {
      return { target: `${fileName}${meta}`, meta: '' }
    }
    return { target: fileName, meta }
  }

  if (preview) {
    const colonIndex = preview.indexOf(':')
    if (colonIndex > 0) {
      const target = preview.substring(0, colonIndex)
      const meta = preview.substring(colonIndex)
      return { target, meta }
    }
    const spaceIndex = preview.indexOf(' ')
    if (spaceIndex > 0) {
      const target = preview.substring(0, spaceIndex)
      const meta = preview.substring(spaceIndex).trim()
      return { target, meta }
    }
    return { target: preview, meta: '' }
  }

  return { target: fileName || 'file', meta: '' }
}

export function buildToolActivityView(step: Step, nowMs = Date.now()): ToolActivityView {
  const view = buildToolStepView(step, { includeDetails: false })
  const toolCall = view.toolCall
  const toolName = view.toolName
  const diff = getDiffFromStep(step)
  const filePath = getToolFilePath(toolCall, diff, null, step)
  const stats = buildStats(diff, toolCall)

  let target = ''
  let targetMeta = ''

  if (getFileToolCategory(toolName) !== null) {
    const fileInfo = getFileTargetAndMeta(view, filePath)
    target = fileInfo.target
    targetMeta = fileInfo.meta
  } else {
    target = buildTarget(view, filePath)
    targetMeta = buildTargetMeta(view)
  }

  return {
    id: view.id,
    step,
    toolCall,
    toolName,
    status: view.status,
    toolLabel: getToolDisplayLabel(toolCall.toolName || toolName),
    target,
    targetMeta,
    filePath,
    canOpenFile: !!filePath && getFileToolCategory(toolName) !== null,
    additions: stats.additions,
    deletions: stats.deletions,
    stats: stats.text,
    duration: buildDuration(toolCall, nowMs),
    statusLabel: getStatusLabel(view.status),
    errorSummary: buildErrorSummary(step, toolCall, toolName, filePath, view.status),
    isAwaitingConfirmation: view.isAwaitingConfirmation,
    hasDetails: view.hasDetails,
    defaultExpanded: view.defaultExpanded,
    isFart: toolName === 'fart',
  }
}

export function buildDetailedToolStepView(activity: ToolActivityView): ToolStepView {
  return buildToolStepView(activity.step, { includeDetails: true })
}

function buildTarget(view: ToolStepView, filePath: string): string {
  const mappedTarget = buildToolPrimaryArg(view.toolName, view.toolCall)
  if (mappedTarget) return mappedTarget

  let preview = view.preview
  if (preview && preview.startsWith(':') && filePath) {
    preview = basename(filePath) + preview
  }

  if (preview) return preview
  if (filePath) return basename(filePath)

  // Avoid duplicate tool names (e.g. "Failed Edit edit") by returning a generic noun
  if (getFileToolCategory(view.toolName) !== null) {
    return 'file'
  }
  if (view.toolName === 'bash') {
    return 'command'
  }
  return view.displayName
}

function buildTargetMeta(view: ToolStepView): string {
  if (view.toolName !== 'variable') return ''
  const args = view.toolCall.arguments || {}
  const action = String(args.action || '').toLowerCase()
  const value = typeof args.value === 'string' ? args.value : ''
  if (!value) return ''
  if (action === 'set') return `= ${shortenPath(value, 42)}`
  if (action === 'append') return `+ ${shortenPath(value, 42)}`
  if (action === 'remove') return `− ${shortenPath(value, 42)}`
  return ''
}

interface ActivityStats {
  additions: number
  deletions: number
  text: string
}

function buildStats(diff: ToolDiffData | null, toolCall: ToolCall): ActivityStats {
  if (diff) {
    return {
      additions: diff.additions,
      deletions: diff.deletions,
      text: `+${diff.additions} -${diff.deletions}`,
    }
  }
  if (toolCall.changes) {
    const additions = toolCall.changes.additions ?? 0
    const deletions = toolCall.changes.deletions ?? 0
    return {
      additions,
      deletions,
      text: additions || deletions ? `+${additions} -${deletions}` : '',
    }
  }
  const streamingStats = getStreamingChangeStats(toolCall)
  if (streamingStats) {
    const { additions, deletions } = streamingStats
    return {
      additions,
      deletions,
      text: additions || deletions ? `+${additions} -${deletions}` : '',
    }
  }
  return { additions: 0, deletions: 0, text: '' }
}

/**
 * Duration display. One format everywhere: seconds with a single decimal
 * (`0.3s`, `12.4s`), switching to `2m05.3s` past a minute. Running and final
 * values share the format so the text never jumps shape on completion.
 */
export function formatToolDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = (ms % 60_000) / 1000
  return `${minutes}m${seconds < 10 ? '0' : ''}${seconds.toFixed(1)}s`
}

function buildDuration(toolCall: ToolCall, nowMs = Date.now()): string {
  const running = toolCall.status === 'executing' || toolCall.status === 'input-streaming'
  if (running) {
    if (!toolCall.startTime) return ''
    return formatToolDuration(Math.max(0, (toolCall.endTime ?? nowMs) - toolCall.startTime))
  }
  // Frozen final duration stays on the row so runs can be compared.
  if (toolCall.status === 'completed' || toolCall.status === 'failed' || toolCall.status === 'cancelled') {
    if (typeof toolCall.durationMs === 'number') {
      return formatToolDuration(Math.max(0, toolCall.durationMs))
    }
    if (toolCall.startTime && toolCall.endTime) {
      return formatToolDuration(Math.max(0, toolCall.endTime - toolCall.startTime))
    }
  }
  return ''
}

export function buildErrorSummary(
  step: Step,
  toolCall: ToolCall,
  toolName: string,
  filePath: string,
  status: ToolRenderStatus,
): string {
  if (status !== 'failed' && status !== 'rejected') return ''
  if (status === 'rejected') return ''

  const rawError = getRawToolError(step, toolCall)
  const reason = compactFailureReason(rawError)

  const fileCategory = getFileToolCategory(toolName)
  if (fileCategory === 'edit' || fileCategory === 'write') {
    return reason || 'Tool failed.'
  }

  return reason || 'Tool failed.'
}

function getRawToolError(step: Step, toolCall: ToolCall): string {
  if (typeof step.error === 'string' && step.error.trim()) return step.error
  if (typeof toolCall.error === 'string' && toolCall.error.trim()) return toolCall.error

  if (typeof step.result === 'string' && step.result.trim()) {
    try {
      const parsed = JSON.parse(step.result)
      const message = parsed?.error || parsed?.message || parsed?.details?.error || parsed?.details?.message
      if (message) return String(message)
    } catch {
      return step.result
    }
  }

  return ''
}

function compactFailureReason(value: string): string {
  const firstLine = value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .find(Boolean) || ''

  let reason = firstLine
    .replace(/^error:\s*/i, '')
    .replace(/^failed:\s*/i, '')
    .replace(/^the user rejected permission for this tool\.?$/i, 'Permission was rejected.')

  for (let index = 0; index < 3; index++) {
    const stripped = reason
      .replace(/^failed to\s+\w+\s+[^:]+:\s*/i, '')
      .replace(/^\w+\s+failed:\s*[^:]+:\s*/i, '')
    if (stripped === reason) break
    reason = stripped
  }

  return reason.slice(0, 180)
}
