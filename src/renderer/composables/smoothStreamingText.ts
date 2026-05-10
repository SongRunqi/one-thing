export interface SmoothTextOptions {
  charsPerSecond?: number
  minCharsPerFrame?: number
  maxCharsPerFrame?: number
  maxNewlinesPerFrame?: number
}

const DEFAULT_CHARS_PER_SECOND = 1800
const DEFAULT_MIN_CHARS_PER_FRAME = 16
const DEFAULT_MAX_CHARS_PER_FRAME = 96
const DEFAULT_MAX_NEWLINES_PER_FRAME = 1

export function advanceSmoothStreamingText(
  current: string,
  target: string,
  elapsedMs: number,
  options: SmoothTextOptions = {},
): string {
  if (current === target) return current
  if (!target.startsWith(current)) return target

  const remaining = target.length - current.length
  if (remaining <= 0) return target

  const charsPerSecond = options.charsPerSecond ?? DEFAULT_CHARS_PER_SECOND
  const minChars = options.minCharsPerFrame ?? DEFAULT_MIN_CHARS_PER_FRAME
  const maxChars = options.maxCharsPerFrame ?? DEFAULT_MAX_CHARS_PER_FRAME
  const maxNewlines = options.maxNewlinesPerFrame ?? DEFAULT_MAX_NEWLINES_PER_FRAME

  const timeBudget = Math.ceil(charsPerSecond * Math.max(1, elapsedMs) / 1000)
  const adaptiveBudget = Math.ceil(remaining * 0.08)
  let budget = Math.max(minChars, timeBudget, adaptiveBudget)
  budget = Math.min(maxChars, remaining, budget)

  if (budget >= remaining) return target

  let nextLength = current.length + budget
  let newlineCount = 0
  for (let i = current.length; i < nextLength; i++) {
    if (target.charCodeAt(i) !== 10) continue
    newlineCount++
    if (newlineCount >= maxNewlines) {
      nextLength = i + 1
      break
    }
  }

  return target.slice(0, nextLength)
}
