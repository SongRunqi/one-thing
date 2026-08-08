import { create } from 'zustand'
import { abortStream, getMessagePage, sendMessage, type ServerTarget } from '../lib/api'
import {
  applyHistoryPage,
  applySessionEvent as reduceSessionEvent,
  applyStreamChunk as reduceStreamChunk,
  initialChatState,
  type ChatState,
  type SessionEventEnvelopeWire,
  type StreamChunkWire,
} from '../lib/chat-reducer'

export interface SessionChat extends ChatState {
  loaded: boolean
  loadingOlder: boolean
  backwardsCursor: string | null
  hasMoreBefore: boolean
}

interface MessagesState {
  bySession: Record<string, SessionChat>
  loadInitial: (target: ServerTarget, sessionId: string) => Promise<void>
  loadOlder: (target: ServerTarget, sessionId: string) => Promise<void>
  send: (target: ServerTarget, sessionId: string, content: string) => Promise<boolean>
  abort: (target: ServerTarget, sessionId: string) => Promise<void>
  /** Entry points for EventStreamService frames. */
  applySessionEvent: (sessionId: string, envelope: SessionEventEnvelopeWire) => void
  applyStreamChunk: (sessionId: string, chunk: StreamChunkWire) => void
}

function emptySessionChat(): SessionChat {
  return {
    ...initialChatState,
    loaded: false,
    loadingOlder: false,
    backwardsCursor: null,
    hasMoreBefore: false,
  }
}

export const useMessagesStore = create<MessagesState>((set, get) => {
  function update(sessionId: string, patch: (chat: SessionChat) => SessionChat): void {
    set((state) => ({
      bySession: {
        ...state.bySession,
        [sessionId]: patch(state.bySession[sessionId] ?? emptySessionChat()),
      },
    }))
  }

  return {
    bySession: {},

    loadInitial: async (target, sessionId) => {
      const result = await getMessagePage(target, sessionId, null, 50)
      update(sessionId, (chat) => ({
        ...chat,
        ...applyHistoryPage(chat, result.messages ?? [], false),
        loaded: true,
        backwardsCursor: result.backwardsCursor ?? null,
        hasMoreBefore: Boolean(result.hasMoreBefore),
      }))
    },

    loadOlder: async (target, sessionId) => {
      const chat = get().bySession[sessionId]
      if (!chat?.backwardsCursor || chat.loadingOlder || !chat.hasMoreBefore) return
      const cursor = chat.backwardsCursor
      update(sessionId, (c) => ({ ...c, loadingOlder: true }))
      try {
        const result = await getMessagePage(target, sessionId, cursor, 50)
        update(sessionId, (c) => ({
          ...c,
          ...applyHistoryPage(c, result.messages ?? [], true),
          loadingOlder: false,
          backwardsCursor: result.backwardsCursor ?? null,
          hasMoreBefore: Boolean(result.hasMoreBefore),
        }))
      } catch {
        update(sessionId, (c) => ({ ...c, loadingOlder: false }))
      }
    },

    send: async (target, sessionId, content) => {
      // No optimistic insert: the engine persists the user message and echoes
      // message:user-created back over SSE — one write path, no duplicates.
      const result = await sendMessage(target, sessionId, content)
      return result.success
    },

    abort: async (target, sessionId) => {
      await abortStream(target, sessionId)
    },

    applySessionEvent: (sessionId, envelope) => {
      update(sessionId, (chat) => ({ ...chat, ...reduceSessionEvent(chat, envelope) }))
    },

    applyStreamChunk: (sessionId, chunk) => {
      update(sessionId, (chat) => ({ ...chat, ...reduceStreamChunk(chat, chunk) }))
    },
  }
})
