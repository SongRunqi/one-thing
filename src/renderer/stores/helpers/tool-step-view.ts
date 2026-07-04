import type { Step, ToolCall } from '@/types'
import { diffLines } from 'diff'
import { basename, formatToolCallPreview } from './tool-preview'
import { getToolRenderStatus, type ToolRenderStatus } from './tool-status'
import { getFileToolCategory } from './tool-ui-registry'

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
  deletions?: number
  isTruncated?: boolean
  totalLines?: number
  omittedLines?: number
  kind?: 'write' | 'edit'
  replacements?: StreamingEditReplacement[]
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

const STREAMING_CONTENT_CACHE_LIMIT = 80

const streamingContentCache = new Map<string, StreamingToolContent | null>()

interface ToolContentSource {
  filePath: string
  content: string
  cacheKey: string
  kind: 'write' | 'edit'
  replacements?: StreamingEditReplacement[]
}

interface StreamingEditReplacement {
  oldText: string
  newText: string
}

export function clearStreamingContentCache(): void {
  streamingContentCache.clear()
}

/** Wrap a bare ToolCall as a Step so the unified timeline can render it. */
export function stepFromToolCall(toolCall: ToolCall): Step {
  return {
    id: toolCall.id,
    type: toolCall.toolName?.toLowerCase() === 'bash' ? 'command' : 'tool-call',
    title: toolCall.toolName || 'tool',
    status: toolCall.status === 'completed'
      ? 'completed'
      : toolCall.status === 'failed'
        ? 'failed'
        : toolCall.status === 'cancelled'
          ? 'cancelled'
          : 'running',
    timestamp: toolCall.timestamp,
    toolCallId: toolCall.id,
    toolCall,
    result: typeof toolCall.result === 'string'
      ? toolCall.result
      : toolCall.result === undefined
        ? undefined
        : JSON.stringify(toolCall.result),
    error: toolCall.error,
  }
}

export function buildSyntheticToolCall(step: Step): ToolCall {
  const title = step.title || ''
  let name = 'tool'
  const args: Record<string, any> = {}

  if (title.includes(':')) {
    const parts = title.split(':')
    const first = parts[0].trim()
    if (first.toLowerCase() === 'tool' && parts.length > 1) {
      name = parts[1].trim()
      const path = parts.slice(2).join(':').trim()
      if (path) args.path = path
    } else {
      name = first
      const path = parts.slice(1).join(':').trim()
      if (path) {
        const rangeMatch = path.match(/:(\d+)-(\d+)$/)
        if (rangeMatch) {
          args.path = path.slice(0, -rangeMatch[0].length)
          args.offset = parseInt(rangeMatch[1], 10)
          args.limit = parseInt(rangeMatch[2], 10) - args.offset + 1
        } else {
          args.path = path
        }
      }
    }
  } else {
    const lowerTitle = title.toLowerCase()
    if (lowerTitle.startsWith('read ') || lowerTitle.startsWith('reading ')) {
      name = 'read'
      args.path = title.slice(lowerTitle.startsWith('read ') ? 5 : 8).trim()
    } else if (lowerTitle.startsWith('edit ') || lowerTitle.startsWith('editing ')) {
      name = 'edit'
      args.path = title.slice(lowerTitle.startsWith('edit ') ? 5 : 8).trim()
    } else if (lowerTitle.startsWith('write ') || lowerTitle.startsWith('writing ')) {
      name = 'write'
      args.path = title.slice(lowerTitle.startsWith('write ') ? 6 : 8).trim()
    } else if (lowerTitle.startsWith('run ') || lowerTitle.startsWith('running ')) {
      name = 'bash'
      args.command = title.slice(lowerTitle.startsWith('run ') ? 4 : 8).trim()
    } else {
      name = title.trim() || 'tool'
    }
  }

  name = name.toLowerCase()

  return {
    id: step.toolCallId || step.id,
    toolId: name,
    toolName: name,
    arguments: args,
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
  const filePath = getToolFilePath(toolCall, diff, streamingContent, step)
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
    resultText ||
    step.summary ||
    step.error ||
    // The single-line row title truncates long commands; the expanded
    // details are the guaranteed place to read the full command, so a bash
    // row with a command is always expandable.
    (toolName === 'bash' && toolCall.arguments?.command)
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
    defaultExpanded: shouldDefaultExpand(toolName, status),
    isAwaitingConfirmation: status === 'awaiting-confirmation',
  }
}

function shouldDefaultExpand(toolName: string, status: ToolRenderStatus): boolean {
  if (status === 'failed' || status === 'rejected') return false
  // Live bash output is the one result the row title can't summarize —
  // show it while the command runs.
  if (status === 'executing' && toolName === 'bash') return true
  if (status === 'streaming-input') {
    const cat = getFileToolCategory(toolName)
    return cat === 'write' || cat === 'edit'
  }
  return false
}

function hasPotentialStreamingDetails(step: Step, toolName: string): boolean {
  const cat = getFileToolCategory(toolName)
  if (cat !== 'write' && cat !== 'edit') return false
  if (step.toolCall?.streamingArgs) {
    const source = getStreamingContentSource(toolName, step.toolCall.streamingArgs)
    if (!source) return false
    if (source.kind === 'edit') return Boolean(source.replacements?.length)
    return Boolean(source.content)
  }
  return Boolean(
    step.toolCall?.changes ||
    getFinalizedContentSource(step.toolCall, toolName),
  )
}

function hasPotentialDetails(step: Step, toolName: string, diff: ToolDiffData | null): boolean {
  if (hasPotentialStreamingDetails(step, toolName)) return true
  if (diff || step.thinking || step.summary || step.error) return true
  return Boolean(step.result || step.partialResult)
}

export function getToolFilePath(
  toolCall: ToolCall | undefined,
  diff: ToolDiffData | null = null,
  streamingContent: StreamingToolContent | null = null,
  step?: Step | null,
): string {
  const args = toolCall?.arguments || {}
  if (diff?.filePath) return diff.filePath
  if (streamingContent?.filePath) return streamingContent.filePath
  if (typeof toolCall?.changes?.filePath === 'string') return toolCall.changes.filePath
  const argPath = getPathArgument(args)
  if (argPath) return argPath

  const partialPath = getPathFromDetails(step?.partialResult?.details)
  if (partialPath) return partialPath

  // Parse path from step result JSON output if available
  if (step?.result) {
    try {
      const parsed = JSON.parse(step.result)
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.path === 'string') return parsed.path
        if (typeof parsed.filePath === 'string') return parsed.filePath
        if (typeof parsed.metadata?.path === 'string') return parsed.metadata.path
      }
    } catch {
      // Non-JSON results cannot provide structured file metadata.
    }
  }

  if (toolCall?.status === 'input-streaming' && toolCall.streamingArgs) {
    return (
      extractStreamingStringValue(toolCall.streamingArgs, 'path') ||
      extractStreamingStringValue(toolCall.streamingArgs, 'filePath') ||
      extractStreamingStringValue(toolCall.streamingArgs, 'filepath') ||
      extractStreamingStringValue(toolCall.streamingArgs, 'file_path') ||
      extractStreamingStringValue(toolCall.streamingArgs, 'AbsolutePath') ||
      extractStreamingStringValue(toolCall.streamingArgs, 'TargetFile') ||
      extractStreamingStringValue(toolCall.streamingArgs, 'SearchPath') ||
      extractStreamingStringValue(toolCall.streamingArgs, 'FilePath') ||
      ''
    )
  }
  return ''
}

export function getStreamingDiffStats(toolCall: ToolCall | undefined): { additions: number; deletions: number } | null {
  if (!toolCall?.streamingArgs) return null
  const toolName = toolCall.toolName?.toLowerCase() || ''
  const cat = getFileToolCategory(toolName)
  if (cat !== 'write' && cat !== 'edit') return null
  const source = getStreamingContentSource(toolName, toolCall.streamingArgs)
  if (!source) return null
  return {
    additions: countStreamingSourceAdditions(source),
    deletions: countStreamingSourceDeletions(source),
  }
}

function getPathArgument(args: Record<string, any>): string {
  const value = args.path ||
    args.filePath ||
    args.filepath ||
    args.file_path ||
    args.AbsolutePath ||
    args.TargetFile ||
    args.SearchPath ||
    args.FilePath
  return typeof value === 'string' ? value : ''
}

function getPathFromDetails(details: unknown): string {
  if (!details || typeof details !== 'object') return ''
  const value = (details as Record<string, unknown>).path ||
    (details as Record<string, unknown>).filePath ||
    (details as Record<string, unknown>).file_path
  return typeof value === 'string' ? value : ''
}

function getStreamingDiff(streamingContent: StreamingToolContent | null): ToolDiffData | null {
  if (!streamingContent) return null
  if (streamingContent.kind === 'edit' && !streamingContent.replacements?.length) return null
  return {
    diff: '',
    filePath: streamingContent.filePath,
    additions: streamingContent.additions,
    deletions: streamingContent.deletions || 0,
  }
}

function parseStreamingDiffLines(streamingContent: StreamingToolContent | null): ToolDiffLine[] {
  if (!streamingContent) return []
  if (streamingContent.kind === 'edit') {
    return parseStreamingEditDiffLines(streamingContent.replacements || [])
  }
  if (!streamingContent.content) return []

  const lines = splitDisplayLines(streamingContent.content)
  const result: ToolDiffLine[] = lines.map((line, index) => ({
    class: 'diff-add',
    prefix: '+',
    content: line,
    newNum: index + 1,
  }))

  return result
}

function parseStreamingEditDiffLines(replacements: StreamingEditReplacement[]): ToolDiffLine[] {
  const result: ToolDiffLine[] = []
  let oldLineNum = 1
  let newLineNum = 1

  replacements.forEach((replacement, replacementIndex) => {
    if (replacementIndex > 0) {
      result.push({
        class: 'diff-hunk',
        prefix: '',
        content: `... edit ${replacementIndex + 1} ...`,
        oldNum: '',
        newNum: '',
      })
    }

    for (const change of diffLines(replacement.oldText, replacement.newText)) {
      const lines = splitDisplayLines(change.value)
      if (change.removed) {
        for (const line of lines) {
          result.push({ class: 'diff-del', prefix: '-', content: line, oldNum: oldLineNum, newNum: '' })
          oldLineNum++
        }
        continue
      }
      if (change.added) {
        for (const line of lines) {
          result.push({ class: 'diff-add', prefix: '+', content: line, oldNum: '', newNum: newLineNum })
          newLineNum++
        }
        continue
      }
      for (const line of lines) {
        result.push({ class: '', prefix: ' ', content: line, oldNum: oldLineNum, newNum: newLineNum })
        oldLineNum++
        newLineNum++
      }
    }
  })

  return result
}

export function getResultText(step: Step): string | null {
  if (!step.result || step.status === 'running' || getDiffFromStep(step)) return null
  return formatResult(step.result)
}

function getArgsJson(step: Step): string | null {
  const args = step.toolCall?.arguments
  const toolName = step.toolCall?.toolName?.toLowerCase() || ''
  if (toolName === 'read') return null
  if (args && Object.keys(args).length > 0) {
    return formatArgsJson(args, toolName)
  }
  if (step.toolCall?.streamingArgs) {
    return formatStreamingArgs(step.toolCall.streamingArgs, toolName)
  }
  return null
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
  const displayArgs = truncateDisplayValue(args)

  if (toolName === 'bash') {
    return String((displayArgs as Record<string, any>).command || '')
  }
  return JSON.stringify(displayArgs, null, 2)
}

function formatStreamingArgs(streamingArgs: string, toolName: string): string {
  try {
    const parsed = JSON.parse(streamingArgs)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return formatArgsJson(parsed as Record<string, any>, toolName)
    }
  } catch {
    // Incomplete JSON while the model is streaming; show a bounded preview.
  }
  return truncateString(streamingArgs, 1200)
}

function truncateDisplayValue(value: any, depth = 0): any {
  if (typeof value === 'string') {
    return truncateString(value, depth === 0 ? 500 : 300)
  }
  if (Array.isArray(value)) {
    const maxItems = depth >= 2 ? 8 : 24
    const items = value.slice(0, maxItems).map(item => truncateDisplayValue(item, depth + 1))
    if (value.length > maxItems) {
      items.push(`... (${value.length - maxItems} more items)`)
    }
    return items
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
    const maxEntries = depth >= 2 ? 12 : 40
    const result: Record<string, any> = {}
    for (const [key, item] of entries.slice(0, maxEntries)) {
      result[key] = truncateDisplayValue(item, depth + 1)
    }
    if (entries.length > maxEntries) {
      result.__truncated = `${entries.length - maxEntries} more keys`
    }
    return result
  }
  return value
}

function truncateString(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}... (${value.length} chars total)`
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
    additions: countStreamingSourceAdditions(source),
    deletions: countStreamingSourceDeletions(source),
    kind: source.kind,
    replacements: source.replacements,
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
  const toolName = toolCall?.toolName?.toLowerCase() || ''
  const cat = getFileToolCategory(toolName)
  if (!toolCall || (cat !== 'write' && cat !== 'edit')) return null

  if (toolCall.streamingArgs) {
    return getStreamingContentSource(toolName, toolCall.streamingArgs)
  }

  return getFinalizedContentSource(toolCall, toolName)
}

function getStreamingContentSource(toolName: string, args: string): ToolContentSource | null {
  const result = { filePath: '', content: '' }
  const cat = getFileToolCategory(toolName)

  try {
    const parsed = JSON.parse(args)
    const filePath = typeof parsed.path === 'string' ? parsed.path : ''
    if (cat === 'edit') {
      const replacements = extractEditReplacements(parsed)
      const content = replacements.map(edit => edit.newText).join('\n')
      return (content || replacements.length)
        ? {
          filePath,
          content,
          kind: 'edit',
          replacements,
          cacheKey: `stream:${args.length}:${hashString(replacements.map(edit => `${edit.oldText}\u0000${edit.newText}`).join('\u0001'))}`,
        }
        : null
    }

    const content = typeof parsed.content === 'string' ? parsed.content : ''
    return content
      ? {
        filePath,
        content,
        kind: 'write',
        cacheKey: `stream:${args.length}:${hashString(content)}`,
      }
      : null
  } catch {
    // Incomplete JSON while the model is still streaming; fall through to
    // tolerant extraction below.
  }

  result.filePath = extractStreamingStringValue(args, 'path') || ''

  if (cat === 'edit') {
    const oldText = extractStreamingStringValue(args, 'oldText') || ''
    const newText = extractStreamingStringValue(args, 'newText') || ''
    const replacements = oldText || newText ? [{ oldText, newText }] : []
    return replacements.length
      ? {
        ...result,
        content: replacements.map(edit => edit.newText).join('\n'),
        kind: 'edit',
        replacements,
        cacheKey: `stream:${args.length}:${hashString(replacements.map(edit => `${edit.oldText}\u0000${edit.newText}`).join('\u0001'))}`,
      }
      : null
  }

  const contentKey = 'content'
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

  return result.content
    ? {
      ...result,
      kind: 'write',
      cacheKey: `stream:${args.length}:${hashString(result.content)}`,
    }
    : null
}

function extractEditReplacementContent(args: Record<string, any>): string {
  return extractEditReplacements(args)
    .map(edit => edit.newText)
    .filter(Boolean)
    .join('\n')
}

function extractEditReplacements(args: Record<string, any>): StreamingEditReplacement[] {
  if (!Array.isArray(args.edits)) return []
  return args.edits
    .map((edit: any) => ({
      oldText: typeof edit?.oldText === 'string' ? edit.oldText : '',
      newText: typeof edit?.newText === 'string' ? edit.newText : '',
    }))
    .filter(edit => edit.oldText || edit.newText)
}

function getFinalizedContentSource(toolCall: ToolCall | undefined, toolName: string): ToolContentSource | null {
  const args = toolCall?.arguments
  if (!args) return null

  const cat = getFileToolCategory(toolName)
  const parsedContent = cat === 'write' ? args.content : extractEditReplacementContent(args)
  if (typeof parsedContent !== 'string') return null

  const filePath = typeof args.path === 'string' ? args.path : ''

  return {
    filePath,
    content: parsedContent,
    kind: cat === 'edit' ? 'edit' : 'write',
    replacements: cat === 'edit' ? extractEditReplacements(args) : undefined,
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
  return {
    ...content,
    totalLines: countAddedLines(content.content),
    isTruncated: false,
    omittedLines: 0,
  }
}

function countAddedLines(content: string): number {
  if (!content) return 0
  return content.endsWith('\n')
    ? content.split('\n').length - 1
    : content.split('\n').length
}

function splitDisplayLines(value: string): string[] {
  if (!value) return []
  const lines = value.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

function countStreamingSourceAdditions(source: ToolContentSource): number {
  if (source.kind !== 'edit') return countAddedLines(source.content)
  return countStreamingEditChanges(source.replacements || []).additions
}

function countStreamingSourceDeletions(source: ToolContentSource): number {
  if (source.kind !== 'edit') return 0
  return countStreamingEditChanges(source.replacements || []).deletions
}

function countStreamingEditChanges(replacements: StreamingEditReplacement[]): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const replacement of replacements) {
    for (const change of diffLines(replacement.oldText, replacement.newText)) {
      const count = splitDisplayLines(change.value).length
      if (change.added) additions += count
      if (change.removed) deletions += count
    }
  }
  return { additions, deletions }
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
