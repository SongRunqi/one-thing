import type {
  CoreSessionDetails,
  CoreSessionMeta,
  CoreSessionTokenUsage,
  StoredChatMessage,
  UserMessageMarker,
} from '@onething/core/session'

export interface OnethingSqliteContextVariable {
  name: string
  value: string
  values?: string[]
  scope?: 'global' | 'session'
  description?: string
  readonly?: boolean
  updatedAt?: number
}

export interface OnethingSqliteChatMessage extends StoredChatMessage {
  role: string
  timestamp: number
  reasoning?: string
  isStreaming?: boolean
  isThinking?: boolean
  errorDetails?: string
  model?: string
  provider?: string
  thinkingTime?: number
  thinkingStartTime?: number
  skillUsed?: string
  contentParts?: unknown[]
  toolCalls?: unknown[]
  steps?: unknown[]
  attachments?: unknown[]
  usage?: CoreSessionTokenUsage
}

export interface OnethingSqliteSessionMeta extends CoreSessionMeta {
  parentSessionId?: string
  branchFromMessageId?: string
  lastModel?: string
  lastProvider?: string
  isPinned?: boolean
  isArchived?: boolean
  archivedAt?: number
  workingDirectory?: string
  workingDirectoryRoots?: string[]
  summary?: string
  summaryUpToMessageId?: string
  summaryCreatedAt?: number
  promptContext?: unknown
  variables?: OnethingSqliteContextVariable[]
}

export interface OnethingSqliteChatSession extends OnethingSqliteSessionMeta {
  messages: OnethingSqliteChatMessage[]
}

export interface OnethingSqliteSessionDetails extends CoreSessionDetails {
  variables?: OnethingSqliteContextVariable[]
}

export type OnethingSqliteUserMessageMarker = UserMessageMarker

export interface OnethingSqliteRepositoryAdapters<
  TSession extends OnethingSqliteChatSession = OnethingSqliteChatSession,
> {
  getSessionDatabasePath(): string
  getSessionPath(sessionId: string): string
  readJsonFile<TValue>(filePath: string, fallback: TValue): TValue
}
