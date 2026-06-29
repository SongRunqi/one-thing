import type {
  ChatMessage,
  ChatSession,
  GetSessionMessagesPageRequest,
  GetSessionMessagesPageResponse,
  SessionDetails,
  SessionMeta,
  UserMessageMarker,
} from '../../../shared/ipc.js'
import {
  configureOnethingSqliteSessionRepositoryRuntime,
  deleteSqliteMessage as runtimeDeleteSqliteMessage,
  deleteSqliteMessageAndAfter as runtimeDeleteSqliteMessageAndAfter,
  deleteSqliteSessions as runtimeDeleteSqliteSessions,
  getSessionDatabase as runtimeGetSessionDatabase,
  getSqliteMessagesPage as runtimeGetSqliteMessagesPage,
  getSqliteSessionDetails as runtimeGetSqliteSessionDetails,
  getSqliteUserMessageMarkers as runtimeGetSqliteUserMessageMarkers,
  importSessionIndexToSqlite as runtimeImportSessionIndexToSqlite,
  initializeSqliteSessionRepository as runtimeInitializeSqliteSessionRepository,
  isSqliteSessionReady as runtimeIsSqliteSessionReady,
  migrateSessionToSqliteNow as runtimeMigrateSessionToSqliteNow,
  scheduleSessionSqliteMigration as runtimeScheduleSessionSqliteMigration,
  syncFullSessionToSqlite as runtimeSyncFullSessionToSqlite,
  syncSqliteMessage as runtimeSyncSqliteMessage,
  syncSqliteSessionMetadata as runtimeSyncSqliteSessionMetadata,
  syncSqliteSessionUsage as runtimeSyncSqliteSessionUsage,
  syncSqliteSessionVariables as runtimeSyncSqliteSessionVariables,
  upsertSessionMetadata as runtimeUpsertSessionMetadata,
  upsertSqliteMessageAndTruncate as runtimeUpsertSqliteMessageAndTruncate,
} from '@onething/runtime/sessions'
import type {
  OnethingSqliteChatMessage,
  OnethingSqliteChatSession,
  OnethingSqliteContextVariable,
  OnethingSqliteRepositoryAdapters,
  OnethingSqliteSessionDetails,
  OnethingSqliteSessionMeta,
  OnethingSqliteUserMessageMarker,
} from '@onething/runtime/sessions'
import {
  getSessionDatabasePath,
  getSessionPath,
  readJsonFile,
} from '../paths.js'

configureOnethingSqliteSessionRepositoryRuntime({
  getSessionDatabasePath,
  getSessionPath,
  readJsonFile,
})

export { configureOnethingSqliteSessionRepositoryRuntime }

export function initializeSqliteSessionRepository(): void {
  runtimeInitializeSqliteSessionRepository()
}

export function getSessionDatabase(): ReturnType<typeof runtimeGetSessionDatabase> {
  return runtimeGetSessionDatabase()
}

export function upsertSessionMetadata(meta: SessionMeta | SessionDetails): void {
  runtimeUpsertSessionMetadata(meta as OnethingSqliteSessionMeta | OnethingSqliteSessionDetails)
}

export function importSessionIndexToSqlite(index: SessionMeta[]): void {
  runtimeImportSessionIndexToSqlite(index as OnethingSqliteSessionMeta[])
}

export function getSqliteSessionDetails(sessionId: string): SessionDetails | undefined {
  return runtimeGetSqliteSessionDetails(sessionId) as SessionDetails | undefined
}

export function isSqliteSessionReady(sessionId: string): boolean {
  return runtimeIsSqliteSessionReady(sessionId)
}

export function getSqliteMessagesPage(
  request: GetSessionMessagesPageRequest,
): GetSessionMessagesPageResponse | undefined {
  return runtimeGetSqliteMessagesPage(request) as GetSessionMessagesPageResponse | undefined
}

export function getSqliteUserMessageMarkers(sessionId: string): UserMessageMarker[] | undefined {
  return runtimeGetSqliteUserMessageMarkers(sessionId) as UserMessageMarker[] | undefined
}

export function syncFullSessionToSqlite(session: ChatSession): void {
  runtimeSyncFullSessionToSqlite(session as OnethingSqliteChatSession)
}

export function syncSqliteSessionMetadata(session: ChatSession): void {
  runtimeSyncSqliteSessionMetadata(session as OnethingSqliteChatSession)
}

export function syncSqliteSessionUsage(session: ChatSession): void {
  runtimeSyncSqliteSessionUsage(session as OnethingSqliteChatSession)
}

export function syncSqliteSessionVariables(session: ChatSession): void {
  runtimeSyncSqliteSessionVariables(session as OnethingSqliteChatSession)
}

export function syncSqliteMessage(sessionId: string, message: ChatMessage, seq: number): void {
  runtimeSyncSqliteMessage(sessionId, message as OnethingSqliteChatMessage, seq)
}

export function deleteSqliteMessage(sessionId: string, messageId: string): void {
  runtimeDeleteSqliteMessage(sessionId, messageId)
}

export function deleteSqliteMessageAndAfter(sessionId: string, messageId: string): void {
  runtimeDeleteSqliteMessageAndAfter(sessionId, messageId)
}

export function upsertSqliteMessageAndTruncate(sessionId: string, message: ChatMessage, seq: number): void {
  runtimeUpsertSqliteMessageAndTruncate(sessionId, message as OnethingSqliteChatMessage, seq)
}

export function deleteSqliteSessions(sessionIds: string[]): void {
  runtimeDeleteSqliteSessions(sessionIds)
}

export function migrateSessionToSqliteNow(sessionId: string): boolean {
  return runtimeMigrateSessionToSqliteNow(sessionId)
}

export function scheduleSessionSqliteMigration(sessionId: string): void {
  runtimeScheduleSessionSqliteMigration(sessionId)
}

export type {
  OnethingSqliteChatMessage,
  OnethingSqliteChatSession,
  OnethingSqliteContextVariable,
  OnethingSqliteRepositoryAdapters,
  OnethingSqliteSessionDetails,
  OnethingSqliteSessionMeta,
  OnethingSqliteUserMessageMarker,
}
