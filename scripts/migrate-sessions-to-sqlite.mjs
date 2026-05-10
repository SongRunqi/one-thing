#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'

const storeDir = path.join(os.homedir(), '.onething')
const sessionsDir = path.join(storeDir, 'sessions')
const indexPath = path.join(sessionsDir, 'index.json')
const sqlitePath = path.join(storeDir, 'onething.sqlite')

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const text = fs.readFileSync(filePath, 'utf-8').trim()
    return text ? JSON.parse(text) : fallback
  } catch (error) {
    console.warn(`[migrate] Failed to read ${filePath}:`, error.message)
    return fallback
  }
}

function boolInt(value) {
  return value ? 1 : 0
}

function jsonOrNull(value) {
  return value === undefined ? null : JSON.stringify(value)
}

function ensureSchema(db) {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
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
    );

    CREATE TABLE IF NOT EXISTS session_usage (
      session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
      total_input_tokens INTEGER NOT NULL DEFAULT 0,
      total_output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      last_input_tokens INTEGER NOT NULL DEFAULT 0,
      context_size INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS session_variables (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      updated_at INTEGER,
      PRIMARY KEY (session_id, name)
    );

    CREATE TABLE IF NOT EXISTS messages (
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
    );

    CREATE TABLE IF NOT EXISTS message_blocks (
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
    );

    CREATE TABLE IF NOT EXISTS block_chunks (
      block_id TEXT NOT NULL REFERENCES message_blocks(id) ON DELETE CASCADE,
      chunk_seq INTEGER NOT NULL,
      start_line INTEGER,
      end_line INTEGER,
      text TEXT NOT NULL,
      PRIMARY KEY (block_id, chunk_seq)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_active_updated
      ON sessions(is_archived, is_pinned, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_session_seq
      ON messages(session_id, seq);
    CREATE INDEX IF NOT EXISTS idx_messages_session_role_seq
      ON messages(session_id, role, seq);
    CREATE INDEX IF NOT EXISTS idx_blocks_message_seq
      ON message_blocks(message_id, block_seq);

    INSERT OR REPLACE INTO schema_migrations (version, applied_at)
      VALUES (1, ${Date.now()});
  `)
}

function prepareStatements(db) {
  return {
    upsertSession: db.prepare(`
      INSERT INTO sessions (
        id, name, created_at, updated_at, parent_session_id, branch_from_message_id,
        last_model, last_provider, is_pinned, is_archived, archived_at,
        working_directory, summary, summary_up_to_message_id, summary_created_at,
        migration_state, migrated_from_json_at, legacy_json_path
      )
      VALUES (
        @id, @name, @createdAt, @updatedAt, @parentSessionId, @branchFromMessageId,
        @lastModel, @lastProvider, @isPinned, @isArchived, @archivedAt,
        @workingDirectory, @summary, @summaryUpToMessageId, @summaryCreatedAt,
        'ready', @migratedFromJsonAt, @legacyJsonPath
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
        working_directory = excluded.working_directory,
        summary = excluded.summary,
        summary_up_to_message_id = excluded.summary_up_to_message_id,
        summary_created_at = excluded.summary_created_at,
        migration_state = 'ready',
        migrated_from_json_at = excluded.migrated_from_json_at,
        legacy_json_path = excluded.legacy_json_path
    `),
    deleteUsage: db.prepare('DELETE FROM session_usage WHERE session_id = ?'),
    insertUsage: db.prepare(`
      INSERT INTO session_usage (
        session_id, total_input_tokens, total_output_tokens, total_tokens,
        last_input_tokens, context_size
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    deleteVariables: db.prepare('DELETE FROM session_variables WHERE session_id = ?'),
    insertVariable: db.prepare(`
      INSERT OR REPLACE INTO session_variables (
        session_id, name, value, description, updated_at
      )
      VALUES (?, ?, ?, ?, ?)
    `),
    deleteMessages: db.prepare('DELETE FROM messages WHERE session_id = ?'),
    insertMessage: db.prepare(`
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
    `),
  }
}

function uniqueMessageId(baseId, sessionId, seq, usedMessageIds) {
  const id = baseId || `${sessionId}-${seq}`
  if (!usedMessageIds.has(id)) {
    usedMessageIds.add(id)
    return id
  }

  const fallback = `${sessionId}:${id}:${seq}`
  usedMessageIds.add(fallback)
  return fallback
}

function migrateSession(stmts, session, filePath, usedMessageIds) {
  const now = Date.now()
  stmts.upsertSession.run({
    id: session.id,
    name: session.name || 'Untitled',
    createdAt: session.createdAt || now,
    updatedAt: session.updatedAt || session.createdAt || now,
    parentSessionId: session.parentSessionId ?? null,
    branchFromMessageId: session.branchFromMessageId ?? null,
    lastModel: session.lastModel ?? null,
    lastProvider: session.lastProvider ?? null,
    isPinned: boolInt(session.isPinned),
    isArchived: boolInt(session.isArchived),
    archivedAt: session.archivedAt ?? null,
    workingDirectory: session.workingDirectory ?? null,
    summary: session.summary ?? null,
    summaryUpToMessageId: session.summaryUpToMessageId ?? null,
    summaryCreatedAt: session.summaryCreatedAt ?? null,
    migratedFromJsonAt: now,
    legacyJsonPath: filePath,
  })

  stmts.deleteUsage.run(session.id)
  stmts.insertUsage.run(
    session.id,
    session.totalInputTokens ?? 0,
    session.totalOutputTokens ?? 0,
    session.totalTokens ?? 0,
    session.lastInputTokens ?? 0,
    session.contextSize ?? 0,
  )

  stmts.deleteVariables.run(session.id)
  for (const variable of session.variables ?? []) {
    stmts.insertVariable.run(
      session.id,
      variable.name,
      variable.value,
      variable.description ?? null,
      variable.updatedAt ?? null,
    )
  }

  stmts.deleteMessages.run(session.id)
  ;(session.messages ?? []).forEach((message, index) => {
    const seq = index + 1
    stmts.insertMessage.run({
      id: uniqueMessageId(message.id, session.id, seq, usedMessageIds),
      sessionId: session.id,
      seq,
      role: message.role || 'assistant',
      content: message.content ?? '',
      timestamp: message.timestamp || now,
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
  })

  return session.messages?.length ?? 0
}

function main() {
  if (!fs.existsSync(indexPath)) {
    console.error(`[migrate] Missing ${indexPath}`)
    process.exit(1)
  }

  fs.mkdirSync(storeDir, { recursive: true })
  const index = readJson(indexPath, [])
  const db = new Database(sqlitePath)
  ensureSchema(db)
  const stmts = prepareStatements(db)

  let migratedSessions = 0
  let migratedMessages = 0
  const failed = []

  const migrateAll = db.transaction(() => {
    db.prepare('DELETE FROM block_chunks').run()
    db.prepare('DELETE FROM message_blocks').run()
    db.prepare('DELETE FROM messages').run()
    db.prepare('DELETE FROM session_variables').run()
    db.prepare('DELETE FROM session_usage').run()
    db.prepare('DELETE FROM sessions').run()

    const usedMessageIds = new Set()

    for (const meta of index) {
      const filePath = path.join(sessionsDir, `${meta.id}.json`)
      const session = readJson(filePath, null)
      if (!session) {
        failed.push({ id: meta.id, reason: 'missing or invalid json' })
        continue
      }

      try {
        migratedMessages += migrateSession(stmts, session, filePath, usedMessageIds)
        migratedSessions++
      } catch (error) {
        failed.push({ id: meta.id, reason: error.message })
      }
    }
  })

  const started = Date.now()
  migrateAll()
  db.close()

  console.log(`[migrate] SQLite: ${sqlitePath}`)
  console.log(`[migrate] Sessions migrated: ${migratedSessions}/${index.length}`)
  console.log(`[migrate] Messages migrated: ${migratedMessages}`)
  console.log(`[migrate] Duration: ${Date.now() - started}ms`)
  if (failed.length > 0) {
    console.warn(`[migrate] Failed sessions: ${failed.length}`)
    for (const item of failed.slice(0, 20)) {
      console.warn(`  - ${item.id}: ${item.reason}`)
    }
    process.exitCode = 1
  }
}

main()
