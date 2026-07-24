import type { Node as ProseNode } from 'prosemirror-model'

// Bridges the panel's text-offset world (find bar offsets computed on the
// serialized markdown draft) and ProseMirror positions. The mapping works by
// occurrence matching: locate the target string's occurrence index in the
// draft, then find the same occurrence in the document's flat text.

interface FlatSegment {
  textStart: number
  pmStart: number
  length: number
}

export interface FlatText {
  text: string
  segments: FlatSegment[]
}

export function buildFlatText(doc: ProseNode): FlatText {
  let text = ''
  const segments: FlatSegment[] = []
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      segments.push({ textStart: text.length, pmStart: pos, length: node.text.length })
      text += node.text
      return true
    }
    if (node.isBlock && text.length && !text.endsWith('\n')) {
      text += '\n'
    }
    if (node.type.name === 'math_inline') {
      text += `$${node.attrs.tex}$`
      return false
    }
    if (node.type.name === 'obsidian_link') {
      text += `${node.attrs.embed ? '!' : ''}[[${node.attrs.target}]]`
      return false
    }
    return true
  })
  return { text, segments }
}

export function flatIndexToPmPos(flat: FlatText, index: number): number | null {
  for (const segment of flat.segments) {
    if (index >= segment.textStart && index <= segment.textStart + segment.length) {
      return segment.pmStart + (index - segment.textStart)
    }
  }
  return null
}

export function pmPosToFlatIndex(flat: FlatText, pos: number): number | null {
  for (const segment of flat.segments) {
    if (pos >= segment.pmStart && pos <= segment.pmStart + segment.length) {
      return segment.textStart + (pos - segment.pmStart)
    }
  }
  return null
}

function occurrenceIndex(haystack: string, needle: string, beforeOffset: number): number {
  if (!needle) return 0
  let count = 0
  let cursor = haystack.indexOf(needle)
  while (cursor >= 0 && cursor < beforeOffset) {
    count += 1
    cursor = haystack.indexOf(needle, cursor + 1)
  }
  return count
}

function nthOccurrence(haystack: string, needle: string, n: number): number {
  let cursor = -1
  for (let i = 0; i <= n; i += 1) {
    cursor = haystack.indexOf(needle, cursor + 1)
    if (cursor < 0) return -1
  }
  return cursor
}

// Map a [from, to) range in the serialized draft onto PM positions. Returns
// null when the target text does not exist in the rendered document (e.g. a
// match inside syntax markers).
export function draftRangeToPmRange(
  doc: ProseNode,
  draft: string,
  from: number,
  to: number,
): { from: number, to: number } | null {
  const flat = buildFlatText(doc)
  if (from >= to) {
    // Caret only: anchor on the preceding context, else clamp to the end.
    const context = draft.slice(Math.max(0, from - 12), from)
    if (!context.trim()) return null
    const occurrence = occurrenceIndex(draft, context, Math.max(0, from - 12))
    const flatIndex = nthOccurrence(flat.text, context, occurrence)
    if (flatIndex < 0) return null
    const pos = flatIndexToPmPos(flat, flatIndex + context.length)
    return pos === null ? null : { from: pos, to: pos }
  }
  const target = draft.slice(from, to)
  const occurrence = occurrenceIndex(draft, target, from)
  const flatIndex = nthOccurrence(flat.text, target, occurrence)
  if (flatIndex < 0) return null
  const pmFrom = flatIndexToPmPos(flat, flatIndex)
  const pmTo = flatIndexToPmPos(flat, flatIndex + target.length)
  if (pmFrom === null || pmTo === null) return null
  return { from: pmFrom, to: pmTo }
}

// Reverse: approximate draft offsets for the current PM selection.
export function pmRangeToDraftRange(
  doc: ProseNode,
  draft: string,
  from: number,
  to: number,
): { from: number, to: number } {
  const flat = buildFlatText(doc)
  const flatFrom = pmPosToFlatIndex(flat, from)
  const flatTo = pmPosToFlatIndex(flat, to)
  if (flatFrom === null || flatTo === null) return { from: draft.length, to: draft.length }
  const target = flat.text.slice(flatFrom, flatTo)
  if (target) {
    const occurrence = occurrenceIndex(flat.text, target, flatFrom)
    const draftIndex = nthOccurrence(draft, target, occurrence)
    if (draftIndex >= 0) return { from: draftIndex, to: draftIndex + target.length }
  } else {
    const context = flat.text.slice(Math.max(0, flatFrom - 12), flatFrom)
    if (context.trim()) {
      const occurrence = occurrenceIndex(flat.text, context, Math.max(0, flatFrom - 12))
      const draftIndex = nthOccurrence(draft, context, occurrence)
      if (draftIndex >= 0) {
        const caret = draftIndex + context.length
        return { from: caret, to: caret }
      }
    }
  }
  return { from: draft.length, to: draft.length }
}
