import { describe, expect, it } from 'vitest'
import { advanceSmoothStreamingText } from '../smoothStreamingText'

describe('advanceSmoothStreamingText', () => {
  it('reveals a burst over multiple frames instead of committing it at once', () => {
    const target = 'a'.repeat(1000)
    const next = advanceSmoothStreamingText('', target, 16)

    expect(next.length).toBeGreaterThan(0)
    expect(next.length).toBeLessThan(target.length)
  })

  it('limits newline bursts so code blocks grow smoothly by line count', () => {
    const target = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n')
    const next = advanceSmoothStreamingText('', target, 16, {
      maxCharsPerFrame: 1000,
      maxNewlinesPerFrame: 1,
    })

    expect(next.split('\n').length - 1).toBeLessThanOrEqual(1)
    expect(next.length).toBeLessThan(target.length)
  })

  it('commits immediately when content is replaced rather than appended', () => {
    expect(advanceSmoothStreamingText('hello world', 'new text', 16)).toBe('new text')
  })
})
