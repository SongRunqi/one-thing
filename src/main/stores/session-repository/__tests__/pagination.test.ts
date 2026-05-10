import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../../../shared/ipc.js'
import {
  encodeMessagePageCursor,
  getMessagesPageFromArray,
  getUserMessageMarkersFromArray,
} from '../pagination.js'

function message(index: number, role: ChatMessage['role'] = 'assistant'): ChatMessage {
  return {
    id: `msg-${index}`,
    role,
    content: `message ${index}`,
    timestamp: index,
  }
}

describe('session message pagination', () => {
  const messages = Array.from({ length: 10 }, (_, index) =>
    message(index + 1, (index + 1) % 3 === 0 ? 'user' : 'assistant')
  )

  it('returns the tail page in chronological order', () => {
    const page = getMessagesPageFromArray(messages, {
      sessionId: 's1',
      anchor: 'tail',
      limit: 4,
    })

    expect(page.success).toBe(true)
    expect(page.messages?.map(m => m.id)).toEqual(['msg-7', 'msg-8', 'msg-9', 'msg-10'])
    expect(page.hasMoreBefore).toBe(true)
    expect(page.hasMoreAfter).toBe(false)
  })

  it('returns older messages before a cursor in chronological order', () => {
    const cursor = encodeMessagePageCursor({
      sessionId: 's1',
      seq: 7,
      includeAnchor: false,
    })

    const page = getMessagesPageFromArray(messages, {
      sessionId: 's1',
      cursor,
      direction: 'older',
      limit: 3,
    })

    expect(page.success).toBe(true)
    expect(page.messages?.map(m => m.id)).toEqual(['msg-4', 'msg-5', 'msg-6'])
    expect(page.hasMoreBefore).toBe(true)
    expect(page.hasMoreAfter).toBe(true)
  })

  it('returns newer messages after a cursor in chronological order', () => {
    const cursor = encodeMessagePageCursor({
      sessionId: 's1',
      seq: 4,
      includeAnchor: false,
    })

    const page = getMessagesPageFromArray(messages, {
      sessionId: 's1',
      cursor,
      direction: 'newer',
      limit: 3,
    })

    expect(page.success).toBe(true)
    expect(page.messages?.map(m => m.id)).toEqual(['msg-5', 'msg-6', 'msg-7'])
    expect(page.hasMoreBefore).toBe(true)
    expect(page.hasMoreAfter).toBe(true)
  })

  it('returns an empty successful page for empty sessions', () => {
    const page = getMessagesPageFromArray([], {
      sessionId: 's1',
      anchor: 'tail',
    })

    expect(page.success).toBe(true)
    expect(page.messages).toEqual([])
    expect(page.nextCursor).toBeNull()
    expect(page.backwardsCursor).toBeNull()
    expect(page.totalCount).toBe(0)
  })

  it('returns a window around an anchor message', () => {
    const page = getMessagesPageFromArray(messages, {
      sessionId: 's1',
      anchor: {
        messageId: 'msg-5',
        before: 2,
        after: 1,
      },
    })

    expect(page.success).toBe(true)
    expect(page.messages?.map(m => m.id)).toEqual(['msg-3', 'msg-4', 'msg-5', 'msg-6'])
  })

  it('rejects cursors from another session', () => {
    const cursor = encodeMessagePageCursor({
      sessionId: 'other',
      seq: 7,
      includeAnchor: false,
    })

    const page = getMessagesPageFromArray(messages, {
      sessionId: 's1',
      cursor,
      limit: 3,
    })

    expect(page.success).toBe(false)
  })

  it('builds user message markers without full message bodies', () => {
    const markers = getUserMessageMarkersFromArray(messages)

    expect(markers.map(marker => [marker.id, marker.seq])).toEqual([
      ['msg-3', 3],
      ['msg-6', 6],
      ['msg-9', 9],
    ])
  })
})
