import type {
  ChatMessage,
  ChatSession,
  ToolCall,
  Step,
  ContentPart,
  SessionMeta,
  SessionDetails,
  ContextVariable,
  GetSessionMessagesPageRequest,
  GetSessionMessagesPageResponse,
  PromptContextState,
  UserMessageMarker,
} from '../../shared/ipc.js'
import {
  getSessionsDir,
  getSessionPath,
  readJsonFile,
  writeJsonFile,
  writeJsonFileAsync,
  deleteJsonFile,
} from './paths.js'
import { getCurrentSessionId, setCurrentSessionId } from './app-state.js'
import { getSettings } from './settings.js'
import { expandPath } from '../tools/core/sandbox.js'
import {
  createOnethingResilientSessionSqliteAdapters,
  createOnethingSessionMessageRuntime,
  createOnethingSessionRepository,
  type OnethingSessionMessageRuntime,
} from '@onething/runtime/sessions'
import {
  deleteSqliteMessage as rawDeleteSqliteMessage,
  deleteSqliteMessageAndAfter as rawDeleteSqliteMessageAndAfter,
  deleteSqliteSessions as rawDeleteSqliteSessions,
  getSqliteMessagesPage as rawGetSqliteMessagesPage,
  getSqliteSessionDetails as rawGetSqliteSessionDetails,
  getSqliteUserMessageMarkers as rawGetSqliteUserMessageMarkers,
  importSessionIndexToSqlite as rawImportSessionIndexToSqlite,
  isSqliteSessionReady as rawIsSqliteSessionReady,
  scheduleSessionSqliteMigration as rawScheduleSessionSqliteMigration,
  syncFullSessionToSqlite as rawSyncFullSessionToSqlite,
  syncSqliteMessage as rawSyncSqliteMessage,
  syncSqliteSessionMetadata as rawSyncSqliteSessionMetadata,
  syncSqliteSessionUsage as rawSyncSqliteSessionUsage,
  syncSqliteSessionVariables as rawSyncSqliteSessionVariables,
  upsertSqliteMessageAndTruncate as rawUpsertSqliteMessageAndTruncate,
} from './session-repository/sqlite-repository.js'
import {
  CORE_DEFAULT_AGENT_ID as DEFAULT_AGENT_ID,
  deriveRetainedContextSize,
  repairSessionTimelineMetadata,
  sanitizeSessionOnStartup,
} from '@onething/core/session'

export {
  deriveRetainedContextSize,
  repairSessionTimelineMetadata,
  sanitizeSessionOnStartup,
}

// ============ 异步节流落盘 ============
// Streaming updates (每个 token) 会频繁触发 updateMessageContent 等写入,
// 同步 writeFileSync 会阻塞事件循环并拖慢流式节奏。
// 策略:更新内存缓存后,用 300ms 节流把脏 session 异步写盘。
// 同一 session 的多次写入在 promise 链上串行化,避免旧异步写盖新数据。
// 关键生命周期(finalize / delete / 应用退出)会强制 flush。
const SQLITE_STREAM_SYNC_THROTTLE_MS = 1000
let sessionMessageRuntime: OnethingSessionMessageRuntime<
  ChatSession,
  ChatMessage,
  SessionMeta,
  Step,
  ContentPart,
  ToolCall
> | undefined

function cancelPendingSqliteMessageSyncs(sessionId: string): void {
  sessionMessageRuntime?.cancelPendingSqliteMessageSyncs(sessionId)
}

const sqliteSessionAdapters = createOnethingResilientSessionSqliteAdapters<
  ChatSession,
  ChatMessage,
  SessionMeta,
  SessionDetails,
  UserMessageMarker
>({
  adapters: {
    importSessionIndex: rawImportSessionIndexToSqlite,
    getSessionDetails: rawGetSqliteSessionDetails,
    getMessagesPage: rawGetSqliteMessagesPage,
    getUserMessageMarkers: rawGetSqliteUserMessageMarkers,
    isSessionReady: rawIsSqliteSessionReady,
    scheduleMigration: rawScheduleSessionSqliteMigration,
    syncFullSession: rawSyncFullSessionToSqlite,
    syncSessionMetadata: rawSyncSqliteSessionMetadata,
    syncSessionUsage: rawSyncSqliteSessionUsage,
    syncSessionVariables: rawSyncSqliteSessionVariables,
    deleteSessions: rawDeleteSqliteSessions,
    syncMessage: rawSyncSqliteMessage,
    deleteMessage: rawDeleteSqliteMessage,
    deleteMessageAndAfter: rawDeleteSqliteMessageAndAfter,
    upsertMessageAndTruncate: rawUpsertSqliteMessageAndTruncate,
  },
  isEnabled: () => process.env.ONETHING_HEADLESS !== '1',
  logger: console,
})

const sessionRepository = createOnethingSessionRepository<
  ChatSession,
  ChatMessage,
  SessionMeta,
  SessionDetails,
  UserMessageMarker
>({
  defaultAgentId: DEFAULT_AGENT_ID,
  getSessionsDir,
  getSessionPath,
  readJsonFile,
  writeJsonFile,
  writeJsonFileAsync,
  deleteJsonFile,
  getCurrentSessionId,
  setCurrentSessionId,
  getDefaultWorkingDirectory: () => getSettings().tools?.bash?.defaultWorkingDirectory,
  expandPath,
  cancelPendingSideEffects: cancelPendingSqliteMessageSyncs,
  sqlite: sqliteSessionAdapters,
  logger: console,
})

sessionMessageRuntime = createOnethingSessionMessageRuntime<
  ChatSession,
  ChatMessage,
  SessionMeta,
  Step,
  ContentPart,
  ToolCall
>({
  repository: {
    getSession: sessionId => sessionRepository.getSession(sessionId),
    getCachedSession: sessionId => sessionRepository.getCachedSession(sessionId),
    saveSessionToFile: (sessionId, session) => sessionRepository.saveSessionToFile(sessionId, session),
    syncSessionToSqliteIfReady: session => sessionRepository.syncSessionToSqliteIfReady(session),
    updateSessionsIndexMeta: (sessionId, update) => sessionRepository.updateSessionsIndexMeta(sessionId, update),
  },
  sqlite: {
    isSessionReady: sessionId => sqliteSessionAdapters.isSessionReady?.(sessionId) ?? false,
    scheduleMigration: sessionId => sqliteSessionAdapters.scheduleMigration?.(sessionId),
    syncMessage: (sessionId, message, seq) => sqliteSessionAdapters.syncMessage?.(sessionId, message, seq),
    syncSessionMetadata: session => sqliteSessionAdapters.syncSessionMetadata?.(session),
    syncSessionUsage: session => sqliteSessionAdapters.syncSessionUsage?.(session),
    deleteMessage: (sessionId, messageId) => sqliteSessionAdapters.deleteMessage?.(sessionId, messageId),
    deleteMessageAndAfter: (sessionId, messageId) => sqliteSessionAdapters.deleteMessageAndAfter?.(sessionId, messageId),
    upsertMessageAndTruncate: (sessionId, message, seq) =>
      sqliteSessionAdapters.upsertMessageAndTruncate?.(sessionId, message, seq),
  },
  streamSyncThrottleMs: SQLITE_STREAM_SYNC_THROTTLE_MS,
  now: Date.now,
  logger: console,
})

function updateSessionsIndexMeta(
  sessionId: string,
  update: (meta: SessionMeta) => void,
): boolean {
  return sessionRepository.updateSessionsIndexMeta(sessionId, update)
}

function importSessionIndexToSqlite(index: SessionMeta[]): void {
  sqliteSessionAdapters.importSessionIndex?.(index)
}

function getSqliteSessionDetails(sessionId: string): SessionDetails | undefined {
  return sqliteSessionAdapters.getSessionDetails?.(sessionId)
}

function getSqliteMessagesPage(request: GetSessionMessagesPageRequest): GetSessionMessagesPageResponse | undefined {
  return sqliteSessionAdapters.getMessagesPage?.(request) as GetSessionMessagesPageResponse | undefined
}

function getSqliteUserMessageMarkers(sessionId: string): UserMessageMarker[] | undefined {
  return sqliteSessionAdapters.getUserMessageMarkers?.(sessionId)
}

function isSqliteSessionReady(sessionId: string): boolean {
  return sqliteSessionAdapters.isSessionReady?.(sessionId) ?? false
}

function scheduleSessionSqliteMigration(sessionId: string): void {
  sqliteSessionAdapters.scheduleMigration?.(sessionId)
}

function syncFullSessionToSqlite(session: ChatSession): void {
  sqliteSessionAdapters.syncFullSession?.(session)
}

function syncSqliteMessage(sessionId: string, message: ChatMessage, seq: number): void {
  sqliteSessionAdapters.syncMessage?.(sessionId, message, seq)
}

function syncSqliteSessionMetadata(session: ChatSession): void {
  sqliteSessionAdapters.syncSessionMetadata?.(session)
}

function syncSqliteSessionUsage(session: ChatSession): void {
  sqliteSessionAdapters.syncSessionUsage?.(session)
}

function syncSqliteSessionVariables(session: ChatSession): void {
  sqliteSessionAdapters.syncSessionVariables?.(session)
}

function deleteSqliteSessions(sessionIds: string[]): void {
  sqliteSessionAdapters.deleteSessions?.(sessionIds)
}

function deleteSqliteMessage(sessionId: string, messageId: string): void {
  sqliteSessionAdapters.deleteMessage?.(sessionId, messageId)
}

function deleteSqliteMessageAndAfter(sessionId: string, messageId: string): void {
  sqliteSessionAdapters.deleteMessageAndAfter?.(sessionId, messageId)
}

function upsertSqliteMessageAndTruncate(sessionId: string, message: ChatMessage, seq: number): void {
  sqliteSessionAdapters.upsertMessageAndTruncate?.(sessionId, message, seq)
}

/**
 * 强制刷盘单个 session,等待所有挂起的写入完成。
 * 用于 stream 结束、session 删除前等关键点。
 */
export async function flushSessionSave(sessionId: string): Promise<void> {
  await sessionRepository.flushSessionSave(sessionId)
}

/**
 * 应用退出前调用,刷完所有挂起的异步写入。
 */
export async function flushAllPendingSaves(): Promise<void> {
  await sessionRepository.flushAllPendingSaves()
}

/**
 * 统一的保存函数 - 更新缓存并安排异步落盘
 * 默认节流异步,finalize/delete 等关键路径可调 flushSessionSave 强刷
 */
function saveSessionToFile(sessionId: string, session: ChatSession): void {
  sessionRepository.saveSessionToFile(sessionId, session)
}

/**
 * 失效单个 session 缓存
 */
export function invalidateSessionCache(sessionId: string): void {
  sessionRepository.invalidateSessionCache(sessionId)
}

/**
 * 清空所有缓存（应用重启时可能需要）
 */
export function clearAllSessionCache(): void {
  sessionRepository.clearAllSessionCache()
}

/**
 * 获取 LRU 缓存统计信息（调试用）
 */
export function getSessionCacheStats(): { size: number; maxSize: number; cachedSessionIds: string[] } {
  return sessionRepository.getSessionCacheStats()
}

/**
 * Sanitize all sessions on app startup - clean up interrupted states
 * This should only be called once when the app starts
 */
export function sanitizeAllSessionsOnStartup(): void {
  sessionRepository.sanitizeAllSessionsOnStartup()
}

// Load sessions index (metadata only)
function loadSessionsIndex(): SessionMeta[] {
  return sessionRepository.loadSessionsIndex()
}

// Save sessions index
function saveSessionsIndex(index: SessionMeta[]): void {
  sessionRepository.saveSessionsIndex(index)
}

// Get all sessions with full data (legacy, for backward compatibility)
export function getSessions(): ChatSession[] {
  return sessionRepository.getSessions()
}

// ============================================================================
// Optimized Session Loading (Metadata Separation)
// ============================================================================

/**
 * Get sessions list with metadata only (no messages)
 * This is the optimized version for fast startup
 */
export function getSessionsList(): SessionMeta[] {
  return sessionRepository.getSessionsList()
}

export function initializeSessionRepositoryIndex(): void {
  sessionRepository.initializeSessionRepositoryIndex()
}

/**
 * Get session details without messages
 * Used for session activation before loading messages
 */
export function getSessionDetails(sessionId: string): SessionDetails | undefined {
  return sessionRepository.getSessionDetails(sessionId)
}

/**
 * Get session messages only
 * Called separately after activating a session
 */
export function getSessionMessages(sessionId: string): ChatMessage[] | undefined {
  return sessionRepository.getSessionMessages(sessionId)
}

/**
 * Get a cursor-addressed page of session messages.
 *
 * This JSON-backed implementation intentionally preserves the existing storage
 * path while establishing the page contract that SQLite will implement
 * directly. It still reads the full legacy session file internally.
 */
export function getSessionMessagesPage(
  request: GetSessionMessagesPageRequest
): GetSessionMessagesPageResponse {
  return sessionRepository.getSessionMessagesPage(request) as GetSessionMessagesPageResponse
}

export function getSessionUserMessageMarkers(sessionId: string): UserMessageMarker[] | undefined {
  return sessionRepository.getSessionUserMessageMarkers(sessionId)
}

/**
 * Read a session from disk without inserting into the LRU cache.
 * Use for bulk read-only operations like search that scan many sessions.
 */
export function getSessionRaw(sessionId: string): ChatSession | undefined {
  return sessionRepository.getSessionRaw(sessionId)
}

// Get a single session by ID
export function getSession(sessionId: string): ChatSession | undefined {
  return sessionRepository.getSession(sessionId)
}

// Create a new session
export function createSession(sessionId: string, name: string): ChatSession {
  return sessionRepository.createSession(sessionId, name)
}

// Create a branch session
export function createBranchSession(
  sessionId: string,
  name: string,
  parentSessionId: string,
  branchFromMessageId: string,
  inheritedMessages: ChatMessage[]
): ChatSession {
  return sessionRepository.createBranchSession(
    sessionId,
    name,
    parentSessionId,
    branchFromMessageId,
    inheritedMessages,
  )
}

// Delete session result type
export interface DeleteSessionResult {
  deletedIds: string[]
  parentSessionId?: string
}

// Delete a session and all its child sessions (cascade delete)
export function deleteSession(sessionId: string): DeleteSessionResult {
  return sessionRepository.deleteSession(sessionId)
}

// Rename a session (does not update updatedAt to avoid reordering)
export function renameSession(sessionId: string, newName: string): void {
  sessionRepository.renameSession(sessionId, newName)
}

// Update session pin status (does not affect sort order)
export function updateSessionPin(sessionId: string, isPinned: boolean): void {
  sessionRepository.updateSessionPin(sessionId, isPinned)
}

// Update session archived status (does not affect sort order)
export function updateSessionArchived(sessionId: string, isArchived: boolean, archivedAt?: number | null): void {
  sessionRepository.updateSessionArchived(sessionId, isArchived, archivedAt)
}

// Update session working directory (does not affect sort order)
export function updateSessionPermissionMode(sessionId: string, permissionMode: ChatSession['permissionMode']): boolean {
  return sessionRepository.updateSessionPermissionMode(sessionId, permissionMode)
}

export function updateSessionWorkingDirectory(sessionId: string, workingDirectory: string | null): void {
  sessionRepository.updateSessionWorkingDirectory(sessionId, workingDirectory)
}

export function updateSessionWorkingDirectoryRoots(sessionId: string, roots: string[]): void {
  sessionRepository.updateSessionWorkingDirectoryRoots(sessionId, roots)
}

export function updateSessionVariables(sessionId: string, variables: ContextVariable[]): void {
  sessionRepository.updateSessionVariables(sessionId, variables)
}

// Inherit working directory from workspace (does not update updatedAt)
export function inheritSessionWorkingDirectory(sessionId: string, workingDirectory: string): void {
  sessionRepository.inheritSessionWorkingDirectory(sessionId, workingDirectory)
}

// Update session token usage (does not affect sort order)
export function updateSessionTokenUsage(
  sessionId: string,
  usage: { inputTokens: number; outputTokens: number; totalTokens: number },
  lastTurnUsage?: { inputTokens: number; outputTokens: number }
): void {
  const before = sessionMessageRuntime!.getSessionTokenUsage(sessionId)
  sessionRepository.updateSessionTokenUsage(sessionId, usage, lastTurnUsage)
  const after = sessionMessageRuntime!.getSessionTokenUsage(sessionId)
  console.log('[SessionUsage] updateSessionTokenUsage', {
    sessionId,
    source: 'stream-final-usage',
    usageInputTokens: usage.inputTokens,
    usageOutputTokens: usage.outputTokens,
    usageTotalTokens: usage.totalTokens,
    lastTurnInputTokens: lastTurnUsage?.inputTokens,
    lastTurnOutputTokens: lastTurnUsage?.outputTokens,
    beforeContextSize: before?.contextSize,
    beforeLastInputTokens: before?.lastInputTokens,
    afterContextSize: after?.contextSize,
    afterLastInputTokens: after?.lastInputTokens,
    afterTotalInputTokens: after?.totalInputTokens,
    afterTotalTokens: after?.totalTokens,
  })
}

export function updateSessionContextSize(sessionId: string, contextSize: number, source = 'direct'): boolean {
  const before = sessionMessageRuntime!.getSessionTokenUsage(sessionId)
  const updated = sessionRepository.updateSessionContextSize(sessionId, contextSize)
  const after = sessionMessageRuntime!.getSessionTokenUsage(sessionId)
  console.log('[SessionUsage] updateSessionContextSize', {
    sessionId,
    source,
    contextSize,
    updated,
    beforeContextSize: before?.contextSize,
    beforeLastInputTokens: before?.lastInputTokens,
    afterContextSize: after?.contextSize,
    afterLastInputTokens: after?.lastInputTokens,
  })
  return updated
}

export function updateSessionPromptContext(
  sessionId: string,
  promptContext: PromptContextState | null,
): boolean {
  return sessionRepository.updateSessionPromptContext(sessionId, promptContext)
}

// Get session token usage
export function getSessionTokenUsage(sessionId: string): {
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  lastInputTokens: number
  contextSize: number
} | null {
  return sessionMessageRuntime!.getSessionTokenUsage(sessionId)
}

// Add a message to a session
export function addMessage(sessionId: string, message: ChatMessage): void {
  sessionMessageRuntime!.addMessage(sessionId, message)
}

// Insert a message after a specific message ID
// Used for context compacting to insert summary message at the correct position
export function insertMessageAfter(sessionId: string, afterMessageId: string, message: ChatMessage): boolean {
  return sessionMessageRuntime!.insertMessageAfter(sessionId, afterMessageId, message)
}

// Delete a message from a session
export function deleteMessage(sessionId: string, messageId: string): boolean {
  return sessionMessageRuntime!.deleteMessage(sessionId, messageId)
}

// Delete a message and all messages after it.
// Used when regenerating an earlier assistant response so later conversation is discarded.
export function deleteMessageAndTruncate(sessionId: string, messageId: string): boolean {
  return sessionMessageRuntime!.deleteMessageAndTruncate(sessionId, messageId)
}

// Update a message and remove all messages after it
// Returns true if successful, also subtracts token usage of deleted messages from session total
export function updateMessageAndTruncate(
  sessionId: string,
  messageId: string,
  newContent: string,
  options?: { contentParts?: ChatMessage['contentParts'] | null }
): boolean {
  return sessionMessageRuntime!.updateMessageAndTruncate(sessionId, messageId, newContent, options)
}

// Update message content (for streaming, does not affect sort order)
export function updateMessageContent(sessionId: string, messageId: string, newContent: string): boolean {
  return sessionMessageRuntime!.updateMessageContent(sessionId, messageId, newContent)
}

// Update message reasoning (for streaming, does not affect sort order)
export function updateMessageReasoning(sessionId: string, messageId: string, reasoning: string): boolean {
  return sessionMessageRuntime!.updateMessageReasoning(sessionId, messageId, reasoning)
}

// Update message streaming status (does not affect sort order)
export function updateMessageStreaming(sessionId: string, messageId: string, isStreaming: boolean): boolean {
  return sessionMessageRuntime!.updateMessageStreaming(sessionId, messageId, isStreaming)
}

// Update message usage (does not affect sort order)
export function updateMessageUsage(
  sessionId: string,
  messageId: string,
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
): boolean {
  return sessionMessageRuntime!.updateMessageUsage(sessionId, messageId, usage)
}

// Update message tool calls (does not affect sort order)
export function updateMessageToolCalls(sessionId: string, messageId: string, toolCalls: ToolCall[]): boolean {
  return sessionMessageRuntime!.updateMessageToolCalls(sessionId, messageId, toolCalls)
}

// Update message content parts (does not affect sort order)
export function updateMessageContentParts(sessionId: string, messageId: string, contentParts: ChatMessage['contentParts']): boolean {
  return sessionMessageRuntime!.updateMessageContentParts(sessionId, messageId, contentParts)
}

// Add a single content part to message (does not affect sort order)
export function addMessageContentPart(sessionId: string, messageId: string, part: ContentPart): boolean {
  return sessionMessageRuntime!.addMessageContentPart(sessionId, messageId, part)
}

// Update message thinking time (does not affect sort order)
export function updateMessageThinkingTime(sessionId: string, messageId: string, thinkingTime: number): boolean {
  return sessionMessageRuntime!.updateMessageThinkingTime(sessionId, messageId, thinkingTime)
}

// Update message skill used (does not affect sort order)
export function updateMessageSkill(sessionId: string, messageId: string, skillUsed: string): boolean {
  return sessionMessageRuntime!.updateMessageSkill(sessionId, messageId, skillUsed)
}

// Update message error details (for API errors during streaming)
export function updateMessageError(sessionId: string, messageId: string, errorDetails: string): boolean {
  return sessionMessageRuntime!.updateMessageError(sessionId, messageId, errorDetails)
}

// Add a step to a message (does not affect sort order)
export function addMessageStep(sessionId: string, messageId: string, step: Step): boolean {
  return sessionMessageRuntime!.addMessageStep(sessionId, messageId, step)
}

// Update a step in a message (does not affect sort order)
// Searches recursively in childSteps
export function updateMessageStep(sessionId: string, messageId: string, stepId: string, updates: Partial<Step>): boolean {
  return sessionMessageRuntime!.updateMessageStep(sessionId, messageId, stepId, updates)
}

export function updateMessageSteps(sessionId: string, messageId: string, steps: Step[] | undefined): boolean {
  return sessionMessageRuntime!.updateMessageSteps(sessionId, messageId, steps)
}

// Update usage for all steps in a specific turn (does not affect sort order)
export function updateStepsUsageByTurn(
  sessionId: string,
  messageId: string,
  turnIndex: number,
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
): string[] {
  return sessionMessageRuntime!.updateStepsUsageByTurn(sessionId, messageId, turnIndex, usage)
}

// Update session summary (for context compacting)
export function updateSessionSummary(
  sessionId: string,
  summary: string,
  summaryUpToMessageId: string
): boolean {
  return sessionRepository.updateSessionSummary(sessionId, summary, summaryUpToMessageId)
}

export function updateSessionModel(sessionId: string, provider: string, model: string): boolean {
  return sessionRepository.updateSessionModel(sessionId, provider, model)
}

export function updateSessionAgent(sessionId: string, agentId: string): boolean {
  return sessionRepository.updateSessionAgent(sessionId, agentId)
}
