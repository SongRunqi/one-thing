import { describe, expect, it } from 'vitest'
import {
  REPLY_EXCERPT_MAX_CHARS,
  REPLY_UNKNOWN_AUTHOR_LABEL,
  buildReplyToSnapshot,
  condenseReplyExcerpt,
} from '../reply-quote'

describe('condenseReplyExcerpt', () => {
  it('flattens newlines and runs of whitespace into one line', () => {
    expect(condenseReplyExcerpt('  第一行\n\n  第二行\t第三行 ')).toBe('第一行 第二行 第三行')
  })

  it('cuts at 120 chars and marks the cut', () => {
    const long = 'あ'.repeat(500)
    const excerpt = condenseReplyExcerpt(long)
    expect(excerpt).toHaveLength(REPLY_EXCERPT_MAX_CHARS + 1)
    expect(excerpt.endsWith('…')).toBe(true)
  })

  it('leaves a message exactly at the limit unmarked', () => {
    const exact = 'x'.repeat(REPLY_EXCERPT_MAX_CHARS)
    expect(condenseReplyExcerpt(exact)).toBe(exact)
  })

  it('treats whitespace-only and empty content as nothing to quote', () => {
    expect(condenseReplyExcerpt('   \n  ')).toBe('')
    expect(condenseReplyExcerpt('')).toBe('')
  })
})

describe('buildReplyToSnapshot', () => {
  it('snapshots the author label and the truncated excerpt', () => {
    expect(buildReplyToSnapshot({
      messageId: 'm1',
      authorLabel: '阿明',
      content: '我建议\n先做接口',
    })).toEqual({ messageId: 'm1', authorLabel: '阿明', excerpt: '我建议 先做接口' })
  })

  it('falls back to 成员 when the signature is missing', () => {
    expect(buildReplyToSnapshot({ messageId: 'm1', authorLabel: '  ', content: '在' })?.authorLabel)
      .toBe(REPLY_UNKNOWN_AUTHOR_LABEL)
    expect(buildReplyToSnapshot({ messageId: 'm1', content: '在' })?.authorLabel)
      .toBe(REPLY_UNKNOWN_AUTHOR_LABEL)
  })

  it('refuses to build a snapshot with nothing in it', () => {
    // An empty quote block is noise, not context.
    expect(buildReplyToSnapshot({ messageId: 'm1', authorLabel: '阿明', content: '   ' })).toBeNull()
    expect(buildReplyToSnapshot({ messageId: '', authorLabel: '阿明', content: '在' })).toBeNull()
  })
})
