export interface SqliteMigration {
  version: number
  statements: string[]
}

export const SESSION_REPOSITORY_MIGRATIONS: SqliteMigration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        parent_session_id TEXT,
        branch_from_message_id TEXT,
        last_model TEXT,
        last_provider TEXT,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        archived_at INTEGER,
        working_directory TEXT,
        summary TEXT,
        summary_up_to_message_id TEXT,
        summary_created_at INTEGER,
        migration_state TEXT NOT NULL DEFAULT 'pending',
        migrated_from_json_at INTEGER,
        legacy_json_path TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS session_usage (
        session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
        total_input_tokens INTEGER NOT NULL DEFAULT 0,
        total_output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        last_input_tokens INTEGER NOT NULL DEFAULT 0,
        context_size INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS session_variables (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        value TEXT NOT NULL,
        description TEXT,
        updated_at INTEGER,
        PRIMARY KEY (session_id, name)
      )`,
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        timestamp INTEGER NOT NULL,
        reasoning TEXT,
        is_streaming INTEGER NOT NULL DEFAULT 0,
        is_thinking INTEGER NOT NULL DEFAULT 0,
        error_details TEXT,
        model TEXT,
        thinking_time INTEGER,
        thinking_start_time INTEGER,
        skill_used TEXT,
        content_parts_json TEXT,
        tool_calls_json TEXT,
        steps_json TEXT,
        attachments_json TEXT,
        usage_json TEXT,
        UNIQUE (session_id, seq)
      )`,
      `CREATE TABLE IF NOT EXISTS message_blocks (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        block_seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        text TEXT,
        json TEXT,
        line_count INTEGER,
        byte_length INTEGER,
        is_large INTEGER NOT NULL DEFAULT 0,
        UNIQUE (message_id, block_seq)
      )`,
      `CREATE TABLE IF NOT EXISTS block_chunks (
        block_id TEXT NOT NULL REFERENCES message_blocks(id) ON DELETE CASCADE,
        chunk_seq INTEGER NOT NULL,
        start_line INTEGER,
        end_line INTEGER,
        text TEXT NOT NULL,
        PRIMARY KEY (block_id, chunk_seq)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_active_updated
        ON sessions(is_archived, is_pinned, updated_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_messages_session_seq
        ON messages(session_id, seq)`,
      `CREATE INDEX IF NOT EXISTS idx_messages_session_role_seq
        ON messages(session_id, role, seq)`,
      `CREATE INDEX IF NOT EXISTS idx_blocks_message_seq
        ON message_blocks(message_id, block_seq)`,
    ],
  },
]

export function getLatestSessionRepositorySchemaVersion(): number {
  return SESSION_REPOSITORY_MIGRATIONS[SESSION_REPOSITORY_MIGRATIONS.length - 1]?.version ?? 0
}
