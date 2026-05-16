import type { Step, ToolCall } from '@/types'
import {
  buildToolStepView,
  getDiffFromStep,
  getToolFilePath,
  type ToolStepView,
} from './tool-step-view'
import { basename } from './tool-preview'
import type { ToolRenderStatus } from './tool-status'

export interface ToolActivityView {
  id: string
  step: Step
  toolCall: ToolCall
  toolName: string
  status: ToolRenderStatus
  verb: string
  target: string
  filePath: string
  canOpenFile: boolean
  stats: string
  duration: string
  isAwaitingConfirmation: boolean
  hasDetails: boolean
  defaultExpanded: boolean
  isFart: boolean
}

export function buildToolActivityViews(steps: Step[]): ToolActivityView[] {
  return steps.map(step => buildToolActivityView(step))
}

export function buildToolActivityView(step: Step): ToolActivityView {
  const view = buildToolStepView(step, { includeDetails: false })
  const toolCall = view.toolCall
  const toolName = view.toolName
  const filePath = getToolFilePath(toolCall, getDiffFromStep(step))
  const target = buildTarget(view, filePath)

  return {
    id: view.id,
    step,
    toolCall,
    toolName,
    status: view.status,
    verb: buildVerb(toolName, view.status),
    target,
    filePath,
    canOpenFile: !!filePath && ['read', 'write', 'edit'].includes(toolName),
    stats: buildStats(step, toolCall),
    duration: buildDuration(toolCall),
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
  if (view.preview) return view.preview
  if (filePath) return basename(filePath)
  return view.displayName
}

function buildVerb(toolName: string, status: ToolRenderStatus): string {
  if (status === 'rejected') return 'Rejected'

  const running = status === 'pending' || status === 'streaming-input' || status === 'executing'
  const awaiting = status === 'awaiting-confirmation'

  if (toolName === 'bash') return awaiting ? 'Run' : running ? 'Running' : 'Ran'
  if (toolName === 'read') return running ? 'Reading' : 'Read'
  if (toolName === 'grep') return running ? 'Searching' : 'Searched'
  if (toolName === 'glob') return running ? 'Matching' : 'Matched'
  if (toolName === 'write') return running ? 'Writing' : 'Wrote'
  if (toolName === 'edit') return running ? 'Editing' : 'Edited'
  return running ? 'Using' : 'Used'
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

function buildDuration(toolCall: ToolCall): string {
  if (!toolCall.startTime) return ''
  const end = toolCall.endTime ?? (toolCall.status === 'executing' ? Date.now() : 0)
  if (!end) return ''
  const ms = Math.max(0, end - toolCall.startTime)
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
}
