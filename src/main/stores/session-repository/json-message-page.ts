import fs from 'node:fs'
import type {
  ChatMessage,
  GetSessionMessagesPageRequest,
  GetSessionMessagesPageResponse,
} from '../../../shared/ipc.js'
import { getSessionPath } from '../paths.js'
import {
  decodeMessagePageCursor,
  encodeMessagePageCursor,
} from './pagination.js'

interface MessageSlice {
  seq: number
  start: number
  end: number
}

interface JsonMessagePageCursor {
  sessionId: string
  seq: number
  includeAnchor: boolean
  byteStart?: number
  byteEnd?: number
}

function findMessagesArrayStart(json: string): number {
  let depth = 0
  let inString = false
  let escaped = false
  let stringStart = -1

  for (let i = 0; i < json.length; i++) {
    const ch = json[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
        if (depth === 1 && json.slice(stringStart + 1, i) === 'messages') {
          let j = i + 1
          while (/\s/.test(json[j] || '')) j++
          if (json[j] !== ':') continue
          j++
          while (/\s/.test(json[j] || '')) j++
          if (json[j] === '[') return j
        }
      }
      continue
    }

    if (ch === '"') {
      inString = true
      stringStart = i
    } else if (ch === '{' || ch === '[') {
      depth++
    } else if (ch === '}' || ch === ']') {
      depth--
    }
  }

  return -1
}

function findArrayEnd(json: string, arrayStart: number): number {
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = arrayStart; i < json.length; i++) {
    const ch = json[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
    } else if (ch === '[') {
      depth++
    } else if (ch === ']') {
      depth--
      if (depth === 0) return i
    }
  }

  return -1
}

function collectMessageSlices(json: string, arrayStart: number, arrayEnd: number): MessageSlice[] {
  const slices: MessageSlice[] = []
  let objectDepth = 0
  let objectStart = -1
  let inString = false
  let escaped = false

  for (let i = arrayStart + 1; i < arrayEnd; i++) {
    const ch = json[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
    } else if (ch === '{') {
      if (objectDepth === 0) objectStart = i
      objectDepth++
    } else if (ch === '}') {
      objectDepth--
      if (objectDepth === 0 && objectStart >= 0) {
        slices.push({ seq: slices.length + 1, start: objectStart, end: i + 1 })
        objectStart = -1
      }
    }
  }

  return slices
}

function cursorFor(sessionId: string, slice: MessageSlice | undefined, includeAnchor: boolean): string | null {
  if (!slice) return null
  return encodeMessagePageCursor({ sessionId, seq: slice.seq, includeAnchor })
}

function jsonCursorFor(sessionId: string, slice: MessageSlice | undefined, includeAnchor: boolean): string | null {
  if (!slice) return null
  return JSON.stringify({
    sessionId,
    seq: slice.seq,
    includeAnchor,
    byteStart: slice.start,
    byteEnd: slice.end,
  } satisfies JsonMessagePageCursor)
}

function decodeJsonCursor(cursor: string): JsonMessagePageCursor | null {
  try {
    const parsed = JSON.parse(cursor) as Partial<JsonMessagePageCursor>
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
      byteStart: typeof parsed.byteStart === 'number' ? parsed.byteStart : undefined,
      byteEnd: typeof parsed.byteEnd === 'number' ? parsed.byteEnd : undefined,
    }
  } catch {
    return null
  }
}

function parseMessages(json: string, slices: MessageSlice[]): ChatMessage[] {
  const messages: ChatMessage[] = []
  for (const slice of slices) {
    messages.push({
      ...(JSON.parse(json.slice(slice.start, slice.end)) as ChatMessage),
      seq: slice.seq,
    })
  }
  return messages
}

function responseFromSlices(
  sessionId: string,
  json: string,
  slices: MessageSlice[],
  totalCount: number,
): GetSessionMessagesPageResponse {
  const first = slices[0]
  const last = slices[slices.length - 1]
  return {
    success: true,
    messages: parseMessages(json, slices),
    nextCursor: cursorFor(sessionId, first, false),
    backwardsCursor: cursorFor(sessionId, last, true),
    hasMoreBefore: first ? first.seq > 1 : false,
    hasMoreAfter: last ? last.seq < totalCount : false,
    totalCount,
  }
}

function fastResponseFromSlices(
  sessionId: string,
  json: string,
  slices: MessageSlice[],
  hasMoreBefore: boolean,
  hasMoreAfter: boolean,
): GetSessionMessagesPageResponse {
  const first = slices[0]
  const last = slices[slices.length - 1]
  return {
    success: true,
    messages: parseMessages(json, slices),
    nextCursor: jsonCursorFor(sessionId, first, false),
    backwardsCursor: jsonCursorFor(sessionId, last, true),
    hasMoreBefore,
    hasMoreAfter,
  }
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return 16
  return Math.max(1, Math.min(300, Math.floor(limit)))
}

function collectSlicesBackward(
  json: string,
  fromIndex: number,
  lowerBound: number,
  limit: number,
): MessageSlice[] {
  const slices: MessageSlice[] = []
  let objectDepth = 0
  let objectEnd = -1
  let inString = false
  let escaped = false

  for (let i = fromIndex; i > lowerBound && slices.length < limit; i--) {
    const ch = json[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
    } else if (ch === '}') {
      if (objectDepth === 0) objectEnd = i + 1
      objectDepth++
    } else if (ch === '{') {
      objectDepth--
      if (objectDepth === 0 && objectEnd >= 0) {
        slices.push({ seq: slices.length + 1, start: i, end: objectEnd })
        objectEnd = -1
      }
    }
  }

  return slices.reverse()
}

function hasObjectBefore(json: string, arrayStart: number, byteStart: number): boolean {
  return json.lastIndexOf('{', byteStart - 1) > arrayStart
}

function fastTailPage(
  request: GetSessionMessagesPageRequest,
  json: string,
  arrayStart: number,
  arrayEnd: number,
  limit: number,
): GetSessionMessagesPageResponse {
  const slices = collectSlicesBackward(json, arrayEnd - 1, arrayStart, limit)
  return fastResponseFromSlices(
    request.sessionId,
    json,
    slices,
    slices.length > 0 ? hasObjectBefore(json, arrayStart, slices[0].start) : false,
    false,
  )
}

function fastOlderPage(
  request: GetSessionMessagesPageRequest,
  json: string,
  arrayStart: number,
  cursor: JsonMessagePageCursor,
  limit: number,
): GetSessionMessagesPageResponse | null {
  if (typeof cursor.byteStart !== 'number') return null
  const startFrom = cursor.includeAnchor
    ? (cursor.byteEnd ?? cursor.byteStart) - 1
    : cursor.byteStart - 1
  const slices = collectSlicesBackward(json, startFrom, arrayStart, limit)
  return fastResponseFromSlices(
    request.sessionId,
    json,
    slices,
    slices.length > 0 ? hasObjectBefore(json, arrayStart, slices[0].start) : false,
    true,
  )
}

export function getMessagesPageFromJsonFile(
  request: GetSessionMessagesPageRequest,
): GetSessionMessagesPageResponse | null {
  const sessionPath = getSessionPath(request.sessionId)
  if (!fs.existsSync(sessionPath)) return null

  try {
    const json = fs.readFileSync(sessionPath, 'utf-8')
    const arrayStart = findMessagesArrayStart(json)
    if (arrayStart < 0) return null
    const arrayEnd = findArrayEnd(json, arrayStart)
    if (arrayEnd < 0) return null

    const limit = clampLimit(request.limit)

    if (request.cursor) {
      const jsonCursor = decodeJsonCursor(request.cursor)
      if (!jsonCursor || jsonCursor.sessionId !== request.sessionId) {
        return { success: false, error: 'Invalid message page cursor' }
      }
      if ((request.direction ?? 'older') === 'older') {
        const fastOlder = fastOlderPage(request, json, arrayStart, jsonCursor, limit)
        if (fastOlder) return fastOlder
      }
    } else if (!request.anchor || request.anchor === 'tail') {
      return fastTailPage(request, json, arrayStart, arrayEnd, limit)
    }

    const allSlices = collectMessageSlices(json, arrayStart, arrayEnd)
    const totalCount = allSlices.length

    if (totalCount === 0) {
      return responseFromSlices(request.sessionId, json, [], totalCount)
    }

    if (request.cursor) {
      const cursor = decodeMessagePageCursor(request.cursor)
      if (!cursor || cursor.sessionId !== request.sessionId) {
        return { success: false, error: 'Invalid message page cursor' }
      }

      const direction = request.direction ?? 'older'
      const selected = direction === 'newer'
        ? allSlices.filter(slice => cursor.includeAnchor ? slice.seq >= cursor.seq : slice.seq > cursor.seq).slice(0, limit)
        : allSlices.filter(slice => cursor.includeAnchor ? slice.seq <= cursor.seq : slice.seq < cursor.seq).slice(-limit)

      return responseFromSlices(request.sessionId, json, selected, totalCount)
    }

    const anchor = request.anchor
    if (anchor && anchor !== 'tail') {
      let anchorSeq = anchor.seq
      if (!anchorSeq && anchor.messageId) {
        for (const slice of allSlices) {
          const message = JSON.parse(json.slice(slice.start, slice.end)) as Pick<ChatMessage, 'id'>
          if (message.id === anchor.messageId) {
            anchorSeq = slice.seq
            break
          }
        }
      }
      if (!anchorSeq) return { success: false, error: 'Anchor message not found' }

      const before = Math.max(0, anchor.before ?? Math.floor(limit / 2))
      const after = Math.max(0, anchor.after ?? Math.max(0, limit - before - 1))
      const startSeq = Math.max(1, anchorSeq - before)
      const endSeq = Math.min(totalCount, anchorSeq + after)
      const selected = allSlices.filter(slice => slice.seq >= startSeq && slice.seq <= endSeq)
      return responseFromSlices(request.sessionId, json, selected, totalCount)
    }

    return responseFromSlices(request.sessionId, json, allSlices.slice(-limit), totalCount)
  } catch (error) {
    console.warn('[Sessions] Failed to read message page without full JSON parse:', error)
    return null
  }
}
