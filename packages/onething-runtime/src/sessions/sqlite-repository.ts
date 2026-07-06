import type {
  GetSessionMessagesPageRequest,
  GetSessionMessagesPageResponse,
} from '@onething/core/session'
import type {
  OnethingSqliteChatMessage,
  OnethingSqliteChatSession,
  OnethingSqliteRepositoryAdapters,
  OnethingSqliteSessionDetails,
  OnethingSqliteSessionMeta,
  OnethingSqliteUserMessageMarker,
} from './sqlite-types.js'
import {
  createSessionDatabaseConnection,
  type SessionDatabaseConnection,
} from './sqlite-driver.js'
import {
  CORE_DEFAULT_AGENT_ID as DEFAULT_AGENT_ID,
} from '@onething/core/session'
import {
  applySqliteSchemaMigrationsWithAdapters,
  CoreSqliteSessionMigrationTracker,
  deleteSqliteSessionsWithAdapters,
  deleteSqliteMessageAndAfterWithAdapters,
  deleteSqliteMessageWithRenumberAdapters,
  preserveSqliteSessionAgentId,
  resolveSqliteMessagesPageWithAdapters,
  rowToMessage,
  rowToSessionDetails,
  runSqliteSessionMigrationWithAdapters,
  SQLITE_COUNT_MESSAGES_SQL,
  SQLITE_CREATE_SCHEMA_MIGRATIONS_SQL,
  SQLITE_DELETE_MESSAGE_BY_ID_SQL,
  SQLITE_DELETE_MESSAGES_AFTER_SEQ_SQL,
  SQLITE_DELETE_MESSAGES_FROM_SEQ_SQL,
  SQLITE_DELETE_SESSION_MESSAGES_SQL,
  SQLITE_DELETE_SESSION_SQL,
  SQLITE_DELETE_SESSION_USAGE_SQL,
  SQLITE_DELETE_SESSION_VARIABLES_SQL,
  SQLITE_INSERT_MESSAGE_SQL,
  SQLITE_INSERT_OR_REPLACE_SESSION_VARIABLE_SQL,
  SQLITE_INSERT_SESSION_FOR_WRITE_SQL,
  SQLITE_INSERT_SESSION_USAGE_SQL,
  SQLITE_INSERT_SESSION_VARIABLE_SQL,
  SQLITE_MARK_SESSION_MIGRATION_FAILED_SQL,
  SQLITE_MARK_SESSION_READY_COALESCE_SQL,
  SQLITE_MARK_SESSION_READY_SQL,
  SQLITE_MOVE_LATER_MESSAGES_TO_NEGATIVE_SQL,
  SQLITE_RESTORE_NEGATIVE_MESSAGES_SQL,
  SQLITE_SELECT_MESSAGE_SEQ_SQL,
  SQLITE_SELECT_MIGRATION_STATE_SQL,
  SQLITE_SELECT_SCHEMA_MIGRATION_SQL,
  SQLITE_SELECT_SESSION_AGENT_ID_SQL,
  SQLITE_SELECT_SESSION_DETAILS_SQL,
  SQLITE_SELECT_USER_MESSAGE_MARKERS_SQL,
  SQLITE_UPSERT_MESSAGE_SQL,
  SQLITE_UPSERT_SCHEMA_MIGRATION_SQL,
  SQLITE_UPSERT_SESSION_METADATA_SQL,
  SQLITE_UPSERT_SESSION_USAGE_SQL,
  SESSION_REPOSITORY_MIGRATIONS,
  applySqliteFullSessionWritePlanWithAdapters,
  importSqliteSessionIndexWithAdapters,
  sqliteFullSessionWritePlan,
  sqliteMessageParams,
  sqliteSessionMetadataInputFromSession,
  sqliteSessionMetadataParams,
  sqliteSessionInsertParams,
  sqliteSessionUsageParams,
  syncSqliteMessageWithReadyAdapters,
  syncSqliteSessionVariablesWithAdapters,
  upsertSqliteMessageAndTruncateWithAdapters,
  type SqliteFullSessionWritePlan,
} from '@onething/core/session/storage'

type DatabaseConnection = SessionDatabaseConnection

let configuredAdapters: OnethingSqliteRepositoryAdapters | undefined

export function configureOnethingSqliteSessionRepositoryRuntime(
  adapters: OnethingSqliteRepositoryAdapters | undefined,
): void {
  configuredAdapters = adapters
  db = null
}

function getAdapters(): OnethingSqliteRepositoryAdapters {
  if (!configuredAdapters) {
    throw new Error('SQLite session repository runtime adapters are not configured')
  }
  return configuredAdapters
}

interface MessageRow {
  id: string
  session_id: string
  role: OnethingSqliteChatMessage['role']
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
const migrationTracker = new CoreSqliteSessionMigrationTracker()

export function initializeSqliteSessionRepository(): void {
  const database = getSessionDatabase()
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.exec(SQLITE_CREATE_SCHEMA_MIGRATIONS_SQL)

  applySqliteSchemaMigrationsWithAdapters({
    migrations: SESSION_REPOSITORY_MIGRATIONS,
    hasMigration: version => Boolean(database
      .prepare(SQLITE_SELECT_SCHEMA_MIGRATION_SQL)
      .get(version)),
    applyMigration(migration, appliedAt) {
      const runMigration = database.transaction(() => {
        for (const statement of migration.statements) {
          database.exec(statement)
        }
        database
          .prepare(SQLITE_UPSERT_SCHEMA_MIGRATION_SQL)
          .run(migration.version, appliedAt)
      })
      runMigration()
    },
  })
}

export function getSessionDatabase(): DatabaseConnection {
  if (!db) {
    db = createSessionDatabaseConnection(getAdapters().getSessionDatabasePath())
  }
  return db
}

export function upsertSessionMetadata(meta: OnethingSqliteSessionMeta | OnethingSqliteSessionDetails): void {
  const database = getSessionDatabase()
  database.prepare(SQLITE_UPSERT_SESSION_METADATA_SQL).run(sqliteSessionMetadataParams(meta, {
    defaultAgentId: DEFAULT_AGENT_ID,
    legacyJsonPath: getAdapters().getSessionPath(meta.id),
  }))
}

export function importSessionIndexToSqlite(index: OnethingSqliteSessionMeta[]): void {
  initializeSqliteSessionRepository()
  const database = getSessionDatabase()
  const importIndex = database.transaction((items: OnethingSqliteSessionMeta[]) => {
    importSqliteSessionIndexWithAdapters({
      index: items,
      upsertSessionMetadata,
    })
  })
  importIndex(index)
}

export function getSqliteSessionDetails(sessionId: string): OnethingSqliteSessionDetails | undefined {
  const row = getSessionDatabase().prepare(SQLITE_SELECT_SESSION_DETAILS_SQL).get(sessionId) as SessionRow | undefined
  return row
    ? rowToSessionDetails(row, {
      defaultAgentId: DEFAULT_AGENT_ID,
      messageCount: getMessageCount(row.id),
    }) as OnethingSqliteSessionDetails
    : undefined
}

function getMigrationState(sessionId: string): string | undefined {
  const row = getSessionDatabase()
    .prepare(SQLITE_SELECT_MIGRATION_STATE_SQL)
    .get(sessionId) as { migration_state: string } | undefined
  return row?.migration_state
}

export function isSqliteSessionReady(sessionId: string): boolean {
  initializeSqliteSessionRepository()
  return getMigrationState(sessionId) === 'ready'
}

function getMessageCount(sessionId: string): number {
  const row = getSessionDatabase()
    .prepare(SQLITE_COUNT_MESSAGES_SQL)
    .get(sessionId) as { count: number }
  return row.count
}

function getReadySqlitePage(request: GetSessionMessagesPageRequest): GetSessionMessagesPageResponse | undefined {
  if (getMigrationState(request.sessionId) !== 'ready') return undefined

  const database = getSessionDatabase()
  const totalCount = getMessageCount(request.sessionId)
  return resolveSqliteMessagesPageWithAdapters(request, totalCount, {
    resolveAnchorSeq(query) {
      const row = database.prepare(query.sql).get(...query.params) as { seq: number } | undefined
      return row?.seq
    },
    selectRows(query) {
      return database.prepare(query.sql).all(...query.params) as Array<MessageRow & { seq: number }>
    },
  }) as GetSessionMessagesPageResponse
}

export function getSqliteMessagesPage(
  request: GetSessionMessagesPageRequest,
): GetSessionMessagesPageResponse | undefined {
  initializeSqliteSessionRepository()
  return getReadySqlitePage(request)
}

export function getSqliteUserMessageMarkers(sessionId: string): OnethingSqliteUserMessageMarker[] | undefined {
  initializeSqliteSessionRepository()
  if (getMigrationState(sessionId) !== 'ready') return undefined
  return getSessionDatabase().prepare(SQLITE_SELECT_USER_MESSAGE_MARKERS_SQL).all(sessionId) as OnethingSqliteUserMessageMarker[]
}

function insertMessage(database: DatabaseConnection, sessionId: string, message: OnethingSqliteChatMessage, seq: number): void {
  database.prepare(SQLITE_INSERT_MESSAGE_SQL).run(sqliteMessageParams(sessionId, message, seq))
}

function upsertMessage(database: DatabaseConnection, sessionId: string, message: OnethingSqliteChatMessage, seq: number): void {
  database.prepare(SQLITE_UPSERT_MESSAGE_SQL).run(sqliteMessageParams(sessionId, message, seq))
}

function insertSessionParams(
  database: DatabaseConnection,
  params: ReturnType<typeof sqliteSessionInsertParams>,
): void {
  database.prepare(SQLITE_INSERT_SESSION_FOR_WRITE_SQL).run(...params)
}

function applyFullSessionWritePlan(
  database: DatabaseConnection,
  sessionId: string,
  plan: SqliteFullSessionWritePlan<OnethingSqliteChatMessage>,
  markReadySql: string,
): void {
  applySqliteFullSessionWritePlanWithAdapters(sessionId, plan, {
    insertSession: params => insertSessionParams(database, params),
    clearUsage: id => database.prepare(SQLITE_DELETE_SESSION_USAGE_SQL).run(id),
    clearVariables: id => database.prepare(SQLITE_DELETE_SESSION_VARIABLES_SQL).run(id),
    clearMessages: id => database.prepare(SQLITE_DELETE_SESSION_MESSAGES_SQL).run(id),
    insertUsage: params => database.prepare(SQLITE_INSERT_SESSION_USAGE_SQL).run(...params),
    insertOrReplaceVariable: params => database.prepare(SQLITE_INSERT_OR_REPLACE_SESSION_VARIABLE_SQL).run(...params),
    insertMessage: (message, seq) => insertMessage(database, sessionId, message, seq),
    markReady: params => database.prepare(markReadySql).run(...params),
  })
}

function preserveExistingAgentId(database: DatabaseConnection, session: OnethingSqliteChatSession): OnethingSqliteChatSession {
  if (session.agentId) return session
  const row = database
    .prepare(SQLITE_SELECT_SESSION_AGENT_ID_SQL)
    .get(session.id) as { agent_id: string | null } | undefined
  return preserveSqliteSessionAgentId(session, row?.agent_id)
}

function migrateSession(session: OnethingSqliteChatSession): void {
  const database = getSessionDatabase()
  const migrate = database.transaction(() => {
    const sessionWithAgent = preserveExistingAgentId(database, session)
    const plan = sqliteFullSessionWritePlan(sessionWithAgent, {
      defaultAgentId: DEFAULT_AGENT_ID,
      legacyJsonPath: getAdapters().getSessionPath(sessionWithAgent.id),
    })
    applyFullSessionWritePlan(database, session.id, plan, SQLITE_MARK_SESSION_READY_SQL)
  })

  migrate()
}

export function syncFullSessionToSqlite(session: OnethingSqliteChatSession): void {
  initializeSqliteSessionRepository()
  const database = getSessionDatabase()
  const sync = database.transaction(() => {
    const sessionWithAgent = preserveExistingAgentId(database, session)
    const plan = sqliteFullSessionWritePlan(sessionWithAgent, {
      defaultAgentId: DEFAULT_AGENT_ID,
      legacyJsonPath: getAdapters().getSessionPath(sessionWithAgent.id),
    })
    applyFullSessionWritePlan(database, session.id, plan, SQLITE_MARK_SESSION_READY_COALESCE_SQL)
  })
  sync()
}

export function syncSqliteSessionMetadata(session: OnethingSqliteChatSession): void {
  initializeSqliteSessionRepository()
  upsertSessionMetadata(sqliteSessionMetadataInputFromSession(session))
}

export function syncSqliteSessionUsage(session: OnethingSqliteChatSession): void {
  initializeSqliteSessionRepository()
  getSessionDatabase().prepare(SQLITE_UPSERT_SESSION_USAGE_SQL).run(...sqliteSessionUsageParams(session))
}

export function syncSqliteSessionVariables(session: OnethingSqliteChatSession): void {
  initializeSqliteSessionRepository()
  const database = getSessionDatabase()
  const sync = database.transaction(() => {
    syncSqliteSessionVariablesWithAdapters({
      sessionId: session.id,
      variables: session.variables,
      clearVariables: id => database.prepare(SQLITE_DELETE_SESSION_VARIABLES_SQL).run(id),
      insertVariable: params => database.prepare(SQLITE_INSERT_SESSION_VARIABLE_SQL).run(...params),
    })
  })
  sync()
}

export function syncSqliteMessage(sessionId: string, message: OnethingSqliteChatMessage, seq: number): void {
  initializeSqliteSessionRepository()
  syncSqliteMessageWithReadyAdapters({
    sessionId,
    message,
    seq,
    isReady: isSqliteSessionReady,
    upsertMessage: (id, targetMessage, targetSeq) => upsertMessage(getSessionDatabase(), id, targetMessage, targetSeq),
  })
}

/**
 * Delete a single message and renumber the rows after it so `seq` stays
 * contiguous (1-based, == position). Pagination relies on this invariant — see
 * getSqliteMessagesPage / hasMoreAfter. Avoids the O(n) full-session rewrite.
 *
 * The renumber is done via a negate two-step so it never transiently violates
 * the UNIQUE(session_id, seq) constraint regardless of row-processing order.
 */
export function deleteSqliteMessage(sessionId: string, messageId: string): void {
  initializeSqliteSessionRepository()
  const database = getSessionDatabase()
  const run = database.transaction(() => {
    deleteSqliteMessageWithRenumberAdapters({
      sessionId,
      messageId,
      isReady: isSqliteSessionReady,
      getMessageSeq: (id, targetMessageId) => {
        const row = database
          .prepare(SQLITE_SELECT_MESSAGE_SEQ_SQL)
          .get(id, targetMessageId) as { seq: number } | undefined
        return row?.seq
      },
      deleteMessage: params => database.prepare(SQLITE_DELETE_MESSAGE_BY_ID_SQL).run(...params),
      moveLaterMessagesToNegative: params => database.prepare(SQLITE_MOVE_LATER_MESSAGES_TO_NEGATIVE_SQL).run(...params),
      restoreLaterMessages: params => database.prepare(SQLITE_RESTORE_NEGATIVE_MESSAGES_SQL).run(...params),
    })
  })
  run()
}

/**
 * Delete the given message and every message after it (tail truncate). Retained
 * rows keep their contiguous 1-based seq, so no renumber is needed.
 */
export function deleteSqliteMessageAndAfter(sessionId: string, messageId: string): void {
  initializeSqliteSessionRepository()
  const database = getSessionDatabase()
  const run = database.transaction(() => {
    deleteSqliteMessageAndAfterWithAdapters({
      sessionId,
      messageId,
      isReady: isSqliteSessionReady,
      getMessageSeq: (id, targetMessageId) => {
        const row = database
          .prepare(SQLITE_SELECT_MESSAGE_SEQ_SQL)
          .get(id, targetMessageId) as { seq: number } | undefined
        return row?.seq
      },
      deleteMessagesFromSeq: params => database.prepare(SQLITE_DELETE_MESSAGES_FROM_SEQ_SQL).run(...params),
    })
  })
  run()
}

/**
 * Upsert one message at `seq` and delete every message after it. Used by
 * edit-and-resend; atomic so the edited row and the truncate land together.
 */
export function upsertSqliteMessageAndTruncate(sessionId: string, message: OnethingSqliteChatMessage, seq: number): void {
  initializeSqliteSessionRepository()
  const database = getSessionDatabase()
  const run = database.transaction(() => {
    upsertSqliteMessageAndTruncateWithAdapters({
      sessionId,
      message,
      seq,
      isReady: isSqliteSessionReady,
      upsertMessage: (id, targetMessage, targetSeq) => upsertMessage(database, id, targetMessage, targetSeq),
      deleteMessagesAfterSeq: params => database.prepare(SQLITE_DELETE_MESSAGES_AFTER_SEQ_SQL).run(...params),
    })
  })
  run()
}

export function deleteSqliteSessions(sessionIds: string[]): void {
  initializeSqliteSessionRepository()
  const database = getSessionDatabase()
  const remove = database.transaction((ids: string[]) => {
    deleteSqliteSessionsWithAdapters({
      sessionIds: ids,
      deleteSession: id => database.prepare(SQLITE_DELETE_SESSION_SQL).run(id),
    })
  })
  remove(sessionIds)
}

export function migrateSessionToSqliteNow(sessionId: string): boolean {
  initializeSqliteSessionRepository()
  return runSqliteSessionMigrationWithAdapters<OnethingSqliteChatSession>({
    sessionId,
    tracker: migrationTracker,
    getMigrationState,
    loadSession: id => getAdapters().readJsonFile<OnethingSqliteChatSession | null>(getAdapters().getSessionPath(id), null) ?? undefined,
    migrateSession,
    markMigrationFailed: id => {
      getSessionDatabase()
        .prepare(SQLITE_MARK_SESSION_MIGRATION_FAILED_SQL)
        .run(id)
    },
    logger: console,
  }).migrated
}

export function scheduleSessionSqliteMigration(sessionId: string): void {
  initializeSqliteSessionRepository()
  const plan = migrationTracker.planSchedule(sessionId, getMigrationState(sessionId))
  if (!plan.shouldSchedule) return
  // Do not migrate legacy JSON on the main thread from the session-switch
  // hot path. Large JSON parse + SQLite insert is visible as UI freeze.
  // Existing sessions migrate when explicitly written/synced; page reads use
  // the byte-cursor JSON fallback until a worker-backed migration is added.
  void sessionId
}
