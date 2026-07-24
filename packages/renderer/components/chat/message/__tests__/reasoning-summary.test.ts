import { describe, it, expect } from 'vitest'
import {
  hasVisibleReasoningContent,
  summarizeReasoningContent,
  INLINE_REASONING_SUMMARY_MAX,
} from '../reasoning-summary'

describe('hasVisibleReasoningContent', () => {
  it('accepts latin, digits, and CJK text', () => {
    expect(hasVisibleReasoningContent('check the diff')).toBe(true)
    expect(hasVisibleReasoningContent('第 3 步')).toBe(true)
  })

  it('rejects empty and punctuation-only content', () => {
    expect(hasVisibleReasoningContent('')).toBe(false)
    expect(hasVisibleReasoningContent('...---___')).toBe(false)
    expect(hasVisibleReasoningContent('   \n\n  ')).toBe(false)
  })

  it('rejects content that is empty after <think> tag cleanup', () => {
    expect(hasVisibleReasoningContent('<think></think>')).toBe(false)
    expect(hasVisibleReasoningContent('<think>real thought</think>')).toBe(true)
  })
})

describe('summarizeReasoningContent', () => {
  it('returns the first sentence', () => {
    expect(summarizeReasoningContent('Validate syntax and inspect the final diff. Then run tests.'))
      .toBe('Validate syntax and inspect the final diff.')
  })

  it('supports CJK sentence boundaries', () => {
    expect(summarizeReasoningContent('先检查语法错误，再运行测试。然后提交。'))
      .toBe('先检查语法错误，再运行测试。')
  })

  it('keeps the whole text when the first boundary is too early', () => {
    expect(summarizeReasoningContent('Ok. now check')).toBe('Ok. now check')
  })

  it('strips markdown structure before summarizing', () => {
    const input = '## Plan\n- **Run** the [parser](https://example.com) on `main.lua`. Then stop.'
    // Note: the "." inside "main.lua" counts as a sentence boundary — this
    // documents current behavior, not an endorsement of it.
    expect(summarizeReasoningContent(input)).toBe('Plan Run the parser on main.')
  })

  it('drops fenced code blocks', () => {
    const input = '```ts\nconst x = 1\n```\nInspect the output. More later.'
    expect(summarizeReasoningContent(input)).toBe('Inspect the output.')
  })

  it('returns empty string for invisible content', () => {
    expect(summarizeReasoningContent('---')).toBe('')
    expect(summarizeReasoningContent('')).toBe('')
  })

  it('truncates long single sentences with an ellipsis', () => {
    const summary = summarizeReasoningContent(`${'a'.repeat(200)}.`)
    expect(summary.length).toBe(INLINE_REASONING_SUMMARY_MAX)
    expect(summary.endsWith('...')).toBe(true)
  })
})
