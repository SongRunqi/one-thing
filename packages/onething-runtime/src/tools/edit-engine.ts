import { createTwoFilesPatch } from 'diff'

export interface ExactEdit {
  oldText: string
  newText: string
  replaceAll?: boolean
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

function characterBigrams(text: string): Set<string> {
  const grams = new Set<string>()
  for (let i = 0; i < text.length - 1; i++) grams.add(text.slice(i, i + 2))
  return grams
}

function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const gramsA = characterBigrams(a)
  const gramsB = characterBigrams(b)
  let shared = 0
  for (const gram of gramsA) if (gramsB.has(gram)) shared++
  return (2 * shared) / (gramsA.size + gramsB.size)
}

const CLOSEST_MATCH_MIN_SCORE = 0.4
const CLOSEST_MATCH_MAX_SNIPPET_CHARS = 2400

/**
 * When oldText matches nothing, locate the region of the file that most
 * resembles it and return a line-numbered snippet. The failure message then
 * carries the *current* text of the likely target, so the model can retry
 * with real content instead of guessing again from stale memory (the
 * observed failure spiral: stale oldText → edit fails → bash/python fallback
 * → file drifts further).
 */
export function findClosestRegionSnippet(content: string, oldText: string): string | null {
  const contentLines = content.split('\n')
  const anchorLines = normalizeToLF(oldText)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length >= 4)
    .slice(0, 5)
  if (anchorLines.length === 0) return null

  let bestScore = 0
  let bestLine = -1
  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i].trim()
    if (!line) continue
    for (const anchor of anchorLines) {
      let score: number
      if (line === anchor) score = 1
      else if (line.includes(anchor) || anchor.includes(line)) score = 0.9
      else score = diceSimilarity(line, anchor)
      if (score > bestScore) {
        bestScore = score
        bestLine = i
      }
    }
    if (bestScore === 1) break
  }
  if (bestLine === -1 || bestScore < CLOSEST_MATCH_MIN_SCORE) return null

  const halfWindow = Math.min(12, Math.max(4, Math.ceil(oldText.split('\n').length / 2) + 2))
  const start = Math.max(0, bestLine - halfWindow)
  const end = Math.min(contentLines.length, bestLine + halfWindow + 1)
  const numbered: string[] = []
  for (let i = start; i < end; i++) numbered.push(`${i + 1}→${contentLines[i]}`)
  let snippet = numbered.join('\n')
  if (snippet.length > CLOSEST_MATCH_MAX_SNIPPET_CHARS) {
    snippet = `${snippet.slice(0, CLOSEST_MATCH_MAX_SNIPPET_CHARS)}\n…`
  }
  return `Closest match in the current file (lines ${start + 1}-${end}):\n${snippet}`
}

function getNotFoundError(
  filePath: string,
  editIndex: number,
  totalEdits: number,
  content?: string,
  oldText?: string,
): Error {
  const base = totalEdits === 1
    ? `Could not find the target text in ${filePath}. Tried exact matching and a single unique indentation-insensitive whole-line match. Re-read the current file and include a larger unique block.`
    : `Could not find edits[${editIndex}] in ${filePath}. Tried exact matching and a single unique indentation-insensitive whole-line match. Re-read the current file and include a larger unique block.`
  const snippet = content !== undefined && oldText !== undefined
    ? findClosestRegionSnippet(content, oldText)
    : null
  return new Error(snippet ? `${base}\n${snippet}` : base)
}

function getDuplicateError(filePath: string, editIndex: number, totalEdits: number, occurrences: number): Error {
  const hint = 'Provide more context to make it unique, or set replaceAll: true on this edit to replace every occurrence.'
  return totalEdits === 1
    ? new Error(`Found ${occurrences} occurrences of the text in ${filePath}. The text must be unique. ${hint}`)
    : new Error(`Found ${occurrences} occurrences of edits[${editIndex}] in ${filePath}. Each oldText must be unique. ${hint}`)
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
 * oldText values must be non-empty and non-overlapping. An oldText must occur
 * exactly once unless the edit sets replaceAll, in which case every occurrence
 * is replaced.
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
    replaceAll: edit.replaceAll === true,
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
      throw getNotFoundError(filePath, i, normalizedEdits.length, normalizedContent, edit.oldText)
    }
    if (matches.length > 1 && !edit.replaceAll) {
      throw getDuplicateError(filePath, i, normalizedEdits.length, matches.length)
    }

    for (const match of matches) {
      matchedEdits.push({
        editIndex: i,
        matchIndex: match.matchIndex,
        matchLength: match.matchLength,
        newText: match.strategy === 'line-trim'
          ? applyMatchedIndent(edit.newText, edit.oldText, match.matchedText)
          : edit.newText,
      })
    }
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
