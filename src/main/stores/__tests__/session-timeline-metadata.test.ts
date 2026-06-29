import { describe, expect, it } from 'vitest'
import type { ChatMessage, ChatSession } from '../../../shared/ipc.js'
import {
  deriveRetainedContextSize,
  repairSessionTimelineMetadata,
  sanitizeSessionOnStartup,
} from '../sessions.js'

function user(index: number): ChatMessage {
  return {
    id: `user-${index}`,
    role: 'user',
    content: `user ${index}`,
    timestamp: index,
  }
}

function assistant(index: number, inputTokens?: number): ChatMessage {
  return {
    id: `assistant-${index}`,
    role: 'assistant',
    content: `assistant ${index}`,
    timestamp: index,
    usage: inputTokens === undefined
      ? undefined
      : {
          inputTokens,
          outputTokens: 1,
          totalTokens: inputTokens + 1,
        },
  }
}

function session(messages: ChatMessage[], summaryUpToMessageId?: string): ChatSession {
  return {
    id: 's1',
    name: 'Test',
    messages,
    createdAt: 0,
    updatedAt: 0,
    summary: summaryUpToMessageId ? 'Previous summary' : undefined,
    summaryUpToMessageId,
    summaryCreatedAt: summaryUpToMessageId ? 1 : undefined,
  }
}

describe('session timeline metadata repair', () => {
  it('keeps valid compact metadata without recomputing context by default', () => {
    const testSession = session([user(1), assistant(2, 120)], 'assistant-2')
    testSession.contextSize = 0
    testSession.lastInputTokens = 0

    expect(repairSessionTimelineMetadata(testSession)).toBe(false)
    expect(testSession.summary).toBe('Previous summary')
    expect(testSession.summaryUpToMessageId).toBe('assistant-2')
    expect(testSession.contextSize).toBe(0)
    expect(testSession.lastInputTokens).toBe(0)
  })

  it('clears dangling summary metadata and restores context from retained provider usage', () => {
    const testSession = session([user(1), assistant(2, 120), user(3)], 'missing-message')
    testSession.contextSize = 999
    testSession.lastInputTokens = 999

    expect(repairSessionTimelineMetadata(testSession)).toBe(true)
    expect(testSession.summary).toBeUndefined()
    expect(testSession.summaryUpToMessageId).toBeUndefined()
    expect(testSession.summaryCreatedAt).toBeUndefined()
    expect(testSession.contextSize).toBe(120)
    expect(testSession.lastInputTokens).toBe(120)
  })

  it('prefers the latest retained step usage over accumulated assistant usage', () => {
    const assistantMessage = assistant(2, 200)
    assistantMessage.steps = [
      {
        id: 'step-1',
        type: 'tool-call',
        title: 'Step 1',
        status: 'completed',
        timestamp: 1,
        turnIndex: 1,
        usage: { inputTokens: 80, outputTokens: 1, totalTokens: 81 },
      },
      {
        id: 'step-2',
        type: 'tool-call',
        title: 'Step 2',
        status: 'completed',
        timestamp: 2,
        turnIndex: 2,
        usage: { inputTokens: 140, outputTokens: 1, totalTokens: 141 },
      },
    ]

    expect(deriveRetainedContextSize(session([user(1), assistantMessage]))).toBe(140)
  })

  it('does not derive context from accumulated tool-loop assistant usage without step usage', () => {
    const assistantMessage = assistant(2, 4606545)
    assistantMessage.toolCalls = [
      {
        id: 'call-1',
        toolName: 'bash',
        toolId: 'bash',
        status: 'completed',
        arguments: {},
      } as NonNullable<ChatMessage['toolCalls']>[number],
    ]

    const testSession = session([user(1), assistantMessage])
    testSession.contextSize = 4606545
    testSession.lastInputTokens = 4606545

    expect(deriveRetainedContextSize(testSession)).toBe(0)
    expect(repairSessionTimelineMetadata(testSession)).toBe(true)
    expect(testSession.contextSize).toBe(0)
    expect(testSession.lastInputTokens).toBe(0)
  })

  it('ignores provider usage before a valid summary anchor when recomputing context', () => {
    const testSession = session([user(1), assistant(2, 300), user(3)], 'assistant-2')
    testSession.contextSize = 999
    testSession.lastInputTokens = 999

    expect(repairSessionTimelineMetadata(testSession, { recomputeContextSize: true })).toBe(true)
    expect(testSession.summaryUpToMessageId).toBe('assistant-2')
    expect(testSession.contextSize).toBe(0)
    expect(testSession.lastInputTokens).toBe(0)
  })

  it('derives context from retained assistant usage after a valid summary anchor', () => {
    const testSession = session([
      user(1),
      assistant(2, 300),
      user(3),
      assistant(4, 180),
      user(5),
    ], 'assistant-2')

    expect(deriveRetainedContextSize(testSession)).toBe(180)
  })

  it('sets context to zero after truncation when no retained provider usage exists', () => {
    const testSession = session([user(1)])
    testSession.contextSize = 999
    testSession.lastInputTokens = 999

    expect(repairSessionTimelineMetadata(testSession, { recomputeContextSize: true })).toBe(true)
    expect(testSession.contextSize).toBe(0)
    expect(testSession.lastInputTokens).toBe(0)
  })

  it('marks stale context compact markers as failed on startup', () => {
    const compactingMessage: ChatMessage = {
      id: 'compact-1',
      role: 'system',
      content: JSON.stringify({
        type: 'context-compact',
        status: 'compacting',
        summary: '',
        compactedMessageCount: 40,
      }),
      timestamp: 1,
    }
    const testSession = session([user(1), compactingMessage])

    expect(sanitizeSessionOnStartup(testSession)).toBe(true)
    expect(JSON.parse(compactingMessage.content)).toEqual({
      type: 'context-compact',
      status: 'failed',
      summary: '',
      error: 'Context compact was interrupted before completion.',
      compactedMessageCount: 40,
    })
  })
})
