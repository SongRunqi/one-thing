import { createTwoFilesPatch } from 'diff'

export interface ExactEdit {
  oldText: string
  newText: string
}

export interface ExactEditApplyResult {
  baseContent: string
  newContent: string
}

export interface ExactEditPreviewResult extends ExactEditApplyResult {
  finalContent: string
  diff: string
  bom: string
  lineEnding: '\r\n' | '\n'
}

interface MatchedEdit {
  editIndex: number
  matchIndex: number
  matchLength: number
  newText: string
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

function countExactOccurrences(content: string, oldText: string): number {
  if (!oldText) return 0
  let count = 0
  let index = 0
  while (true) {
    const next = content.indexOf(oldText, index)
    if (next === -1) return count
    count++
    index = next + oldText.length
  }
}

function getEmptyOldTextError(filePath: string, editIndex: number, totalEdits: number): Error {
  return totalEdits === 1
    ? new Error(`oldText must not be empty in ${filePath}.`)
    : new Error(`edits[${editIndex}].oldText must not be empty in ${filePath}.`)
}

function getNotFoundError(filePath: string, editIndex: number, totalEdits: number): Error {
  return totalEdits === 1
    ? new Error(`Could not find the exact text in ${filePath}. The oldText must match exactly including whitespace and newlines.`)
    : new Error(`Could not find edits[${editIndex}] in ${filePath}. The oldText must match exactly including whitespace and newlines.`)
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
    const occurrences = countExactOccurrences(normalizedContent, edit.oldText)
    if (occurrences === 0) {
      throw getNotFoundError(filePath, i, normalizedEdits.length)
    }
    if (occurrences > 1) {
      throw getDuplicateError(filePath, i, normalizedEdits.length, occurrences)
    }

    matchedEdits.push({
      editIndex: i,
      matchIndex: normalizedContent.indexOf(edit.oldText),
      matchLength: edit.oldText.length,
      newText: edit.newText,
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

export function previewExactEdits(rawContent: string, edits: ExactEdit[], filePath: string): ExactEditPreviewResult {
  const { bom, text } = stripBom(rawContent)
  const lineEnding = detectLineEnding(text)
  const normalizedContent = normalizeToLF(text)
  const { baseContent, newContent } = applyExactEditsToNormalizedContent(normalizedContent, edits, filePath)
  const finalContent = bom + restoreLineEndings(newContent, lineEnding)
  const diff = createTwoFilesPatch(filePath, filePath, baseContent, newContent)
  return { baseContent, newContent, finalContent, diff, bom, lineEnding }
}
