import Database from 'better-sqlite3'
import path from 'node:path'
import type {
  ChatMessage,
  ChatSession,
  ContextVariable,
  GetSessionMessagesPageRequest,
  GetSessionMessagesPageResponse,
  SessionDetails,
  SessionMeta,
  UserMessageMarker,
} from '../../../shared/ipc.js'
import {
  getSessionPath,
  getStorePath,
  readJsonFile,
} from '../paths.js'
import { SESSION_REPOSITORY_MIGRATIONS } from './sqlite-schema.js'
import { decodeMessagePageCursor, encodeMessagePageCursor } from './pagination.js'

type DatabaseConnection = Database.Database

interface MessageRow {
  id: string
  session_id: string
  role: ChatMessage['role']
  content: string
  timestamp: number
  reasoning: string | null
  is_streaming: number
  is_thinking: number
  error_details: string | null
  model: string | null
  thinking_time: number | null
  thinking_start_time: number | null
  skill_used: string | null
  content_parts_json: string | null
  tool_calls_json: string | null
  steps_json: string | null
  attachments_json: string | null
  usage_json: string | null
}

interface SessionRow {
  id: string
  name: string
  created_at: number
  updated_at: number
  parent_session_id: string | null
  branch_from_message_id: string | null
  last_model: string | null
  last_provider: string | null
  is_pinned: number
  is_archived: number
  archived_at: number | null
  working_directory: string | null
  summary: string | null
  summary_up_to_message_id: string | null
  summary_created_at: number | null
  migration_state: 'pending' | 'migrating' | 'ready' | 'failed'
  migrated_from_json_at: number | null
  legacy_json_path: string | null
  total_input_tokens: number | null
  total_output_tokens: number | null
  total_tokens: number | null
  last_input_tokens: number | null
  context_size: number | null
}

let db: DatabaseConnection | null = null
const migratingSessions = new Set<string>()

function jsonOrNull(value: unknown): string | null {
  if (value === undefined) return null
  return JSON.stringify(value)
}

function parseJson<T>(value: string | null): T | undefined {
  if (!value) return undefined
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

function boolInt(value: boolean | undefined): number {
  return value ? 1 : 0
}

export function getSessionDatabasePath(): string {
  return path.join(getStorePath(), 'onething.sqlite')
}

export function initializeSqliteSessionRepository(): void {
  const database = getSessionDatabase()
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`)

  for (const migration of SESSION_REPOSITORY_MIGRATIONS) {
    const existing = database
      .prepare('SELECT version FROM schema_migrations WHERE version = ?')
      .get(migration.version)
    if (existing) continue

    const applyMigration = database.transaction(() => {
      for (const statement of migration.statements) {
        database.exec(statement)
      }
      database
        .prepare('INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(migration.version, Date.now())
    })
    applyMigration()
  }
}

export function getSessionDatabase(): DatabaseConnection {
  if (!db) {
    db = new Database(getSessionDatabasePath())
  }
  return db
}

export function upsertSessionMetadata(meta: SessionMeta | SessionDetails): void {
  const database = getSessionDatabase()
  database.prepare(`
    INSERT INTO sessions (
      id, name, created_at, updated_at, parent_session_id, branch_from_message_id,
      last_model, last_provider, is_pinned, is_archived, archived_at,
      working_directory, summary, summary_up_to_message_id, summary_created_at,
      migration_state, legacy_json_path
    )
    VALUES (
      @id, @name, @createdAt, @updatedAt, @parentSessionId, @branchFromMessageId,
      @lastModel, @lastProvider, @isPinned, @isArchived, @archivedAt,
      @workingDirectory, @summary, @summaryUpToMessageId, @summaryCreatedAt,
      COALESCE(@migrationState, 'pending'), @legacyJsonPath
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      parent_session_id = excluded.parent_session_id,
      branch_from_message_id = excluded.branch_from_message_id,
      last_model = excluded.last_model,
      last_provider = excluded.last_provider,
      is_pinned = excluded.is_pinned,
      is_archived = excluded.is_archived,
      archived_at = excluded.archived_at,
      working_directory = COALESCE(excluded.working_directory, sessions.working_directory),
      summary = COALESCE(excluded.summary, sessions.summary),
      summary_up_to_message_id = COALESCE(excluded.summary_up_to_message_id, sessions.summary_up_to_message_id),
      summary_created_at = COALESCE(excluded.summary_created_at, sessions.summary_created_at),
      legacy_json_path = COALESCE(excluded.legacy_json_path, sessions.legacy_json_path)
  `).run({
    id: meta.id,
    name: meta.name,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    parentSessionId: meta.parentSessionId ?? null,
    branchFromMessageId: meta.branchFromMessageId ?? null,
    lastModel: meta.lastModel ?? null,
    lastProvider: meta.lastProvider ?? null,
    isPinned: boolInt(meta.isPinned),
    isArchived: boolInt(meta.isArchived),
    archivedAt: meta.archivedAt ?? null,
    workingDirectory: ('workingDirectory' in meta ? meta.workingDirectory : undefined) ?? null,
    summary: ('summary' in meta ? meta.summary : undefined) ?? null,
    summaryUpToMessageId: ('summaryUpToMessageId' in meta ? meta.summaryUpToMessageId : undefined) ?? null,
    summaryCreatedAt: ('summaryCreatedAt' in meta ? meta.summaryCreatedAt : undefined) ?? null,
    migrationState: null,
    legacyJsonPath: getSessionPath(meta.id),
  })
}

export function importSessionIndexToSqlite(index: SessionMeta[]): void {
  initializeSqliteSessionRepository()
  const database = getSessionDatabase()
  const importIndex = database.transaction((items: SessionMeta[]) => {
    for (const meta of items) {
      upsertSessionMetadata(meta)
    }
  })
  importIndex(index)
}

function rowToSessionDetails(row: SessionRow): SessionDetails {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    parentSessionId: row.parent_session_id ?? undefined,
    branchFromMessageId: row.branch_from_message_id ?? undefined,
    lastModel: row.last_model ?? undefined,
    lastProvider: row.last_provider ?? undefined,
    isPinned: !!row.is_pinned,
    isArchived: !!row.is_archived,
    archivedAt: row.archived_at ?? undefined,
    workingDirectory: row.working_directory ?? undefined,
    summary: row.summary ?? undefined,
    summaryUpToMessageId: row.summary_up_to_message_id ?? undefined,
    summaryCreatedAt: row.summary_created_at ?? undefined,
    totalInputTokens: row.total_input_tokens ?? undefined,
    totalOutputTokens: row.total_output_tokens ?? undefined,
    totalTokens: row.total_tokens ?? undefined,
    lastInputTokens: row.last_input_tokens ?? undefined,
    contextSize: row.context_size ?? undefined,
    messageCount: getMessageCount(row.id),
  }
}

export function getSqliteSessionDetails(sessionId: string): SessionDetails | undefined {
  const row = getSessionDatabase().prepare(`
    SELECT
      s.*,
      u.total_input_tokens,
      u.total_output_tokens,
      u.total_tokens,
      u.last_input_tokens,
      u.context_size
    FROM sessions s
    LEFT JOIN session_usage u ON u.session_id = s.id
    WHERE s.id = ?
  `).get(sessionId) as SessionRow | undefined
  return row ? rowToSessionDetails(row) : undefined
}

function getMigrationState(sessionId: string): string | undefined {
  const row = getSessionDatabase()
    .prepare('SELECT migration_state FROM sessions WHERE id = ?')
    .get(sessionId) as { migration_state: string } | undefined
  return row?.migration_state
}

export function isSqliteSessionReady(sessionId: string): boolean {
  initializeSqliteSessionRepository()
  return getMigrationState(sessionId) === 'ready'
}

function getMessageCount(sessionId: string): number {
  const row = getSessionDatabase()
    .prepare('SELECT COUNT(*) AS count FROM messages WHERE session_id = ?')
    .get(sessionId) as { count: number }
  return row.count
}

function rowToMessage(row: MessageRow & { seq?: number }): ChatMessage {
  return {
    id: row.id,
    seq: row.seq,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    timestamp: row.timestamp,
    isStreaming: !!row.is_streaming,
    isThinking: !!row.is_thinking,
    errorDetails: row.error_details ?? undefined,
    reasoning: row.reasoning ?? undefined,
    toolCalls: parseJson(row.tool_calls_json),
    contentParts: parseJson(row.content_parts_json),
    model: row.model ?? undefined,
    thinkingTime: row.thinking_time ?? undefined,
    thinkingStartTime: row.thinking_start_time ?? undefined,
    skillUsed: row.skill_used ?? undefined,
    steps: parseJson(row.steps_json),
    attachments: parseJson(row.attachments_json),
    usage: parseJson(row.usage_json),
  }
}

function responseFromRows(
  sessionId: string,
  rows: Array<MessageRow & { seq: number }>,
  totalCount: number,
): GetSessionMessagesPageResponse {
  const first = rows[0]
  const last = rows[rows.length - 1]
  return {
    success: true,
    messages: rows.map(rowToMessage),
    nextCursor: first ? encodeMessagePageCursor({ sessionId, seq: first.seq, includeAnchor: false }) : null,
    backwardsCursor: last ? encodeMessagePageCursor({ sessionId, seq: last.seq, includeAnchor: true }) : null,
    hasMoreBefore: first ? first.seq > 1 : false,
    hasMoreAfter: last ? last.seq < totalCount : false,
    totalCount,
  }
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return 16
  return Math.max(1, Math.min(300, Math.floor(limit)))
}

function getReadySqlitePage(request: GetSessionMessagesPageRequest): GetSessionMessagesPageResponse | undefined {
  if (getMigrationState(request.sessionId) !== 'ready') return undefined

  const database = getSessionDatabase()
  const totalCount = getMessageCount(request.sessionId)
  const limit = clampLimit(request.limit)

  if (totalCount === 0) {
    return responseFromRows(request.sessionId, [], totalCount)
  }

  if (request.cursor) {
    const cursor = decodeMessagePageCursor(request.cursor)
    if (!cursor || cursor.sessionId !== request.sessionId) {
      return { success: false, error: 'Invalid message page cursor' }
    }

    const direction = request.direction ?? 'older'
    if (direction === 'newer') {
      const op = cursor.includeAnchor ? '>=' : '>'
      const rows = database.prepare(`
        SELECT * FROM messages
        WHERE session_id = ? AND seq ${op} ?
        ORDER BY seq ASC
        LIMIT ?
      `).all(request.sessionId, cursor.seq, limit) as Array<MessageRow & { seq: number }>
      return responseFromRows(request.sessionId, rows, totalCount)
    }

    const op = cursor.includeAnchor ? '<=' : '<'
    const rows = database.prepare(`
      SELECT * FROM (
        SELECT * FROM messages
        WHERE session_id = ? AND seq ${op} ?
        ORDER BY seq DESC
        LIMIT ?
      )
      ORDER BY seq ASC
    `).all(request.sessionId, cursor.seq, limit) as Array<MessageRow & { seq: number }>
    return responseFromRows(request.sessionId, rows, totalCount)
  }

  const anchor = request.anchor
  if (anchor && anchor !== 'tail') {
    let anchorSeq = anchor.seq
    if (!anchorSeq && anchor.messageId) {
      const row = database
        .prepare('SELECT seq FROM messages WHERE session_id = ? AND id = ?')
        .get(request.sessionId, anchor.messageId) as { seq: number } | undefined
      anchorSeq = row?.seq
    }
    if (!anchorSeq) return { success: false, error: 'Anchor message not found' }

    const before = Math.max(0, anchor.before ?? Math.floor(limit / 2))
    const after = Math.max(0, anchor.after ?? Math.max(0, limit - before - 1))
    const startSeq = Math.max(1, anchorSeq - before)
    const endSeq = Math.min(totalCount, anchorSeq + after)
    const rows = database.prepare(`
      SELECT * FROM messages
      WHERE session_id = ? AND seq BETWEEN ? AND ?
      ORDER BY seq ASC
    `).all(request.sessionId, startSeq, endSeq) as Array<MessageRow & { seq: number }>
    return responseFromRows(request.sessionId, rows, totalCount)
  }

  const rows = database.prepare(`
    SELECT * FROM (
      SELECT * FROM messages
      WHERE session_id = ?
      ORDER BY seq DESC
      LIMIT ?
    )
    ORDER BY seq ASC
  `).all(request.sessionId, limit) as Array<MessageRow & { seq: number }>
  return responseFromRows(request.sessionId, rows, totalCount)
}

export function getSqliteMessagesPage(
  request: GetSessionMessagesPageRequest,
): GetSessionMessagesPageResponse | undefined {
  initializeSqliteSessionRepository()
  return getReadySqlitePage(request)
}

export function getSqliteUserMessageMarkers(sessionId: string): UserMessageMarker[] | undefined {
  initializeSqliteSessionRepository()
  if (getMigrationState(sessionId) !== 'ready') return undefined
  return getSessionDatabase().prepare(`
    SELECT id, seq, timestamp, substr(content, 1, 80) AS preview
    FROM messages
    WHERE session_id = ? AND role = 'user'
    ORDER BY seq ASC
  `).all(sessionId) as UserMessageMarker[]
}

function insertMessage(database: DatabaseConnection, sessionId: string, message: ChatMessage, seq: number): void {
  database.prepare(`
    INSERT INTO messages (
      id, session_id, seq, role, content, timestamp, reasoning,
      is_streaming, is_thinking, error_details, model, thinking_time,
      thinking_start_time, skill_used, content_parts_json, tool_calls_json,
      steps_json, attachments_json, usage_json
    )
    VALUES (
      @id, @sessionId, @seq, @role, @content, @timestamp, @reasoning,
      @isStreaming, @isThinking, @errorDetails, @model, @thinkingTime,
      @thinkingStartTime, @skillUsed, @contentPartsJson, @toolCallsJson,
      @stepsJson, @attachmentsJson, @usageJson
    )
  `).run({
    id: message.id,
    sessionId,
    seq,
    role: message.role,
    content: message.content ?? '',
    timestamp: message.timestamp,
    reasoning: message.reasoning ?? null,
    isStreaming: boolInt(message.isStreaming),
    isThinking: boolInt(message.isThinking),
    errorDetails: message.errorDetails ?? null,
    model: message.model ?? null,
    thinkingTime: message.thinkingTime ?? null,
    thinkingStartTime: message.thinkingStartTime ?? null,
    skillUsed: message.skillUsed ?? null,
    contentPartsJson: jsonOrNull(message.contentParts),
    toolCallsJson: jsonOrNull(message.toolCalls),
    stepsJson: jsonOrNull(message.steps),
    attachmentsJson: jsonOrNull(message.attachments),
    usageJson: jsonOrNull(message.usage),
  })
}

function upsertMessage(database: DatabaseConnection, sessionId: string, message: ChatMessage, seq: number): void {
  database.prepare(`
    INSERT INTO messages (
      id, session_id, seq, role, content, timestamp, reasoning,
      is_streaming, is_thinking, error_details, model, thinking_time,
      thinking_start_time, skill_used, content_parts_json, tool_calls_json,
      steps_json, attachments_json, usage_json
    )
    VALUES (
      @id, @sessionId, @seq, @role, @content, @timestamp, @reasoning,
      @isStreaming, @isThinking, @errorDetails, @model, @thinkingTime,
      @thinkingStartTime, @skillUsed, @contentPartsJson, @toolCallsJson,
      @stepsJson, @attachmentsJson, @usageJson
    )
    ON CONFLICT(id) DO UPDATE SET
      seq = excluded.seq,
      role = excluded.role,
      content = excluded.content,
      timestamp = excluded.timestamp,
      reasoning = excluded.reasoning,
      is_streaming = excluded.is_streaming,
      is_thinking = excluded.is_thinking,
      error_details = excluded.error_details,
      model = excluded.model,
      thinking_time = excluded.thinking_time,
      thinking_start_time = excluded.thinking_start_time,
      skill_used = excluded.skill_used,
      content_parts_json = excluded.content_parts_json,
      tool_calls_json = excluded.tool_calls_json,
      steps_json = excluded.steps_json,
      attachments_json = excluded.attachments_json,
      usage_json = excluded.usage_json
  `).run({
    id: message.id,
    sessionId,
    seq,
    role: message.role,
    content: message.content ?? '',
    timestamp: message.timestamp,
    reasoning: message.reasoning ?? null,
    isStreaming: boolInt(message.isStreaming),
    isThinking: boolInt(message.isThinking),
    errorDetails: message.errorDetails ?? null,
    model: message.model ?? null,
    thinkingTime: message.thinkingTime ?? null,
    thinkingStartTime: message.thinkingStartTime ?? null,
    skillUsed: message.skillUsed ?? null,
    contentPartsJson: jsonOrNull(message.contentParts),
    toolCallsJson: jsonOrNull(message.toolCalls),
    stepsJson: jsonOrNull(message.steps),
    attachmentsJson: jsonOrNull(message.attachments),
    usageJson: jsonOrNull(message.usage),
  })
}

function insertSession(database: DatabaseConnection, session: ChatSession): void {
  database.prepare(`
    INSERT OR REPLACE INTO sessions (
      id, name, created_at, updated_at, parent_session_id, branch_from_message_id,
      last_model, last_provider, is_pinned, is_archived, archived_at,
      working_directory, summary, summary_up_to_message_id, summary_created_at,
      migration_state, migrated_from_json_at, legacy_json_path
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'migrating', NULL, ?)
  `).run(
    session.id,
    session.name,
    session.createdAt,
    session.updatedAt,
    session.parentSessionId ?? null,
    session.branchFromMessageId ?? null,
    session.lastModel ?? null,
    session.lastProvider ?? null,
    boolInt(session.isPinned),
    boolInt(session.isArchived),
    session.archivedAt ?? null,
    session.workingDirectory ?? null,
    session.summary ?? null,
    session.summaryUpToMessageId ?? null,
    session.summaryCreatedAt ?? null,
    getSessionPath(session.id),
  )
}

function migrateSession(session: ChatSession): void {
  const database = getSessionDatabase()
  const migrate = database.transaction(() => {
    insertSession(database, session)
    database.prepare('DELETE FROM session_usage WHERE session_id = ?').run(session.id)
    database.prepare('DELETE FROM session_variables WHERE session_id = ?').run(session.id)
    database.prepare('DELETE FROM messages WHERE session_id = ?').run(session.id)

    database.prepare(`
      INSERT INTO session_usage (
        session_id, total_input_tokens, total_output_tokens, total_tokens,
        last_input_tokens, context_size
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.totalInputTokens ?? 0,
      session.totalOutputTokens ?? 0,
      session.totalTokens ?? 0,
      session.lastInputTokens ?? 0,
      session.contextSize ?? 0,
    )

    for (const variable of session.variables ?? []) {
      database.prepare(`
        INSERT OR REPLACE INTO session_variables (
          session_id, name, value, description, updated_at
        )
        VALUES (?, ?, ?, ?, ?)
      `).run(
        session.id,
        variable.name,
        variable.value,
        variable.description ?? null,
        variable.updatedAt ?? null,
      )
    }

    session.messages.forEach((message, index) => {
      insertMessage(database, session.id, message, index + 1)
    })

    database.prepare(`
      UPDATE sessions
      SET migration_state = 'ready', migrated_from_json_at = ?
      WHERE id = ?
    `).run(Date.now(), session.id)
  })

  migrate()
}

export function syncFullSessionToSqlite(session: ChatSession): void {
  initializeSqliteSessionRepository()
  const database = getSessionDatabase()
  const sync = database.transaction(() => {
    insertSession(database, session)
    database.prepare('DELETE FROM session_usage WHERE session_id = ?').run(session.id)
    database.prepare('DELETE FROM session_variables WHERE session_id = ?').run(session.id)
    database.prepare('DELETE FROM messages WHERE session_id = ?').run(session.id)

    database.prepare(`
      INSERT INTO session_usage (
        session_id, total_input_tokens, total_output_tokens, total_tokens,
        last_input_tokens, context_size
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.totalInputTokens ?? 0,
      session.totalOutputTokens ?? 0,
      session.totalTokens ?? 0,
      session.lastInputTokens ?? 0,
      session.contextSize ?? 0,
    )

    for (const variable of session.variables ?? []) {
      database.prepare(`
        INSERT OR REPLACE INTO session_variables (
          session_id, name, value, description, updated_at
        )
        VALUES (?, ?, ?, ?, ?)
      `).run(
        session.id,
        variable.name,
        variable.value,
        variable.description ?? null,
        variable.updatedAt ?? null,
      )
    }

    session.messages.forEach((message, index) => {
      insertMessage(database, session.id, message, index + 1)
    })

    database.prepare(`
      UPDATE sessions
      SET migration_state = 'ready', migrated_from_json_at = COALESCE(migrated_from_json_at, ?)
      WHERE id = ?
    `).run(Date.now(), session.id)
  })
  sync()
}

export function syncSqliteSessionMetadata(session: ChatSession): void {
  initializeSqliteSessionRepository()
  upsertSessionMetadata({
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    parentSessionId: session.parentSessionId,
    branchFromMessageId: session.branchFromMessageId,
    lastModel: session.lastModel,
    lastProvider: session.lastProvider,
    isPinned: session.isPinned,
    isArchived: session.isArchived,
    archivedAt: session.archivedAt,
    messageCount: session.messages.length,
    workingDirectory: session.workingDirectory,
    summary: session.summary,
    summaryUpToMessageId: session.summaryUpToMessageId,
    summaryCreatedAt: session.summaryCreatedAt,
    totalInputTokens: session.totalInputTokens,
    totalOutputTokens: session.totalOutputTokens,
    totalTokens: session.totalTokens,
    lastInputTokens: session.lastInputTokens,
    contextSize: session.contextSize,
  })
}

export function syncSqliteSessionUsage(session: ChatSession): void {
  initializeSqliteSessionRepository()
  getSessionDatabase().prepare(`
    INSERT INTO session_usage (
      session_id, total_input_tokens, total_output_tokens, total_tokens,
      last_input_tokens, context_size
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      total_input_tokens = excluded.total_input_tokens,
      total_output_tokens = excluded.total_output_tokens,
      total_tokens = excluded.total_tokens,
      last_input_tokens = excluded.last_input_tokens,
      context_size = excluded.context_size
  `).run(
    session.id,
    session.totalInputTokens ?? 0,
    session.totalOutputTokens ?? 0,
    session.totalTokens ?? 0,
    session.lastInputTokens ?? 0,
    session.contextSize ?? 0,
  )
}

export function syncSqliteSessionVariables(session: ChatSession): void {
  initializeSqliteSessionRepository()
  const database = getSessionDatabase()
  const sync = database.transaction(() => {
    database.prepare('DELETE FROM session_variables WHERE session_id = ?').run(session.id)
    for (const variable of session.variables ?? []) {
      database.prepare(`
        INSERT INTO session_variables (
          session_id, name, value, description, updated_at
        )
        VALUES (?, ?, ?, ?, ?)
      `).run(
        session.id,
        variable.name,
        variable.value,
        variable.description ?? null,
        variable.updatedAt ?? null,
      )
    }
  })
  sync()
}

export function syncSqliteMessage(sessionId: string, message: ChatMessage, seq: number): void {
  initializeSqliteSessionRepository()
  if (!isSqliteSessionReady(sessionId)) return
  upsertMessage(getSessionDatabase(), sessionId, message, seq)
}

export function deleteSqliteSessions(sessionIds: string[]): void {
  initializeSqliteSessionRepository()
  const database = getSessionDatabase()
  const remove = database.transaction((ids: string[]) => {
    for (const id of ids) {
      database.prepare('DELETE FROM sessions WHERE id = ?').run(id)
    }
  })
  remove(sessionIds)
}

export function migrateSessionToSqliteNow(sessionId: string): boolean {
  initializeSqliteSessionRepository()
  if (getMigrationState(sessionId) === 'ready') return true
  if (migratingSessions.has(sessionId)) return false

  migratingSessions.add(sessionId)
  try {
    const session = readJsonFile<ChatSession | null>(getSessionPath(sessionId), null)
    if (!session) return false
    migrateSession(session)
    return true
  } catch (error) {
    console.error('[SQLite Sessions] Migration failed:', sessionId, error)
    try {
      getSessionDatabase()
        .prepare("UPDATE sessions SET migration_state = 'failed' WHERE id = ?")
        .run(sessionId)
    } catch {
      // ignore secondary failure
    }
    return false
  } finally {
    migratingSessions.delete(sessionId)
  }
}

export function scheduleSessionSqliteMigration(sessionId: string): void {
  initializeSqliteSessionRepository()
  const state = getMigrationState(sessionId)
  if (state === 'ready' || state === 'migrating' || migratingSessions.has(sessionId)) return
  // Do not migrate legacy JSON on the main thread from the session-switch
  // hot path. Large JSON parse + SQLite insert is visible as UI freeze.
  // Existing sessions migrate when explicitly written/synced; page reads use
  // the byte-cursor JSON fallback until a worker-backed migration is added.
  void sessionId
}
