import { cleanReasoningContent } from '@/composables/useMarkdownRenderer'

export const INLINE_REASONING_SUMMARY_MAX = 88

// True when the cleaned reasoning text contains at least one letter, digit,
// or CJK character — pure punctuation/whitespace blocks stay hidden.
export function hasVisibleReasoningContent(content: string): boolean {
  const cleaned = cleanReasoningContent(content)
  if (!cleaned) return false
  return /[\p{L}\p{N}\p{Script=Han}]/u.test(cleaned)
}

// Collapse a reasoning block into a single-line header summary: strip
// markdown structure, keep the first sentence, cap the length.
export function summarizeReasoningContent(content: string): string {
  const cleaned = cleanReasoningContent(content)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/\r\n/g, '\n')

  const lines = cleaned
    .split('\n')
    .map(line => line
      .replace(/^\s{0,3}(?:#{1,6}|[-*+]|>\s*|\d+[.)])\s+/u, '')
      .trim())
    .filter(line => hasVisibleReasoningContent(line))

  const source = lines.join(' ').replace(/\s+/g, ' ').trim()
  if (!source) return ''

  const boundary = source.search(/[.!?。！？]/u)
  const sentence = boundary >= 8 ? source.slice(0, boundary + 1) : source
  return truncateReasoningSummary(sentence)
}

function truncateReasoningSummary(value: string): string {
  if (value.length <= INLINE_REASONING_SUMMARY_MAX) return value
  return `${value.slice(0, INLINE_REASONING_SUMMARY_MAX - 3).trimEnd()}...`
}
