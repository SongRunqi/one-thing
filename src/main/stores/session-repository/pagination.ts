import type {
  ChatMessage,
  GetSessionMessagesPageRequest,
  GetSessionMessagesPageResponse,
  SessionMessagePageCursor,
  UserMessageMarker,
} from '../../../shared/ipc.js'

const DEFAULT_PAGE_LIMIT = 16
const MAX_PAGE_LIMIT = 300

interface IndexedMessage {
  message: ChatMessage
  seq: number
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_PAGE_LIMIT
  return Math.max(1, Math.min(MAX_PAGE_LIMIT, Math.floor(limit)))
}

export function encodeMessagePageCursor(cursor: SessionMessagePageCursor): string {
  return JSON.stringify(cursor)
}

export function decodeMessagePageCursor(cursor: string): SessionMessagePageCursor | null {
  try {
    const parsed = JSON.parse(cursor) as Partial<SessionMessagePageCursor>
    if (
      typeof parsed.sessionId !== 'string' ||
      typeof parsed.seq !== 'number' ||
      typeof parsed.includeAnchor !== 'boolean'
    ) {
      return null
    }
    return {
      sessionId: parsed.sessionId,
      seq: parsed.seq,
      includeAnchor: parsed.includeAnchor,
    }
  } catch {
    return null
  }
}

function withSeq(messages: ChatMessage[]): IndexedMessage[] {
  return messages.map((message, index) => ({ message, seq: index + 1 }))
}

function cursorFor(sessionId: string, item: IndexedMessage | undefined, includeAnchor: boolean): string | null {
  if (!item) return null
  return encodeMessagePageCursor({ sessionId, seq: item.seq, includeAnchor })
}

function responseFromItems(
  sessionId: string,
  items: IndexedMessage[],
  totalCount: number,
): GetSessionMessagesPageResponse {
  const first = items[0]
  const last = items[items.length - 1]
  return {
    success: true,
    messages: items.map(item => ({ ...item.message, seq: item.seq })),
    nextCursor: cursorFor(sessionId, first, false),
    backwardsCursor: cursorFor(sessionId, last, true),
    hasMoreBefore: first ? first.seq > 1 : false,
    hasMoreAfter: last ? last.seq < totalCount : false,
    totalCount,
  }
}

export function getMessagesPageFromArray(
  messages: ChatMessage[],
  request: GetSessionMessagesPageRequest,
): GetSessionMessagesPageResponse {
  const indexed = withSeq(messages)
  const totalCount = indexed.length
  const limit = clampLimit(request.limit)

  if (totalCount === 0) {
    return responseFromItems(request.sessionId, [], totalCount)
  }

  if (request.cursor) {
    const cursor = decodeMessagePageCursor(request.cursor)
    if (!cursor || cursor.sessionId !== request.sessionId) {
      return { success: false, error: 'Invalid message page cursor' }
    }

    const direction = request.direction ?? 'older'
    const filtered = direction === 'newer'
      ? indexed.filter(item => cursor.includeAnchor ? item.seq >= cursor.seq : item.seq > cursor.seq)
      : indexed
          .filter(item => cursor.includeAnchor ? item.seq <= cursor.seq : item.seq < cursor.seq)
          .slice()
          .reverse()

    const page = filtered.slice(0, limit)
    const ordered = direction === 'older' ? page.reverse() : page
    return responseFromItems(request.sessionId, ordered, totalCount)
  }

  const anchor = request.anchor
  if (anchor && anchor !== 'tail') {
    const anchorSeq = anchor.seq ??
      indexed.find(item => item.message.id === anchor.messageId)?.seq
    if (!anchorSeq) {
      return { success: false, error: 'Anchor message not found' }
    }
    const before = Math.max(0, anchor.before ?? Math.floor(limit / 2))
    const after = Math.max(0, anchor.after ?? Math.max(0, limit - before - 1))
    const start = Math.max(1, anchorSeq - before)
    const end = Math.min(totalCount, anchorSeq + after)
    return responseFromItems(
      request.sessionId,
      indexed.filter(item => item.seq >= start && item.seq <= end),
      totalCount,
    )
  }

  const tail = indexed.slice(Math.max(0, totalCount - limit))
  return responseFromItems(request.sessionId, tail, totalCount)
}

export function getUserMessageMarkersFromArray(messages: ChatMessage[]): UserMessageMarker[] {
  return messages
    .map((message, index) => ({ message, seq: index + 1 }))
    .filter(item => item.message.role === 'user')
    .map(({ message, seq }) => ({
      id: message.id,
      seq,
      timestamp: message.timestamp,
      preview: message.content.replace(/\s+/g, ' ').trim().slice(0, 80),
    }))
}
