import { describe, expect, it, vi } from 'vitest'
import type { StreamContext } from '../stream-processor.js'

const emit = vi.fn(() => Promise.resolve())
const getSession = vi.fn(() => ({
  id: 's1',
  name: 'Session',
  messages: [],
  createdAt: 1,
  updatedAt: 1,
  contextSize: 9000,
}))
const compactSessionContext = vi.fn(() => Promise.resolve({
  success: true,
  summary: 'compacted',
  retainedContextSize: 0,
}))
const getContextCompactReason = vi.fn()

vi.mock('../../../store.js', () => ({
  getSession,
}))

vi.mock('../../../events/index.js', () => ({
  getEventBus: () => ({ emit }),
}))

vi.mock('../../context-compact.js', () => ({
  compactSessionContext,
  getContextCompactReason,
}))

const { maybeCompactAgentLoopContext } = await import('../agent-loop-runtime.js')

function ctx(): StreamContext {
  return {
    sessionId: 's1',
    assistantMessageId: 'm1',
    abortSignal: new AbortController().signal,
    settings: {
      chat: {
        contextCompactEnabled: true,
        contextCompactKeepRecentTurns: 6,
        contextCompactThreshold: 85,
      },
    } as any,
    providerConfig: { model: 'deepseek-v4-flash', selectedModels: ['deepseek-v4-flash'] },
    providerId: 'deepseek',
    toolSettings: undefined,
    sender: { isDestroyed: () => false, send: vi.fn() } as any,
  }
}

describe('agent loop runtime compaction', () => {
  it('runs compact and returns rebuilt messages before a later turn', async () => {
    getContextCompactReason
      .mockReturnValueOnce('threshold')
      .mockReturnValueOnce(null)
    const rebuilt = [{ role: 'system' as const, content: 'rebuilt summary' }]
    const rebuildMessages = vi.fn(async () => rebuilt)

    const result = await maybeCompactAgentLoopContext({
      ctx: ctx(),
      turn: 2,
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'read', arguments: '{}' }] },
        { role: 'tool', toolCallId: 'call_1', content: 'tool result' },
      ],
      budget: {
        modelContextLength: 10000,
        reservedOutputTokens: 512,
        thresholdPercent: 85,
      },
      rebuildMessages,
    })

    expect(compactSessionContext).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 's1',
      providerId: 'deepseek',
      keepRecentTurns: 6,
    }))
    expect(emit).toHaveBeenCalledWith('s1', expect.objectContaining({
      type: 'context:compact-completed',
      success: true,
      summary: 'compacted',
    }))
    expect(emit).toHaveBeenCalledWith('s1', {
      type: 'context:size-updated',
      contextSize: 0,
    })
    expect(rebuildMessages).toHaveBeenCalled()
    expect(result).toBe(rebuilt)
  })
})
