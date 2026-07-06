import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../../shared/ipc.js'
import {
  buildHistoryMessages,
  filterHistoryForNonToolAPI,
  sanitizeToolResultForAI,
} from '../stream/message-helpers.js'

function message(index: number, role: 'user' | 'assistant'): ChatMessage {
  return {
    id: `${role}-${index}`,
    role,
    content: `${role} ${index}`,
    timestamp: index,
  }
}

describe('buildHistoryMessages', () => {
  it('uses summary plus recent messages when the summary anchor exists', () => {
    const history = buildHistoryMessages(
      [
        message(1, 'user'),
        message(2, 'assistant'),
        message(3, 'user'),
      ],
      {
        id: 's1',
        summary: 'Earlier context',
        summaryUpToMessageId: 'assistant-2',
      },
    )

    expect(history).toHaveLength(3)
    expect(history[0]).toMatchObject({
      role: 'user',
      content: expect.stringContaining('Earlier context'),
    })
    expect(history[1]).toMatchObject({ role: 'assistant' })
    expect(history[2]).toMatchObject({ role: 'user', content: 'user 3' })
  })

  it('does not use a summary when the summary anchor is missing', () => {
    const history = buildHistoryMessages(
      [
        message(1, 'user'),
        message(2, 'assistant'),
      ],
      {
        id: 's1',
        summary: 'Stale context',
        summaryUpToMessageId: 'missing-message',
      },
    )

    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({ role: 'user', content: 'user 1' })
    expect(history[1]).toMatchObject({ role: 'assistant', content: 'assistant 2' })
  })

  it('labels user history with trusted channel actor without mutating stored content', () => {
    const stored = {
      ...message(1, 'user'),
      content: 'Can you summarize the thread?',
      origin: {
        transport: 'im',
        source: 'slack',
        actor: {
          externalUserId: 'u-1',
          displayName: 'Alice',
          handle: 'alice',
        },
        conversation: {
          connector: 'slack',
          externalConversationId: 'c-1',
          type: 'thread',
        },
        receivedAt: 123,
      },
    } satisfies ChatMessage

    const history = buildHistoryMessages([stored])

    expect(stored.content).toBe('Can you summarize the thread?')
    expect(history[0]).toMatchObject({
      role: 'user',
      content: 'Alice said:\nCan you summarize the thread?',
    })
  })

  it('caps retained message payload after a compact summary', () => {
    const history = buildHistoryMessages(
      [
        message(1, 'user'),
        message(2, 'assistant'),
        { ...message(3, 'user'), content: `old retained ${'a'.repeat(140_000)}` },
        { ...message(4, 'assistant'), content: `middle retained ${'b'.repeat(140_000)}` },
        { ...message(5, 'user'), content: `latest retained ${'c'.repeat(140_000)}` },
      ],
      {
        id: 's1',
        summary: 'Earlier context',
        summaryUpToMessageId: 'assistant-2',
      },
    )

    const joined = JSON.stringify(history)
    expect(joined).not.toContain('old retained')
    expect(joined).toContain('middle retained')
    expect(joined).toContain('latest retained')
  })

  it('summarizes oversized tool results in compacted retained history', () => {
    const history = buildHistoryMessages(
      [
        message(1, 'user'),
        message(2, 'assistant'),
        {
          ...message(3, 'assistant'),
          toolCalls: [{
            id: 'call_1',
            toolId: 'read',
            toolName: 'read',
            arguments: { path: '/tmp/large.txt' },
            status: 'completed',
            result: {
              title: 'Read large file',
              output: 'x'.repeat(80_000),
            },
            timestamp: 3,
          }],
        },
      ],
      {
        id: 's1',
        summary: 'Earlier context',
        summaryUpToMessageId: 'assistant-2',
      },
    )

    const toolMessage = history.find(item => item.role === 'tool')
    expect(toolMessage).toBeDefined()
    expect(JSON.stringify(toolMessage)).not.toContain('x'.repeat(10_000))
    expect(toolMessage).toMatchObject({
      role: 'tool',
      content: [{
        result: {
          truncated: true,
          title: 'Read large file',
          originalChars: expect.any(Number),
        },
      }],
    })
  })

  it('summarizes oversized failed tool results in compacted retained history', () => {
    const history = buildHistoryMessages(
      [
        message(1, 'user'),
        message(2, 'assistant'),
        {
          ...message(3, 'assistant'),
          toolCalls: [{
            id: 'call_failed',
            toolId: 'web_search',
            toolName: 'web_search',
            arguments: { query: 'docs' },
            status: 'failed',
            error: 'x'.repeat(80_000),
            timestamp: 3,
          }],
        },
      ],
      {
        id: 's1',
        summary: 'Earlier context',
        summaryUpToMessageId: 'assistant-2',
      },
    )

    const toolMessage = history.find(item => item.role === 'tool')
    expect(JSON.stringify(toolMessage)).not.toContain('x'.repeat(10_000))
    expect(toolMessage).toMatchObject({
      role: 'tool',
      content: [{
        result: {
          truncated: true,
          originalChars: expect.any(Number),
        },
      }],
    })
  })
})

describe('sanitizeToolResultForAI', () => {
  it('removes file rollback content and hashes recursively', () => {
    const result = sanitizeToolResultForAI({
      title: 'Edited file',
      metadata: {
        originalContent: 'secret file contents',
        originalContentHash: 'sha256',
        diff: 'diff text',
        nested: {
          originalContent: 'nested secret',
          originalContentHash: 'nested hash',
          keep: true,
        },
      },
      list: [
        {
          originalContent: 'array secret',
          originalContentHash: 'array hash',
          keep: 'value',
        },
      ],
    })

    expect(result).toEqual({
      title: 'Edited file',
      metadata: {
        diff: 'diff text',
        nested: {
          keep: true,
        },
      },
      list: [
        {
          keep: 'value',
        },
      ],
    })
  })
})

describe('filterHistoryForNonToolAPI', () => {
  it('keeps user and assistant messages through the runtime sessions facade', () => {
    expect(filterHistoryForNonToolAPI([
      { role: 'user', content: 'hello' },
      {
        role: 'tool',
        content: [{
          type: 'tool-result',
          toolCallId: 'call_1',
          toolName: 'read',
          result: { output: 'ok' },
        }],
      },
      { role: 'assistant', content: 'done', reasoningContent: 'read completed' },
    ])).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'done', reasoningContent: 'read completed' },
    ])
  })
})
