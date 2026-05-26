const SENTENCE_END_RE = /[.!?。！？]+["'”’)]*\s*$/
const HARD_END_CHAR_RE = /[.!?。！？]/
const SOFT_END_CHAR_RE = /[,，;；、]/

export interface SentenceSegmentationResult {
  ready: string[]
  remainder: string
}

export interface SentenceSegmentationOptions {
  force?: boolean
  lowLatency?: boolean
  minSoftChars?: number
  maxChars?: number
}

export function splitSpeakableSentences(
  input: string,
  options: boolean | SentenceSegmentationOptions = false,
): SentenceSegmentationResult {
  const normalizedOptions = typeof options === 'boolean' ? { force: options } : options
  const force = Boolean(normalizedOptions.force)
  const lowLatency = Boolean(normalizedOptions.lowLatency)
  const minSoftChars = Math.max(4, normalizedOptions.minSoftChars ?? 12)
  const maxChars = Math.max(minSoftChars, normalizedOptions.maxChars ?? 96)
  const text = input.replace(/\s+/g, ' ')
  const ready: string[] = []
  let start = 0

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (HARD_END_CHAR_RE.test(char)) {
      let end = i + 1
      while (end < text.length && /["'”’)]/.test(text[end])) end += 1
      const candidate = text.slice(start, end).trim()
      if (candidate.length >= 2 && SENTENCE_END_RE.test(candidate)) {
        ready.push(candidate)
        start = end
      }
      continue
    }

    if (lowLatency && SOFT_END_CHAR_RE.test(char)) {
      const end = i + 1
      const candidate = text.slice(start, end).trim()
      if (candidate.length >= minSoftChars) {
        ready.push(candidate)
        start = end
      }
    }
  }

  let remainder = text.slice(start).trimStart()
  if (lowLatency) {
    while (remainder.length >= maxChars) {
      const breakIndex = findLowLatencyBreak(remainder, minSoftChars, maxChars)
      ready.push(remainder.slice(0, breakIndex).trim())
      remainder = remainder.slice(breakIndex).trimStart()
    }
  }

  if (force && remainder.trim()) {
    ready.push(remainder.trim())
    return { ready, remainder: '' }
  }
  return { ready, remainder }
}

function findLowLatencyBreak(text: string, minChars: number, maxChars: number): number {
  const window = text.slice(0, maxChars)
  for (let index = window.length - 1; index >= minChars; index -= 1) {
    if (/[\s,，;；、]/.test(window[index])) return index + 1
  }
  return maxChars
}
