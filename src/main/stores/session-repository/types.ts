import type {
  ChatMessage,
  ChatSession,
  GetSessionMessagesPageRequest,
  GetSessionMessagesPageResponse,
  SessionDetails,
  SessionMeta,
  TokenUsage,
  UserMessageMarker,
} from '../../../shared/ipc.js'

export interface TurnUsage {
  inputTokens: number
  outputTokens: number
}

export interface SessionRepository {
  getSessionsList(): SessionMeta[]
  getSessionDetails(sessionId: string): SessionDetails | undefined
  getSessionMessagesPage(request: GetSessionMessagesPageRequest): GetSessionMessagesPageResponse
  getSessionForGeneration(sessionId: string): ChatSession | undefined
  getUserMessageMarkers(sessionId: string): UserMessageMarker[] | undefined
  createSession(sessionId: string, name: string): ChatSession
  addMessage(sessionId: string, message: ChatMessage): void
  updateMessage(sessionId: string, messageId: string, updates: Partial<ChatMessage>): boolean
  updateMessageAndTruncate(
    sessionId: string,
    messageId: string,
    newContent: string,
    options?: { contentParts?: ChatMessage['contentParts'] | null }
  ): boolean
  updateSessionTokenUsage(sessionId: string, usage: TokenUsage, lastTurnUsage?: TurnUsage): void
  flushSessionSave(sessionId: string): Promise<void>
  flushAllPendingSaves(): Promise<void>
}
