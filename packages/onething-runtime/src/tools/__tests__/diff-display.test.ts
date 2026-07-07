import { describe, expect, it } from 'vitest'
import { truncateDiffForDisplay } from '../replacers.js'

describe('truncateDiffForDisplay', () => {
  it('returns small diffs untouched', () => {
    const diff = '@@ -1 +1 @@\n-old\n+new'
    expect(truncateDiffForDisplay(diff)).toBe(diff)
    expect(truncateDiffForDisplay('')).toBe('')
  })

  it('caps by line count and reports how many lines were dropped', () => {
    const diff = Array.from({ length: 30 }, (_, i) => `+line ${i}`).join('\n')
    const result = truncateDiffForDisplay(diff, 10, 200_000)
    const lines = result.split('\n')
    expect(lines).toHaveLength(11)
    expect(lines[0]).toBe('+line 0')
    expect(lines[9]).toBe('+line 9')
    expect(lines[10]).toMatch(/diff truncated \(20 more lines\)/)
  })

  it('caps by byte size on a line boundary', () => {
    const diff = Array.from({ length: 50 }, (_, i) => `+${'x'.repeat(100)} ${i}`).join('\n')
    const result = truncateDiffForDisplay(diff, 2_000, 500)
    expect(result.length).toBeLessThan(700)
    expect(result).toMatch(/diff truncated/)
    const body = result.slice(0, result.lastIndexOf('\n'))
    expect(body.endsWith('x 0') || body.split('\n').every(line => line.startsWith('+'))).toBe(true)
  })
})
