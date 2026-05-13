/**
 * Single-line preview text for a tool call row. Used by both
 * `ToolCallItem` (inline streaming entry) and `StepsPanel` (step row),
 * so the visible summary stays consistent across the two render paths.
 */

import type { ToolCall } from '@/types'

const STREAMING_TAIL_MAX = 80
const BASH_PREVIEW_MAX = 55
const PATTERN_PREVIEW_MAX = 20

/** Shorten a file path to its last 1-2 segments when it exceeds maxLen. */
export function shortenPath(path: string, maxLen: number = 45): string {
  if (!path) return ''
  if (path.length <= maxLen) return path
  const parts = path.split('/')
  if (parts.length >= 2) {
    const short = '.../' + parts.slice(-2).join('/')
    if (short.length <= maxLen) return short
  }
  return '.../' + parts[parts.length - 1]
}

/** Return the final path segment for compact file-tool UI. */
export function basename(path: string): string {
  if (!path) return ''
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return normalized.split('/').filter(Boolean).pop() || normalized || path
}

/** Truncate `s` to `max` chars, adding an ellipsis when shortened. */
function truncate(s: string, max: number): string {
  if (!s || s.length <= max) return s
  return s.slice(0, max - 3) + '...'
}

/** Pull the `file_path` value out of partially-streamed JSON args. */
function extractStreamingPath(streamingArgs: string): string | null {
  const match = streamingArgs.match(/"(?:file_path|path)"\s*:\s*"/)
  if (!match || match.index === undefined) return null

  let value = ''
  let escaped = false
  for (const char of streamingArgs.slice(match.index + match[0].length)) {
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

/**
 * Per-tool argument summary for finalized tool calls. Returns a single-line
 * string suitable for the tool-row preview slot.
 */
function formatArgsSummary(toolCall: ToolCall): string {
  const args = toolCall.arguments as Record<string, unknown> | undefined
  if (!args) return ''
  const toolName = toolCall.toolName?.toLowerCase()

  switch (toolName) {
    case 'read': {
      const path = basename(String(args.file_path || args.path || ''))
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
      const pattern = String(args.pattern || '')
      const glob = (args.glob || args.type) as string | undefined
      const truncPattern = truncate(pattern, PATTERN_PREVIEW_MAX)
      if (glob) return `"${truncPattern}" in ${glob}`
      return pattern ? `"${truncPattern}"` : ''
    }

    case 'bash': {
      const cmd = String(args.command || '')
      return truncate(cmd, BASH_PREVIEW_MAX)
    }

    case 'edit': {
      const changes = toolCall.changes
      const path = basename(String(args.file_path || changes?.filePath || ''))
      if (changes) return `${path} (+${changes.additions} -${changes.deletions})`
      return path
    }

    case 'write': {
      const path = basename(String(args.file_path || ''))
      const content = args.content as string | undefined
      if (content) return `${path} (${content.length} chars)`
      return path
    }

    case 'glob': {
      const pattern = String(args.pattern || '')
      const path = args.path as string | undefined
      if (path) return `${pattern} in ${shortenPath(path, 25)}`
      return pattern
    }

    case 'web-search':
    case 'websearch': {
      const query = args.query as string | undefined
      return query ? `"${query}"` : ''
    }

    default: {
      // Generic fallback: prefer file path > pattern > command > first value
      if (args.file_path || args.path) {
        return basename(String(args.file_path || args.path))
      }
      if (args.pattern) return `"${args.pattern}"`
      if (args.command) return truncate(String(args.command), BASH_PREVIEW_MAX)
      const firstVal = Object.values(args)[0]
      return firstVal !== undefined ? String(firstVal) : ''
    }
  }
}

/**
 * Format a single-line preview for a tool call row.
 *
 * - During `input-streaming`, tries to surface the file path from partially
 *   streamed JSON, falling back to the trailing chunk of streaming args.
 * - Otherwise routes to per-tool argument summaries.
 */
export function formatToolCallPreview(toolCall: ToolCall | undefined): string {
  if (!toolCall) return ''

  if (toolCall.status === 'input-streaming') {
    const args = toolCall.streamingArgs || ''
    if (!args) return ''
    const toolName = toolCall.toolName?.toLowerCase()
    if (toolName === 'write' || toolName === 'edit' || toolName === 'read') {
      const path = extractStreamingPath(args)
      return path ? basename(path) : ''
    }
    return args.length > STREAMING_TAIL_MAX ? '...' + args.slice(-STREAMING_TAIL_MAX) : args
  }

  return formatArgsSummary(toolCall)
}
