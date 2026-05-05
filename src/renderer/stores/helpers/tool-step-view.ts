import type { Step, ToolCall } from '@/types'
import { formatToolCallPreview } from './tool-preview'
import { getToolRenderStatus, type ToolRenderStatus } from './tool-status'

export interface ToolDiffData {
  diff: string
  additions: number
  deletions: number
  filePath: string
}

export interface ToolDiffLine {
  class: string
  prefix: string
  content: string
  oldNum?: number | string
  newNum?: number | string
}

export interface StreamingToolContent {
  filePath: string
  content: string
}

export interface ToolStepView {
  id: string
  step: Step
  toolCall: ToolCall
  toolName: string
  displayName: string
  status: ToolRenderStatus
  preview: string
  inlineResult: string | null
  errorPreview: string | null
  streamingContent: StreamingToolContent | null
  diff: ToolDiffData | null
  diffLines: ToolDiffLine[]
  argsJson: string | null
  resultText: string | null
  liveOutput: string | null
  hasDetails: boolean
  defaultExpanded: boolean
  isAwaitingConfirmation: boolean
}

const AUTO_EXPAND_TOOLS = new Set(['write', 'read', 'edit'])
const DETAILS_ARGS_EXCLUDED_TOOLS = new Set(['edit', 'read', 'write'])

export function buildSyntheticToolCall(step: Step): ToolCall {
  const name = step.title?.split(':')[0] || 'tool'
  return {
    id: step.toolCallId || step.id,
    toolId: name,
    toolName: name,
    arguments: {},
    status: 'pending',
    timestamp: step.timestamp,
  }
}

export function buildToolStepView(step: Step): ToolStepView {
  const toolCall = step.toolCall || buildSyntheticToolCall(step)
  const toolName = toolCall.toolName?.toLowerCase() || ''
  const status = getToolRenderStatus(toolCall, step)
  const diff = getDiffFromStep(step)
  const streamingContent = getStreamingContent(step, diff)
  const argsJson = getArgsJson(step)
  const resultText = getResultText(step)
  const liveOutput = step.status === 'running' && step.result
    ? truncateOutput(step.result)
    : null
  const inlineResult = getInlineResult(step)
  const errorPreview = step.status === 'failed' && step.error
    ? truncateError(step.error, 30)
    : null

  const hasDetails = !!(
    streamingContent ||
    diff ||
    step.thinking ||
    argsJson ||
    resultText ||
    step.summary ||
    step.error
  )

  return {
    id: step.id,
    step,
    toolCall,
    toolName,
    displayName: toolCall.toolName || step.title?.split(':')[0] || 'tool',
    status,
    preview: formatToolCallPreview(toolCall),
    inlineResult,
    errorPreview,
    streamingContent,
    diff,
    diffLines: diff ? parseDiffWithLineNumbers(diff.diff) : [],
    argsJson,
    resultText,
    liveOutput,
    hasDetails,
    defaultExpanded: status === 'awaiting-confirmation' ||
      (AUTO_EXPAND_TOOLS.has(toolName) && (status === 'streaming-input' || status === 'completed')),
    isAwaitingConfirmation: status === 'awaiting-confirmation',
  }
}

export function getResultText(step: Step): string | null {
  if (!step.result || step.status === 'running' || getDiffFromStep(step)) return null
  return formatResult(step.result)
}

function getArgsJson(step: Step): string | null {
  const args = step.toolCall?.arguments
  const toolName = step.toolCall?.toolName?.toLowerCase() || ''
  if (!args || Object.keys(args).length === 0 || DETAILS_ARGS_EXCLUDED_TOOLS.has(toolName)) {
    return null
  }
  return formatArgsJson(args, toolName)
}

function getInlineResult(step: Step): string | null {
  if (step.status !== 'completed' && step.status !== 'failed') return null
  const raw = step.result
  if (!raw || typeof raw !== 'string') return null

  let text = raw
  try {
    const parsed = JSON.parse(raw)
    if (parsed.output !== undefined) text = String(parsed.output)
    else if (parsed.data?.output !== undefined) text = String(parsed.data.output)
  } catch {
    // Use raw result.
  }

  const firstLine = text.split('\n')[0].trim()
  if (!firstLine || firstLine.length > 80) return null
  return firstLine
}

function truncateError(error: string, maxLen: number): string {
  const firstLine = error.split('\n')[0]
  if (firstLine.length <= maxLen) return firstLine
  return firstLine.slice(0, maxLen - 3) + '...'
}

function formatArgsJson(args: Record<string, any>, toolName: string): string {
  const displayArgs = { ...args }
  for (const [key, value] of Object.entries(displayArgs)) {
    if (typeof value === 'string' && value.length > 500) {
      displayArgs[key] = value.slice(0, 500) + `... (${value.length} chars total)`
    }
  }

  if (toolName === 'bash') {
    return String(displayArgs.command || '')
  }
  return JSON.stringify(displayArgs, null, 2)
}

function formatResult(result: string): string {
  try {
    const parsed = JSON.parse(result)
    if (parsed.output !== undefined) return String(parsed.output)
    if (parsed.data?.output !== undefined) return String(parsed.data.output)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return result
  }
}

function truncateOutput(output: string, maxLines: number = 8): string {
  const lines = output.split('\n')
  if (lines.length <= maxLines) return output
  return '...\n' + lines.slice(-maxLines).join('\n')
}

function getStreamingContent(step: Step, diff: ToolDiffData | null): StreamingToolContent | null {
  if (diff || !step.toolCall?.streamingArgs) return null

  const toolName = step.toolCall.toolName?.toLowerCase()
  if (toolName !== 'write' && toolName !== 'edit') return null

  const args = step.toolCall.streamingArgs
  const result = { filePath: '', content: '' }

  try {
    const parsed = JSON.parse(args)
    const parsedContent = toolName === 'write' ? parsed.content : parsed.new_string
    return {
      filePath: typeof parsed.file_path === 'string' ? parsed.file_path : '',
      content: typeof parsedContent === 'string' ? parsedContent : '',
    }
  } catch {
    // Incomplete JSON while the model is still streaming; fall through to
    // tolerant extraction below.
  }

  const pathMatch = args.match(/"file_path"\s*:\s*"([^"]*)"?/)
  if (pathMatch) result.filePath = pathMatch[1]

  const contentKey = toolName === 'write' ? 'content' : 'new_string'
  const contentMatch = args.match(new RegExp(`"${contentKey}"\\s*:\\s*"`))
  if (contentMatch) {
    const startIdx = contentMatch.index! + contentMatch[0].length
    let content = args.slice(startIdx)
    content = content
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
    if (content.endsWith('"')) content = content.slice(0, -1)
    result.content = content
  }

  return (result.filePath || result.content) ? result : null
}

export function getDiffFromStep(step: Step): ToolDiffData | null {
  if (step.toolCall?.changes?.diff) {
    return {
      diff: step.toolCall.changes.diff,
      additions: step.toolCall.changes.additions || 0,
      deletions: step.toolCall.changes.deletions || 0,
      filePath: step.toolCall.changes.filePath || '',
    }
  }

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
    if (parsed.metadata?.diff) {
      return {
        diff: parsed.metadata.diff,
        additions: parsed.metadata.additions || 0,
        deletions: parsed.metadata.deletions || 0,
        filePath: parsed.metadata.filePath || '',
      }
    }
  } catch {
    // Not JSON, no diff.
  }
  return null
}

function getDiffLineClass(line: string): string {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'diff-add'
  if (line.startsWith('-') && !line.startsWith('---')) return 'diff-del'
  if (line.startsWith('@@')) return 'diff-hunk'
  return ''
}

function parseHunkHeader(line: string): { oldStart: number; newStart: number } | null {
  const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
  if (!match) return null
  return { oldStart: parseInt(match[1], 10), newStart: parseInt(match[2], 10) }
}

export function parseDiffWithLineNumbers(diff: string): ToolDiffLine[] {
  const rawLines = diff.split('\n')
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
    rawLines.pop()
  }

  const result: ToolDiffLine[] = []
  let oldLineNum = 0
  let newLineNum = 0
  let inHunk = false

  for (const line of rawLines) {
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('Index:') || line.startsWith('diff ')) {
      continue
    }

    if (line.startsWith('@@')) {
      const parsed = parseHunkHeader(line)
      if (parsed) {
        oldLineNum = parsed.oldStart
        newLineNum = parsed.newStart
        inHunk = true
        result.push({ class: 'diff-hunk', prefix: '', content: '...', oldNum: '', newNum: '' })
      }
      continue
    }

    if (!inHunk || line.startsWith('\\ ')) continue

    const lineClass = getDiffLineClass(line)
    const prefix = line.charAt(0) || ' '
    const content = line.slice(1)

    if (lineClass === 'diff-del') {
      result.push({ class: lineClass, prefix, content, oldNum: oldLineNum, newNum: '' })
      oldLineNum++
    } else if (lineClass === 'diff-add') {
      result.push({ class: lineClass, prefix, content, oldNum: '', newNum: newLineNum })
      newLineNum++
    } else {
      result.push({ class: '', prefix, content, oldNum: oldLineNum, newNum: newLineNum })
      oldLineNum++
      newLineNum++
    }
  }

  return result
}
