import { describe, expect, it } from 'vitest'
import { parseStreamingMarkdown } from '../parseStreamingMarkdown'

describe('parseStreamingMarkdown', () => {
  it('does not render a transient code block for a partial opening fence', () => {
    expect(parseStreamingMarkdown('before\n```', { streaming: true })).toEqual([
      { type: 'markdown', key: 'md-0', content: 'before\n', complete: false },
    ])

    expect(parseStreamingMarkdown('before\n```go', { streaming: true })).toEqual([
      { type: 'markdown', key: 'md-0', content: 'before\n', complete: false },
    ])
  })

  it('renders a streaming code block once the opening fence line is complete', () => {
    expect(parseStreamingMarkdown('before\n```go\n', { streaming: true })).toEqual([
      { type: 'markdown', key: 'md-0', content: 'before\n', complete: true },
      {
        type: 'code',
        key: 'code-7',
        lang: 'go',
        content: '',
        complete: false,
      },
    ])

    expect(parseStreamingMarkdown('before\n```go\npackage main', { streaming: true })).toEqual([
      { type: 'markdown', key: 'md-0', content: 'before\n', complete: true },
      {
        type: 'code',
        key: 'code-7',
        lang: 'go',
        content: 'package main',
        complete: false,
      },
    ])
  })

  it('suppresses transient trailing blank lines and partial closing fences', () => {
    expect(parseStreamingMarkdown('```ts\nconst a = 1\n', { streaming: true })).toEqual([
      {
        type: 'code',
        key: 'code-0',
        lang: 'ts',
        content: 'const a = 1',
        complete: false,
      },
    ])

    expect(parseStreamingMarkdown('```ts\nconst a = 1\n``', { streaming: true })).toEqual([
      {
        type: 'code',
        key: 'code-0',
        lang: 'ts',
        content: 'const a = 1',
        complete: false,
      },
    ])
  })

  it('keeps the same code segment identity while a fenced block grows', () => {
    const first = parseStreamingMarkdown('intro\n```python\nprint(1)\n', { streaming: true })
    const next = parseStreamingMarkdown('intro\n```python\nprint(1)\nprint(2)\n', { streaming: true })

    expect(first.find(seg => seg.type === 'code')?.key).toBe('code-6')
    expect(next.find(seg => seg.type === 'code')?.key).toBe('code-6')
  })
})
