import type { Step, ToolCall } from '@/types'
import {
  buildToolStepView,
  getDiffFromStep,
  getToolFilePath,
  type ToolStepView,
} from './tool-step-view'
import { buildToolActivityTarget, buildToolVerb, getFileToolCategory } from './tool-display'
import { basename, shortenPath } from './tool-preview'
import type { ToolRenderStatus } from './tool-status'

export interface ToolActivityView {
  id: string
  step: Step
  toolCall: ToolCall
  toolName: string
  status: ToolRenderStatus
  verb: string
  target: string
  targetMeta: string
  filePath: string
  canOpenFile: boolean
  stats: string
  duration: string
  statusLabel: string
  errorSummary: string
  nextAction: string
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
    return { target: fileName, meta: preview }
  }

  if (preview.startsWith(':')) {
    return { target: `Lines ${preview.slice(1)}`, meta: '' }
  }

  if (/^Lines\s+\d+/i.test(preview)) {
    return { target: preview, meta: '' }
  }

  if (fileName && preview.startsWith(fileName)) {
    const meta = preview.slice(fileName.length).trim()
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
  const filePath = getToolFilePath(toolCall, getDiffFromStep(step), null, step)

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
    verb: buildToolVerb(toolName, view.status, toolCall),
    target,
    targetMeta,
    filePath,
    canOpenFile: !!filePath && getFileToolCategory(toolName) !== null,
    stats: buildStats(step, toolCall),
    duration: buildDuration(toolCall, nowMs),
    statusLabel: buildStatusLabel(view.status),
    errorSummary: buildErrorSummary(step, toolCall, toolName, filePath, view.status),
    nextAction: buildNextAction(toolName, view.status),
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
  const mappedTarget = buildToolActivityTarget(view.toolName, view.toolCall)
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

function buildStats(step: Step, toolCall: ToolCall): string {
  const diff = getDiffFromStep(step)
  if (diff) return `+${diff.additions} -${diff.deletions}`
  if (toolCall.changes) {
    const additions = toolCall.changes.additions ?? 0
    const deletions = toolCall.changes.deletions ?? 0
    if (additions || deletions) return `+${additions} -${deletions}`
  }
  return ''
}

function buildDuration(toolCall: ToolCall, nowMs = Date.now()): string {
  if (!toolCall.startTime) return ''
  const end = toolCall.endTime ?? (toolCall.status === 'executing' ? nowMs : 0)
  if (!end) return ''
  const ms = Math.max(0, end - toolCall.startTime)
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
}

function buildStatusLabel(status: ToolRenderStatus): string {
  switch (status) {
    case 'queued': return 'Queued'
    case 'pending': return 'Pending'
    case 'streaming-input': return 'Preparing'
    case 'executing': return 'Running'
    case 'awaiting-confirmation': return 'Needs approval'
    case 'completed': return 'Done'
    case 'failed': return 'Failed'
    case 'rejected': return 'Rejected'
    case 'cancelled': return 'Cancelled'
    default: return 'Pending'
  }
}

function buildErrorSummary(
  step: Step,
  toolCall: ToolCall,
  toolName: string,
  filePath: string,
  status: ToolRenderStatus,
): string {
  if (status !== 'failed' && status !== 'rejected') return ''

  const rawError = getRawToolError(step, toolCall)
  const reason = compactFailureReason(rawError)

  if (status === 'rejected') {
    return reason || 'Permission was rejected.'
  }

  const fileCategory = getFileToolCategory(toolName)
  if (fileCategory === 'edit' || fileCategory === 'write') {
    const fileName = filePath ? basename(filePath) : 'file'
    return reason ? `${fileName}: ${reason}` : `${fileName}: tool failed.`
  }

  return reason || 'Tool failed.'
}

function buildNextAction(toolName: string, status: ToolRenderStatus): string {
  if (status === 'rejected') return 'Approve the request or rerun with a different permission choice.'
  if (status !== 'failed') return ''

  const fileCategory = getFileToolCategory(toolName)
  if (fileCategory === 'edit') return 'Open details, adjust the edit target or replacement, then retry.'
  if (fileCategory === 'write') return 'Open details, check the path and content, then retry.'
  if (toolName === 'bash') return 'Open details to inspect the command output, then rerun if needed.'
  return 'Open details to inspect the tool output, then retry if needed.'
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

  return firstLine
    .replace(/^error:\s*/i, '')
    .replace(/^failed:\s*/i, '')
    .replace(/^the user rejected permission for this tool\.?$/i, 'Permission was rejected.')
    .slice(0, 180)
}
