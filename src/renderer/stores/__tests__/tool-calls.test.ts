import { describe, it, expect } from 'vitest'
import {
  linkStepsToToolCalls,
  mergeToolCall,
  upsertMessageToolCall,
} from '../helpers/tool-calls'
import type { ChatMessage, Step, ToolCall } from '@/types'

function makeToolCall(id: string, overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id,
    toolId: 'bash',
    toolName: 'bash',
    arguments: {},
    status: 'pending',
    timestamp: 0,
    ...overrides,
  }
}

function makeStep(id: string, overrides: Partial<Step> = {}): Step {
  return {
    id,
    type: 'tool-call',
    title: 'tool',
    status: 'pending',
    timestamp: 0,
    ...overrides,
  }
}

function makeMessage(toolCalls: ToolCall[] = [], steps: Step[] = []): ChatMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: '',
    timestamp: 0,
    toolCalls,
    steps,
  }
}

describe('mergeToolCall', () => {
  it('skips undefined values', () => {
    const target = makeToolCall('a', { status: 'completed', error: 'old' })
    mergeToolCall(target, { status: undefined, error: undefined })
    expect(target.status).toBe('completed')
    expect(target.error).toBe('old')
  })

  it('copies primitive values including null and empty strings', () => {
    const target = makeToolCall('a', { error: 'old', result: 1 })
    mergeToolCall(target, { error: '', result: null as unknown as undefined })
    expect(target.error).toBe('')
    expect(target.result).toBeNull()
  })

  it('replaces nested objects by reference (no deep merge)', () => {
    const target = makeToolCall('a', { arguments: { existing: 'keep' } })
    const newArgs = { fresh: 'value' }
    mergeToolCall(target, { arguments: newArgs })
    expect(target.arguments).toBe(newArgs)
    expect(target.arguments).not.toHaveProperty('existing')
  })

  it('returns the same target reference', () => {
    const target = makeToolCall('a')
    expect(mergeToolCall(target, { status: 'completed' })).toBe(target)
  })
})

describe('upsertMessageToolCall', () => {
  it('appends and returns the new entry when id is missing', () => {
    const message = makeMessage()
    const incoming = makeToolCall('a')
    const ret = upsertMessageToolCall(message, incoming)
    expect(message.toolCalls).toHaveLength(1)
    expect(ret).toBe(incoming)
    expect(message.toolCalls![0]).toBe(incoming)
  })

  it('initializes message.toolCalls when missing', () => {
    const message: ChatMessage = { id: 'm1', role: 'assistant', content: '', timestamp: 0 }
    upsertMessageToolCall(message, makeToolCall('a'))
    expect(message.toolCalls).toHaveLength(1)
  })

  it('merges in place when id matches, preserving slot reference', () => {
    const existing = makeToolCall('a', { status: 'pending' })
    const message = makeMessage([existing])
    const slotBefore = message.toolCalls![0]
    const incoming = makeToolCall('a', { status: 'completed', result: 42 })
    const ret = upsertMessageToolCall(message, incoming)
    expect(ret).toBe(existing)
    expect(message.toolCalls![0]).toBe(slotBefore)
    expect(existing.status).toBe('completed')
    expect(existing.result).toBe(42)
  })
})

describe('linkStepsToToolCalls', () => {
  it('relinks step.toolCall to the matching message.toolCalls entry by id', () => {
    const canonical = makeToolCall('a', { status: 'pending' })
    const stepClone = makeToolCall('a', { status: 'pending' })
    const step = makeStep('s1', { toolCallId: 'a', toolCall: stepClone })
    const message = makeMessage([canonical], [step])

    linkStepsToToolCalls(message)
    expect(step.toolCall).toBe(canonical)
  })

  it('promotes step.toolCall to canonical when no matching entry exists', () => {
    const stepTC = makeToolCall('a')
    const step = makeStep('s1', { toolCallId: 'a', toolCall: stepTC })
    const message = makeMessage([], [step])

    linkStepsToToolCalls(message)
    expect(message.toolCalls).toHaveLength(1)
    expect(message.toolCalls![0]).toBe(stepTC)
    expect(step.toolCall).toBe(stepTC)
  })

  it('merges fresher step-side fields into existing canonical', () => {
    const canonical = makeToolCall('a', { status: 'pending', result: undefined })
    const stepClone = makeToolCall('a', { status: 'completed', result: { ok: true } })
    const step = makeStep('s1', { toolCallId: 'a', toolCall: stepClone })
    const message = makeMessage([canonical], [step])

    linkStepsToToolCalls(message)
    expect(canonical.status).toBe('completed')
    expect(canonical.result).toEqual({ ok: true })
    expect(step.toolCall).toBe(canonical)
  })

  it('does not overwrite newer streaming args with an older step clone', () => {
    const canonical = makeToolCall('a', {
      status: 'input-streaming',
      streamingArgs: '{"file_path":"a.txt","new_string":"hello',
    })
    const stepClone = makeToolCall('a', {
      status: 'input-streaming',
      streamingArgs: '{"file_path":"a.txt"',
    })
    const step = makeStep('s1', { toolCallId: 'a', toolCall: stepClone })
    const message = makeMessage([canonical], [step])

    linkStepsToToolCalls(message)

    expect(canonical.streamingArgs).toBe('{"file_path":"a.txt","new_string":"hello')
    expect(step.toolCall).toBe(canonical)
  })

  it('skips steps without toolCallId', () => {
    const step = makeStep('s1', { type: 'thinking' })
    const message = makeMessage([], [step])
    linkStepsToToolCalls(message)
    expect(message.toolCalls).toEqual([])
    expect(step.toolCall).toBeUndefined()
  })

  it('is idempotent', () => {
    const canonical = makeToolCall('a')
    const step = makeStep('s1', { toolCallId: 'a', toolCall: makeToolCall('a') })
    const message = makeMessage([canonical], [step])

    linkStepsToToolCalls(message)
    const firstRefs = { toolCall: step.toolCall, canonical: message.toolCalls![0] }
    linkStepsToToolCalls(message)
    expect(step.toolCall).toBe(firstRefs.toolCall)
    expect(message.toolCalls![0]).toBe(firstRefs.canonical)
  })

  it('handles missing message.steps gracefully', () => {
    const message: ChatMessage = { id: 'm1', role: 'assistant', content: '', timestamp: 0 }
    expect(() => linkStepsToToolCalls(message)).not.toThrow()
  })

  it('after relink, mutations on canonical propagate to step.toolCall', () => {
    const canonical = makeToolCall('a', { status: 'pending' })
    const step = makeStep('s1', { toolCallId: 'a', toolCall: makeToolCall('a') })
    const message = makeMessage([canonical], [step])

    linkStepsToToolCalls(message)
    canonical.status = 'completed'
    canonical.result = 'done'
    expect(step.toolCall!.status).toBe('completed')
    expect(step.toolCall!.result).toBe('done')
  })
})
