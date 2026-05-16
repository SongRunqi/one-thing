import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../../shared/ipc.js'
import { buildHistoryMessages } from '../stream/message-helpers.js'

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
})
