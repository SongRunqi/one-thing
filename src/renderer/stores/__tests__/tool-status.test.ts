import { describe, it, expect } from 'vitest'
import { getToolRenderStatus } from '../helpers/tool-status'
import type { Step, ToolCall } from '@/types'

function tc(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id: 't',
    toolId: 'bash',
    toolName: 'bash',
    arguments: {},
    status: 'pending',
    timestamp: 0,
    ...overrides,
  }
}

function st(overrides: Partial<Step> = {}): Step {
  return {
    id: 's',
    type: 'tool-call',
    title: 't',
    status: 'pending',
    timestamp: 0,
    ...overrides,
  }
}

describe('getToolRenderStatus', () => {
  it('returns pending when both inputs are absent', () => {
    expect(getToolRenderStatus()).toBe('pending')
  })

  it('returns awaiting-confirmation when toolCall.requiresConfirmation is set', () => {
    expect(getToolRenderStatus(tc({ requiresConfirmation: true, status: 'pending' }))).toBe('awaiting-confirmation')
  })

  it('returns awaiting-confirmation when step.status is awaiting-confirmation', () => {
    expect(getToolRenderStatus(tc(), st({ status: 'awaiting-confirmation' }))).toBe('awaiting-confirmation')
  })

  it('awaiting-confirmation takes precedence over executing', () => {
    expect(
      getToolRenderStatus(
        tc({ status: 'executing', requiresConfirmation: true }),
        st({ status: 'running' }),
      ),
    ).toBe('awaiting-confirmation')
  })

  it('maps toolCall.status="input-streaming" to streaming-input', () => {
    expect(getToolRenderStatus(tc({ status: 'input-streaming' }))).toBe('streaming-input')
  })

  it('maps toolCall.status="queued" to queued', () => {
    expect(getToolRenderStatus(tc({ status: 'queued' }))).toBe('queued')
  })

  it('maps toolCall.status="executing" to executing', () => {
    expect(getToolRenderStatus(tc({ status: 'executing' }))).toBe('executing')
  })

  it('maps step.status="running" to executing', () => {
    expect(getToolRenderStatus(undefined, st({ status: 'running' }))).toBe('executing')
  })

  it('maps step.status="completed" to completed even when toolCall.status disagrees', () => {
    // edge: backend sometimes emits step:updated completed before tool_call chunk lands
    expect(getToolRenderStatus(tc({ status: 'pending' }), st({ status: 'completed' }))).toBe('completed')
  })

  it('failed beats pending', () => {
    expect(getToolRenderStatus(tc({ status: 'failed' }))).toBe('failed')
    expect(getToolRenderStatus(undefined, st({ status: 'failed' }))).toBe('failed')
  })

  it('returns rejected when permission rejection metadata is present', () => {
    expect(getToolRenderStatus(tc({ status: 'failed', rejected: true }))).toBe('rejected')
    expect(getToolRenderStatus(tc({ status: 'pending', requiresConfirmation: true, rejected: true }))).toBe('rejected')
    expect(getToolRenderStatus(undefined, st({ status: 'failed', rejected: true }))).toBe('rejected')
  })

  it('cancelled beats failed/completed (cancelled is the strongest terminal)', () => {
    expect(getToolRenderStatus(tc({ status: 'cancelled' }), st({ status: 'completed' }))).toBe('cancelled')
  })
})
