export interface StreamingRevealOptions {
  unitsPerSecond?: number
  minUnitsPerFrame?: number
  maxUnitsPerFrame?: number
  maxCharsPerFrame?: number
  maxNewlinesPerFrame?: number
  catchUpAfterMs?: number
  catchUpRemainingChars?: number
  /**
   * Smoothed gap between upstream content arrivals, in ms (see
   * `createStreamingArrivalTracker`). Present = pace the reveal so the pending
   * backlog is spread across the wait for the next batch instead of being
   * dumped in one or two frames. Absent = no pacing clamp.
   */
  arrivalIntervalMs?: number
  /** How much faster than the arrival rate to drain, so lag never accumulates. */
  pacingCatchUpFactor?: number
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

// --- Adaptive pacing -------------------------------------------------------
// Sources differ by two orders of magnitude in delivery cadence. A native
// provider's SSE arrives every few tens of ms; a batching connector (the
// Claude Code CLI) forwards roughly 1Hz, ~20 chars a shot. The budget rules
// above are frame-based, so the slow source empties its backlog in one or two
// frames and then shows nothing for the rest of the second — the "一顿一顿".
// The pacing clamp below stretches the backlog over the measured gap instead.

/** Weight of the newest gap in the arrival-interval EMA. */
const ARRIVAL_INTERVAL_EMA_ALPHA = 0.3
/**
 * Ceiling on the smoothed interval. A tool call or a model pause produces a
 * multi-second gap; without this cap that gap would be taken as the cadence
 * and the next batch would trickle out over several seconds.
 */
const MAX_ARRIVAL_INTERVAL_MS = 1500
/** Gaps below this are treated as one burst, not as a faster cadence. */
const MIN_ARRIVAL_INTERVAL_MS = 8
/**
 * Drain slightly faster than the source fills, so the reveal finishes just
 * before the next batch lands rather than lagging a batch behind forever.
 */
const DEFAULT_PACING_CATCH_UP_FACTOR = 1.35
/**
 * Floor on the paced rate. The backlog term alone is Zeno-slow at the tail —
 * it re-divides an ever smaller remainder by the same interval, so the last
 * unit of a batch would wait most of a second and every message would end on
 * a crawl. This floor bounds the tail without touching the fast path (at a
 * 16ms frame it contributes nothing).
 */
const PACING_MIN_UNITS_PER_SECOND = 8

export interface StreamingArrivalTracker {
  /** Record an upstream content arrival at `nowMs`. */
  record(nowMs: number): void
  /** Forget the measured cadence (stream ended, content replaced, …). */
  reset(): void
  /** Smoothed gap between arrivals, or undefined until two have been seen. */
  readonly intervalMs: number | undefined
}

export function createStreamingArrivalTracker(): StreamingArrivalTracker {
  // Undefined, not 0: a timestamp is a valid 0 and must still count as
  // "seen", or the first gap is silently dropped.
  let lastArrivalMs: number | undefined
  let smoothed: number | undefined

  return {
    record(nowMs: number) {
      if (lastArrivalMs !== undefined) {
        const gap = Math.min(
          MAX_ARRIVAL_INTERVAL_MS,
          Math.max(MIN_ARRIVAL_INTERVAL_MS, nowMs - lastArrivalMs),
        )
        smoothed = smoothed === undefined
          ? gap
          : smoothed * (1 - ARRIVAL_INTERVAL_EMA_ALPHA) + gap * ARRIVAL_INTERVAL_EMA_ALPHA
      }
      lastArrivalMs = nowMs
    },
    reset() {
      lastArrivalMs = undefined
      smoothed = undefined
    },
    get intervalMs() {
      return smoothed
    },
  }
}

/**
 * Units this frame may reveal so that `pendingUnits` spreads evenly over
 * `arrivalIntervalMs`. Returns 0 when the pace is slower than one unit per
 * frame — the caller then reveals nothing and lets `elapsedMs` keep growing
 * until a whole unit is due.
 *
 * Fast sources are untouched by construction: they arrive about once per
 * frame, so `elapsedMs ≈ arrivalIntervalMs` and the budget lands at
 * `pendingUnits * factor` — above the whole backlog, hence never binding.
 */
export function pacedRevealUnitBudget(input: {
  pendingUnits: number
  elapsedMs: number
  arrivalIntervalMs: number
  catchUpFactor?: number
}): number {
  const { pendingUnits, elapsedMs, arrivalIntervalMs } = input
  if (arrivalIntervalMs <= 0 || pendingUnits <= 0) return pendingUnits
  const factor = input.catchUpFactor ?? DEFAULT_PACING_CATCH_UP_FACTOR
  const elapsed = Math.max(1, elapsedMs)
  const fromBacklog = Math.floor(pendingUnits * elapsed * factor / arrivalIntervalMs)
  const fromFloor = Math.floor(PACING_MIN_UNITS_PER_SECOND * elapsed / 1000)
  return Math.max(fromBacklog, fromFloor)
}

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
  if (
    options.catchUpAfterMs !== undefined &&
    elapsedMs >= options.catchUpAfterMs &&
    remaining >= (options.catchUpRemainingChars ?? 0)
  ) {
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

  // Pace against the measured source cadence. Reduced motion opts out — it
  // asks for less animation, not for a slower one.
  if (options.arrivalIntervalMs !== undefined && !reducedMotion) {
    const paced = pacedRevealUnitBudget({
      pendingUnits: Math.max(1, units.length - currentUnitIndex),
      elapsedMs,
      arrivalIntervalMs: options.arrivalIntervalMs,
      ...(options.pacingCatchUpFactor !== undefined
        ? { catchUpFactor: options.pacingCatchUpFactor }
        : {}),
    })
    // Below one unit per frame: hold this frame. The caller must keep the
    // clock running (not reset it) so `elapsedMs` accumulates toward the
    // next whole unit — that is what makes a 1Hz source come out evenly
    // instead of in a burst.
    if (paced < 1) {
      return { content: currentContent, done: false, replaced: false, unitsRevealed: 0 }
    }
    unitBudget = Math.min(unitBudget, paced)
  }
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
