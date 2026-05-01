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
  | { type: 'markdown'; key: string; content: string }
  | { type: 'code'; key: string; lang: string; content: string; complete: boolean }

// Open fence matcher:
//   group 1: the preceding newline (or empty at string start)
//   group 2: the fence chars (``` or ~~~)
//   group 3: the info string (language). May be empty.
// The fence must be followed by either a newline or end-of-string (streaming).
const FENCE_OPEN = /(^|\n)(```|~~~)[ \t]*([^\n`~]*?)[ \t]*(?:\n|$)/

export function parseStreamingMarkdown(content: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = []
  let pos = 0

  while (pos < content.length) {
    const rest = content.slice(pos)
    const openMatch = rest.match(FENCE_OPEN)
    if (!openMatch) {
      if (rest.length > 0) {
        segments.push({ type: 'markdown', key: `md-${pos}`, content: rest })
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
      segments.push({ type: 'markdown', key: `md-${pos}`, content: before })
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
      const codeContent = content.slice(afterOpenAbs)
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
