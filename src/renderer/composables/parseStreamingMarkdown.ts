/**
 * Parse a (possibly incomplete, still-streaming) markdown string into a
 * sequence of segments. Fenced code blocks are split out as their own
 * segments so each one can be rendered by a stable Vue component —
 * preserving horizontal scroll, text selection, and copy-button state
 * across re-renders while new tokens arrive.
 *
 * Non-code portions are emitted as raw markdown strings (still containing
 * inline code, lists, tables, etc.) and rendered by markdown-it as usual.
 *
 * A trailing fenced block with no closing fence yet is emitted with
 * `complete: false` so the UI can style it or defer highlighting.
 */

export type MarkdownSegment =
  | { type: 'markdown'; key: string; content: string; complete: boolean }
  | { type: 'table'; key: string; content: string; complete: boolean }
  | { type: 'code'; key: string; lang: string; content: string; complete: boolean }

// Open fence matcher:
//   group 1: the preceding newline (or empty at string start)
//   group 2: the fence chars (``` or ~~~)
//   group 3: the info string (language). May be empty.
// The fence must be followed by either a newline or end-of-string (streaming).
const FENCE_OPEN = /(^|\n)(```|~~~)[ \t]*([^\n`~]*?)[ \t]*(?:\n|$)/
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/

function trimStreamingCodeTail(codeContent: string, fenceChars: string): string {
  const lastNewline = codeContent.lastIndexOf('\n')
  if (lastNewline === -1) return codeContent

  const trailingLine = codeContent.slice(lastNewline + 1)
  const fenceChar = fenceChars[0]
  const escapedFenceChar = fenceChar === '`' ? '\\`' : '\\~'
  const partialClose = new RegExp(`^[ \\t]*${escapedFenceChar}{1,${fenceChars.length - 1}}[ \\t]*$`)

  // While the model is still typing the closing fence, avoid rendering the
  // partial line as code. Otherwise the block grows by one line for ` / ``
  // and immediately shrinks again once ``` is recognized as the terminator.
  return partialClose.test(trailingLine)
    ? codeContent.slice(0, lastNewline)
    : codeContent.replace(/\n[ \t\n]*$/, '')
}

function trimPartialOpeningFence(markdownContent: string): string {
  const lastNewline = markdownContent.lastIndexOf('\n')
  const lineStart = lastNewline === -1 ? 0 : lastNewline + 1
  const trailingLine = markdownContent.slice(lineStart)

  if (/^[ \t]*(`{1,2}|~{1,2})[ \t]*$/.test(trailingLine)) {
    return markdownContent.slice(0, lineStart)
  }
  return markdownContent
}

function emitMarkdownSegments(
  segments: MarkdownSegment[],
  rawContent: string,
  start: number,
  complete: boolean,
) {
  const content = complete ? rawContent : trimPartialOpeningFence(rawContent)
  if (!content) return

  if (complete) {
    segments.push({ type: 'markdown', key: `md-${start}`, content, complete })
    return
  }

  const tableStart = findTrailingTableCandidateStart(content)
  if (tableStart === -1) {
    emitStreamingMarkdownSegments(segments, content, start)
    return
  }

  const before = content.slice(0, tableStart)
  const table = content.slice(tableStart)
  if (before) {
    emitStreamingMarkdownSegments(segments, before, start)
  }
  segments.push({ type: 'table', key: `table-${start + tableStart}`, content: table, complete })
}

function emitStreamingMarkdownSegments(
  segments: MarkdownSegment[],
  content: string,
  start: number,
) {
  const splitAt = findStableMarkdownPrefixEnd(content)
  if (splitAt <= 0) {
    segments.push({ type: 'markdown', key: `md-${start}`, content, complete: false })
    return
  }

  const stable = content.slice(0, splitAt)
  const tail = content.slice(splitAt)
  if (stable) {
    segments.push({ type: 'markdown', key: `md-${start}`, content: stable, complete: true })
  }
  if (tail) {
    segments.push({ type: 'markdown', key: `md-${start + splitAt}`, content: tail, complete: false })
  }
}

function findStableMarkdownPrefixEnd(content: string): number {
  const paragraphBreak = content.lastIndexOf('\n\n')
  if (paragraphBreak !== -1) return paragraphBreak + 2

  // Headings are block-level once their line has ended. Splitting completed
  // heading lines keeps repeated H1/H2/H3 output from forcing the whole
  // preceding markdown segment through markdown-it on every streamed token.
  const lastNewline = content.lastIndexOf('\n')
  if (lastNewline <= 0) return -1

  const previousLineStart = content.lastIndexOf('\n', lastNewline - 1) + 1
  const previousLine = content.slice(previousLineStart, lastNewline)
  return /^#{1,6}\s+\S/.test(previousLine) ? lastNewline + 1 : -1
}

function findTrailingTableCandidateStart(content: string): number {
  const lines = content.split('\n')
  let startLine = -1
  let hasSeparator = false

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (!line.trim()) {
      if (startLine !== -1) break
      continue
    }
    if (!line.includes('|')) break
    startLine = i
    if (TABLE_SEPARATOR.test(line)) hasSeparator = true
  }

  if (startLine === -1) return -1

  // A single trailing pipe line is too ambiguous; keep it as markdown until
  // the table starts taking shape. Once a separator appears, hold the whole
  // trailing candidate stable until the final markdown render.
  const candidateLines = lines.slice(startLine).filter(line => line.trim())
  if (candidateLines.length < 2 && !hasSeparator) return -1

  let offset = 0
  for (let i = 0; i < startLine; i++) {
    offset += lines[i].length + 1
  }
  return offset
}

export function parseStreamingMarkdown(content: string, options: { streaming?: boolean } = {}): MarkdownSegment[] {
  const segments: MarkdownSegment[] = []
  let pos = 0

  while (pos < content.length) {
    const rest = content.slice(pos)
    const openMatch = rest.match(FENCE_OPEN)
    if (!openMatch) {
      if (rest.length > 0) {
        emitMarkdownSegments(segments, rest, pos, !(options.streaming ?? false))
      }
      break
    }

    const openPrefix = openMatch[1] // '' or '\n'
    const fenceChars = openMatch[2] // ``` or ~~~
    const lang = (openMatch[3] || 'text').trim() || 'text'

    const fenceRelStart = openMatch.index! + openPrefix.length
    const fenceAbsStart = pos + fenceRelStart
    const afterOpenAbs = pos + openMatch.index! + openMatch[0].length

    // Emit preceding markdown (including the leading newline so block-level
    // structure is preserved).
    if (fenceAbsStart > pos) {
      const before = content.slice(pos, fenceAbsStart)
      emitMarkdownSegments(segments, before, pos, true)
    }

    // Look for a closing fence matching the opener (``` or ~~~).
    // Closing fence must be on its own line: \n<fence>[ \t]* then \n or EOL.
    const closeRegex = new RegExp(`\\n${fenceChars}[ \\t]*(?:\\n|$)`)
    const afterText = content.slice(afterOpenAbs)
    const closeMatch = afterText.match(closeRegex)

    if (closeMatch) {
      const codeEnd = afterOpenAbs + closeMatch.index!
      const codeContent = content.slice(afterOpenAbs, codeEnd)
      segments.push({
        type: 'code',
        key: `code-${fenceAbsStart}`,
        lang,
        content: codeContent,
        complete: true,
      })
      pos = afterOpenAbs + closeMatch.index! + closeMatch[0].length
    } else {
      // Still streaming — no closing fence yet.
      const codeContent = trimStreamingCodeTail(content.slice(afterOpenAbs), fenceChars)
      segments.push({
        type: 'code',
        key: `code-${fenceAbsStart}`,
        lang,
        content: codeContent,
        complete: false,
      })
      pos = content.length
    }
  }

  return segments
}
