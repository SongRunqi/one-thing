import { createTwoFilesPatch } from 'diff'

export interface ExactEdit {
  oldText: string
  newText: string
}

export interface ExactEditApplyResult {
  baseContent: string
  newContent: string
}

export interface ExactEditPreviewContentResult extends ExactEditApplyResult {
  finalContent: string
  bom: string
  lineEnding: '\r\n' | '\n'
}

export interface ExactEditPreviewResult extends ExactEditPreviewContentResult {
  diff: string
}

interface MatchedEdit {
  editIndex: number
  matchIndex: number
  matchLength: number
  newText: string
}

interface TextMatch {
  matchIndex: number
  matchLength: number
  matchedText: string
  strategy: 'exact' | 'line-trim'
}

export function detectLineEnding(content: string): '\r\n' | '\n' {
  const crlfIdx = content.indexOf('\r\n')
  const lfIdx = content.indexOf('\n')
  if (lfIdx === -1) return '\n'
  if (crlfIdx === -1) return '\n'
  return crlfIdx < lfIdx ? '\r\n' : '\n'
}

export function normalizeToLF(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function restoreLineEndings(text: string, ending: '\r\n' | '\n'): string {
  return ending === '\r\n' ? text.replace(/\n/g, '\r\n') : text
}

export function stripBom(content: string): { bom: string; text: string } {
  return content.startsWith('\uFEFF')
    ? { bom: '\uFEFF', text: content.slice(1) }
    : { bom: '', text: content }
}

function findExactMatches(content: string, oldText: string): TextMatch[] {
  if (!oldText) return []
  const matches: TextMatch[] = []
  let index = 0
  while (true) {
    const next = content.indexOf(oldText, index)
    if (next === -1) return matches
    matches.push({
      matchIndex: next,
      matchLength: oldText.length,
      matchedText: oldText,
      strategy: 'exact',
    })
    index = next + oldText.length
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildLineTrimPattern(oldText: string): RegExp | null {
  const withoutOuterBlankLines = oldText.replace(/^\n+|\n+$/g, '')
  const lines = withoutOuterBlankLines.split('\n')
  if (!lines.some(line => line.trim())) return null

  const linePatterns = lines.map(line => {
    const trimmed = line.trim()
    return trimmed ? `[ \\t]*${escapeRegExp(trimmed)}[ \\t]*` : '[ \\t]*'
  })

  return new RegExp(`^${linePatterns.join('\\n')}(?=\\n|$)`, 'gm')
}

function findLineTrimMatches(content: string, oldText: string): TextMatch[] {
  const pattern = buildLineTrimPattern(oldText)
  if (!pattern) return []

  const matches: TextMatch[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content)) !== null) {
    if (match[0].length === 0) {
      pattern.lastIndex++
      continue
    }
    matches.push({
      matchIndex: match.index,
      matchLength: match[0].length,
      matchedText: match[0],
      strategy: 'line-trim',
    })
  }
  return matches
}

function firstNonEmptyIndent(text: string): string {
  const line = text.split('\n').find(item => item.trim().length > 0)
  return line?.match(/^[ \t]*/)?.[0] ?? ''
}

function applyMatchedIndent(newText: string, oldText: string, matchedText: string): string {
  const oldIndent = firstNonEmptyIndent(oldText)
  const matchedIndent = firstNonEmptyIndent(matchedText)
  const newIndent = firstNonEmptyIndent(newText)

  if (matchedIndent === oldIndent || newIndent === matchedIndent) {
    return newText
  }

  return newText.split('\n').map(line => {
    if (!line.trim()) return line
    if (oldIndent && line.startsWith(oldIndent)) {
      return matchedIndent + line.slice(oldIndent.length)
    }
    if (!oldIndent) {
      return matchedIndent + line
    }
    return matchedIndent + line.trimStart()
  }).join('\n')
}

function findReplacementMatches(content: string, oldText: string): TextMatch[] {
  const exactMatches = findExactMatches(content, oldText)
  return exactMatches.length > 0 ? exactMatches : findLineTrimMatches(content, oldText)
}

function getEmptyOldTextError(filePath: string, editIndex: number, totalEdits: number): Error {
  return totalEdits === 1
    ? new Error(`oldText must not be empty in ${filePath}.`)
    : new Error(`edits[${editIndex}].oldText must not be empty in ${filePath}.`)
}

function getNotFoundError(filePath: string, editIndex: number, totalEdits: number): Error {
  return totalEdits === 1
    ? new Error(`Could not find the target text in ${filePath}. Tried exact matching and a single unique indentation-insensitive whole-line match. Re-read the current file and include a larger unique block.`)
    : new Error(`Could not find edits[${editIndex}] in ${filePath}. Tried exact matching and a single unique indentation-insensitive whole-line match. Re-read the current file and include a larger unique block.`)
}

function getDuplicateError(filePath: string, editIndex: number, totalEdits: number, occurrences: number): Error {
  return totalEdits === 1
    ? new Error(`Found ${occurrences} occurrences of the text in ${filePath}. The text must be unique. Provide more context to make it unique.`)
    : new Error(`Found ${occurrences} occurrences of edits[${editIndex}] in ${filePath}. Each oldText must be unique. Provide more context to make it unique.`)
}

function getNoChangeError(filePath: string, totalEdits: number): Error {
  return totalEdits === 1
    ? new Error(`No changes made to ${filePath}. The replacement produced identical content.`)
    : new Error(`No changes made to ${filePath}. The replacements produced identical content.`)
}

/**
 * Apply one or more exact replacements to LF-normalized content.
 *
 * Each edit is matched against the original content, not incrementally. All
 * oldText values must be non-empty, present exactly once, and non-overlapping.
 */
export function applyExactEditsToNormalizedContent(
  normalizedContent: string,
  edits: ExactEdit[],
  filePath: string,
): ExactEditApplyResult {
  if (!Array.isArray(edits) || edits.length === 0) {
    throw new Error('Edit input is invalid. edits must contain at least one replacement.')
  }

  const normalizedEdits = edits.map(edit => ({
    oldText: normalizeToLF(edit.oldText),
    newText: normalizeToLF(edit.newText),
  }))

  for (let i = 0; i < normalizedEdits.length; i++) {
    if (normalizedEdits[i].oldText.length === 0) {
      throw getEmptyOldTextError(filePath, i, normalizedEdits.length)
    }
  }

  const matchedEdits: MatchedEdit[] = []
  for (let i = 0; i < normalizedEdits.length; i++) {
    const edit = normalizedEdits[i]
    const matches = findReplacementMatches(normalizedContent, edit.oldText)
    if (matches.length === 0) {
      throw getNotFoundError(filePath, i, normalizedEdits.length)
    }
    if (matches.length > 1) {
      throw getDuplicateError(filePath, i, normalizedEdits.length, matches.length)
    }

    const match = matches[0]
    matchedEdits.push({
      editIndex: i,
      matchIndex: match.matchIndex,
      matchLength: match.matchLength,
      newText: match.strategy === 'line-trim'
        ? applyMatchedIndent(edit.newText, edit.oldText, match.matchedText)
        : edit.newText,
    })
  }

  matchedEdits.sort((a, b) => a.matchIndex - b.matchIndex)
  for (let i = 1; i < matchedEdits.length; i++) {
    const previous = matchedEdits[i - 1]
    const current = matchedEdits[i]
    if (previous.matchIndex + previous.matchLength > current.matchIndex) {
      throw new Error(
        `edits[${previous.editIndex}] and edits[${current.editIndex}] overlap in ${filePath}. Merge them into one edit or target disjoint regions.`,
      )
    }
  }

  let newContent = normalizedContent
  for (let i = matchedEdits.length - 1; i >= 0; i--) {
    const edit = matchedEdits[i]
    newContent =
      newContent.slice(0, edit.matchIndex) +
      edit.newText +
      newContent.slice(edit.matchIndex + edit.matchLength)
  }

  if (newContent === normalizedContent) {
    throw getNoChangeError(filePath, normalizedEdits.length)
  }

  return { baseContent: normalizedContent, newContent }
}

export function prepareExactEditPreview(
  rawContent: string,
  edits: ExactEdit[],
  filePath: string,
): ExactEditPreviewContentResult {
  const { bom, text } = stripBom(rawContent)
  const lineEnding = detectLineEnding(text)
  const normalizedContent = normalizeToLF(text)
  const { baseContent, newContent } = applyExactEditsToNormalizedContent(normalizedContent, edits, filePath)
  const finalContent = bom + restoreLineEndings(newContent, lineEnding)
  return { baseContent, newContent, finalContent, bom, lineEnding }
}

export function previewExactEdits(
  rawContent: string,
  edits: ExactEdit[],
  filePath: string,
): ExactEditPreviewResult {
  const preview = prepareExactEditPreview(rawContent, edits, filePath)
  const diff = createTwoFilesPatch(filePath, filePath, preview.baseContent, preview.newContent)
  return { ...preview, diff }
}
