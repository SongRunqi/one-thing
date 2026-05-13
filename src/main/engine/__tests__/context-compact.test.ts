import { describe, expect, it } from 'vitest'
import type { ChatMessage, ChatSession } from '../../../shared/ipc.js'
import { selectCompactPlan, shouldAutoCompactBeforeSend } from '../context-compact.js'

function message(index: number, role: 'user' | 'assistant'): ChatMessage {
  return {
    id: `${role}-${index}`,
    role,
    content: `${role} ${index}`,
    timestamp: index,
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
  }
}

describe('selectCompactPlan', () => {
  it('skips when the session does not exceed the retained recent turns', () => {
    const messages = [
      message(1, 'user'),
      message(2, 'assistant'),
      message(3, 'user'),
      message(4, 'assistant'),
    ]

    expect(selectCompactPlan(session(messages), 3)).toBeNull()
  })

  it('summarizes older messages and keeps recent turns intact', () => {
    const messages = [
      message(1, 'user'),
      message(2, 'assistant'),
      message(3, 'user'),
      message(4, 'assistant'),
      message(5, 'user'),
      message(6, 'assistant'),
      message(7, 'user'),
      message(8, 'assistant'),
    ]

    const plan = selectCompactPlan(session(messages), 2)

    expect(plan?.cutoffMessage.id).toBe('assistant-4')
    expect(plan?.messagesToSummarize.map(m => m.id)).toEqual([
      'user-1',
      'assistant-2',
      'user-3',
      'assistant-4',
    ])
  })

  it('does not compact again until messages pass the previous summary point', () => {
    const messages = [
      message(1, 'user'),
      message(2, 'assistant'),
      message(3, 'user'),
      message(4, 'assistant'),
      message(5, 'user'),
      message(6, 'assistant'),
    ]

    expect(selectCompactPlan(session(messages, 'assistant-4'), 1)).toBeNull()
  })
})

describe('shouldAutoCompactBeforeSend', () => {
  it('triggers when tracked context reaches the configured threshold', async () => {
    const testSession = session([message(1, 'user')])
    testSession.contextSize = 90

    await expect(shouldAutoCompactBeforeSend({
      session: testSession,
      modelContextLength: 100,
      thresholdPercent: 85,
    })).resolves.toBe(true)
  })

  it('does not count reserved output tokens toward the configured percentage', async () => {
    const testSession = session([message(1, 'user')])
    testSession.contextSize = 80

    await expect(shouldAutoCompactBeforeSend({
      session: testSession,
      modelContextLength: 200,
      thresholdPercent: 85,
      reservedOutputTokens: 80,
    })).resolves.toBe(false)
  })

  it('still triggers when reserved output would exceed the hard model limit', async () => {
    const testSession = session([message(1, 'user')])
    testSession.contextSize = 80

    await expect(shouldAutoCompactBeforeSend({
      session: testSession,
      modelContextLength: 100,
      thresholdPercent: 85,
      reservedOutputTokens: 25,
    })).resolves.toBe(true)
  })

  it('does not trigger below threshold', async () => {
    const testSession = session([message(1, 'user')])
    testSession.contextSize = 40

    await expect(shouldAutoCompactBeforeSend({
      session: testSession,
      modelContextLength: 100,
      thresholdPercent: 85,
    })).resolves.toBe(false)
  })

  it('does not trigger from local message size when provider context is unknown', async () => {
    const testSession = session([{
      ...message(1, 'user'),
      content: 'x'.repeat(10000),
    }])

    await expect(shouldAutoCompactBeforeSend({
      session: testSession,
      modelContextLength: 100,
      thresholdPercent: 50,
    })).resolves.toBe(false)
  })
})
