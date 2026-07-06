import { decodeMessagePageCursor, encodeMessagePageCursor } from './pagination.js'
import type { GetSessionMessagesPageRequest, GetSessionMessagesPageResponse } from './types.js'

export interface SqliteMessageRow {
  id: string
  session_id: string
  role: string
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

export interface SqliteSessionRow {
  id: string
  name: string
  created_at: number
  updated_at: number
  agent_id: string | null
  memory_profile_id: string | null
  origin_identity_key: string | null
  memory_scope_id: string | null
  last_connector: string | null
  last_sent_at: number | null
  parent_session_id: string | null
  branch_from_message_id: string | null
  last_model: string | null
  last_provider: string | null
  is_pinned: number
  is_archived: number
  archived_at: number | null
  working_directory: string | null
  working_directory_roots_json: string | null
  summary: string | null
  summary_up_to_message_id: string | null
  summary_created_at: number | null
  prompt_context_json: string | null
  total_input_tokens: number | null
  total_output_tokens: number | null
  total_tokens: number | null
  last_input_tokens: number | null
  context_size: number | null
}

export interface SqliteStoredChatMessage {
  id: string
  seq?: number
  sessionId: string
  role: string
  content: string
  timestamp: number
  isStreaming: boolean
  isThinking: boolean
  errorDetails?: string
  reasoning?: string
  toolCalls?: unknown
  contentParts?: unknown
  model?: string
  thinkingTime?: number
  thinkingStartTime?: number
  skillUsed?: string
  steps?: unknown
  attachments?: unknown
  usage?: unknown
}

export interface SqliteMessageParamInput {
  id: string
  role: string
  content?: string | null
  timestamp: number
  isStreaming?: boolean
  isThinking?: boolean
  errorDetails?: string
  reasoning?: string
  toolCalls?: unknown
  contentParts?: unknown
  model?: string
  thinkingTime?: number
  thinkingStartTime?: number
  skillUsed?: string
  steps?: unknown
  attachments?: unknown
  usage?: unknown
}

export interface SqliteMessageParams {
  id: string
  sessionId: string
  seq: number
  role: string
  content: string
  timestamp: number
  reasoning: string | null
  isStreaming: number
  isThinking: number
  errorDetails: string | null
  model: string | null
  thinkingTime: number | null
  thinkingStartTime: number | null
  skillUsed: string | null
  contentPartsJson: string | null
  toolCallsJson: string | null
  stepsJson: string | null
  attachmentsJson: string | null
  usageJson: string | null
}

export interface SqliteSessionDetails {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  agentId?: string
  memoryProfileId?: string
  originIdentityKey?: string
  memoryScopeId?: string
  lastConnector?: string
  lastSentAt?: number
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
  totalInputTokens?: number
  totalOutputTokens?: number
  totalTokens?: number
  lastInputTokens?: number
  contextSize?: number
  messageCount: number
}

export interface SqliteSessionMetadataInput {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  agentId?: string
  memoryProfileId?: string
  originIdentityKey?: string
  memoryScopeId?: string
  lastConnector?: string
  lastSentAt?: number
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
}

export interface SqliteSessionMetadataSource extends SqliteSessionMetadataInput {
  workingDirectoryRoots?: string[]
}

export interface SqliteSessionMetadataParams {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  parentSessionId: string | null
  branchFromMessageId: string | null
  agentId: string
  memoryProfileId: string | null
  originIdentityKey: string | null
  memoryScopeId: string | null
  lastConnector: string | null
  lastSentAt: number | null
  lastModel: string | null
  lastProvider: string | null
  isPinned: number
  isArchived: number
  archivedAt: number | null
  workingDirectory: string | null
  workingDirectoryRootsJson: string | null
  workingDirectoryRootsProvided: number
  summary: string | null
  summaryUpToMessageId: string | null
  summaryCreatedAt: number | null
  promptContextJson: string | null
  promptContextProvided: number
  migrationState: string | null
  legacyJsonPath: string | null
}

export interface SqliteSessionUsageInput {
  id: string
  totalInputTokens?: number
  totalOutputTokens?: number
  totalTokens?: number
  lastInputTokens?: number
  contextSize?: number
}

export type SqliteSessionUsageParams = [
  sessionId: string,
  totalInputTokens: number,
  totalOutputTokens: number,
  totalTokens: number,
  lastInputTokens: number,
  contextSize: number,
]

export interface SqliteSessionVariableInput {
  name: string
  value: string
  description?: string
  updatedAt?: number
}

export type SqliteSessionVariableParams = [
  sessionId: string,
  name: string,
  value: string,
  description: string | null,
  updatedAt: number | null,
]

export interface SqliteSequencedMessage<TMessage> {
  message: TMessage
  seq: number
}

export interface SqliteFullSessionWriteSource<TMessage = unknown>
  extends SqliteSessionMetadataSource,
    SqliteSessionUsageInput {
  variables?: SqliteSessionVariableInput[]
  messages: TMessage[]
}

export interface SqliteFullSessionWritePlan<TMessage = unknown> {
  sessionInsertParams: SqliteSessionInsertParams
  usageParams: SqliteSessionUsageParams
  variableParams: SqliteSessionVariableParams[]
  sequencedMessages: Array<SqliteSequencedMessage<TMessage>>
  readyParams: SqliteSessionReadyParams
}

export interface SqliteFullSessionWriteAdapters<TMessage = unknown> {
  insertSession(params: SqliteSessionInsertParams): void
  clearUsage(sessionId: string): void
  clearVariables(sessionId: string): void
  clearMessages(sessionId: string): void
  insertUsage(params: SqliteSessionUsageParams): void
  insertOrReplaceVariable(params: SqliteSessionVariableParams): void
  insertMessage(message: TMessage, seq: number): void
  markReady(params: SqliteSessionReadyParams): void
}

export interface SyncSqliteSessionVariablesWithAdaptersOptions<
  TVariable extends SqliteSessionVariableInput = SqliteSessionVariableInput,
> {
  sessionId: string
  variables?: TVariable[]
  clearVariables(sessionId: string): void
  insertVariable(params: SqliteSessionVariableParams): void
}

export interface SyncSqliteMessageWithReadyAdaptersOptions<TMessage> {
  sessionId: string
  message: TMessage
  seq: number
  isReady(sessionId: string): boolean
  upsertMessage(sessionId: string, message: TMessage, seq: number): void
}

export type SyncSqliteMessageWithReadyAdaptersResult = 'synced' | 'skipped-not-ready'

export interface DeleteSqliteSessionsWithAdaptersOptions {
  sessionIds: string[]
  deleteSession(sessionId: string): void
}

export interface ImportSqliteSessionIndexWithAdaptersOptions<TMeta> {
  index: TMeta[]
  upsertSessionMetadata(meta: TMeta): void
}

export interface DeleteSqliteMessageWithRenumberAdaptersOptions {
  sessionId: string
  messageId: string
  isReady(sessionId: string): boolean
  getMessageSeq(sessionId: string, messageId: string): number | undefined
  deleteMessage(params: SqliteDeleteMessageParams): void
  moveLaterMessagesToNegative(params: SqliteRenumberMessagesAfterDeleteParams): void
  restoreLaterMessages(params: SqliteRestoreRenumberedMessagesParams): void
}

export interface DeleteSqliteMessageAndAfterWithAdaptersOptions {
  sessionId: string
  messageId: string
  isReady(sessionId: string): boolean
  getMessageSeq(sessionId: string, messageId: string): number | undefined
  deleteMessagesFromSeq(params: SqliteDeleteMessagesFromSeqParams): void
}

export interface UpsertSqliteMessageAndTruncateWithAdaptersOptions<TMessage> {
  sessionId: string
  message: TMessage
  seq: number
  isReady(sessionId: string): boolean
  upsertMessage(sessionId: string, message: TMessage, seq: number): void
  deleteMessagesAfterSeq(params: SqliteDeleteMessagesAfterSeqParams): void
}

export type SqliteReadyMutationResult = 'applied' | 'skipped-not-ready' | 'missing-message'

export interface SqliteSessionInsertOptions {
  defaultAgentId: string
  legacyJsonPath?: string | null
  migratedFromJsonAt?: number
}

export type SqliteSessionInsertParams = [
  id: string,
  name: string,
  createdAt: number,
  updatedAt: number,
  parentSessionId: string | null,
  branchFromMessageId: string | null,
  agentId: string,
  memoryProfileId: string | null,
  originIdentityKey: string | null,
  memoryScopeId: string | null,
  lastConnector: string | null,
  lastSentAt: number | null,
  lastModel: string | null,
  lastProvider: string | null,
  isPinned: number,
  isArchived: number,
  archivedAt: number | null,
  workingDirectory: string | null,
  workingDirectoryRootsJson: string | null,
  summary: string | null,
  summaryUpToMessageId: string | null,
  summaryCreatedAt: number | null,
  promptContextJson: string | null,
  legacyJsonPath: string | null,
]

export type SqliteSessionReadyParams = [
  migratedFromJsonAt: number,
  sessionId: string,
]

export type SqliteSessionMigrationState = 'pending' | 'migrating' | 'ready' | 'failed' | string | undefined

export type SqliteSessionMigrationBeginResult =
  | {
    status: 'already-ready'
    shouldRun: false
  }
  | {
    status: 'in-flight'
    shouldRun: false
  }
  | {
    status: 'started'
    shouldRun: true
  }

export type SqliteSessionMigrationScheduleResult =
  | {
    status: 'already-ready' | 'database-migrating' | 'in-flight'
    shouldSchedule: false
  }
  | {
    status: 'schedule'
    shouldSchedule: true
  }

export interface RunSqliteSessionMigrationWithAdaptersOptions<TSession> {
  sessionId: string
  tracker: CoreSqliteSessionMigrationTracker
  getMigrationState(sessionId: string): SqliteSessionMigrationState
  loadSession(sessionId: string): TSession | undefined
  migrateSession(session: TSession): void
  markMigrationFailed?(sessionId: string): void
  logger?: { error?: (...args: unknown[]) => void }
}

export type RunSqliteSessionMigrationWithAdaptersResult =
  | { status: 'already-ready'; migrated: true }
  | { status: 'in-flight'; migrated: false }
  | { status: 'missing-session'; migrated: false }
  | { status: 'migrated'; migrated: true }
  | { status: 'failed'; migrated: false; error: unknown }

export class CoreSqliteSessionMigrationTracker {
  private readonly inFlight = new Set<string>()

  has(sessionId: string): boolean {
    return this.inFlight.has(sessionId)
  }

  begin(sessionId: string, state: SqliteSessionMigrationState): SqliteSessionMigrationBeginResult {
    if (state === 'ready') {
      return { status: 'already-ready', shouldRun: false }
    }
    if (this.inFlight.has(sessionId)) {
      return { status: 'in-flight', shouldRun: false }
    }
    this.inFlight.add(sessionId)
    return { status: 'started', shouldRun: true }
  }

  finish(sessionId: string): void {
    this.inFlight.delete(sessionId)
  }

  planSchedule(sessionId: string, state: SqliteSessionMigrationState): SqliteSessionMigrationScheduleResult {
    if (state === 'ready') {
      return { status: 'already-ready', shouldSchedule: false }
    }
    if (state === 'migrating') {
      return { status: 'database-migrating', shouldSchedule: false }
    }
    if (this.inFlight.has(sessionId)) {
      return { status: 'in-flight', shouldSchedule: false }
    }
    return { status: 'schedule', shouldSchedule: true }
  }

  reset(): void {
    this.inFlight.clear()
  }
}

export function runSqliteSessionMigrationWithAdapters<TSession>(
  options: RunSqliteSessionMigrationWithAdaptersOptions<TSession>,
): RunSqliteSessionMigrationWithAdaptersResult {
  const start = options.tracker.begin(options.sessionId, options.getMigrationState(options.sessionId))
  if (start.status === 'already-ready') return { status: 'already-ready', migrated: true }
  if (!start.shouldRun) return { status: 'in-flight', migrated: false }

  try {
    const session = options.loadSession(options.sessionId)
    if (!session) return { status: 'missing-session', migrated: false }

    options.migrateSession(session)
    return { status: 'migrated', migrated: true }
  } catch (error) {
    options.logger?.error?.('[SQLite Sessions] Migration failed:', options.sessionId, error)
    try {
      options.markMigrationFailed?.(options.sessionId)
    } catch {
      // ignore secondary failure
    }
    return { status: 'failed', migrated: false, error }
  } finally {
    options.tracker.finish(options.sessionId)
  }
}

export type SqliteDeleteMessageParams = [
  sessionId: string,
  messageId: string,
]

export type SqliteRenumberMessagesAfterDeleteParams = [
  sessionId: string,
  deletedSeq: number,
]

export type SqliteRestoreRenumberedMessagesParams = [
  sessionId: string,
]

export interface SqliteDeleteMessageRenumberPlan {
  deleteMessageParams: SqliteDeleteMessageParams
  moveLaterMessagesToNegativeParams: SqliteRenumberMessagesAfterDeleteParams
  restoreLaterMessagesParams: SqliteRestoreRenumberedMessagesParams
}

export type SqliteDeleteMessagesFromSeqParams = [
  sessionId: string,
  fromSeq: number,
]

export type SqliteDeleteMessagesAfterSeqParams = [
  sessionId: string,
  afterSeq: number,
]

export type SqliteMessagePageCursorComparison = 'gt' | 'gte' | 'lt' | 'lte'

export type SqliteMessagePageCursorParams = [
  sessionId: string,
  seq: number,
  limit: number,
]

export type SqliteMessagePageResolveAnchorParams = [
  sessionId: string,
  messageId: string,
]

export type SqliteMessagePageWindowParams = [
  sessionId: string,
  startSeq: number,
  endSeq: number,
]

export type SqliteMessagePageTailParams = [
  sessionId: string,
  limit: number,
]

export type SqliteMessagePageQueryPlan =
  | {
    kind: 'empty' | 'error'
    response: GetSessionMessagesPageResponse<SqliteStoredChatMessage>
  }
  | {
    kind: 'cursor'
    direction: 'newer' | 'older'
    comparison: SqliteMessagePageCursorComparison
    params: SqliteMessagePageCursorParams
  }
  | {
    kind: 'resolve-anchor'
    params: SqliteMessagePageResolveAnchorParams
  }
  | {
    kind: 'anchor-window'
    params: SqliteMessagePageWindowParams
  }
  | {
    kind: 'tail'
    params: SqliteMessagePageTailParams
  }

export type SqliteMessagePageExecutableQuery =
  | {
    kind: 'response'
    response: GetSessionMessagesPageResponse<SqliteStoredChatMessage>
  }
  | {
    kind: 'resolve-anchor'
    sql: string
    params: SqliteMessagePageResolveAnchorParams
  }
  | {
    kind: 'rows'
    sql: string
    params: SqliteMessagePageCursorParams | SqliteMessagePageWindowParams | SqliteMessagePageTailParams
  }
  | {
    kind: 'unsupported'
    response: GetSessionMessagesPageResponse<SqliteStoredChatMessage>
  }

export interface SqliteMessagesPageExecutionAdapters<TRow extends SqliteMessageRow & { seq: number }> {
  resolveAnchorSeq(query: Extract<SqliteMessagePageExecutableQuery, { kind: 'resolve-anchor' }>): number | null | undefined
  selectRows(query: Extract<SqliteMessagePageExecutableQuery, { kind: 'rows' }>): TRow[]
}

export const SQLITE_CREATE_SCHEMA_MIGRATIONS_SQL = `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`

export const SQLITE_SELECT_SCHEMA_MIGRATION_SQL = 'SELECT version FROM schema_migrations WHERE version = ?'

export const SQLITE_UPSERT_SCHEMA_MIGRATION_SQL = 'INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (?, ?)'

export const SQLITE_UPSERT_SESSION_METADATA_SQL = `
    INSERT INTO sessions (
      id, name, created_at, updated_at, parent_session_id, branch_from_message_id,
      agent_id, memory_profile_id, origin_identity_key, memory_scope_id, last_connector, last_sent_at,
      last_model, last_provider, is_pinned, is_archived, archived_at,
      working_directory, working_directory_roots_json, summary, summary_up_to_message_id, summary_created_at, prompt_context_json,
      migration_state, legacy_json_path
    )
    VALUES (
      @id, @name, @createdAt, @updatedAt, @parentSessionId, @branchFromMessageId,
      @agentId, @memoryProfileId, @originIdentityKey, @memoryScopeId, @lastConnector, @lastSentAt,
      @lastModel, @lastProvider, @isPinned, @isArchived, @archivedAt,
      @workingDirectory, @workingDirectoryRootsJson, @summary, @summaryUpToMessageId, @summaryCreatedAt, @promptContextJson,
      COALESCE(@migrationState, 'pending'), @legacyJsonPath
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      agent_id = COALESCE(excluded.agent_id, sessions.agent_id),
      memory_profile_id = COALESCE(excluded.memory_profile_id, sessions.memory_profile_id),
      origin_identity_key = COALESCE(excluded.origin_identity_key, sessions.origin_identity_key),
      memory_scope_id = COALESCE(excluded.memory_scope_id, sessions.memory_scope_id),
      last_connector = COALESCE(excluded.last_connector, sessions.last_connector),
      last_sent_at = COALESCE(excluded.last_sent_at, sessions.last_sent_at),
      parent_session_id = excluded.parent_session_id,
      branch_from_message_id = excluded.branch_from_message_id,
      last_model = excluded.last_model,
      last_provider = excluded.last_provider,
      is_pinned = excluded.is_pinned,
      is_archived = excluded.is_archived,
      archived_at = excluded.archived_at,
      working_directory = COALESCE(excluded.working_directory, sessions.working_directory),
      working_directory_roots_json = CASE
        WHEN @workingDirectoryRootsProvided THEN excluded.working_directory_roots_json
        ELSE sessions.working_directory_roots_json
      END,
      summary = COALESCE(excluded.summary, sessions.summary),
      summary_up_to_message_id = COALESCE(excluded.summary_up_to_message_id, sessions.summary_up_to_message_id),
      summary_created_at = COALESCE(excluded.summary_created_at, sessions.summary_created_at),
      prompt_context_json = CASE
        WHEN @promptContextProvided THEN excluded.prompt_context_json
        ELSE sessions.prompt_context_json
      END,
      legacy_json_path = COALESCE(excluded.legacy_json_path, sessions.legacy_json_path)
  `

export const SQLITE_SELECT_SESSION_DETAILS_SQL = `
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
  `

export const SQLITE_SELECT_MIGRATION_STATE_SQL = 'SELECT migration_state FROM sessions WHERE id = ?'

export const SQLITE_COUNT_MESSAGES_SQL = 'SELECT COUNT(*) AS count FROM messages WHERE session_id = ?'

export const SQLITE_SELECT_USER_MESSAGE_MARKERS_SQL = `
    SELECT id, seq, timestamp, substr(content, 1, 80) AS preview
    FROM messages
    WHERE session_id = ? AND role = 'user'
    ORDER BY seq ASC
  `

export const SQLITE_INSERT_MESSAGE_SQL = `
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
  `

export const SQLITE_UPSERT_MESSAGE_SQL = `
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
  `

export const SQLITE_INSERT_SESSION_FOR_WRITE_SQL = `
    INSERT OR REPLACE INTO sessions (
      id, name, created_at, updated_at, parent_session_id, branch_from_message_id,
      agent_id, memory_profile_id, origin_identity_key, memory_scope_id, last_connector, last_sent_at,
      last_model, last_provider, is_pinned, is_archived, archived_at,
      working_directory, working_directory_roots_json, summary, summary_up_to_message_id, summary_created_at,
      prompt_context_json, migration_state, migrated_from_json_at, legacy_json_path
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'migrating', NULL, ?)
  `

export const SQLITE_DELETE_SESSION_USAGE_SQL = 'DELETE FROM session_usage WHERE session_id = ?'
export const SQLITE_DELETE_SESSION_VARIABLES_SQL = 'DELETE FROM session_variables WHERE session_id = ?'
export const SQLITE_DELETE_SESSION_MESSAGES_SQL = 'DELETE FROM messages WHERE session_id = ?'

export const SQLITE_INSERT_SESSION_USAGE_SQL = `
    INSERT INTO session_usage (
      session_id, total_input_tokens, total_output_tokens, total_tokens,
      last_input_tokens, context_size
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `

export const SQLITE_UPSERT_SESSION_USAGE_SQL = `
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
  `

export const SQLITE_INSERT_SESSION_VARIABLE_SQL = `
        INSERT INTO session_variables (
          session_id, name, value, description, updated_at
        )
        VALUES (?, ?, ?, ?, ?)
      `

export const SQLITE_INSERT_OR_REPLACE_SESSION_VARIABLE_SQL = `
        INSERT OR REPLACE INTO session_variables (
          session_id, name, value, description, updated_at
        )
        VALUES (?, ?, ?, ?, ?)
      `

export const SQLITE_MARK_SESSION_READY_SQL = `
      UPDATE sessions
      SET migration_state = 'ready', migrated_from_json_at = ?
      WHERE id = ?
    `

export const SQLITE_MARK_SESSION_READY_COALESCE_SQL = `
      UPDATE sessions
      SET migration_state = 'ready', migrated_from_json_at = COALESCE(migrated_from_json_at, ?)
      WHERE id = ?
    `

export const SQLITE_SELECT_SESSION_AGENT_ID_SQL = 'SELECT agent_id FROM sessions WHERE id = ?'

export const SQLITE_SELECT_MESSAGE_SEQ_SQL = 'SELECT seq FROM messages WHERE session_id = ? AND id = ?'
export const SQLITE_DELETE_MESSAGE_BY_ID_SQL = 'DELETE FROM messages WHERE session_id = ? AND id = ?'
export const SQLITE_MOVE_LATER_MESSAGES_TO_NEGATIVE_SQL = 'UPDATE messages SET seq = -(seq - 1) WHERE session_id = ? AND seq > ?'
export const SQLITE_RESTORE_NEGATIVE_MESSAGES_SQL = 'UPDATE messages SET seq = -seq WHERE session_id = ? AND seq < 0'
export const SQLITE_DELETE_MESSAGES_FROM_SEQ_SQL = 'DELETE FROM messages WHERE session_id = ? AND seq >= ?'
export const SQLITE_DELETE_MESSAGES_AFTER_SEQ_SQL = 'DELETE FROM messages WHERE session_id = ? AND seq > ?'
export const SQLITE_DELETE_SESSION_SQL = 'DELETE FROM sessions WHERE id = ?'
export const SQLITE_MARK_SESSION_MIGRATION_FAILED_SQL = "UPDATE sessions SET migration_state = 'failed' WHERE id = ?"

export interface RowToSessionDetailsOptions {
  defaultAgentId?: string
  messageCount: number
}

export function jsonOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null
  return JSON.stringify(value)
}

export function parseJson<T = unknown>(value: string | null): T | undefined {
  if (!value) return undefined
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

export function boolInt(value: boolean | undefined): number {
  return value ? 1 : 0
}

export function sqliteMessageParams(
  sessionId: string,
  message: SqliteMessageParamInput,
  seq: number,
): SqliteMessageParams {
  return {
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
  }
}

export function sqliteSessionMetadataParams(
  meta: SqliteSessionMetadataInput,
  options: {
    defaultAgentId: string
    legacyJsonPath?: string | null
    migrationState?: string | null
  },
): SqliteSessionMetadataParams {
  return {
    id: meta.id,
    name: meta.name,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    parentSessionId: meta.parentSessionId ?? null,
    branchFromMessageId: meta.branchFromMessageId ?? null,
    agentId: meta.agentId || options.defaultAgentId,
    memoryProfileId: meta.memoryProfileId ?? null,
    originIdentityKey: meta.originIdentityKey ?? null,
    memoryScopeId: meta.memoryScopeId ?? null,
    lastConnector: meta.lastConnector ?? null,
    lastSentAt: meta.lastSentAt ?? null,
    lastModel: meta.lastModel ?? null,
    lastProvider: meta.lastProvider ?? null,
    isPinned: boolInt(meta.isPinned),
    isArchived: boolInt(meta.isArchived),
    archivedAt: meta.archivedAt ?? null,
    workingDirectory: ('workingDirectory' in meta ? meta.workingDirectory : undefined) ?? null,
    workingDirectoryRootsJson: 'workingDirectoryRoots' in meta
      ? jsonOrNull(meta.workingDirectoryRoots ?? [])
      : null,
    workingDirectoryRootsProvided: 'workingDirectoryRoots' in meta ? 1 : 0,
    summary: ('summary' in meta ? meta.summary : undefined) ?? null,
    summaryUpToMessageId: ('summaryUpToMessageId' in meta ? meta.summaryUpToMessageId : undefined) ?? null,
    summaryCreatedAt: ('summaryCreatedAt' in meta ? meta.summaryCreatedAt : undefined) ?? null,
    promptContextJson: 'promptContext' in meta ? jsonOrNull(meta.promptContext) : null,
    promptContextProvided: 'promptContext' in meta ? 1 : 0,
    migrationState: options.migrationState ?? null,
    legacyJsonPath: options.legacyJsonPath ?? null,
  }
}

export function sqliteSessionMetadataInputFromSession(
  session: SqliteSessionMetadataSource,
): SqliteSessionMetadataInput {
  return {
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    parentSessionId: session.parentSessionId,
    branchFromMessageId: session.branchFromMessageId,
    agentId: session.agentId,
    memoryProfileId: session.memoryProfileId,
    originIdentityKey: session.originIdentityKey,
    memoryScopeId: session.memoryScopeId,
    lastConnector: session.lastConnector,
    lastSentAt: session.lastSentAt,
    lastModel: session.lastModel,
    lastProvider: session.lastProvider,
    isPinned: session.isPinned,
    isArchived: session.isArchived,
    archivedAt: session.archivedAt,
    workingDirectory: session.workingDirectory,
    workingDirectoryRoots: session.workingDirectoryRoots ?? [],
    summary: session.summary,
    summaryUpToMessageId: session.summaryUpToMessageId,
    summaryCreatedAt: session.summaryCreatedAt,
    promptContext: session.promptContext ?? null,
  }
}

export function sqliteSessionInsertParams(
  session: SqliteSessionMetadataSource,
  options: SqliteSessionInsertOptions,
): SqliteSessionInsertParams {
  return [
    session.id,
    session.name,
    session.createdAt,
    session.updatedAt,
    session.parentSessionId ?? null,
    session.branchFromMessageId ?? null,
    session.agentId || options.defaultAgentId,
    session.memoryProfileId ?? null,
    session.originIdentityKey ?? null,
    session.memoryScopeId ?? null,
    session.lastConnector ?? null,
    session.lastSentAt ?? null,
    session.lastModel ?? null,
    session.lastProvider ?? null,
    boolInt(session.isPinned),
    boolInt(session.isArchived),
    session.archivedAt ?? null,
    session.workingDirectory ?? null,
    jsonOrNull(session.workingDirectoryRoots ?? []),
    session.summary ?? null,
    session.summaryUpToMessageId ?? null,
    session.summaryCreatedAt ?? null,
    jsonOrNull(session.promptContext ?? null),
    options.legacyJsonPath ?? null,
  ]
}

export function sqliteSessionReadyParams(
  sessionId: string,
  migratedFromJsonAt = Date.now(),
): SqliteSessionReadyParams {
  return [migratedFromJsonAt, sessionId]
}

export function preserveSqliteSessionAgentId<TSession extends object>(
  session: TSession,
  existingAgentId: string | null | undefined,
): TSession {
  if ((session as { agentId?: string }).agentId || !existingAgentId) return session
  return { ...session, agentId: existingAgentId }
}

export function sqliteSessionUsageParams(session: SqliteSessionUsageInput): SqliteSessionUsageParams {
  return [
    session.id,
    session.totalInputTokens ?? 0,
    session.totalOutputTokens ?? 0,
    session.totalTokens ?? 0,
    session.lastInputTokens ?? 0,
    session.contextSize ?? 0,
  ]
}

export function sqliteSessionVariableParams(
  sessionId: string,
  variable: SqliteSessionVariableInput,
): SqliteSessionVariableParams {
  return [
    sessionId,
    variable.name,
    variable.value,
    variable.description ?? null,
    variable.updatedAt ?? null,
  ]
}

export function sqliteSequencedMessages<TMessage>(messages: TMessage[]): Array<SqliteSequencedMessage<TMessage>> {
  return messages.map((message, index) => ({
    message,
    seq: index + 1,
  }))
}

export function sqliteFullSessionWritePlan<TMessage>(
  session: SqliteFullSessionWriteSource<TMessage>,
  options: SqliteSessionInsertOptions,
): SqliteFullSessionWritePlan<TMessage> {
  return {
    sessionInsertParams: sqliteSessionInsertParams(session, options),
    usageParams: sqliteSessionUsageParams(session),
    variableParams: (session.variables ?? []).map(variable =>
      sqliteSessionVariableParams(session.id, variable),
    ),
    sequencedMessages: sqliteSequencedMessages(session.messages),
    readyParams: sqliteSessionReadyParams(session.id, options.migratedFromJsonAt),
  }
}

export function applySqliteFullSessionWritePlanWithAdapters<TMessage>(
  sessionId: string,
  plan: SqliteFullSessionWritePlan<TMessage>,
  adapters: SqliteFullSessionWriteAdapters<TMessage>,
): void {
  adapters.insertSession(plan.sessionInsertParams)
  adapters.clearUsage(sessionId)
  adapters.clearVariables(sessionId)
  adapters.clearMessages(sessionId)
  adapters.insertUsage(plan.usageParams)

  for (const params of plan.variableParams) {
    adapters.insertOrReplaceVariable(params)
  }

  for (const { message, seq } of plan.sequencedMessages) {
    adapters.insertMessage(message, seq)
  }

  adapters.markReady(plan.readyParams)
}

export function syncSqliteSessionVariablesWithAdapters<
  TVariable extends SqliteSessionVariableInput = SqliteSessionVariableInput,
>(
  options: SyncSqliteSessionVariablesWithAdaptersOptions<TVariable>,
): number {
  options.clearVariables(options.sessionId)
  let inserted = 0

  for (const variable of options.variables ?? []) {
    options.insertVariable(sqliteSessionVariableParams(options.sessionId, variable))
    inserted += 1
  }

  return inserted
}

export function syncSqliteMessageWithReadyAdapters<TMessage>(
  options: SyncSqliteMessageWithReadyAdaptersOptions<TMessage>,
): SyncSqliteMessageWithReadyAdaptersResult {
  if (!options.isReady(options.sessionId)) return 'skipped-not-ready'

  options.upsertMessage(options.sessionId, options.message, options.seq)
  return 'synced'
}

export function deleteSqliteSessionsWithAdapters(
  options: DeleteSqliteSessionsWithAdaptersOptions,
): number {
  for (const sessionId of options.sessionIds) {
    options.deleteSession(sessionId)
  }
  return options.sessionIds.length
}

export function importSqliteSessionIndexWithAdapters<TMeta>(
  options: ImportSqliteSessionIndexWithAdaptersOptions<TMeta>,
): number {
  for (const meta of options.index) {
    options.upsertSessionMetadata(meta)
  }
  return options.index.length
}

export function deleteSqliteMessageWithRenumberAdapters(
  options: DeleteSqliteMessageWithRenumberAdaptersOptions,
): SqliteReadyMutationResult {
  if (!options.isReady(options.sessionId)) return 'skipped-not-ready'

  const seq = options.getMessageSeq(options.sessionId, options.messageId)
  if (seq === undefined) return 'missing-message'

  const plan = sqliteDeleteMessageRenumberPlan(options.sessionId, options.messageId, seq)
  options.deleteMessage(plan.deleteMessageParams)
  options.moveLaterMessagesToNegative(plan.moveLaterMessagesToNegativeParams)
  options.restoreLaterMessages(plan.restoreLaterMessagesParams)
  return 'applied'
}

export function deleteSqliteMessageAndAfterWithAdapters(
  options: DeleteSqliteMessageAndAfterWithAdaptersOptions,
): SqliteReadyMutationResult {
  if (!options.isReady(options.sessionId)) return 'skipped-not-ready'

  const seq = options.getMessageSeq(options.sessionId, options.messageId)
  if (seq === undefined) return 'missing-message'

  options.deleteMessagesFromSeq(sqliteDeleteMessagesFromSeqParams(options.sessionId, seq))
  return 'applied'
}

export function upsertSqliteMessageAndTruncateWithAdapters<TMessage>(
  options: UpsertSqliteMessageAndTruncateWithAdaptersOptions<TMessage>,
): Exclude<SqliteReadyMutationResult, 'missing-message'> {
  if (!options.isReady(options.sessionId)) return 'skipped-not-ready'

  options.upsertMessage(options.sessionId, options.message, options.seq)
  options.deleteMessagesAfterSeq(sqliteDeleteMessagesAfterSeqParams(options.sessionId, options.seq))
  return 'applied'
}

export function sqliteDeleteMessageRenumberPlan(
  sessionId: string,
  messageId: string,
  deletedSeq: number,
): SqliteDeleteMessageRenumberPlan {
  return {
    deleteMessageParams: [sessionId, messageId],
    moveLaterMessagesToNegativeParams: [sessionId, deletedSeq],
    restoreLaterMessagesParams: [sessionId],
  }
}

export function sqliteDeleteMessagesFromSeqParams(
  sessionId: string,
  fromSeq: number,
): SqliteDeleteMessagesFromSeqParams {
  return [sessionId, fromSeq]
}

export function sqliteDeleteMessagesAfterSeqParams(
  sessionId: string,
  afterSeq: number,
): SqliteDeleteMessagesAfterSeqParams {
  return [sessionId, afterSeq]
}

export function planSqliteMessagesPageQuery(
  request: GetSessionMessagesPageRequest,
  totalCount: number,
  resolvedAnchorSeq?: number | null,
): SqliteMessagePageQueryPlan {
  const limit = clampMessagePageLimit(request.limit)

  if (totalCount === 0) {
    return {
      kind: 'empty',
      response: sqliteMessagesPageFromRows(request.sessionId, [], totalCount),
    }
  }

  if (request.cursor) {
    const cursor = decodeMessagePageCursor(request.cursor)
    if (!cursor || cursor.sessionId !== request.sessionId) {
      return {
        kind: 'error',
        response: { success: false, error: 'Invalid message page cursor' },
      }
    }

    const direction = request.direction ?? 'older'
    if (direction === 'newer') {
      return {
        kind: 'cursor',
        direction,
        comparison: cursor.includeAnchor ? 'gte' : 'gt',
        params: [request.sessionId, cursor.seq, limit],
      }
    }

    return {
      kind: 'cursor',
      direction,
      comparison: cursor.includeAnchor ? 'lte' : 'lt',
      params: [request.sessionId, cursor.seq, limit],
    }
  }

  const anchor = request.anchor
  if (anchor && anchor !== 'tail') {
    if (!anchor.seq && anchor.messageId && resolvedAnchorSeq === undefined) {
      return {
        kind: 'resolve-anchor',
        params: [request.sessionId, anchor.messageId],
      }
    }

    const anchorSeq = anchor.seq ?? resolvedAnchorSeq ?? undefined
    if (!anchorSeq) {
      return {
        kind: 'error',
        response: { success: false, error: 'Anchor message not found' },
      }
    }

    const before = Math.max(0, anchor.before ?? Math.floor(limit / 2))
    const after = Math.max(0, anchor.after ?? Math.max(0, limit - before - 1))
    return {
      kind: 'anchor-window',
      params: [
        request.sessionId,
        Math.max(1, anchorSeq - before),
        Math.min(totalCount, anchorSeq + after),
      ],
    }
  }

  return {
    kind: 'tail',
    params: [request.sessionId, limit],
  }
}

export function sqliteMessagesPageExecutableQuery(
  plan: SqliteMessagePageQueryPlan,
): SqliteMessagePageExecutableQuery {
  if (plan.kind === 'empty' || plan.kind === 'error') {
    return {
      kind: 'response',
      response: plan.response,
    }
  }

  if (plan.kind === 'resolve-anchor') {
    return {
      kind: 'resolve-anchor',
      sql: 'SELECT seq FROM messages WHERE session_id = ? AND id = ?',
      params: plan.params,
    }
  }

  if (plan.kind === 'cursor' && plan.direction === 'newer') {
    const op = plan.comparison === 'gte' ? '>=' : '>'
    return {
      kind: 'rows',
      sql: [
        'SELECT * FROM messages',
        `WHERE session_id = ? AND seq ${op} ?`,
        'ORDER BY seq ASC',
        'LIMIT ?',
      ].join('\n'),
      params: plan.params,
    }
  }

  if (plan.kind === 'cursor') {
    const op = plan.comparison === 'lte' ? '<=' : '<'
    return {
      kind: 'rows',
      sql: [
        'SELECT * FROM (',
        '  SELECT * FROM messages',
        `  WHERE session_id = ? AND seq ${op} ?`,
        '  ORDER BY seq DESC',
        '  LIMIT ?',
        ')',
        'ORDER BY seq ASC',
      ].join('\n'),
      params: plan.params,
    }
  }

  if (plan.kind === 'anchor-window') {
    return {
      kind: 'rows',
      sql: [
        'SELECT * FROM messages',
        'WHERE session_id = ? AND seq BETWEEN ? AND ?',
        'ORDER BY seq ASC',
      ].join('\n'),
      params: plan.params,
    }
  }

  if (plan.kind === 'tail') {
    return {
      kind: 'rows',
      sql: [
        'SELECT * FROM (',
        '  SELECT * FROM messages',
        '  WHERE session_id = ?',
        '  ORDER BY seq DESC',
        '  LIMIT ?',
        ')',
        'ORDER BY seq ASC',
      ].join('\n'),
      params: plan.params,
    }
  }

  return {
    kind: 'unsupported',
    response: { success: false, error: 'Unsupported message page query plan' },
  }
}

export function resolveSqliteMessagesPageWithAdapters<TRow extends SqliteMessageRow & { seq: number }>(
  request: GetSessionMessagesPageRequest,
  totalCount: number,
  adapters: SqliteMessagesPageExecutionAdapters<TRow>,
): GetSessionMessagesPageResponse<SqliteStoredChatMessage> {
  let plan = planSqliteMessagesPageQuery(request, totalCount)

  if (plan.kind === 'resolve-anchor') {
    const query = sqliteMessagesPageExecutableQuery(plan)
    if (query.kind !== 'resolve-anchor') {
      return query.kind === 'response'
        ? query.response
        : { success: false, error: 'Unsupported message page query plan' }
    }
    const seq = adapters.resolveAnchorSeq(query)
    plan = planSqliteMessagesPageQuery(request, totalCount, seq ?? null)
  }

  const query = sqliteMessagesPageExecutableQuery(plan)
  if (query.kind === 'response' || query.kind === 'unsupported') {
    return query.response
  }
  if (query.kind === 'rows') {
    return sqliteMessagesPageFromRows(request.sessionId, adapters.selectRows(query), totalCount)
  }

  return { success: false, error: 'Unsupported message page query plan' }
}

export function rowToSessionDetails(
  row: SqliteSessionRow,
  options: RowToSessionDetailsOptions,
): SqliteSessionDetails {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    agentId: row.agent_id || options.defaultAgentId,
    memoryProfileId: row.memory_profile_id ?? undefined,
    originIdentityKey: row.origin_identity_key ?? undefined,
    memoryScopeId: row.memory_scope_id ?? undefined,
    lastConnector: row.last_connector ?? undefined,
    lastSentAt: row.last_sent_at ?? undefined,
    parentSessionId: row.parent_session_id ?? undefined,
    branchFromMessageId: row.branch_from_message_id ?? undefined,
    lastModel: row.last_model ?? undefined,
    lastProvider: row.last_provider ?? undefined,
    isPinned: Boolean(row.is_pinned),
    isArchived: Boolean(row.is_archived),
    archivedAt: row.archived_at ?? undefined,
    workingDirectory: row.working_directory ?? undefined,
    workingDirectoryRoots: parseJson<string[]>(row.working_directory_roots_json) ?? undefined,
    summary: row.summary ?? undefined,
    summaryUpToMessageId: row.summary_up_to_message_id ?? undefined,
    summaryCreatedAt: row.summary_created_at ?? undefined,
    promptContext: parseJson(row.prompt_context_json) ?? undefined,
    totalInputTokens: row.total_input_tokens ?? undefined,
    totalOutputTokens: row.total_output_tokens ?? undefined,
    totalTokens: row.total_tokens ?? undefined,
    lastInputTokens: row.last_input_tokens ?? undefined,
    contextSize: row.context_size ?? undefined,
    messageCount: options.messageCount,
  }
}

export function rowToMessage(row: SqliteMessageRow & { seq?: number }): SqliteStoredChatMessage {
  return {
    id: row.id,
    seq: row.seq,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    timestamp: row.timestamp,
    isStreaming: Boolean(row.is_streaming),
    isThinking: Boolean(row.is_thinking),
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

export function sqliteMessagesPageFromRows<
  TRow extends SqliteMessageRow & { seq: number },
>(
  sessionId: string,
  rows: TRow[],
  totalCount: number,
): GetSessionMessagesPageResponse<SqliteStoredChatMessage> {
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

export function clampMessagePageLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return 16
  return Math.max(1, Math.min(300, Math.floor(limit)))
}
