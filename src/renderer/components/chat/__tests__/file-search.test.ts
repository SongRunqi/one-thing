// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  findFileSearchMatches,
  markSearchMatchesInHtml,
  nextSearchIndex,
  normalizeSearchIndex,
} from '../file-search'

describe('file-search', () => {
  it('returns no matches for an empty query', () => {
    expect(findFileSearchMatches('hello', '', false)).toEqual([])
  })

  it('finds matches in document order with case-insensitive search by default', () => {
    expect(findFileSearchMatches('Alpha alpha ALPHA', 'alpha', false)).toEqual([
      { from: 0, to: 5 },
      { from: 6, to: 11 },
      { from: 12, to: 17 },
    ])
  })

  it('respects case-sensitive search', () => {
    expect(findFileSearchMatches('Alpha alpha ALPHA', 'Alpha', true)).toEqual([
      { from: 0, to: 5 },
    ])
  })

  it('wraps search indexes', () => {
    expect(normalizeSearchIndex(3, 3)).toBe(0)
    expect(normalizeSearchIndex(-1, 3)).toBe(2)
    expect(nextSearchIndex(2, 3, 1)).toBe(0)
    expect(nextSearchIndex(0, 3, -1)).toBe(2)
    expect(nextSearchIndex(0, 0, 1)).toBe(-1)
  })

  it('marks matches without discarding existing highlight markup', () => {
    const html = '<span class="hljs-keyword">const</span> value = const'
    const marked = markSearchMatchesInHtml(html, [
      { from: 0, to: 5 },
      { from: 14, to: 19 },
    ], 1)

    expect(marked).toContain('hljs-keyword')
    expect(marked).toContain('data-search-index="0"')
    expect(marked).toContain('data-search-index="1"')
    expect(marked).toContain('file-search-current')
  })
})
