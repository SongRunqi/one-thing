import type { Step, ToolCall } from '@/types'
import { basename, formatToolCallPreview } from './tool-preview'
import { getToolRenderStatus, type ToolRenderStatus } from './tool-status'

export interface ToolDiffData {
  diff: string
  additions: number
  deletions: number
  filePath: string
  auditId?: string
  auditPath?: string
  originalContentHash?: string
  afterContentHash?: string
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
  additions: number
  isTruncated?: boolean
  totalLines?: number
  omittedLines?: number
}

export interface ToolStepView {
  id: string
  step: Step
  toolCall: ToolCall
  toolName: string
  displayName: string
  status: ToolRenderStatus
  preview: string
  filePath: string
  fileName: string
  inlineResult: string | null
  errorPreview: string | null
  streamingContent: StreamingToolContent | null
  streamingDiff: ToolDiffData | null
  streamingDiffLines: ToolDiffLine[]
  diff: ToolDiffData | null
  diffLines: ToolDiffLine[]
  argsJson: string | null
  resultText: string | null
  liveOutput: string | null
  hasDetails: boolean
  defaultExpanded: boolean
  isAwaitingConfirmation: boolean
}

export interface BuildToolStepViewOptions {
  includeDetails?: boolean
}

const DETAILS_ARGS_EXCLUDED_TOOLS = new Set(['edit', 'read', 'write'])
const STREAMING_CONTENT_CACHE_LIMIT = 80
const STREAMING_PREVIEW_HEAD_LINES = 80
const STREAMING_PREVIEW_TAIL_LINES = 80
const STREAMING_PREVIEW_MAX_LINES = STREAMING_PREVIEW_HEAD_LINES + STREAMING_PREVIEW_TAIL_LINES

const streamingContentCache = new Map<string, StreamingToolContent | null>()

interface ToolContentSource {
  filePath: string
  content: string
  cacheKey: string
}

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

export function buildToolStepView(step: Step, options: BuildToolStepViewOptions = {}): ToolStepView {
  const includeDetails = options.includeDetails ?? true
  const toolCall = step.toolCall || buildSyntheticToolCall(step)
  const toolName = toolCall.toolName?.toLowerCase() || ''
  const status = getToolRenderStatus(toolCall, step)
  const isRejected = status === 'rejected'
  const diff = getDiffFromStep(step)
  const streamingContent = includeDetails ? getCachedStreamingContent(step, diff, status) : null
  const streamingDiff = includeDetails ? getStreamingDiff(streamingContent) : null
  const filePath = getToolFilePath(toolCall, diff, streamingContent)
  const argsJson = includeDetails ? getArgsJson(step) : null
  const resultText = includeDetails ? getResultText(step) : null
  const liveOutput = includeDetails && step.status === 'running'
    ? getLiveOutput(step)
    : null
  const inlineResult = includeDetails ? getInlineResult(step) : null
  const errorPreview = isRejected
    ? 'Rejected'
    : step.status === 'failed' && step.error
      ? truncateError(step.error, 30)
      : null

  const hasDetails = !!(
    hasPotentialDetails(step, toolName, diff) ||
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
    filePath,
    fileName: basename(filePath),
    inlineResult,
    errorPreview,
    streamingContent,
    streamingDiff,
    streamingDiffLines: includeDetails && streamingDiff ? parseStreamingDiffLines(streamingContent) : [],
    diff,
    diffLines: includeDetails && diff ? parseDiffWithLineNumbers(diff.diff) : [],
    argsJson,
    resultText,
    liveOutput,
    hasDetails,
    defaultExpanded: status === 'awaiting-confirmation' || status === 'failed' || status === 'rejected',
    isAwaitingConfirmation: status === 'awaiting-confirmation',
  }
}

function hasPotentialStreamingDetails(step: Step, toolName: string): boolean {
  if (toolName !== 'write' && toolName !== 'edit') return false
  return Boolean(
    step.toolCall?.streamingArgs ||
    step.toolCall?.changes ||
    getFinalizedContentSource(step.toolCall, toolName),
  )
}

function hasPotentialDetails(step: Step, toolName: string, diff: ToolDiffData | null): boolean {
  if (hasPotentialStreamingDetails(step, toolName)) return true
  if (diff || step.thinking || step.summary || step.error) return true
  if (step.result) return true

  const args = step.toolCall?.arguments
  return Boolean(
    args &&
    Object.keys(args).length > 0 &&
    !DETAILS_ARGS_EXCLUDED_TOOLS.has(toolName),
  )
}

export function getToolFilePath(
  toolCall: ToolCall | undefined,
  diff: ToolDiffData | null = null,
  streamingContent: StreamingToolContent | null = null,
): string {
  const args = toolCall?.arguments || {}
  if (diff?.filePath) return diff.filePath
  if (streamingContent?.filePath) return streamingContent.filePath
  if (typeof toolCall?.changes?.filePath === 'string') return toolCall.changes.filePath
  if (typeof args.path === 'string') return args.path
  if (toolCall?.status === 'input-streaming' && toolCall.streamingArgs) {
    return extractStreamingStringValue(toolCall.streamingArgs, 'path') || ''
  }
  return ''
}

function getStreamingDiff(streamingContent: StreamingToolContent | null): ToolDiffData | null {
  if (!streamingContent) return null
  return {
    diff: '',
    filePath: streamingContent.filePath,
    additions: streamingContent.additions,
    deletions: 0,
  }
}

function parseStreamingDiffLines(streamingContent: StreamingToolContent | null): ToolDiffLine[] {
  if (!streamingContent?.content) return []
  const lines = streamingContent.content.split('\n')
  const result: ToolDiffLine[] = lines.map((line, index) => ({
    class: 'diff-add',
    prefix: '+',
    content: line,
    newNum: index + 1,
  }))

  if (streamingContent.isTruncated && streamingContent.omittedLines) {
    result.splice(STREAMING_PREVIEW_HEAD_LINES, 0, {
      class: 'diff-hunk',
      prefix: '',
      content: `... ${streamingContent.omittedLines} lines omitted while streaming ...`,
      newNum: '',
    })
  }

  return result
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

function getLiveOutput(step: Step): string | null {
  const partialText = step.partialResult?.content
    ?.map((part) => {
      if (part.type === 'text') return part.text ?? ''
      if (part.type === 'file') return part.path ? `[File: ${part.path}]` : ''
      if (part.type === 'image') return part.path ? `[Image: ${part.path}]` : '[Image]'
      return ''
    })
    .filter(Boolean)
    .join('\n')

  const source = partialText || step.result
  return source ? truncateOutput(source) : null
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

function getCachedStreamingContent(
  step: Step,
  diff: ToolDiffData | null,
  status: ToolRenderStatus,
): StreamingToolContent | null {
  if (diff) return null

  const source = getToolContentSource(step)
  if (!source) return null

  const toolCallId = step.toolCall?.id || step.toolCallId || step.id
  const cacheKey = `${toolCallId}:${source.cacheKey}:${status}`
  if (streamingContentCache.has(cacheKey)) {
    return streamingContentCache.get(cacheKey) ?? null
  }

  const result = normalizeStreamingContent({
    filePath: source.filePath,
    content: source.content,
    additions: countAddedLines(source.content),
  })
  streamingContentCache.set(cacheKey, result)
  if (streamingContentCache.size > STREAMING_CONTENT_CACHE_LIMIT) {
    const firstKey = streamingContentCache.keys().next().value
    if (firstKey) streamingContentCache.delete(firstKey)
  }
  return result
}

function getToolContentSource(step: Step): ToolContentSource | null {
  const toolCall = step.toolCall
  const toolName = toolCall?.toolName?.toLowerCase()
  if (!toolCall || (toolName !== 'write' && toolName !== 'edit')) return null

  if (toolCall.streamingArgs) {
    return getStreamingContentSource(toolName, toolCall.streamingArgs)
  }

  return getFinalizedContentSource(toolCall, toolName)
}

function getStreamingContentSource(toolName: string, args: string): ToolContentSource | null {
  const result = { filePath: '', content: '' }

  try {
    const parsed = JSON.parse(args)
    const parsedContent = toolName === 'write'
      ? parsed.content
      : extractEditReplacementContent(parsed)
    const content = typeof parsedContent === 'string' ? parsedContent : ''
    const filePath = typeof parsed.path === 'string' ? parsed.path : ''
    return (filePath || content)
      ? {
        filePath,
        content,
        cacheKey: `stream:${args.length}:${hashString(content)}`,
      }
      : null
  } catch {
    // Incomplete JSON while the model is still streaming; fall through to
    // tolerant extraction below.
  }

  result.filePath = extractStreamingStringValue(args, 'path') || ''

  const contentKey = toolName === 'write' ? 'content' : 'newText'
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

  return (result.filePath || result.content)
    ? {
      ...result,
      cacheKey: `stream:${args.length}:${hashString(result.content)}`,
    }
    : null
}

function extractEditReplacementContent(args: Record<string, any>): string {
  if (Array.isArray(args.edits)) {
    return args.edits
      .map((edit: any) => typeof edit?.newText === 'string' ? edit.newText : '')
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function getFinalizedContentSource(toolCall: ToolCall | undefined, toolName: string): ToolContentSource | null {
  const args = toolCall?.arguments
  if (!args) return null

  const parsedContent = toolName === 'write' ? args.content : extractEditReplacementContent(args)
  if (typeof parsedContent !== 'string') return null

  const filePath = typeof args.path === 'string' ? args.path : ''

  return {
    filePath,
    content: parsedContent,
    cacheKey: `final:${filePath}:${parsedContent.length}:${hashString(parsedContent)}`,
  }
}

function hashString(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return String(hash >>> 0)
}

function normalizeStreamingContent(content: StreamingToolContent): StreamingToolContent {
  const lines = content.content ? content.content.split('\n') : []
  if (lines.length <= STREAMING_PREVIEW_MAX_LINES) {
    return {
      ...content,
      totalLines: lines.length,
      isTruncated: false,
      omittedLines: 0,
    }
  }

  const omittedLines = Math.max(0, lines.length - STREAMING_PREVIEW_MAX_LINES)
  return {
    ...content,
    content: [
      ...lines.slice(0, STREAMING_PREVIEW_HEAD_LINES),
      ...lines.slice(-STREAMING_PREVIEW_TAIL_LINES),
    ].join('\n'),
    totalLines: lines.length,
    isTruncated: true,
    omittedLines,
  }
}

function countAddedLines(content: string): number {
  if (!content) return 0
  return content.endsWith('\n')
    ? content.split('\n').length - 1
    : content.split('\n').length
}

function extractStreamingStringValue(source: string, key: string): string | null {
  const match = source.match(new RegExp(`"${key}"\\s*:\\s*"`))
  if (!match || match.index === undefined) return null

  let value = ''
  let escaped = false
  for (const char of source.slice(match.index + match[0].length)) {
    if (escaped) {
      value += char === 'n' ? '\n' : char === 't' ? '\t' : char
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') break
    value += char
  }

  return value || null
}

export function getDiffFromStep(step: Step): ToolDiffData | null {
  if (step.toolCall?.changes?.diff) {
    return {
      diff: step.toolCall.changes.diff,
      additions: step.toolCall.changes.additions || 0,
      deletions: step.toolCall.changes.deletions || 0,
      filePath: step.toolCall.changes.filePath || '',
      auditId: step.toolCall.changes.auditId,
      auditPath: step.toolCall.changes.auditPath,
      originalContentHash: step.toolCall.changes.originalContentHash,
      afterContentHash: step.toolCall.changes.afterContentHash,
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
        filePath: parsed.path || '',
        auditId: parsed.auditId,
        auditPath: parsed.auditPath,
        originalContentHash: parsed.originalContentHash,
        afterContentHash: parsed.afterContentHash,
      }
    }
    if (parsed.metadata?.diff) {
      return {
        diff: parsed.metadata.diff,
        additions: parsed.metadata.additions || 0,
        deletions: parsed.metadata.deletions || 0,
        filePath: parsed.metadata.path || '',
        auditId: parsed.metadata.auditId,
        auditPath: parsed.metadata.auditPath,
        originalContentHash: parsed.metadata.originalContentHash,
        afterContentHash: parsed.metadata.afterContentHash,
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
