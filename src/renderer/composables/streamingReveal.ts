export interface StreamingRevealOptions {
  unitsPerSecond?: number
  minUnitsPerFrame?: number
  maxUnitsPerFrame?: number
  maxCharsPerFrame?: number
  maxNewlinesPerFrame?: number
  reducedMotion?: boolean
}

export interface StreamingRevealState {
  content: string
}

export interface StreamingRevealAdvance {
  content: string
  done: boolean
  replaced: boolean
  unitsRevealed: number
}

const DEFAULT_UNITS_PER_SECOND = 42
const DEFAULT_MIN_UNITS_PER_FRAME = 2
const DEFAULT_MAX_UNITS_PER_FRAME = 14
const DEFAULT_MAX_CHARS_PER_FRAME = 180
const DEFAULT_MAX_NEWLINES_PER_FRAME = 1

interface RevealUnit {
  start: number
  end: number
}

type SegmenterCtor = new (
  locales?: string | string[],
  options?: { granularity?: 'grapheme' | 'word' | 'sentence' },
) => {
  segment(input: string): Iterable<{
    segment: string
    index: number
    isWordLike?: boolean
  }>
}

function getSegmenter(): SegmenterCtor | null {
  return (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter ?? null
}

function isWordLike(text: string, hinted?: boolean): boolean {
  return hinted === true || /[\p{L}\p{N}\p{Script=Han}]/u.test(text)
}

function buildIntlRevealUnits(content: string): RevealUnit[] {
  const Segmenter = getSegmenter()
  if (!Segmenter) return []

  const rawSegments = Array.from(new Segmenter(undefined, { granularity: 'word' }).segment(content))
  const units: RevealUnit[] = []

  for (let i = 0; i < rawSegments.length; i += 1) {
    const seg = rawSegments[i]
    if (!isWordLike(seg.segment, seg.isWordLike)) continue

    let end = seg.index + seg.segment.length
    let j = i + 1
    while (j < rawSegments.length) {
      const next = rawSegments[j]
      if (isWordLike(next.segment, next.isWordLike)) break
      end = next.index + next.segment.length
      j += 1
      if (next.segment.includes('\n')) break
    }

    units.push({ start: seg.index, end })
  }

  return units
}

function buildFallbackRevealUnits(content: string): RevealUnit[] {
  const units: RevealUnit[] = []
  const re = /[\p{Script=Han}]|[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}\p{Script=Han}]+|\s+/gu
  const tokens = Array.from(content.matchAll(re), match => ({
    text: match[0],
    index: match.index ?? 0,
  }))

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (!isWordLike(token.text)) continue

    let end = token.index + token.text.length
    let j = i + 1
    while (j < tokens.length && !isWordLike(tokens[j].text)) {
      end = tokens[j].index + tokens[j].text.length
      if (tokens[j].text.includes('\n')) break
      j += 1
    }
    units.push({ start: token.index, end })
  }

  return units
}

export function getStreamingRevealUnits(content: string): RevealUnit[] {
  const intlUnits = buildIntlRevealUnits(content)
  return intlUnits.length > 0 ? intlUnits : buildFallbackRevealUnits(content)
}

function findCurrentUnitIndex(units: RevealUnit[], currentLength: number): number {
  let index = 0
  while (index < units.length && units[index].end <= currentLength) index += 1
  return index
}

function countNewlines(value: string): number {
  let count = 0
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) === 10) count += 1
  }
  return count
}

export function advanceStreamingReveal(
  current: string | StreamingRevealState,
  target: string,
  elapsedMs: number,
  options: StreamingRevealOptions = {},
): StreamingRevealAdvance {
  const currentContent = typeof current === 'string' ? current : current.content
  if (currentContent === target) {
    return { content: currentContent, done: true, replaced: false, unitsRevealed: 0 }
  }
  if (!target.startsWith(currentContent)) {
    return { content: target, done: true, replaced: true, unitsRevealed: 0 }
  }

  const remaining = target.length - currentContent.length
  if (remaining <= 0) {
    return { content: target, done: true, replaced: false, unitsRevealed: 0 }
  }

  const units = getStreamingRevealUnits(target)
  if (units.length === 0) {
    return { content: target, done: true, replaced: false, unitsRevealed: 1 }
  }

  const reducedMotion = options.reducedMotion === true
  const unitsPerSecond = options.unitsPerSecond ?? DEFAULT_UNITS_PER_SECOND
  const minUnits = options.minUnitsPerFrame ?? DEFAULT_MIN_UNITS_PER_FRAME
  const maxUnits = options.maxUnitsPerFrame ?? DEFAULT_MAX_UNITS_PER_FRAME
  const maxChars = options.maxCharsPerFrame ?? DEFAULT_MAX_CHARS_PER_FRAME
  const maxNewlines = options.maxNewlinesPerFrame ?? DEFAULT_MAX_NEWLINES_PER_FRAME

  const timeBudget = Math.ceil(unitsPerSecond * Math.max(1, elapsedMs) / 1000)
  const adaptiveBudget = Math.ceil(units.length * 0.015)
  let unitBudget = Math.max(minUnits, timeBudget, adaptiveBudget)
  unitBudget = Math.min(reducedMotion ? maxUnits * 4 : maxUnits, unitBudget)

  const currentUnitIndex = findCurrentUnitIndex(units, currentContent.length)
  let nextUnitIndex = Math.min(units.length - 1, currentUnitIndex + unitBudget - 1)
  let nextLength = Math.max(currentContent.length + 1, units[nextUnitIndex]?.end ?? target.length)
  let revealedUnits = Math.max(1, nextUnitIndex - currentUnitIndex + 1)
  const charBudget = reducedMotion ? maxChars * 4 : maxChars
  if (nextLength - currentContent.length > charBudget) {
    nextLength = currentContent.length + charBudget
    revealedUnits = 1
  }

  while (
    nextUnitIndex > currentUnitIndex &&
    countNewlines(target.slice(currentContent.length, nextLength)) > maxNewlines
  ) {
    nextUnitIndex -= 1
    nextLength = units[nextUnitIndex].end
    revealedUnits = Math.max(1, nextUnitIndex - currentUnitIndex + 1)
  }

  if (nextLength >= target.length || reducedMotion && remaining <= 4096) {
    return { content: target, done: true, replaced: false, unitsRevealed: revealedUnits }
  }

  return {
    content: target.slice(0, nextLength),
    done: false,
    replaced: false,
    unitsRevealed: revealedUnits,
  }
}
