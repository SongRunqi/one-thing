import type { DiffHunk, DiffHunkLine } from '@/types'

/**
 * Structured-diff helpers for display.
 *
 * New tool calls carry structured hunks end-to-end (toolCall.changes.hunks),
 * so nothing here re-derives them. This module exists for the legacy path:
 * sessions persisted before hunks existed only have unified-diff text, which
 * is ambiguous to pattern-based parsers — a deleted line whose content starts
 * with `--` (Lua/SQL/Haskell comments) serializes as `--- …` and reads as a
 * file header. The parser below is count-based instead: after a `@@` header
 * it consumes exactly the declared number of body lines, the way git itself
 * parses patches, so body content can never be mistaken for structure.
 */

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
const LEGACY_TRUNCATION_MARKER = '[... diff truncated'

export interface ParsedUnifiedDiff {
  fileName?: string
  hunks: DiffHunk[]
}

export function parseUnifiedDiffToHunks(text: string): ParsedUnifiedDiff {
  const lines = text.split('\n')
  const hunks: DiffHunk[] = []
  let fileName: string | undefined

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const header = line.match(HUNK_HEADER)
    if (!header) {
      // Between-hunk region: only file headers and metadata live here. Body
      // lines can never reach this branch — they are consumed by count below.
      if (fileName === undefined && line.startsWith('+++ ')) {
        fileName = cleanHeaderFileName(line.slice(4))
      }
      i += 1
      continue
    }

    const oldStart = parseInt(header[1], 10)
    const oldLines = header[2] !== undefined ? parseInt(header[2], 10) : 1
    const newStart = parseInt(header[3], 10)
    const newLines = header[4] !== undefined ? parseInt(header[4], 10) : 1
    i += 1

    const hunkLines: DiffHunkLine[] = []
    let remainingOld = oldLines
    let remainingNew = newLines
    while (i < lines.length && (remainingOld > 0 || remainingNew > 0)) {
      const raw = lines[i]
      if (raw.startsWith(LEGACY_TRUNCATION_MARKER)) break
      const prefix = raw[0]
      if (prefix === '\\') {
        hunkLines.push({ op: 'noeof', text: '' })
      } else if (prefix === '+') {
        hunkLines.push({ op: 'add', text: raw.slice(1) })
        remainingNew -= 1
      } else if (prefix === '-') {
        hunkLines.push({ op: 'del', text: raw.slice(1) })
        remainingOld -= 1
      } else {
        // ' ' context; a bare empty line (some producers drop the space) also
        // counts on both sides.
        hunkLines.push({ op: 'ctx', text: raw.slice(1) })
        remainingOld -= 1
        remainingNew -= 1
      }
      i += 1
    }
    // A no-newline marker for the very last body line sits after the counts.
    if (i < lines.length && lines[i]?.startsWith('\\')) {
      hunkLines.push({ op: 'noeof', text: '' })
      i += 1
    }

    hunks.push({ oldStart, oldLines, newStart, newLines, lines: hunkLines })
  }

  return { fileName, hunks }
}

function cleanHeaderFileName(value: string): string | undefined {
  const name = value.split('\t')[0].trim()
  if (!name || name === '/dev/null') return undefined
  return name.replace(/^[ab]\//, '')
}

const HUNK_LINE_OPS = new Set(['ctx', 'add', 'del', 'noeof'])

/** Validating reader for hunks parsed out of step-result JSON. */
export function diffHunksFromUnknown(value: unknown): DiffHunk[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const hunks: DiffHunk[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined
    const { oldStart, oldLines, newStart, newLines, lines } = entry as Record<string, unknown>
    if (
      typeof oldStart !== 'number' || typeof oldLines !== 'number'
      || typeof newStart !== 'number' || typeof newLines !== 'number'
      || !Array.isArray(lines)
    ) return undefined
    const parsedLines: DiffHunkLine[] = []
    for (const line of lines) {
      if (!line || typeof line !== 'object' || Array.isArray(line)) return undefined
      const { op, text } = line as Record<string, unknown>
      if (typeof op !== 'string' || !HUNK_LINE_OPS.has(op) || typeof text !== 'string') return undefined
      parsedLines.push({ op: op as DiffHunkLine['op'], text })
    }
    hunks.push({ oldStart, oldLines, newStart, newLines, lines: parsedLines })
  }
  return hunks
}

export function diffHunksHaveChanges(hunks: DiffHunk[] | undefined): boolean {
  return Boolean(hunks?.some(hunk => hunk.lines.some(line => line.op === 'add' || line.op === 'del')))
}
