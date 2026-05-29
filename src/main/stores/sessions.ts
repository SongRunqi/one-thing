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
import { DEFAULT_AGENT_ID } from '../../shared/ipc.js'
import {
  getSessionsDir,
  getSessionPath,
  readJsonFile,
  writeJsonFile,
  writeJsonFileAsync,
  deleteJsonFile,
} from './paths.js'
import { displayContentForMessage } from '../prompts/resolver.js'
import { getCurrentSessionId, setCurrentSessionId } from './app-state.js'
import { getSettings } from './settings.js'
import { expandPath } from '../tools/core/sandbox.js'
import { LRUCache } from './lru-cache.js'
import {
  getMessagesPageFromArray,
  getUserMessageMarkersFromArray,
} from './session-repository/pagination.js'
import { getMessagesPageFromJsonFile } from './session-repository/json-message-page.js'
import {
  deleteSqliteSessions,
  getSqliteMessagesPage,
  getSqliteSessionDetails,
  getSqliteUserMessageMarkers,
  importSessionIndexToSqlite,
  isSqliteSessionReady,
  scheduleSessionSqliteMigration,
  syncFullSessionToSqlite,
  syncSqliteMessage,
  syncSqliteSessionMetadata,
  syncSqliteSessionUsage,
  syncSqliteSessionVariables,
  deleteSqliteMessage,
  deleteSqliteMessageAndAfter,
  upsertSqliteMessageAndTruncate,
} from './session-repository/sqlite-repository.js'

// ============ Session 内存缓存 (LRU) ============
// Keep only the 10 most recently accessed sessions in memory
// This prevents memory bloat when users have many sessions
const SESSION_CACHE_SIZE = 10
const sessionCache = new LRUCache<string, ChatSession>(SESSION_CACHE_SIZE)

function normalizeWorkingDirectoryRoots(roots: unknown, active?: string): string[] | undefined {
  if (!Array.isArray(roots)) return undefined

  const activePath = active ? expandPath(active) : ''
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const root of roots) {
    if (typeof root !== 'string' || !root.trim()) continue
    const expanded = expandPath(root.trim())
    if (expanded === activePath || seen.has(expanded)) continue
    seen.add(expanded)
    normalized.push(expanded)
  }

  return normalized.length > 0 ? normalized : undefined
}

// ============ 异步节流落盘 ============
// Streaming updates (每个 token) 会频繁触发 updateMessageContent 等写入,
// 同步 writeFileSync 会阻塞事件循环并拖慢流式节奏。
// 策略:更新内存缓存后,用 300ms 节流把脏 session 异步写盘。
// 同一 session 的多次写入在 promise 链上串行化,避免旧异步写盖新数据。
// 关键生命周期(finalize / delete / 应用退出)会强制 flush。
const SAVE_THROTTLE_MS = 300
const SQLITE_STREAM_SYNC_THROTTLE_MS = 1000

interface PendingSave {
  timer: NodeJS.Timeout | null
  writePromise: Promise<void>
}

const pendingSaves = new Map<string, PendingSave>()
const pendingSqliteMessageSyncs = new Map<string, NodeJS.Timeout>()

type TokenUsage = NonNullable<ChatMessage['usage']>

export interface TimelineMetadataRepairOptions {
  recomputeContextSize?: boolean
}

function getPendingSave(sessionId: string): PendingSave {
  let p = pendingSaves.get(sessionId)
  if (!p) {
    p = { timer: null, writePromise: Promise.resolve() }
    pendingSaves.set(sessionId, p)
  }
  return p
}

function enqueueAsyncWrite(sessionId: string, p: PendingSave): void {
  p.writePromise = p.writePromise.then(async () => {
    const latest = sessionCache.get(sessionId)
    if (!latest) return
    try {
      await writeJsonFileAsync(getSessionPath(sessionId), latest)
    } catch (err) {
      console.error(`[Sessions] async save failed for ${sessionId}:`, err)
    }
  })
}

function scheduleAsyncSave(sessionId: string): void {
  const p = getPendingSave(sessionId)
  if (p.timer) return  // 已排入计时器,最新状态会在其触发时从 cache 读取
  p.timer = setTimeout(() => {
    p.timer = null
    enqueueAsyncWrite(sessionId, p)
  }, SAVE_THROTTLE_MS)
}

/**
 * 强制刷盘单个 session,等待所有挂起的写入完成。
 * 用于 stream 结束、session 删除前等关键点。
 */
export async function flushSessionSave(sessionId: string): Promise<void> {
  const p = pendingSaves.get(sessionId)
  if (!p) return
  if (p.timer) {
    clearTimeout(p.timer)
    p.timer = null
    enqueueAsyncWrite(sessionId, p)
  }
  try {
    await p.writePromise
  } finally {
    if (!p.timer) pendingSaves.delete(sessionId)
  }
}

/**
 * 应用退出前调用,刷完所有挂起的异步写入。
 */
export async function flushAllPendingSaves(): Promise<void> {
  const ids = [...pendingSaves.keys()]
  await Promise.all(ids.map(id => flushSessionSave(id).catch(() => {})))
}

/**
 * 取消挂起的保存(用于删除场景,防止异步写重建已删文件)。
 */
function cancelPendingSave(sessionId: string): void {
  const p = pendingSaves.get(sessionId)
  if (p?.timer) {
    clearTimeout(p.timer)
    p.timer = null
  }
  pendingSaves.delete(sessionId)
  for (const [key, timer] of pendingSqliteMessageSyncs) {
    if (key.startsWith(`${sessionId}:`)) {
      clearTimeout(timer)
      pendingSqliteMessageSyncs.delete(key)
    }
  }
}

/**
 * 统一的保存函数 - 更新缓存并安排异步落盘
 * 默认节流异步,finalize/delete 等关键路径可调 flushSessionSave 强刷
 */
function saveSessionToFile(sessionId: string, session: ChatSession): void {
  sessionCache.set(sessionId, session)
  scheduleAsyncSave(sessionId)
}

/**
 * 失效单个 session 缓存
 */
export function invalidateSessionCache(sessionId: string): void {
  sessionCache.delete(sessionId)
}

/**
 * 清空所有缓存（应用重启时可能需要）
 */
export function clearAllSessionCache(): void {
  sessionCache.clear()
}

/**
 * 获取 LRU 缓存统计信息（调试用）
 */
export function getSessionCacheStats(): { size: number; maxSize: number; cachedSessionIds: string[] } {
  const stats = sessionCache.getStats()
  return {
    size: stats.size,
    maxSize: stats.maxSize,
    cachedSessionIds: stats.keys,
  }
}

function isTokenUsage(value: unknown): value is TokenUsage {
  if (!value || typeof value !== 'object') return false
  const usage = value as Partial<TokenUsage>
  return Number.isFinite(usage.inputTokens) && usage.inputTokens! >= 0
}

function getLatestStepUsage(message: ChatMessage): TokenUsage | undefined {
  let latest:
    | {
        turnIndex: number
        timestamp: number
        usage: TokenUsage
      }
    | undefined

  const visit = (steps: Step[] | undefined): void => {
    if (!steps) return
    for (const step of steps) {
      if (isTokenUsage(step.usage)) {
        const candidate = {
          turnIndex: step.turnIndex ?? -1,
          timestamp: step.timestamp ?? 0,
          usage: step.usage,
        }
        if (
          !latest ||
          candidate.turnIndex > latest.turnIndex ||
          (candidate.turnIndex === latest.turnIndex && candidate.timestamp >= latest.timestamp)
        ) {
          latest = candidate
        }
      }

      const childSteps = (step as Step & { childSteps?: Step[] }).childSteps
      if (Array.isArray(childSteps)) {
        visit(childSteps)
      }
    }
  }

  visit(message.steps)
  return latest?.usage
}

export function deriveRetainedContextSize(
  session: Pick<ChatSession, 'messages' | 'summary' | 'summaryUpToMessageId'>,
): number {
  const summaryIndex = session.summary && session.summaryUpToMessageId
    ? session.messages.findIndex(message => message.id === session.summaryUpToMessageId)
    : -1
  const startIndex = summaryIndex >= 0 ? summaryIndex + 1 : 0

  for (let index = session.messages.length - 1; index >= startIndex; index--) {
    const message = session.messages[index]
    if (message.role !== 'assistant' || message.isStreaming) continue

    const usage = getLatestStepUsage(message) ?? message.usage
    if (isTokenUsage(usage)) {
      return Math.max(0, usage.inputTokens)
    }
  }

  return 0
}

export function repairSessionTimelineMetadata(
  session: ChatSession,
  options: TimelineMetadataRepairOptions = {},
): boolean {
  let modified = false
  let clearedSummary = false
  const messageIds = new Set(session.messages.map(message => message.id))
  const hasSummary = typeof session.summary === 'string' && session.summary.length > 0
  const hasSummaryAnchor = typeof session.summaryUpToMessageId === 'string' && session.summaryUpToMessageId.length > 0
  const hasAnySummaryMetadata = hasSummary || hasSummaryAnchor || session.summaryCreatedAt !== undefined
  const summaryAnchorExists = hasSummaryAnchor ? messageIds.has(session.summaryUpToMessageId!) : false

  if (hasAnySummaryMetadata && (!hasSummary || !hasSummaryAnchor || !summaryAnchorExists)) {
    console.warn('[Sessions] Cleared invalid summary metadata after timeline repair:', {
      sessionId: session.id,
      summaryUpToMessageId: session.summaryUpToMessageId,
    })
    delete session.summary
    delete session.summaryUpToMessageId
    delete session.summaryCreatedAt
    clearedSummary = true
    modified = true
  }

  if (options.recomputeContextSize || clearedSummary) {
    const contextSize = deriveRetainedContextSize(session)
    if ((session.contextSize ?? 0) !== contextSize || (session.lastInputTokens ?? 0) !== contextSize) {
      session.contextSize = contextSize
      session.lastInputTokens = contextSize
      modified = true
    }
  }

  return modified
}

/**
 * Sanitize a session after loading - clean up UI-only states
 * Note: Step/toolCall statuses are NOT modified here to preserve state across session switches
 * Status cleanup only happens on app startup via sanitizeAllSessions()
 */
function sanitizeSession(session: ChatSession): ChatSession {
  let modified = false

  for (const message of session.messages) {
    // Clean up streaming state (UI-only, safe to reset)
    if (message.isStreaming) {
      message.isStreaming = false
      modified = true
    }
  }

  if (repairSessionTimelineMetadata(session)) {
    modified = true
  }

  if (modified) {
    saveSessionToFile(session.id, session)
    syncSessionToSqliteIfReady(session)
  }

  return session
}

/**
 * Sanitize a step recursively
 * Returns true if any modifications were made
 */
function sanitizeStepRecursive(step: Step): boolean {
  let modified = false

  if (step.status === 'running' || step.status === 'pending') {
    step.status = 'failed'
    step.error = step.error || 'Interrupted: app was closed'
    if (step.title.startsWith('Running:') || step.title.startsWith('调用工具:')) {
      step.title = step.title.replace(/^(Running:|调用工具:)\s*/, 'Interrupted: ')
    }
    modified = true
  }
  if (step.status === 'awaiting-confirmation') {
    step.status = 'failed'
    step.error = 'Interrupted: permission request was not answered'
    modified = true
  }
  if (step.toolCall) {
    if (step.toolCall.status === 'executing' || step.toolCall.status === 'pending') {
      step.toolCall.status = 'cancelled'
      modified = true
    }
  }

  // Handle legacy childSteps from old session data
  const legacyChildren = (step as any).childSteps
  if (legacyChildren?.length) {
    for (const childStep of legacyChildren) {
      if (sanitizeStepRecursive(childStep)) {
        modified = true
      }
    }
  }

  return modified
}

/**
 * Sanitize all sessions on app startup - clean up interrupted states
 * This should only be called once when the app starts
 */
export function sanitizeAllSessionsOnStartup(): void {
  const index = loadSessionsIndex()

  for (const meta of index) {
    const sessionPath = getSessionPath(meta.id)
    const session = readJsonFile<ChatSession | null>(sessionPath, null)
    if (!session) continue

    let modified = false

    for (const message of session.messages) {
      // Clean up streaming state
      if (message.isStreaming) {
        message.isStreaming = false
        modified = true
      }

      // Clean up interrupted steps (recursively including childSteps)
      if (message.steps) {
        for (const step of message.steps) {
          if (sanitizeStepRecursive(step)) {
            modified = true
          }
        }
      }

      // Clean up interrupted toolCalls
      if (message.toolCalls) {
        for (const tc of message.toolCalls) {
          if (tc.status === 'executing' || tc.status === 'pending') {
            tc.status = 'cancelled'
            modified = true
          }
        }
      }
    }

    if (repairSessionTimelineMetadata(session)) {
      modified = true
    }

    // Only write back if modified
    if (modified) {
      writeJsonFile(sessionPath, session)
      syncSessionToSqliteIfReady(session)
    }
  }
}

// Session metadata stored in index for quick listing
// Note: SessionMeta is imported from shared/ipc.js (Phase 4 optimization)

// Get sessions index path
function getSessionsIndexPath(): string {
  return `${getSessionsDir()}/index.json`
}

// Load sessions index (metadata only)
function loadSessionsIndex(): SessionMeta[] {
  return readJsonFile(getSessionsIndexPath(), [])
}

// Save sessions index
function saveSessionsIndex(index: SessionMeta[]): void {
  writeJsonFile(getSessionsIndexPath(), index)
}

// Get all sessions with full data (legacy, for backward compatibility)
export function getSessions(): ChatSession[] {
  const index = loadSessionsIndex()
  const sessions: ChatSession[] = []

  for (const meta of index) {
    const session = getSession(meta.id)
    if (session) {
      sessions.push(session)
    }
  }

  return sessions
}

// ============================================================================
// Optimized Session Loading (Metadata Separation)
// ============================================================================

/**
 * Get sessions list with metadata only (no messages)
 * This is the optimized version for fast startup
 */
export function getSessionsList(): SessionMeta[] {
  return loadSessionsIndex().map(session => ({
    ...session,
    agentId: session.agentId || DEFAULT_AGENT_ID,
  }))
}

export function initializeSessionRepositoryIndex(): void {
  importSessionIndexToSqlite(loadSessionsIndex())
}

function getSqliteSessionDetailsSafe(sessionId: string): SessionDetails | undefined {
  try {
    return getSqliteSessionDetails(sessionId)
  } catch (error) {
    console.error('[Sessions] Failed to load SQLite session details:', error)
    return undefined
  }
}

function hasUsageDetails(details: SessionDetails): boolean {
  return details.contextSize !== undefined ||
    details.lastInputTokens !== undefined ||
    details.totalInputTokens !== undefined ||
    details.totalOutputTokens !== undefined ||
    details.totalTokens !== undefined
}

function mergeSessionDetails(
  meta: SessionMeta | undefined,
  details: SessionMeta | SessionDetails,
): SessionDetails {
  const messageCount =
    details.messageCount && details.messageCount > 0
      ? details.messageCount
      : meta?.messageCount ?? details.messageCount ?? 0

  return {
    ...meta,
    ...details,
    agentId: details.agentId || meta?.agentId || DEFAULT_AGENT_ID,
    messageCount,
    totalInputTokens: (details as SessionDetails).totalInputTokens ?? 0,
    totalOutputTokens: (details as SessionDetails).totalOutputTokens ?? 0,
    totalTokens: (details as SessionDetails).totalTokens ?? 0,
    lastInputTokens: (details as SessionDetails).lastInputTokens ?? 0,
    contextSize: (details as SessionDetails).contextSize ?? 0,
  }
}

/**
 * Get session details without messages
 * Used for session activation before loading messages
 */
export function getSessionDetails(sessionId: string): SessionDetails | undefined {
  const meta = loadSessionsIndex().find(session => session.id === sessionId)
  const sqliteDetails = getSqliteSessionDetailsSafe(sessionId)

  if (sqliteDetails && hasUsageDetails(sqliteDetails)) {
    return mergeSessionDetails(meta, sqliteDetails)
  }

  // Fallback to the JSON session when SQLite only has index metadata or is not
  // ready. Activation needs the persisted token/context fields, not just list
  // metadata.
  const session = getSession(sessionId)
  if (session) {
    const { messages, ...details } = session
    return mergeSessionDetails(meta, { ...details, messageCount: messages.length })
  }

  if (sqliteDetails) {
    return mergeSessionDetails(meta, sqliteDetails)
  }

  if (meta) {
    return mergeSessionDetails(undefined, meta)
  }

  return undefined
}

/**
 * Get session messages only
 * Called separately after activating a session
 */
export function getSessionMessages(sessionId: string): ChatMessage[] | undefined {
  const session = getSession(sessionId)
  return session?.messages
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
  const start = performance.now()
  const sqlitePage = getSqliteMessagesPage(request)
  if (sqlitePage) {
    console.info('[Perf][SessionPage][main]', {
      sessionId: request.sessionId,
      source: 'sqlite',
      totalMs: Math.round(performance.now() - start),
      messages: sqlitePage.messages?.length ?? 0,
      success: sqlitePage.success,
    })
    return sqlitePage
  }

  const fastPage = getMessagesPageFromJsonFile(request)
  if (fastPage) {
    scheduleSessionSqliteMigration(request.sessionId)
    console.info('[Perf][SessionPage][main]', {
      sessionId: request.sessionId,
      source: 'json-byte-scan',
      totalMs: Math.round(performance.now() - start),
      messages: fastPage.messages?.length ?? 0,
      success: fastPage.success,
    })
    return fastPage
  }

  const session = getSession(request.sessionId)
  if (!session) {
    return { success: false, error: 'Session not found' }
  }
  scheduleSessionSqliteMigration(request.sessionId)
  const response = getMessagesPageFromArray(session.messages, request)
  console.info('[Perf][SessionPage][main]', {
    sessionId: request.sessionId,
    source: 'json-full-fallback',
    totalMs: Math.round(performance.now() - start),
    messages: response.messages?.length ?? 0,
    success: response.success,
  })
  return response
}

export function getSessionUserMessageMarkers(sessionId: string): UserMessageMarker[] | undefined {
  const sqliteMarkers = getSqliteUserMessageMarkers(sessionId)
  if (sqliteMarkers) return sqliteMarkers

  const session = getSession(sessionId)
  if (!session) return undefined
  scheduleSessionSqliteMigration(sessionId)
  return getUserMessageMarkersFromArray(session.messages)
}

/**
 * Extract session metadata for index storage
 * Called when saving a session to update the index
 */
function extractSessionMeta(session: ChatSession): SessionMeta {
  // Get first user message as preview
  const firstUserMessage = session.messages.find(m => m.role === 'user')
  const previewText = firstUserMessage
    ? displayContentForMessage(firstUserMessage).slice(0, 100)
    : undefined

  return {
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    parentSessionId: session.parentSessionId,
    branchFromMessageId: session.branchFromMessageId,
    agentId: session.agentId || DEFAULT_AGENT_ID,
    lastModel: session.lastModel,
    lastProvider: session.lastProvider,
    isPinned: session.isPinned,
    isArchived: session.isArchived,
    archivedAt: session.archivedAt,
    messageCount: session.messages.length,
    previewText,
  }
}

/**
 * Read a session from disk without inserting into the LRU cache.
 * Use for bulk read-only operations like search that scan many sessions.
 */
export function getSessionRaw(sessionId: string): ChatSession | undefined {
  const sessionPath = getSessionPath(sessionId)
  return readJsonFile<ChatSession | null>(sessionPath, null) ?? undefined
}

// Get a single session by ID
export function getSession(sessionId: string): ChatSession | undefined {
  // 检查缓存
  const cached = sessionCache.get(sessionId)
  if (cached) {
    return cached
  }

  // 从磁盘读取
  const sessionPath = getSessionPath(sessionId)
  const session = readJsonFile<ChatSession | null>(sessionPath, null)
  if (!session) return undefined

  // Expand ~ in workingDirectory (handles legacy stored paths)
  if (session.workingDirectory) {
    session.workingDirectory = expandPath(session.workingDirectory)
  }
  session.workingDirectoryRoots = normalizeWorkingDirectoryRoots(
    session.workingDirectoryRoots,
    session.workingDirectory,
  )

  // Sanitize session to clean up interrupted states
  const sanitized = sanitizeSession(session)

  // 存入缓存
  sessionCache.set(sessionId, sanitized)

  return sanitized
}

function syncSessionToSqliteIfReady(session: ChatSession): void {
  try {
    if (isSqliteSessionReady(session.id)) {
      syncFullSessionToSqlite(session)
    } else {
      scheduleSessionSqliteMigration(session.id)
    }
  } catch (error) {
    console.error('[Sessions] Failed to sync session to SQLite:', error)
  }
}

function syncMessageToSqliteIfReady(session: ChatSession, message: ChatMessage): void {
  try {
    const seq = session.messages.findIndex(item => item.id === message.id) + 1
    if (seq <= 0) return

    const syncKey = `${session.id}:${message.id}`
    const pendingTimer = pendingSqliteMessageSyncs.get(syncKey)
    if (message.isStreaming) {
      if (!pendingTimer) {
        pendingSqliteMessageSyncs.set(syncKey, setTimeout(() => {
          pendingSqliteMessageSyncs.delete(syncKey)
          const latestSession = sessionCache.get(session.id)
          const latestMessage = latestSession?.messages.find(item => item.id === message.id)
          if (latestSession && latestMessage) {
            syncMessageToSqliteIfReady(latestSession, latestMessage)
          }
        }, SQLITE_STREAM_SYNC_THROTTLE_MS))
      }
      return
    }

    if (pendingTimer) {
      clearTimeout(pendingTimer)
      pendingSqliteMessageSyncs.delete(syncKey)
    }

    if (isSqliteSessionReady(session.id)) {
      syncSqliteMessage(session.id, message, seq)
      syncSqliteSessionMetadata(session)
    } else {
      scheduleSessionSqliteMigration(session.id)
    }
  } catch (error) {
    console.error('[Sessions] Failed to sync message to SQLite:', error)
  }
}

function syncSessionMetadataToSqlite(session: ChatSession): void {
  try {
    if (isSqliteSessionReady(session.id)) {
      syncSqliteSessionMetadata(session)
    } else {
      scheduleSessionSqliteMigration(session.id)
    }
  } catch (error) {
    console.error('[Sessions] Failed to sync session metadata to SQLite:', error)
  }
}

// Create a new session
export function createSession(sessionId: string, name: string): ChatSession {
  // Use defaultWorkingDirectory from settings if available
  let workingDirectory: string | undefined
  const settings = getSettings()
  const defaultDir = settings.tools?.bash?.defaultWorkingDirectory
  if (defaultDir) {
    workingDirectory = expandPath(defaultDir)
  }

  const session: ChatSession = {
    id: sessionId,
    name,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    agentId: DEFAULT_AGENT_ID,
    workingDirectory,
  }

  // Save session file
  saveSessionToFile(sessionId, session)
  syncSessionToSqliteIfReady(session)
  syncFullSessionToSqlite(session)

  // Update index
  const index = loadSessionsIndex()
  index.unshift({
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    agentId: session.agentId || DEFAULT_AGENT_ID,
  })
  saveSessionsIndex(index)

  // Set as current session
  setCurrentSessionId(sessionId)

  return session
}

// Create a branch session
export function createBranchSession(
  sessionId: string,
  name: string,
  parentSessionId: string,
  branchFromMessageId: string,
  inheritedMessages: ChatMessage[]
): ChatSession {
  // Get parent session to inherit workingDirectory
  const parentSession = getSession(parentSessionId)

  // Inherit workingDirectory from parent session
  let workingDirectory = parentSession?.workingDirectory

  // Fallback to defaultWorkingDirectory from settings if not set
  if (!workingDirectory) {
    const settings = getSettings()
    const defaultDir = settings.tools?.bash?.defaultWorkingDirectory
    if (defaultDir) {
      workingDirectory = expandPath(defaultDir)
    }
  }

  // Calculate token usage from inherited messages
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalTokens = 0

  for (const message of inheritedMessages) {
    if (message.usage) {
      totalInputTokens += message.usage.inputTokens
      totalOutputTokens += message.usage.outputTokens
      totalTokens += message.usage.totalTokens
    }
  }

  const session: ChatSession = {
    id: sessionId,
    name,
    messages: inheritedMessages,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    parentSessionId,
    branchFromMessageId,
    agentId: parentSession?.agentId || DEFAULT_AGENT_ID,
    workingDirectory,
    workingDirectoryRoots: normalizeWorkingDirectoryRoots(parentSession?.workingDirectoryRoots, workingDirectory),
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
  }

  // Save session file
  saveSessionToFile(sessionId, session)
  syncSessionToSqliteIfReady(session)
  syncFullSessionToSqlite(session)

  // Update index
  const index = loadSessionsIndex()
  index.unshift({
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    parentSessionId,
    branchFromMessageId,
    agentId: session.agentId || DEFAULT_AGENT_ID,
  })
  saveSessionsIndex(index)

  // Set as current session
  setCurrentSessionId(sessionId)

  return session
}

// Delete session result type
export interface DeleteSessionResult {
  deletedIds: string[]
  parentSessionId?: string
}

// Delete a session and all its child sessions (cascade delete)
export function deleteSession(sessionId: string): DeleteSessionResult {
  const session = getSession(sessionId)
  const parentSessionId = session?.parentSessionId

  // Recursively collect all child session IDs
  function collectChildSessionIds(parentId: string): string[] {
    const index = loadSessionsIndex()
    const children = index.filter(s => s.parentSessionId === parentId)
    let ids: string[] = []
    for (const child of children) {
      ids.push(child.id)
      ids = ids.concat(collectChildSessionIds(child.id))
    }
    return ids
  }

  // Collect all IDs to delete (current session + all children)
  const childIds = collectChildSessionIds(sessionId)
  const allIdsToDelete = [sessionId, ...childIds]

  // Delete all session files
  for (const id of allIdsToDelete) {
    cancelPendingSave(id)  // 防止异步写在删除后重建文件
    deleteJsonFile(getSessionPath(id))
    sessionCache.delete(id)  // 清除缓存
  }
  deleteSqliteSessions(allIdsToDelete)

  // Update index - remove all deleted sessions
  let index = loadSessionsIndex()
  index = index.filter(s => !allIdsToDelete.includes(s.id))
  saveSessionsIndex(index)

  // Update current session if it was deleted
  if (allIdsToDelete.includes(getCurrentSessionId())) {
    // If we have a parent session and it still exists, switch to it
    if (parentSessionId && index.some(s => s.id === parentSessionId)) {
      setCurrentSessionId(parentSessionId)
    } else {
      // Otherwise switch to the first available session
      const nextSession = index[0]
      setCurrentSessionId(nextSession?.id || '')
    }
  }

  return { deletedIds: allIdsToDelete, parentSessionId }
}

// Rename a session (does not update updatedAt to avoid reordering)
export function renameSession(sessionId: string, newName: string): void {
  const session = getSession(sessionId)
  if (!session) return

  session.name = newName

  // Save session file
  saveSessionToFile(sessionId, session)
  syncSessionMetadataToSqlite(session)

  // Update index (only name, not updatedAt)
  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    meta.name = newName
    saveSessionsIndex(index)
  }
}

// Update session pin status (does not affect sort order)
export function updateSessionPin(sessionId: string, isPinned: boolean): void {
  const session = getSession(sessionId)
  if (!session) return

  session.isPinned = isPinned

  // Save session file
  saveSessionToFile(sessionId, session)
  syncSessionMetadataToSqlite(session)

  // Update index
  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    meta.isPinned = isPinned
    saveSessionsIndex(index)
  }
}

// Update session archived status (does not affect sort order)
export function updateSessionArchived(sessionId: string, isArchived: boolean, archivedAt?: number | null): void {
  const session = getSession(sessionId)
  if (!session) return

  session.isArchived = isArchived
  if (isArchived && archivedAt) {
    session.archivedAt = archivedAt
  } else if (!isArchived) {
    delete session.archivedAt
  }

  // Save session file
  saveSessionToFile(sessionId, session)
  syncSessionMetadataToSqlite(session)

  // Update index
  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    meta.isArchived = isArchived
    if (isArchived && archivedAt) {
      meta.archivedAt = archivedAt
    } else if (!isArchived) {
      delete meta.archivedAt
    }
    saveSessionsIndex(index)
  }
}

// Update session working directory (does not affect sort order)
export function updateSessionWorkingDirectory(sessionId: string, workingDirectory: string | null): void {
  const session = getSession(sessionId)
  if (!session) return

  if (workingDirectory === null || workingDirectory === '') {
    delete session.workingDirectory
  } else {
    // Expand ~ to home directory before storing
    session.workingDirectory = expandPath(workingDirectory)
  }
  session.workingDirectoryRoots = normalizeWorkingDirectoryRoots(
    session.workingDirectoryRoots,
    session.workingDirectory,
  )

  // Save session file
  saveSessionToFile(sessionId, session)
  syncSessionMetadataToSqlite(session)
}

export function updateSessionWorkingDirectoryRoots(sessionId: string, roots: string[]): void {
  const session = getSession(sessionId)
  if (!session) return

  session.workingDirectoryRoots = normalizeWorkingDirectoryRoots(roots, session.workingDirectory)

  saveSessionToFile(sessionId, session)
  syncSessionMetadataToSqlite(session)
}

export function updateSessionVariables(sessionId: string, variables: ContextVariable[]): void {
  const session = getSession(sessionId)
  if (!session) return

  session.variables = variables.map(v => ({
    name: v.name,
    value: v.value,
    values: v.values,
    description: v.description,
    updatedAt: v.updatedAt ?? Date.now(),
  }))

  saveSessionToFile(sessionId, session)
  try {
    if (isSqliteSessionReady(sessionId)) syncSqliteSessionVariables(session)
    else scheduleSessionSqliteMigration(sessionId)
  } catch (error) {
    console.error('[Sessions] Failed to sync variables to SQLite:', error)
  }
}

// Inherit working directory from workspace (does not update updatedAt)
export function inheritSessionWorkingDirectory(sessionId: string, workingDirectory: string): void {
  const session = getSession(sessionId)
  if (!session) return

  // Expand ~ to home directory before storing
  session.workingDirectory = expandPath(workingDirectory)
  session.workingDirectoryRoots = normalizeWorkingDirectoryRoots(
    session.workingDirectoryRoots,
    session.workingDirectory,
  )

  // Save session file without updating timestamp
  saveSessionToFile(sessionId, session)
  syncSessionMetadataToSqlite(session)
}

// Update session token usage (does not affect sort order)
export function updateSessionTokenUsage(
  sessionId: string,
  usage: { inputTokens: number; outputTokens: number; totalTokens: number },
  lastTurnUsage?: { inputTokens: number; outputTokens: number }
): void {
  const session = getSession(sessionId)
  if (!session) return

  // Accumulate token usage (for statistics)
  session.totalInputTokens = (session.totalInputTokens || 0) + usage.inputTokens
  session.totalOutputTokens = (session.totalOutputTokens || 0) + usage.outputTokens
  session.totalTokens = (session.totalTokens || 0) + usage.totalTokens

  // Use last turn's usage for context size (NOT accumulated)
  const turnUsage = lastTurnUsage || usage
  session.lastInputTokens = turnUsage.inputTokens
  // Context size = input tokens only (context window limit applies to input)
  session.contextSize = turnUsage.inputTokens

  // Save session file. Only usage columns changed, so sync the session_usage
  // table incrementally instead of rewriting the whole session.
  saveSessionToFile(sessionId, session)
  try {
    if (isSqliteSessionReady(sessionId)) syncSqliteSessionUsage(session)
    else scheduleSessionSqliteMigration(sessionId)
  } catch (error) {
    console.error('[Sessions] Failed to sync usage to SQLite:', error)
  }
}

export function updateSessionContextSize(sessionId: string, contextSize: number): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  session.lastInputTokens = Math.max(0, contextSize)
  session.contextSize = Math.max(0, contextSize)

  // Only usage columns changed — sync session_usage incrementally.
  saveSessionToFile(sessionId, session)
  try {
    if (isSqliteSessionReady(sessionId)) syncSqliteSessionUsage(session)
    else scheduleSessionSqliteMigration(sessionId)
  } catch (error) {
    console.error('[Sessions] Failed to sync context size to SQLite:', error)
  }

  return true
}

export function updateSessionPromptContext(
  sessionId: string,
  promptContext: PromptContextState | null,
): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  session.promptContext = promptContext

  saveSessionToFile(sessionId, session)
  syncSessionMetadataToSqlite(session)

  return true
}

// Get session token usage
export function getSessionTokenUsage(sessionId: string): {
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  lastInputTokens: number
  contextSize: number
} | null {
  const session = getSession(sessionId)
  if (!session) return null

  return {
    totalInputTokens: session.totalInputTokens || 0,
    totalOutputTokens: session.totalOutputTokens || 0,
    totalTokens: session.totalTokens || 0,
    lastInputTokens: session.lastInputTokens || 0,
    contextSize: session.contextSize || 0,
  }
}

// Add a message to a session
export function addMessage(sessionId: string, message: ChatMessage): void {
  const session = getSession(sessionId)
  if (!session) return

  session.messages.push(message)
  if (message.role === 'assistant' && message.model) {
    session.lastModel = message.model
  }
  session.updatedAt = Date.now()

  // Save session file (async/throttled) and sync only the newly appended row to
  // SQLite. Using the full-session sync here did a synchronous DELETE + re-INSERT
  // of every message on each append — O(n) and blocking the event loop right
  // before `message:user-created` is emitted, which delayed the user bubble by
  // ~0.5-0.8s in long conversations. Incremental upsert is O(1).
  saveSessionToFile(sessionId, session)
  syncMessageToSqliteIfReady(session, message)

  // Update index timestamp
  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    meta.updatedAt = session.updatedAt
    meta.lastModel = message.role === 'assistant' ? message.model : meta.lastModel
    saveSessionsIndex(index)
  }
}

// Insert a message after a specific message ID
// Used for context compacting to insert summary message at the correct position
export function insertMessageAfter(sessionId: string, afterMessageId: string, message: ChatMessage): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const index = session.messages.findIndex((m) => m.id === afterMessageId)
  if (index === -1) {
    // If afterMessageId not found, append to end
    session.messages.push(message)
  } else {
    // Insert after the found message
    session.messages.splice(index + 1, 0, message)
  }

  session.updatedAt = Date.now()

  // Save session file
  saveSessionToFile(sessionId, session)
  syncSessionToSqliteIfReady(session)

  return true
}

// Delete a message from a session
export function deleteMessage(sessionId: string, messageId: string): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const index = session.messages.findIndex((m) => m.id === messageId)
  if (index === -1) return false

  session.messages.splice(index, 1)
  session.updatedAt = Date.now()

  // Save session file. Delete the single row + renumber incrementally instead
  // of rewriting the whole session; metadata sync persists updatedAt.
  saveSessionToFile(sessionId, session)
  try {
    if (isSqliteSessionReady(sessionId)) {
      deleteSqliteMessage(sessionId, messageId)
      syncSqliteSessionMetadata(session)
    } else {
      scheduleSessionSqliteMigration(sessionId)
    }
  } catch (error) {
    console.error('[Sessions] Failed to delete message from SQLite:', error)
  }

  return true
}

function subtractDeletedMessageUsage(session: ChatSession, messagesToDelete: ChatMessage[]): void {
  const tokensToSubtract = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  for (const msg of messagesToDelete) {
    if (msg.usage) {
      tokensToSubtract.inputTokens += msg.usage.inputTokens
      tokensToSubtract.outputTokens += msg.usage.outputTokens
      tokensToSubtract.totalTokens += msg.usage.totalTokens
    }
  }

  if (tokensToSubtract.totalTokens > 0) {
    session.totalInputTokens = Math.max(0, (session.totalInputTokens || 0) - tokensToSubtract.inputTokens)
    session.totalOutputTokens = Math.max(0, (session.totalOutputTokens || 0) - tokensToSubtract.outputTokens)
    session.totalTokens = Math.max(0, (session.totalTokens || 0) - tokensToSubtract.totalTokens)
    console.log('[Sessions] Subtracted tokens from deleted messages:', tokensToSubtract, 'New session totals:', {
      totalInputTokens: session.totalInputTokens,
      totalOutputTokens: session.totalOutputTokens,
      totalTokens: session.totalTokens,
    })
  }
}

// Delete a message and all messages after it.
// Used when regenerating an earlier assistant response so later conversation is discarded.
export function deleteMessageAndTruncate(sessionId: string, messageId: string): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const messageIndex = session.messages.findIndex((m) => m.id === messageId)
  if (messageIndex === -1) return false

  const messagesToDelete = session.messages.slice(messageIndex)
  subtractDeletedMessageUsage(session, messagesToDelete)

  session.messages = session.messages.slice(0, messageIndex)
  repairSessionTimelineMetadata(session, { recomputeContextSize: true })
  session.updatedAt = Date.now()

  // Tail-truncate the SQLite rows + sync the changed session-level fields
  // (updatedAt/summary via metadata, totals/contextSize via usage) instead of a
  // full session rewrite.
  saveSessionToFile(sessionId, session)
  try {
    if (isSqliteSessionReady(sessionId)) {
      deleteSqliteMessageAndAfter(sessionId, messageId)
      syncSqliteSessionMetadata(session)
      syncSqliteSessionUsage(session)
    } else {
      scheduleSessionSqliteMigration(sessionId)
    }
  } catch (error) {
    console.error('[Sessions] Failed to truncate messages in SQLite:', error)
  }

  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    meta.updatedAt = session.updatedAt
    saveSessionsIndex(index)
  }

  return true
}

// Update a message and remove all messages after it
// Returns true if successful, also subtracts token usage of deleted messages from session total
export function updateMessageAndTruncate(
  sessionId: string,
  messageId: string,
  newContent: string,
  options?: { contentParts?: ChatMessage['contentParts'] | null }
): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const messageIndex = session.messages.findIndex((m) => m.id === messageId)
  if (messageIndex === -1) return false

  // Calculate token usage of messages that will be deleted
  const messagesToDelete = session.messages.slice(messageIndex + 1)
  subtractDeletedMessageUsage(session, messagesToDelete)

  // Update the message content
  session.messages[messageIndex].content = newContent
  if (options && Object.prototype.hasOwnProperty.call(options, 'contentParts')) {
    if (options.contentParts && options.contentParts.length > 0) {
      session.messages[messageIndex].contentParts = options.contentParts
    } else {
      delete session.messages[messageIndex].contentParts
    }
  }
  session.messages[messageIndex].timestamp = Date.now()

  // Remove all messages after this one
  session.messages = session.messages.slice(0, messageIndex + 1)
  repairSessionTimelineMetadata(session, { recomputeContextSize: true })
  session.updatedAt = Date.now()

  // Save session file. Upsert the edited message at its seq and tail-truncate
  // the rest incrementally; sync changed session-level fields. No full rewrite.
  saveSessionToFile(sessionId, session)
  try {
    if (isSqliteSessionReady(sessionId)) {
      upsertSqliteMessageAndTruncate(sessionId, session.messages[messageIndex], messageIndex + 1)
      syncSqliteSessionMetadata(session)
      syncSqliteSessionUsage(session)
    } else {
      scheduleSessionSqliteMigration(sessionId)
    }
  } catch (error) {
    console.error('[Sessions] Failed to update+truncate messages in SQLite:', error)
  }

  // Update index timestamp
  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    meta.updatedAt = session.updatedAt
    saveSessionsIndex(index)
  }

  return true
}

// Update message content (for streaming, does not affect sort order)
export function updateMessageContent(sessionId: string, messageId: string, newContent: string): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.content = newContent

  // Save session file
  saveSessionToFile(sessionId, session)
  syncMessageToSqliteIfReady(session, message)

  return true
}

// Update message reasoning (for streaming, does not affect sort order)
export function updateMessageReasoning(sessionId: string, messageId: string, reasoning: string): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.reasoning = reasoning

  // Save session file
  saveSessionToFile(sessionId, session)
  syncMessageToSqliteIfReady(session, message)

  return true
}

// Update message streaming status (does not affect sort order)
export function updateMessageStreaming(sessionId: string, messageId: string, isStreaming: boolean): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.isStreaming = isStreaming

  // Save session file
  saveSessionToFile(sessionId, session)
  syncMessageToSqliteIfReady(session, message)

  return true
}

// Update message usage (does not affect sort order)
export function updateMessageUsage(
  sessionId: string,
  messageId: string,
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.usage = usage

  // Save session file
  saveSessionToFile(sessionId, session)
  syncMessageToSqliteIfReady(session, message)

  return true
}

// Update message tool calls (does not affect sort order)
export function updateMessageToolCalls(sessionId: string, messageId: string, toolCalls: ToolCall[]): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.toolCalls = toolCalls

  // Save session file
  saveSessionToFile(sessionId, session)
  syncMessageToSqliteIfReady(session, message)

  return true
}

// Update message content parts (does not affect sort order)
export function updateMessageContentParts(sessionId: string, messageId: string, contentParts: ChatMessage['contentParts']): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.contentParts = contentParts

  // Save session file
  saveSessionToFile(sessionId, session)
  syncMessageToSqliteIfReady(session, message)

  return true
}

// Add a single content part to message (does not affect sort order)
export function addMessageContentPart(sessionId: string, messageId: string, part: ContentPart): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  // Initialize contentParts array if needed
  if (!message.contentParts) {
    message.contentParts = []
  }

  message.contentParts.push(part)

  // Save session file
  saveSessionToFile(sessionId, session)
  syncMessageToSqliteIfReady(session, message)

  return true
}

// Update message thinking time (does not affect sort order)
export function updateMessageThinkingTime(sessionId: string, messageId: string, thinkingTime: number): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.thinkingTime = thinkingTime

  // Save session file
  saveSessionToFile(sessionId, session)
  syncMessageToSqliteIfReady(session, message)

  return true
}

// Update message skill used (does not affect sort order)
export function updateMessageSkill(sessionId: string, messageId: string, skillUsed: string): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.skillUsed = skillUsed

  // Save session file
  saveSessionToFile(sessionId, session)
  syncMessageToSqliteIfReady(session, message)

  return true
}

// Update message error details (for API errors during streaming)
export function updateMessageError(sessionId: string, messageId: string, errorDetails: string): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.errorDetails = errorDetails

  // Save session file
  saveSessionToFile(sessionId, session)
  syncMessageToSqliteIfReady(session, message)

  return true
}

/**
 * Find a step by ID
 */
function findStepById(steps: Step[], stepId: string): Step | undefined {
  return steps.find(s => s.id === stepId)
}

// Add a step to a message (does not affect sort order)
export function addMessageStep(sessionId: string, messageId: string, step: Step): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  if (!message.steps) {
    message.steps = []
  }

  // Add as top-level step
  // Check for duplicate by toolCallId to avoid creating multiple steps for the same tool call
  const existingIndex = message.steps.findIndex(s => s.toolCallId && s.toolCallId === step.toolCallId)
  if (existingIndex >= 0) {
    // Update existing step instead of adding duplicate
    message.steps[existingIndex] = { ...message.steps[existingIndex], ...step }

  } else {
    message.steps.push(step)
  }

  // Save session file
  saveSessionToFile(sessionId, session)
  syncMessageToSqliteIfReady(session, message)

  return true
}

// Update a step in a message (does not affect sort order)
// Searches recursively in childSteps
export function updateMessageStep(sessionId: string, messageId: string, stepId: string, updates: Partial<Step>): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message || !message.steps) return false

  const step = findStepById(message.steps, stepId)
  if (!step) return false

  // Apply updates
  Object.assign(step, updates)

  // Save session file
  saveSessionToFile(sessionId, session)
  syncMessageToSqliteIfReady(session, message)

  return true
}

// Update usage for all steps in a specific turn (does not affect sort order)
export function updateStepsUsageByTurn(
  sessionId: string,
  messageId: string,
  turnIndex: number,
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
): string[] {
  const session = getSession(sessionId)
  if (!session) return []

  const message = session.messages.find((m) => m.id === messageId)
  if (!message || !message.steps) return []

  // Find all steps with matching turnIndex and update their usage
  const updatedStepIds: string[] = []
  for (const step of message.steps) {
    if (step.turnIndex === turnIndex) {
      step.usage = usage
      updatedStepIds.push(step.id)
    }
  }

  if (updatedStepIds.length > 0) {
    // Save session file
    saveSessionToFile(sessionId, session)
    syncMessageToSqliteIfReady(session, message)
  }

  return updatedStepIds
}

// Update session summary (for context compacting)
export function updateSessionSummary(
  sessionId: string,
  summary: string,
  summaryUpToMessageId: string
): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  session.summary = summary
  session.summaryUpToMessageId = summaryUpToMessageId
  session.summaryCreatedAt = Date.now()
  session.updatedAt = Date.now()

  // Save session file
  saveSessionToFile(sessionId, session)
  syncSessionMetadataToSqlite(session)

  // Update index timestamp
  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    meta.updatedAt = session.updatedAt
    saveSessionsIndex(index)
  }

  return true
}

export function updateSessionModel(sessionId: string, provider: string, model: string): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  session.lastProvider = provider
  session.lastModel = model

  saveSessionToFile(sessionId, session)
  syncSessionMetadataToSqlite(session)

  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    meta.lastProvider = provider
    meta.lastModel = model
    saveSessionsIndex(index)
  }

  return true
}

export function updateSessionAgent(sessionId: string, agentId: string): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  session.agentId = agentId || DEFAULT_AGENT_ID

  saveSessionToFile(sessionId, session)
  syncSessionMetadataToSqlite(session)

  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    meta.agentId = session.agentId
    saveSessionsIndex(index)
  }

  return true
}
