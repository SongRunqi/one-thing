import Database from 'better-sqlite3'
import type { MemoryWorkspace } from './types.js'

let db: Database.Database | null = null
let currentDbPath = ''
let ftsTokenizer = 'unknown'
let onDbSwitchCallback: ((agentId: string) => void) | undefined

export function setOnDbSwitch(callback: (agentId: string) => void): void {
  onDbSwitchCallback = callback
}

export function getFtsTokenizer(): string {
  return ftsTokenizer
}

export function closeMemoryDatabase(): void {
  db?.close()
  db = null
  currentDbPath = ''
  ftsTokenizer = 'unknown'
}

export function getDb(workspace: MemoryWorkspace): Database.Database {
  if (db && currentDbPath === workspace.dbPath) return db
  db?.close()
  currentDbPath = workspace.dbPath
  ftsTokenizer = 'unknown'
  onDbSwitchCallback?.(workspace.agentId)
  db = new Database(workspace.dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      absolute_path TEXT NOT NULL,
      mtime_ms REAL NOT NULL,
      size INTEGER NOT NULL,
      hash TEXT NOT NULL,
      indexed_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      kind TEXT NOT NULL,
      date TEXT,
      chunk_index INTEGER NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      content TEXT NOT NULL,
      hash TEXT NOT NULL,
      token_count INTEGER NOT NULL,
      embedding_json TEXT,
      embedding_provider TEXT,
      embedding_model TEXT,
      mtime_ms REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);
    CREATE INDEX IF NOT EXISTS idx_chunks_kind ON chunks(kind);
    CREATE TABLE IF NOT EXISTS canonical_memories (
      id TEXT PRIMARY KEY,
      memory_key TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      subject TEXT NOT NULL,
      value TEXT NOT NULL,
      text TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      confidence REAL NOT NULL,
      sensitivity TEXT NOT NULL DEFAULT 'normal',
      source TEXT NOT NULL,
      evidence TEXT,
      session_id TEXT,
      message_id TEXT,
      embedding_json TEXT,
      embedding_provider TEXT,
      embedding_model TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_canonical_memory_key ON canonical_memories(memory_key);
    CREATE INDEX IF NOT EXISTS idx_canonical_kind ON canonical_memories(kind);
    CREATE INDEX IF NOT EXISTS idx_canonical_deleted ON canonical_memories(deleted_at);
    CREATE TABLE IF NOT EXISTS memory_entities (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      aliases_json TEXT NOT NULL DEFAULT '[]',
      confidence REAL NOT NULL,
      sensitivity TEXT NOT NULL DEFAULT 'normal',
      source TEXT NOT NULL,
      evidence TEXT,
      embedding_json TEXT,
      embedding_provider TEXT,
      embedding_model TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_memory_entities_type ON memory_entities(entity_type);
    CREATE INDEX IF NOT EXISTS idx_memory_entities_deleted ON memory_entities(deleted_at);
    CREATE TABLE IF NOT EXISTS memory_observations (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      slot TEXT NOT NULL,
      value TEXT NOT NULL,
      text TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      confidence REAL NOT NULL,
      sensitivity TEXT NOT NULL DEFAULT 'normal',
      source TEXT NOT NULL,
      evidence TEXT,
      session_id TEXT,
      message_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      embedding_json TEXT,
      embedding_provider TEXT,
      embedding_model TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_memory_observations_entity ON memory_observations(entity_id);
    CREATE INDEX IF NOT EXISTS idx_memory_observations_slot ON memory_observations(entity_id, slot);
    CREATE INDEX IF NOT EXISTS idx_memory_observations_status ON memory_observations(status, deleted_at);
    CREATE TABLE IF NOT EXISTS memory_relations (
      id TEXT PRIMARY KEY,
      from_entity_id TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      to_entity_id TEXT NOT NULL,
      text TEXT NOT NULL,
      confidence REAL NOT NULL,
      sensitivity TEXT NOT NULL DEFAULT 'normal',
      source TEXT NOT NULL,
      evidence TEXT,
      session_id TEXT,
      message_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      embedding_json TEXT,
      embedding_provider TEXT,
      embedding_model TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_memory_relations_from ON memory_relations(from_entity_id);
    CREATE INDEX IF NOT EXISTS idx_memory_relations_to ON memory_relations(to_entity_id);
    CREATE INDEX IF NOT EXISTS idx_memory_relations_exact ON memory_relations(from_entity_id, relation_type, to_entity_id);
    CREATE TABLE IF NOT EXISTS memory_evidence (
      id TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      source TEXT NOT NULL,
      evidence TEXT,
      session_id TEXT,
      message_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memory_evidence_owner ON memory_evidence(owner_type, owner_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS memory_possible_duplicates (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      score REAL NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memory_possible_duplicates_status ON memory_possible_duplicates(status, kind);
    CREATE TABLE IF NOT EXISTS memory_events (
      id TEXT PRIMARY KEY,
      memory_id TEXT NOT NULL,
      action TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memory_events_memory ON memory_events(memory_id, created_at DESC);
  `)
  ensureFtsTable(db)
  ensureCanonicalFtsTable(db)
  ensureGraphFtsTable(db)
  return db
}

function ensureFtsTable(database: Database.Database): void {
  const existing = database.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'chunks_fts'
  `).get()
  if (existing) return

  try {
    database.exec("CREATE VIRTUAL TABLE chunks_fts USING fts5(id UNINDEXED, path UNINDEXED, content, tokenize='trigram')")
    ftsTokenizer = 'trigram'
  } catch {
    database.exec("CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(id UNINDEXED, path UNINDEXED, content, tokenize='unicode61')")
    ftsTokenizer = 'unicode61'
  }
}

function ensureCanonicalFtsTable(database: Database.Database): void {
  const existing = database.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'canonical_memories_fts'
  `).get()
  if (existing) return

  try {
    database.exec("CREATE VIRTUAL TABLE canonical_memories_fts USING fts5(id UNINDEXED, memory_key UNINDEXED, text, value, tokenize='trigram')")
  } catch {
    database.exec("CREATE VIRTUAL TABLE IF NOT EXISTS canonical_memories_fts USING fts5(id UNINDEXED, memory_key UNINDEXED, text, value, tokenize='unicode61')")
  }
}

function ensureGraphFtsTable(database: Database.Database): void {
  const existing = database.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'graph_memory_fts'
  `).get()
  if (existing) return

  try {
    database.exec("CREATE VIRTUAL TABLE graph_memory_fts USING fts5(id UNINDEXED, owner_type UNINDEXED, owner_id UNINDEXED, content, tokenize='trigram')")
  } catch {
    database.exec("CREATE VIRTUAL TABLE IF NOT EXISTS graph_memory_fts USING fts5(id UNINDEXED, owner_type UNINDEXED, owner_id UNINDEXED, content, tokenize='unicode61')")
  }
}

export function closeDb(): void {
  db?.close()
  db = null
  currentDbPath = ''
  ftsTokenizer = 'unknown'
}
