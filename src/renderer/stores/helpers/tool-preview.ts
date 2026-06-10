/**
 * Single-line preview text for a tool call row. Used by `StepsPanel`
 * for both Step-backed calls and streaming calls that have not produced
 * a Step yet.
 */

import type { ToolCall } from '@/types'

const STREAMING_TAIL_MAX = 80
const BASH_PREVIEW_MAX = 96
const PATTERN_PREVIEW_MAX = 20

/** Shorten a file path to its last 1-2 segments when it exceeds maxLen. */
export function shortenPath(path: string, maxLen: number = 45): string {
  if (!path) return ''
  const normalized = path.replace(/\\/g, '/')
  if (normalized.length <= maxLen) return normalized
  const parts = normalized.split('/')
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

/** Pull the `path` value out of partially-streamed JSON args. */
function extractStreamingPath(streamingArgs: string): string | null {
  const keys = ['path', 'filePath', 'filepath', 'file_path', 'AbsolutePath', 'TargetFile', 'SearchPath', 'FilePath']
  let match: RegExpMatchArray | null = null
  for (const key of keys) {
    match = streamingArgs.match(new RegExp(`"${key}"\\s*:\\s*"`))
    if (match?.index !== undefined) break
  }
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

function pathArg(args: Record<string, unknown>): string {
  const value = args.path ||
    args.filePath ||
    args.filepath ||
    args.file_path ||
    args.AbsolutePath ||
    args.TargetFile ||
    args.SearchPath ||
    args.FilePath
  return value === undefined || value === null ? '' : String(value)
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
      const path = basename(pathArg(args))
      const offset = (args.offset ?? args.StartLine) as number | undefined
      const limit = (args.limit ?? (args.EndLine && offset ? (args.EndLine as number) - (offset as number) + 1 : undefined)) as number | undefined
      if (offset || limit) {
        const start = offset || 1
        const end = limit ? start + limit - 1 : '...'
        return path ? `${path}:${start}-${end}` : `Lines ${start}-${end}`
      }
      return path
    }

    case 'grep': {
      const pattern = String(args.pattern || args.Query || '')
      const glob = (args.glob || args.type || args.Includes) as string | undefined
      const truncPattern = truncate(pattern, PATTERN_PREVIEW_MAX)
      if (glob) return `"${truncPattern}" in ${shortenPathsInText(glob)}`
      return pattern ? `"${truncPattern}"` : ''
    }

    case 'bash': {
      const cmd = String(args.command || args.CommandLine || '')
      return truncate(shortenPathsInText(cmd), BASH_PREVIEW_MAX)
    }

    case 'edit': {
      const changes = toolCall.changes
      const path = basename(pathArg(args) || changes?.filePath || '')
      if (!path) return ''
      const additions = typeof changes?.additions === 'number' ? changes.additions : null
      const deletions = typeof changes?.deletions === 'number' ? changes.deletions : null
      if (additions !== null || deletions !== null) {
        return `${path} (+${additions ?? 0} -${deletions ?? 0})`
      }
      return path
    }

    case 'write': {
      const path = basename(pathArg(args))
      const content = (args.content || args.CodeContent) as string | undefined
      if (content) return `${path} (${content.length} chars)`
      return path
    }

    case 'glob': {
      const pattern = String(args.pattern || '')
      const path = args.path as string | undefined
      if (path) return `${pattern} in ${shortenPath(path, 25)}`
      return pattern
    }

    case 'find': {
      const pattern = String(args.pattern || '')
      const path = args.path as string | undefined
      if (path) return `${pattern} in ${shortenPath(path, 25)}`
      return pattern
    }

    case 'ls': {
      const path = args.path as string | undefined
      return path ? shortenPath(path, 45) : 'current directory'
    }

    case 'variable': {
      return formatVariablePreview(args)
    }

    case 'todo_plan': {
      const action = String(args.action || '')
      const target = String(args.title || args.id || args.scope || 'todos')
      return action ? `${action} ${target}` : target
    }

    case 'time': {
      const action = String(args.action || 'now')
      const zone = String(args.timezone || args.fromTimezone || args.toTimezone || '')
      return zone ? `${action} ${zone}` : action
    }

    case 'project_dirs': {
      const action = String(args.action || 'list')
      const path = args.path as string | undefined
      return path ? `${action} ${shortenPath(path, 42)}` : action
    }

    case 'skill': {
      const action = String(args.action || 'list')
      const name = String(args.name || args.query || '')
      return name ? `${action} ${name}` : action
    }

    case 'mcp_search':
    case 'tool_function': {
      const action = String(args.action || 'list')
      const fn = String(args.tool || args.function || args.query || '')
      return fn ? `${action} ${fn}` : action
    }

    case 'web-search':
    case 'web_search':
    case 'websearch': {
      const query = args.query as string | undefined
      return query ? `"${query}"` : ''
    }

    case 'web-open':
    case 'web_open':
    case 'webopen': {
      const title = args.title as string | undefined
      const url = args.url as string | undefined
      return title || hostFor(url || '')
    }

    case 'web-find':
    case 'web_find':
    case 'webfind': {
      const pattern = args.pattern as string | undefined
      const url = args.url as string | undefined
      const host = hostFor(url || '')
      if (pattern && host) return `"${truncate(pattern, 28)}" in ${host}`
      return pattern ? `"${truncate(pattern, 40)}"` : host
    }

    case 'calculator': {
      return String(args.expression || '')
    }

    case 'get_current_time': {
      return String(args.timezone || args.format || 'current time')
    }

    default: {
      // Generic fallback: prefer file path > pattern > command > first value
      const rawPath = pathArg(args)
      if (rawPath) {
        return basename(String(rawPath))
      }
      if (args.pattern) return `"${args.pattern}"`
      if (args.command || args.CommandLine) return truncate(shortenPathsInText(String(args.command || args.CommandLine)), BASH_PREVIEW_MAX)
      const firstVal = Object.values(args)[0]
      return firstVal !== undefined ? String(firstVal) : ''
    }
  }
}

function formatVariablePreview(args: Record<string, unknown>): string {
  const action = String(args.action || '').toLowerCase()
  const name = String(args.name || '')
  const value = args.value === undefined ? '' : String(args.value)

  if (action === 'list') return 'variables'
  if (!name) return 'variable'

  if (action === 'set') {
    return value ? `${name} = ${shortenPath(value, 40)}` : name
  }

  if (action === 'append') {
    if (name === 'workdir') return value ? `workdir root ${shortenPath(value, 35)}` : 'workdir root'
    return value ? `${name} += ${truncate(value, 35)}` : name
  }

  if (action === 'remove') {
    if (name === 'workdir') return value ? `workdir root ${shortenPath(value, 35)}` : 'workdir root'
    return value ? `${name} -= ${truncate(value, 35)}` : name
  }

  if (action === 'delete') return name

  return name
}

function hostFor(value: string): string {
  if (!value) return ''
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return truncate(value, 45)
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

/** Detect absolute paths in a text block and shorten them to their base segments. */
export function shortenPathsInText(text: string): string {
  if (!text) return ''
  // Unix absolute path regex: matches / followed by segments, checking it looks like a path (at least 2 slashes)
  let result = text.replace(/(?:\/[a-zA-Z0-9_\-\.\+]+){2,}/g, (match) => {
    return shortenPath(match, 35)
  })
  // Windows absolute path regex: matches C:\... or similar
  result = result.replace(/(?:[a-zA-Z]:\\(?:[a-zA-Z0-9_\-\.\+]+\\)*[a-zA-Z0-9_\-\.\+]+)/g, (match) => {
    return shortenPath(match, 35)
  })
  return result
}
