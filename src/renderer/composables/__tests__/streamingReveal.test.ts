import { describe, expect, it } from 'vitest'
import { advanceStreamingReveal, getStreamingRevealUnits } from '../streamingReveal'

describe('streaming reveal', () => {
  it('reveals prose on word boundaries', () => {
    const target = 'Hello world, this is a streaming answer.'
    const next = advanceStreamingReveal('', target, 16, {
      minUnitsPerFrame: 2,
      maxUnitsPerFrame: 2,
    })

    expect(next.content).toMatch(/^Hello world/)
    expect(next.content.length).toBeLessThan(target.length)
    expect(next.done).toBe(false)
  })

  it('segments CJK text into reveal units', () => {
    const units = getStreamingRevealUnits('你好世界，流式出现')

    expect(units.length).toBeGreaterThan(1)
  })

  it('keeps punctuation and whitespace with revealed words', () => {
    const target = 'One, two. Three.'
    const next = advanceStreamingReveal('', target, 16, {
      minUnitsPerFrame: 1,
      maxUnitsPerFrame: 1,
    })

    expect(next.content).toBe('One, ')
  })

  it('commits immediately when content is replaced rather than appended', () => {
    const next = advanceStreamingReveal('hello world', 'new text', 16)

    expect(next.content).toBe('new text')
    expect(next.replaced).toBe(true)
    expect(next.done).toBe(true)
  })

  it('reveals more aggressively when reduced motion is requested', () => {
    const target = Array.from({ length: 40 }, (_, index) => `word${index}`).join(' ')
    const normal = advanceStreamingReveal('', target, 16, {
      minUnitsPerFrame: 2,
      maxUnitsPerFrame: 4,
    })
    const reduced = advanceStreamingReveal('', target, 16, {
      minUnitsPerFrame: 2,
      maxUnitsPerFrame: 4,
      reducedMotion: true,
    })

    expect(reduced.content.length).toBeGreaterThan(normal.content.length)
  })

  it('does not dump a huge single token in one frame', () => {
    const target = 'a'.repeat(1000)
    const next = advanceStreamingReveal('', target, 16, {
      maxCharsPerFrame: 96,
    })

    expect(next.content.length).toBe(96)
    expect(next.done).toBe(false)
  })
})
