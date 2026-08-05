/**
 * Single-line preview text for a tool call row. Used by `StepsPanel`
 * for both Step-backed calls and streaming calls that have not produced
 * a Step yet.
 */

import type { ToolCall } from '@/types'

const STREAMING_TAIL_MAX = 80
const BASH_PREVIEW_MAX = 96
const PATTERN_PREVIEW_MAX = 20
/** 未知工具兜底摘要的上限。折叠行只有一行,再长也读不完。 */
const GENERIC_PREVIEW_MAX = 60
/** 提问题干的上限 —— 比泛化那格宽:题干是这一行存在的全部理由。 */
const ASK_QUESTION_PREVIEW_MAX = 72

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
      return path
    }

    case 'write': {
      const path = basename(pathArg(args))
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

    case 'todo':
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

    /**
     * AskUserQuestion —— 外部 agent 的提问工具(E1 起是一等交互概念)。
     *
     * 它是 `[object Object]` 那条 bug 的原始现场:args 是 `{questions:[{...}]}`,
     * 泛化兜底的 `String(第一个值)` 拿到的是一个对象数组。折叠行上该看见的是
     * **第一题的题干** —— 那才是「它在等我答什么」这个问题的答案;多题时补一个
     * 计数,因为「还有几题」决定了要不要展开。
     */
    case 'askuserquestion': {
      return formatAskUserQuestionPreview(args)
    }

    default: {
      // Generic fallback: prefer file path > pattern > command > first value
      const rawPath = pathArg(args)
      if (rawPath) {
        return basename(String(rawPath))
      }
      if (args.pattern) return `"${args.pattern}"`
      if (args.command || args.CommandLine) return truncate(shortenPathsInText(String(args.command || args.CommandLine)), BASH_PREVIEW_MAX)
      return firstArgSummary(args)
    }
  }
}

/**
 * 未知工具的第一格参数摘要(G5)。
 *
 * 从前这里是 `String(Object.values(args)[0])` —— 对标量没问题,对**对象或数组**
 * 就直接印出 `[object Object]`。那不是一个不好看的字符串,而是一格**假信息**:
 * 折叠行看上去像是渲染坏了,于是没人会想到去展开它(详情面用的是
 * `JSON.stringify`,一直是对的 —— 坏的只有这一行标题)。
 *
 * 修法是给结构化值一句**可读概要**而不是它的类型名:数组给长度、对象给键名。
 * 不改成 `JSON.stringify`:折叠行只有一行,一份被截断的 JSON 比一句概要更难读,
 * 而且真要看全文本来就该展开。
 */
function firstArgSummary(args: Record<string, unknown>): string {
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue
    const summary = describeArgValue(value)
    if (!summary) continue
    // 标量照旧只印值(`read` 之外的绝大多数工具都是这一支,行为逐字不变);
    // 结构化值带上键名 —— 没有它,「3 项」是一句谁都看不懂的话。
    return isScalar(value) ? summary : `${key}: ${summary}`
  }
  return ''
}

function isScalar(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

/** 一个参数值的一行概要。空数组 / 空对象返回空串(交给下一个键)。 */
function describeArgValue(value: unknown): string {
  if (isScalar(value)) return truncate(String(value), GENERIC_PREVIEW_MAX)
  if (Array.isArray(value)) {
    if (value.length === 0) return ''
    // 全标量的短数组直接列出来 —— `["a","b"]` 印成「2 项」是没必要的信息损失。
    if (value.every(isScalar)) {
      return truncate(value.map(item => String(item)).join(', '), GENERIC_PREVIEW_MAX)
    }
    return `${value.length} 项`
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>)
    if (keys.length === 0) return ''
    return truncate(`{${keys.join(', ')}}`, GENERIC_PREVIEW_MAX)
  }
  return ''
}

/** `AskUserQuestion` 的 args 形状(SDK `AskUserQuestionInput`,E1 逐字对齐)。 */
interface AskUserQuestionLike {
  question?: unknown
  header?: unknown
}

function formatAskUserQuestionPreview(args: Record<string, unknown>): string {
  const raw = args.questions
  const questions = Array.isArray(raw) ? raw : []
  const first = questions.find(
    (item): item is AskUserQuestionLike => typeof item === 'object' && item !== null,
  )
  const title = typeof first?.question === 'string' && first.question.trim()
    ? first.question.trim()
    : typeof first?.header === 'string' && first.header.trim()
      ? first.header.trim()
      : ''
  // 一个字都读不出来时不要退回泛化兜底:那条路会把 questions 数组印回
  // `questions: N 项`,而「在提问」这件事本身比参数结构更值得占这一行。
  if (!title) return questions.length > 1 ? `${questions.length} 个问题` : '提问'
  const head = truncate(title, ASK_QUESTION_PREVIEW_MAX)
  return questions.length > 1 ? `${head} (+${questions.length - 1})` : head
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
