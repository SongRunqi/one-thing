/**
 * W22 回合工具调用断路器 — the pure half.
 *
 * The incident this exists for was a tool loop: 77 calls of one tool inside a
 * handful of turns, each lap a full-context request, stopped only by the ten
 * minute wall clock. The tool is retired, but the SHAPE is not tool-specific,
 * so the breaker is written against tool calls in general.
 *
 * What the tests here have to make true, in order of how badly a mutation would
 * hurt: the caps are MAXIMA (a normal multi-say turn must never trip), the trip
 * fires exactly once (the caller aborts in the handler), and the counting is
 * deduped and scoped to real executions.
 */
import { describe, expect, it } from 'vitest'
import {
  COLLAB_TURN_MAX_SAY_CALLS,
  COLLAB_TURN_MAX_TOOL_CALLS,
  createCollabTurnCircuitBreaker,
  formatCollabTurnBreakerNote,
  resolveCollabTurnBreakerLimits,
  type CollabTurnBreakerSignal,
  type CollabTurnBreakerTrip,
} from '../circuit-breaker.js'

function exec(toolCallId: string, toolName: string): CollabTurnBreakerSignal {
  return { type: 'tool:execution-start', toolCallId, toolName }
}

/** Feed a run of calls and collect every trip the breaker handed back. */
function run(signals: CollabTurnBreakerSignal[], limits?: {
  maxToolCalls?: number
  maxSayCalls?: number
}): CollabTurnBreakerTrip[] {
  const breaker = createCollabTurnCircuitBreaker(limits)
  const trips: CollabTurnBreakerTrip[] = []
  for (const signal of signals) {
    const trip = breaker.observe(signal)
    if (trip) trips.push(trip)
  }
  return trips
}

/** n executions of one tool, each with its own call id. */
function calls(count: number, toolName: string, prefix = 'c'): CollabTurnBreakerSignal[] {
  return Array.from({ length: count }, (_, index) => exec(`${prefix}-${index}`, toolName))
}

describe('回合断路器 — 上限矩阵', () => {
  it('publishes the caps the design fixed: 40 total / 20 say', () => {
    expect(COLLAB_TURN_MAX_TOOL_CALLS).toBe(40)
    expect(COLLAB_TURN_MAX_SAY_CALLS).toBe(20)
  })

  it('keeps the say cap under the total — otherwise it is not a cap at all', () => {
    // The say cap answers a different question than the total (flooding vs
    // stuck), and it can only ever answer it while it sits below the total.
    expect(COLLAB_TURN_MAX_SAY_CALLS).toBeLessThan(COLLAB_TURN_MAX_TOOL_CALLS)
  })

  it('lets a turn spend the WHOLE budget without tripping', () => {
    // MUTATION LOCK on the off-by-one. `>=` instead of `>` turns the cap into a
    // threshold and cuts the last legal call — a behaviour change wearing a
    // safety net's clothes (真机验收: 正常多 say 不能被误伤).
    expect(run(calls(COLLAB_TURN_MAX_SAY_CALLS, 'say'))).toEqual([])
    expect(run([
      ...calls(COLLAB_TURN_MAX_SAY_CALLS, 'say', 'say'),
      ...calls(COLLAB_TURN_MAX_TOOL_CALLS - COLLAB_TURN_MAX_SAY_CALLS, 'board', 'board'),
    ])).toEqual([])
  })

  it('trips on the call PAST the total cap', () => {
    const trips = run(calls(COLLAB_TURN_MAX_TOOL_CALLS + 1, 'board'))

    expect(trips).toEqual([{
      reason: 'total',
      limit: COLLAB_TURN_MAX_TOOL_CALLS,
      toolCalls: COLLAB_TURN_MAX_TOOL_CALLS + 1,
      sayCalls: 0,
    }])
  })

  it('trips on the say PAST the say cap, before the total cap is anywhere near', () => {
    const trips = run(calls(COLLAB_TURN_MAX_SAY_CALLS + 1, 'say'))

    expect(trips).toEqual([{
      reason: 'say',
      limit: COLLAB_TURN_MAX_SAY_CALLS,
      toolCalls: COLLAB_TURN_MAX_SAY_CALLS + 1,
      sayCalls: COLLAB_TURN_MAX_SAY_CALLS + 1,
    }])
  })

  it('counts says toward the TOTAL too — a say flood is also a tool flood', () => {
    // With the say cap lifted, a full say budget plus enough board reads to
    // clear the total still trips on the total: the two caps are not
    // independent budgets.
    const says = COLLAB_TURN_MAX_SAY_CALLS
    const trips = run([
      ...calls(says, 'say', 'say'),
      ...calls(COLLAB_TURN_MAX_TOOL_CALLS - says + 1, 'board', 'board'),
    ], { maxSayCalls: 0 })

    expect(trips).toHaveLength(1)
    expect(trips[0]).toMatchObject({
      reason: 'total',
      toolCalls: COLLAB_TURN_MAX_TOOL_CALLS + 1,
      sayCalls: says,
    })
  })

  it('trips exactly once, then goes quiet — the caller aborts in the handler', () => {
    // A second trip would mean a second abort for one turn, and (worse) a
    // second note in the execution session for the same event.
    const trips = run(calls(COLLAB_TURN_MAX_TOOL_CALLS + 5, 'board'))
    expect(trips).toHaveLength(1)
  })
})

describe('回合断路器 — 计数口径', () => {
  it('counts executions, not argument streams or anything else', () => {
    // `tool:input-start` fires per streamed call and would double-count on
    // providers that stream arguments; the terminals fire once per turn.
    const noise: CollabTurnBreakerSignal[] = [
      { type: 'tool:input-start', toolCallId: 'x', toolName: 'say' },
      { type: 'tool:input-end', toolCallId: 'x' },
      { type: 'stream:start' },
      { type: 'text:delta' },
      { type: 'stream:complete' },
    ]
    const breaker = createCollabTurnCircuitBreaker()
    for (const signal of [...noise, ...noise, ...noise]) breaker.observe(signal)

    expect(breaker.toolCalls).toBe(0)
    expect(breaker.sayCalls).toBe(0)
  })

  it('dedupes by toolCallId — a repeated execution-start is one call', () => {
    const breaker = createCollabTurnCircuitBreaker()
    for (let index = 0; index < 30; index++) breaker.observe(exec('same-call', 'say'))

    expect(breaker.toolCalls).toBe(1)
    expect(breaker.sayCalls).toBe(1)
    expect(breaker.tripped).toBeNull()
  })

  it('reads the tool name off every shape the event can carry', () => {
    const breaker = createCollabTurnCircuitBreaker()
    breaker.observe({ type: 'tool:execution-start', toolCallId: 'a', toolName: 'say' })
    breaker.observe({ type: 'tool:execution-start', toolCall: { id: 'b', toolId: 'say' } })
    breaker.observe({ type: 'tool:execution-start', toolCall: { id: 'c', name: 'say' } })
    breaker.observe({ type: 'tool:execution-start', toolCallId: 'd', toolName: 'board' })

    expect(breaker.sayCalls).toBe(3)
    expect(breaker.toolCalls).toBe(4)
  })

  it('COUNTS an execution with no call id — it just cannot be deduped (P2-15)', () => {
    // The failure mode points at over-counting now. A structural backstop
    // against runaway loops must never under-count: dropping id-less calls
    // meant an emitter that stopped stamping ids would silently switch the
    // breaker off, exactly when the loop it guards against is running.
    const breaker = createCollabTurnCircuitBreaker()
    breaker.observe({ type: 'tool:execution-start', toolName: 'say' })
    breaker.observe({ type: 'tool:execution-start', toolName: 'say' })

    expect(breaker.toolCalls).toBe(2)
    expect(breaker.sayCalls).toBe(2)
  })

  it('still dedupes the calls that DO carry an id', () => {
    const breaker = createCollabTurnCircuitBreaker()
    breaker.observe({ type: 'tool:execution-start', toolCallId: 'c1', toolName: 'read' })
    breaker.observe({ type: 'tool:execution-start', toolCallId: 'c1', toolName: 'read' })

    expect(breaker.toolCalls).toBe(1)
  })

  it('survives null / undefined / shapeless events', () => {
    const breaker = createCollabTurnCircuitBreaker()
    expect(breaker.observe(null)).toBeNull()
    expect(breaker.observe(undefined)).toBeNull()
    expect(breaker.observe({})).toBeNull()
  })

  it('honours caller-supplied caps (the constants are defaults, not law)', () => {
    expect(run(calls(3, 'say'), { maxSayCalls: 2 })).toHaveLength(1)
    expect(run(calls(2, 'say'), { maxSayCalls: 2 })).toEqual([])
  })
})

describe('回合断路器 — 房间可配置 (0 = 关闭)', () => {
  it('falls back to the built-in caps when the room configured nothing', () => {
    expect(resolveCollabTurnBreakerLimits()).toEqual({
      maxToolCalls: COLLAB_TURN_MAX_TOOL_CALLS,
      maxSayCalls: COLLAB_TURN_MAX_SAY_CALLS,
      enabled: true,
    })
    expect(resolveCollabTurnBreakerLimits({})).toMatchObject({ enabled: true })
  })

  it('reads 0 as OFF, not as "trip immediately"', () => {
    // The whole point of the setting: a 0 that meant "cap of zero" would cut
    // every turn on its first tool call — the opposite of what the user asked
    // for, and the same convention 日预算/maxChain already use.
    expect(run(calls(50, 'say'), { maxSayCalls: 0, maxToolCalls: 0 })).toEqual([])
    expect(resolveCollabTurnBreakerLimits({ maxToolCalls: 0, maxSayCalls: 0 })).toEqual({
      maxToolCalls: Infinity,
      maxSayCalls: Infinity,
      enabled: false,
    })
  })

  it('stays enabled while EITHER cap is live — one off is not both off', () => {
    expect(resolveCollabTurnBreakerLimits({ maxSayCalls: 0 })).toMatchObject({
      maxToolCalls: COLLAB_TURN_MAX_TOOL_CALLS,
      maxSayCalls: Infinity,
      enabled: true,
    })
    expect(resolveCollabTurnBreakerLimits({ maxToolCalls: 0 })).toMatchObject({
      maxSayCalls: COLLAB_TURN_MAX_SAY_CALLS,
      enabled: true,
    })
  })

  it('honours a raised cap — the point of making it a setting', () => {
    expect(run(calls(30, 'say'), { maxSayCalls: 50, maxToolCalls: 100 })).toEqual([])
    expect(run(calls(51, 'say'), { maxSayCalls: 50, maxToolCalls: 100 })).toHaveLength(1)
  })

  it('treats garbage and negatives as off rather than as a zero cap', () => {
    // These arrive off a number input and an IPC boundary; failing OPEN keeps a
    // malformed setting from silently cutting every turn in the room.
    expect(resolveCollabTurnBreakerLimits({ maxSayCalls: -1 })).toMatchObject({ maxSayCalls: Infinity })
    expect(resolveCollabTurnBreakerLimits({ maxSayCalls: Number.NaN })).toMatchObject({ maxSayCalls: Infinity })
  })

  it('floors a fractional cap instead of comparing against a fraction', () => {
    expect(resolveCollabTurnBreakerLimits({ maxSayCalls: 2.9 })).toMatchObject({ maxSayCalls: 2 })
    expect(run(calls(3, 'say'), { maxSayCalls: 2.9 })).toHaveLength(1)
  })
})

describe('断路器留痕', () => {
  it('names the cap that gave way and the counts behind it', () => {
    const sayNote = formatCollabTurnBreakerNote({
      reason: 'say', limit: 6, toolCalls: 7, sayCalls: 7,
    })
    expect(sayNote).toContain('7')
    expect(sayNote).toContain('6')
    expect(sayNote).toContain('发言')
    expect(sayNote).toContain('中止')

    const totalNote = formatCollabTurnBreakerNote({
      reason: 'total', limit: 12, toolCalls: 13, sayCalls: 1,
    })
    expect(totalNote).toContain('13')
    expect(totalNote).toContain('工具调用')
  })
})
