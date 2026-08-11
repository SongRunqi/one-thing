import { describe, expect, it } from 'vitest'
import {
  advanceStreamingReveal,
  createStreamingArrivalTracker,
  getStreamingRevealUnits,
  pacedRevealUnitBudget,
} from '../streamingReveal'

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

  it('catches up instead of replaying stale backlog after a long pause', () => {
    const target = Array.from({ length: 200 }, (_, index) => `word${index}`).join(' ')
    const next = advanceStreamingReveal('', target, 1000, {
      catchUpAfterMs: 300,
      catchUpRemainingChars: 1200,
    })

    expect(next.content).toBe(target)
    expect(next.done).toBe(true)
  })

  it('keeps small paused backlogs animated', () => {
    const target = Array.from({ length: 40 }, (_, index) => `w${index}`).join(' ')
    const next = advanceStreamingReveal('', target, 1000, {
      catchUpAfterMs: 300,
      catchUpRemainingChars: 1200,
    })

    expect(next.content.length).toBeLessThan(target.length)
    expect(next.done).toBe(false)
  })
})

describe('arrival tracker', () => {
  it('needs two arrivals before it reports a cadence', () => {
    const tracker = createStreamingArrivalTracker()
    expect(tracker.intervalMs).toBeUndefined()

    tracker.record(0)
    expect(tracker.intervalMs).toBeUndefined()

    tracker.record(800)
    expect(tracker.intervalMs).toBe(800)
  })

  it('smooths toward the recent cadence and forgets it on reset', () => {
    const tracker = createStreamingArrivalTracker()
    for (let i = 0; i <= 20; i += 1) tracker.record(i * 900)
    expect(tracker.intervalMs).toBeCloseTo(900, 0)

    tracker.reset()
    expect(tracker.intervalMs).toBeUndefined()
  })

  it('caps a tool-call sized silence so it is not mistaken for the cadence', () => {
    const tracker = createStreamingArrivalTracker()
    tracker.record(0)
    tracker.record(30_000)

    expect(tracker.intervalMs).toBe(1500)
  })
})

describe('paced reveal budget', () => {
  it('holds the frame when less than one unit is due', () => {
    // 10 units to spread over 900ms: a 16ms frame earns well under one unit.
    expect(pacedRevealUnitBudget({
      pendingUnits: 10, elapsedMs: 16, arrivalIntervalMs: 900,
    })).toBe(0)
  })

  it('releases a unit once enough time has accumulated', () => {
    expect(pacedRevealUnitBudget({
      pendingUnits: 10, elapsedMs: 80, arrivalIntervalMs: 900,
    })).toBeGreaterThanOrEqual(1)
  })

  it('does not bind a fast source, where a frame is a whole arrival', () => {
    // elapsed ≈ interval → budget ≈ pendingUnits * factor > pendingUnits.
    expect(pacedRevealUnitBudget({
      pendingUnits: 12, elapsedMs: 16, arrivalIntervalMs: 16,
    })).toBeGreaterThan(12)
  })
})

describe('streaming reveal pacing', () => {
  const slowBatch = '这是一段中文流式输出的内容示例'

  it('spreads a 1Hz batch instead of dumping it in one frame', () => {
    // One 16ms frame right after a ~900ms-cadence batch reveals nothing yet.
    const held = advanceStreamingReveal('', slowBatch, 16, { arrivalIntervalMs: 900 })
    expect(held.content).toBe('')
    expect(held.done).toBe(false)

    // Walk the frames the way the component does: the clock keeps running
    // across held frames, so the batch comes out in steps rather than at once.
    let content = ''
    let sinceReveal = 0
    let totalMs = 0
    const steps: number[] = []
    for (let frame = 0; frame < 200 && content !== slowBatch; frame += 1) {
      sinceReveal += 16
      totalMs += 16
      const next = advanceStreamingReveal(content, slowBatch, sinceReveal, { arrivalIntervalMs: 900 })
      if (next.content === content && !next.done) continue
      sinceReveal = 0
      content = next.content
      steps.push(content.length)
    }

    expect(content).toBe(slowBatch)
    // The point of the fix: more than a frame or two of reveal.
    expect(steps.length).toBeGreaterThan(3)
    // …and the tail must not crawl. Draining may run slightly past one
    // cadence — that is a small steady lag, which is what continuous motion
    // costs — but the rate floor keeps it near the cadence rather than
    // letting the last units wait most of a second each.
    expect(totalMs).toBeLessThanOrEqual(900 * 1.5)
  })

  it('leaves a fast source on the unpaced budget', () => {
    const target = Array.from({ length: 200 }, (_, index) => `word${index}`).join(' ')
    const unpaced = advanceStreamingReveal('', target, 16, {})
    const paced = advanceStreamingReveal('', target, 16, { arrivalIntervalMs: 16 })

    expect(paced.content).toBe(unpaced.content)
  })

  it('ignores pacing under reduced motion', () => {
    const paced = advanceStreamingReveal('', slowBatch, 16, {
      arrivalIntervalMs: 900,
      reducedMotion: true,
    })

    expect(paced.content.length).toBeGreaterThan(0)
  })
})
