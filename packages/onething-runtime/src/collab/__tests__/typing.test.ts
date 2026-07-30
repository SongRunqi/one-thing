/**
 * W19 真实 typing — the chunk-sequence → emit-sequence matrix.
 *
 * The whole point of the工单 is that the indicator now has a physical referent:
 * `say` arguments streaming. These tests are the specification of that mapping,
 * written as event sequences a real provider produces, so the "亮/不亮" rules
 * can be argued about without an engine, a bus or a room.
 */
import { describe, expect, it } from 'vitest'
import { createCollabTypingTracker, type CollabTypingSignal } from '../typing.js'

/** Play a sequence and collect only the pulses the tracker decided to emit. */
function run(signals: CollabTypingSignal[], options: { finish?: boolean } = {}): boolean[] {
  const tracker = createCollabTypingTracker()
  const emitted: boolean[] = []
  for (const signal of signals) {
    const next = tracker.observe(signal)
    if (next !== null) emitted.push(next)
  }
  if (options.finish !== false) {
    const final = tracker.finish()
    if (final !== null) emitted.push(final)
  }
  return emitted
}

function inputStart(toolCallId: string, toolName: string): CollabTypingSignal {
  return { type: 'tool:input-start', toolCallId, toolName, toolCall: { toolId: toolName } }
}

function inputEnd(toolCallId: string, toolName: string): CollabTypingSignal {
  return { type: 'tool:input-end', toolCallId, toolCall: { id: toolCallId, toolId: toolName } }
}

const START = { type: 'stream:start' } satisfies CollabTypingSignal
const TEXT = { type: 'message:updated' } satisfies CollabTypingSignal
const REASONING = { type: 'reasoning:delta' } satisfies CollabTypingSignal
const COMPLETE = { type: 'stream:complete' } satisfies CollabTypingSignal

describe('W19 — 信号源:只有 say 的参数流亮灯', () => {
  it('lights for one say call and puts it out when the words are complete', () => {
    expect(run([
      START,
      REASONING,
      inputStart('call-1', 'say'),
      inputEnd('call-1', 'say'),
      COMPLETE,
    ])).toEqual([true, false])
  })

  it('pulses once per say — 多 say 多脉冲', () => {
    expect(run([
      START,
      inputStart('call-1', 'say'),
      inputEnd('call-1', 'say'),
      REASONING,
      inputStart('call-2', 'say'),
      inputEnd('call-2', 'say'),
      COMPLETE,
    ])).toEqual([true, false, true, false])
  })

  it('stays silent through a turn that only thinks', () => {
    expect(run([START, REASONING, TEXT, REASONING, COMPLETE])).toEqual([])
  })

  it('stays silent for a board call — moving a card is not speaking', () => {
    expect(run([
      START,
      inputStart('call-1', 'board'),
      inputEnd('call-1', 'board'),
      COMPLETE,
    ])).toEqual([])
  })

  it('stays dark for any non-say tool, named or not', () => {
    // The predicate is a whitelist of ONE name, not a blacklist — a tool the
    // room surface has never heard of must not light the room either.
    expect(run([
      START,
      inputStart('call-1', 'read'),
      inputEnd('call-1', 'read'),
      COMPLETE,
    ])).toEqual([])
  })

  it('ignores the noise between two says (deltas, other tools)', () => {
    expect(run([
      START,
      inputStart('call-1', 'say'),
      TEXT,
      REASONING,
      inputEnd('call-1', 'say'),
      inputStart('call-2', 'board'),
      inputEnd('call-2', 'board'),
      COMPLETE,
    ])).toEqual([true, false])
  })

  it('reads the name off the tool call when the event carries none', () => {
    expect(run([
      { type: 'tool:input-start', toolCallId: 'call-1', toolCall: { name: 'say' } },
      inputEnd('call-1', 'say'),
    ])).toEqual([true, false])
  })
})

describe('W19 — 并发 say 不闪烁', () => {
  it('holds one light across two overlapping say calls', () => {
    expect(run([
      inputStart('call-1', 'say'),
      inputStart('call-2', 'say'),
      inputEnd('call-1', 'say'),
      inputEnd('call-2', 'say'),
    ])).toEqual([true, false])
  })

  it('does not go out on an input-end for a call it never saw start', () => {
    expect(run([
      inputStart('call-1', 'say'),
      inputEnd('call-9', 'say'),
      inputEnd('call-1', 'say'),
    ])).toEqual([true, false])
  })
})

describe('W19 — 兜底:灯不会卡住', () => {
  it('accepts tool:execution-start as the extinguisher when input-end never came', () => {
    expect(run([
      inputStart('call-1', 'say'),
      { type: 'tool:execution-start', toolCallId: 'call-1', toolName: 'say' },
    ])).toEqual([true, false])
  })

  it('clears on a stream terminal — an aborted turn leaves nobody typing', () => {
    expect(run([
      inputStart('call-1', 'say'),
      { type: 'stream:aborted' },
    ])).toEqual([true, false])
  })

  it('forces false when the window closes mid-arguments', () => {
    const tracker = createCollabTypingTracker()
    expect(tracker.observe(inputStart('call-1', 'say'))).toBe(true)
    expect(tracker.lit).toBe(true)
    expect(tracker.finish()).toBe(false)
    expect(tracker.lit).toBe(false)
  })

  it('emits nothing on close when the light was already out', () => {
    const tracker = createCollabTypingTracker()
    tracker.observe(inputStart('call-1', 'say'))
    tracker.observe(inputEnd('call-1', 'say'))
    expect(tracker.finish()).toBeNull()
  })

  it('emits nothing on close after a turn that never spoke', () => {
    expect(run([START, REASONING, COMPLETE])).toEqual([])
  })
})
