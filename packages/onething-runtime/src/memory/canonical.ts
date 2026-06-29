import Database from 'better-sqlite3'
import { toJsonObject } from '@onething/core'
import type {
  CanonicalMemoryAuditEvent,
  CanonicalMemoryInput,
  CanonicalMemoryRecord,
  CanonicalUpsertResult,
  CaptureCandidate,
  MemoryWorkspace,
  SearchHit,
} from './types.js'
import {
  cosine,
  ftsQuery,
  normalizeBulletText,
  normalizeForDedupe,
  sanitizeMemoryKey,
  sha,
  slugifyMemoryKeyPart,
} from './workspace.js'
import { getDb } from './database.js'
import {
  ensureUserSelfEntity,
  graphEntityLabel,
  listGraphObservations,
  listGraphRelations,
} from './graph.js'
import {
  CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
  buildSoulMemoryCanonicalProfileSummary as coreBuildSoulMemoryCanonicalProfileSummary,
  buildSoulMemoryCanonicalSearchHits as coreBuildSoulMemoryCanonicalSearchHits,
  buildSoulMemoryGraphProfileSummary as coreBuildSoulMemoryGraphProfileSummary,
  deriveSoulMemoryCanonicalInput as coreDeriveSoulMemoryCanonicalInput,
  formatSoulMemoryCanonicalDisplayText as coreFormatSoulMemoryCanonicalDisplayText,
  rowToSoulMemoryCanonicalAuditEvent as coreRowToSoulMemoryCanonicalAuditEvent,
  rowToSoulMemoryCanonicalMemory as coreRowToSoulMemoryCanonicalMemory,
  selectSoulMemoryCanonicalDuplicate as coreSelectSoulMemoryCanonicalDuplicate,
  selectSoulMemoryGraphRelatedProjectEntityIds as coreSelectSoulMemoryGraphRelatedProjectEntityIds,
  type CoreCaptureCandidate,
  type CoreSoulMemoryCanonicalDuplicateCandidate,
  type CoreSoulMemoryCanonicalAuditRow,
  type CoreSoulMemoryCanonicalMemoryRow,
} from '@onething/runtime/plugins'

export type CanonicalEmbeddingFn<TSettings = unknown> = (
  settings: TSettings | undefined,
  text: string,
) => Promise<{ embedding?: number[]; provider?: string; model?: string }>

export type CanonicalSearchEmbeddingFn<TSettings = unknown> = (
  settings: TSettings | undefined,
  values: string[],
) => Promise<{ vectors: number[][] }>

export function deriveCanonicalMemoryInput(
  candidate: CaptureCandidate,
  options: {
    source: string
    evidence?: string
    sessionId?: string
    messageId?: string
  },
): CanonicalMemoryInput | null {
  return coreDeriveSoulMemoryCanonicalInput(candidate as CoreCaptureCandidate, options) as CanonicalMemoryInput | null
}

export function rowToCanonicalMemory(row: any): CanonicalMemoryRecord {
  return coreRowToSoulMemoryCanonicalMemory(row as CoreSoulMemoryCanonicalMemoryRow) as CanonicalMemoryRecord
}

export function rowToCanonicalAuditEvent(row: any): CanonicalMemoryAuditEvent {
  return coreRowToSoulMemoryCanonicalAuditEvent(row as CoreSoulMemoryCanonicalAuditRow) as CanonicalMemoryAuditEvent
}

export function canonicalDisplayText(memory: CanonicalMemoryRecord): string {
  return coreFormatSoulMemoryCanonicalDisplayText(memory)
}

export function syncCanonicalFts(database: Database.Database, memory: CanonicalMemoryRecord): void {
  database.prepare('DELETE FROM canonical_memories_fts WHERE id = ?').run(memory.id)
  if (!memory.deletedAt) {
    database.prepare('INSERT INTO canonical_memories_fts (id, memory_key, text, value) VALUES (?, ?, ?, ?)').run(
      memory.id,
      memory.memoryKey,
      memory.text,
      memory.value,
    )
  }
}

export function appendCanonicalAudit(
  database: Database.Database,
  memoryId: string,
  action: CanonicalMemoryAuditEvent['action'],
  payload: object,
): void {
  const createdAt = Date.now()
  const jsonPayload = toJsonObject(payload)
  database.prepare(`
    INSERT INTO memory_events (id, memory_id, action, created_at, payload_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    sha(`${memoryId}:${action}:${createdAt}:${JSON.stringify(jsonPayload)}`),
    memoryId,
    action,
    createdAt,
    JSON.stringify(jsonPayload),
  )
}

export function findCanonicalDuplicate(
  database: Database.Database,
  input: CanonicalMemoryInput & { memoryKey: string; normalizedText: string; embedding?: number[] },
  threshold: number,
): CanonicalMemoryRecord | null {
  const toCandidate = (row: any): CoreSoulMemoryCanonicalDuplicateCandidate<any> => ({
    record: row,
    memoryKey: row.memory_key,
    text: row.text,
    normalizedText: row.normalized_text,
    embeddingJson: row.embedding_json,
  })
  const sameKey = database.prepare(`
    SELECT * FROM canonical_memories WHERE memory_key = ? AND deleted_at IS NULL
  `).get(input.memoryKey) as any

  const rows = database.prepare(`
    SELECT * FROM canonical_memories WHERE deleted_at IS NULL AND (kind = ? OR subject = ?)
  `).all(input.kind, input.subject || 'user') as any[]
  const duplicate = coreSelectSoulMemoryCanonicalDuplicate({
    input,
    sameKey: sameKey ? toCandidate(sameKey) : null,
    candidates: rows.map(toCandidate),
    threshold,
  })
  return duplicate ? rowToCanonicalMemory(duplicate.record) : null
}

export async function upsertCanonicalMemory<TSettings = unknown>(
  workspace: MemoryWorkspace,
  input: CanonicalMemoryInput,
  options: {
    settings?: TSettings
    action?: CanonicalMemoryAuditEvent['action']
    canonicalEmbedding?: CanonicalEmbeddingFn<TSettings>
  } = {},
): Promise<CanonicalUpsertResult> {
  if (!workspace.settings.canonicalMemory.enabled) {
    throw new Error('Canonical memory is disabled in settings')
  }
  const database = getDb(workspace)
  const now = Date.now()
  const memoryKey = sanitizeMemoryKey(input.memoryKey || `user.fact.${slugifyMemoryKeyPart(input.value)}`)
  const kind = input.kind
  const subject = input.subject || (kind === 'project' || kind === 'decision' ? 'project' : 'user')
  const value = normalizeBulletText(input.value)
  const text = normalizeBulletText(input.text || value)
  const normalizedText = normalizeForDedupe(`${memoryKey} ${text} ${value}`)
  const confidence = Math.max(0, Math.min(1, input.confidence ?? workspace.settings.canonicalMemory.highConfidenceThreshold))
  const sensitivity = input.sensitivity || 'normal'
  const embedding = options.canonicalEmbedding
    ? await options.canonicalEmbedding(options.settings, `${memoryKey}\n${text}\n${value}`)
    : {}
  const duplicate = findCanonicalDuplicate(
    database,
    {
      ...input,
      memoryKey,
      kind,
      subject,
      value,
      text,
      normalizedText,
      embedding: embedding.embedding,
    },
    workspace.settings.canonicalMemory.semanticDedupeThreshold,
  )

  const existing = duplicate
  if (!existing) {
    const id = sha(`${memoryKey}:${now}`)
    const record: CanonicalMemoryRecord = {
      id,
      memoryKey,
      kind,
      subject,
      value,
      text,
      confidence,
      sensitivity,
      source: input.source || 'capture',
      evidence: input.evidence,
      sessionId: input.sessionId,
      messageId: input.messageId,
      createdAt: now,
      updatedAt: now,
    }
    const tx = database.transaction(() => {
      database.prepare(`
        INSERT INTO canonical_memories (
          id, memory_key, kind, subject, value, text, normalized_text, confidence,
          sensitivity, source, evidence, session_id, message_id,
          embedding_json, embedding_provider, embedding_model, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).run(
        record.id,
        record.memoryKey,
        record.kind,
        record.subject,
        record.value,
        record.text,
        normalizedText,
        record.confidence,
        record.sensitivity,
        record.source,
        record.evidence || null,
        record.sessionId || null,
        record.messageId || null,
        embedding.embedding ? JSON.stringify(embedding.embedding) : null,
        embedding.provider || null,
        embedding.model || null,
        record.createdAt,
        record.updatedAt,
      )
      syncCanonicalFts(database, record)
      appendCanonicalAudit(database, record.id, options.action || 'create', { input })
    })
    tx()
    return { memory: record, action: 'create' }
  }

  const shouldUpdate = existing.memoryKey === memoryKey ||
    confidence > existing.confidence ||
    normalizeForDedupe(existing.value) !== normalizeForDedupe(value)
  if (!shouldUpdate) {
    appendCanonicalAudit(database, existing.id, 'duplicate', { input, duplicateOf: existing.memoryKey })
    return { memory: existing, action: 'duplicate' }
  }

  const record: CanonicalMemoryRecord = {
    ...existing,
    memoryKey: existing.memoryKey,
    kind,
    subject,
    value,
    text,
    confidence: Math.max(existing.confidence, confidence),
    sensitivity,
    source: input.source || existing.source,
    evidence: input.evidence || existing.evidence,
    sessionId: input.sessionId || existing.sessionId,
    messageId: input.messageId || existing.messageId,
    updatedAt: now,
    deletedAt: undefined,
  }
  const tx = database.transaction(() => {
    database.prepare(`
      UPDATE canonical_memories SET
        kind = ?, subject = ?, value = ?, text = ?, normalized_text = ?, confidence = ?,
        sensitivity = ?, source = ?, evidence = ?, session_id = ?, message_id = ?,
        embedding_json = COALESCE(?, embedding_json),
        embedding_provider = COALESCE(?, embedding_provider),
        embedding_model = COALESCE(?, embedding_model),
        updated_at = ?, deleted_at = NULL
      WHERE id = ?
    `).run(
      record.kind,
      record.subject,
      record.value,
      record.text,
      normalizedText,
      record.confidence,
      record.sensitivity,
      record.source,
      record.evidence || null,
      record.sessionId || null,
      record.messageId || null,
      embedding.embedding ? JSON.stringify(embedding.embedding) : null,
      embedding.provider || null,
      embedding.model || null,
      record.updatedAt,
      record.id,
    )
    syncCanonicalFts(database, record)
    appendCanonicalAudit(database, record.id, options.action || 'update', { input, previous: existing })
  })
  tx()
  return { memory: record, action: 'update' }
}

export async function upsertCanonicalCandidates<TSettings = unknown>(options: {
  settings?: TSettings
  workspace: MemoryWorkspace
  candidates: CaptureCandidate[]
  source: string
  evidence?: string
  sessionId?: string
  messageId?: string
  action?: CanonicalMemoryAuditEvent['action']
  canonicalEmbedding?: CanonicalEmbeddingFn<TSettings>
}): Promise<{ applied: number; updated: number; duplicates: number; memories: CanonicalMemoryRecord[] }> {
  let applied = 0
  let updated = 0
  let duplicates = 0
  const memories: CanonicalMemoryRecord[] = []
  const seen = new Set<string>()
  for (const candidate of options.candidates) {
    const input = deriveCanonicalMemoryInput(candidate, {
      source: options.source,
      evidence: options.evidence,
      sessionId: options.sessionId,
      messageId: options.messageId,
    })
    if (!input) continue
    const seenKey = `${input.memoryKey}:${normalizeForDedupe(input.value)}`
    if (seen.has(seenKey)) {
      duplicates++
      continue
    }
    seen.add(seenKey)
    const result = await upsertCanonicalMemory(options.workspace, input, {
      settings: options.settings,
      action: options.action,
      canonicalEmbedding: options.canonicalEmbedding,
    })
    memories.push(result.memory)
    if (result.action === 'create') applied++
    else if (result.action === 'update') updated++
    else duplicates++
  }
  return { applied, updated, duplicates, memories }
}

export function listCanonicalMemories(options: {
  workspace: MemoryWorkspace
  query?: string
  includeDeleted?: boolean
  limit?: number
}): CanonicalMemoryRecord[] {
  const database = getDb(options.workspace)
  const limit = Math.max(1, Math.min(500, options.limit || 200))
  const includeDeleted = options.includeDeleted === true
  const query = options.query?.trim()
  if (query) {
    const like = `%${query.replace(/[%_]/g, '')}%`
    const rows = database.prepare(`
      SELECT *
      FROM canonical_memories
      WHERE (${includeDeleted ? '1 = 1' : 'deleted_at IS NULL'})
        AND (memory_key LIKE ? OR kind LIKE ? OR subject LIKE ? OR value LIKE ? OR text LIKE ?)
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(like, like, like, like, like, limit) as any[]
    return rows.map(rowToCanonicalMemory)
  }

  const rows = database.prepare(`
    SELECT *
    FROM canonical_memories
    WHERE ${includeDeleted ? '1 = 1' : 'deleted_at IS NULL'}
    ORDER BY
      CASE kind
        WHEN 'identity' THEN 0
        WHEN 'preference' THEN 1
        WHEN 'constraint' THEN 2
        WHEN 'decision' THEN 3
        WHEN 'project' THEN 4
        ELSE 5
      END,
      memory_key ASC,
      updated_at DESC
    LIMIT ?
  `).all(limit) as any[]
  return rows.map(rowToCanonicalMemory)
}

export function getCanonicalMemoryCount(workspace: MemoryWorkspace): number {
  const database = getDb(workspace)
  const row = database.prepare(`
    SELECT COUNT(*) AS count FROM canonical_memories WHERE deleted_at IS NULL
  `).get() as { count: number }
  return row.count
}

export function getCanonicalMemoryByIdOrKey(
  workspace: MemoryWorkspace,
  identifier: string,
  includeDeleted = false,
): CanonicalMemoryRecord | null {
  const clean = identifier
    .replace(/^profile:/i, '')
    .replace(/^canonical:/i, '')
    .trim()
  if (!clean) return null
  const database = getDb(workspace)
  const row = database.prepare(`
    SELECT *
    FROM canonical_memories
    WHERE (id = ? OR memory_key = ?) AND (${includeDeleted ? '1 = 1' : 'deleted_at IS NULL'})
    LIMIT 1
  `).get(clean, sanitizeMemoryKey(clean)) as any
  return row ? rowToCanonicalMemory(row) : null
}

export async function searchCanonicalMemory<TSettings = unknown>(options: {
  settings?: TSettings
  workspace: MemoryWorkspace
  database?: Database.Database
  query: string
  limit: number
  minScore?: number
  embedTexts?: CanonicalSearchEmbeddingFn<TSettings>
  setLastError?: (message: string) => void
  logDiagnostic?: (input: { subsystem: 'search'; operation: string; stage: string; status: 'fallback'; error: unknown; metadata?: Record<string, unknown> }) => void
}): Promise<SearchHit[]> {
  if (!options.workspace.settings.canonicalMemory.enabled) return []
  const database = options.database || getDb(options.workspace)
  const candidates = new Map<string, {
    memory: CanonicalMemoryRecord
    keywordScore?: number
    vectorScore?: number
  }>()

  try {
    const rows = database.prepare(`
      SELECT m.*, bm25(canonical_memories_fts) AS rank
      FROM canonical_memories_fts
      JOIN canonical_memories m ON m.id = canonical_memories_fts.id
      WHERE canonical_memories_fts MATCH ? AND m.deleted_at IS NULL
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery(options.query), options.limit * 8) as any[]
    rows.forEach((row, index) => {
      const memory = rowToCanonicalMemory(row)
      candidates.set(memory.id, {
        memory,
        keywordScore: 1 / (index + 1),
      })
    })
  } catch {
    const pattern = `%${options.query.replace(/[%_]/g, '')}%`
    const rows = database.prepare(`
      SELECT *
      FROM canonical_memories
      WHERE deleted_at IS NULL AND (memory_key LIKE ? OR text LIKE ? OR value LIKE ?)
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(pattern, pattern, pattern, options.limit * 8) as any[]
    rows.forEach((row, index) => {
      const memory = rowToCanonicalMemory(row)
      candidates.set(memory.id, {
        memory,
        keywordScore: 1 / (index + 1),
      })
    })
  }

  if (options.workspace.settings.embeddings?.enabled === true && options.embedTexts) {
    try {
      const queryEmbedding = (await options.embedTexts(options.settings, [options.query])).vectors[0]
      const rows = database.prepare(`
        SELECT * FROM canonical_memories
        WHERE deleted_at IS NULL AND embedding_json IS NOT NULL
      `).all() as any[]
      const vectorScores = rows
        .map(row => {
          const memory = rowToCanonicalMemory(row)
          let embedding: number[] | undefined
          try {
            embedding = JSON.parse(row.embedding_json)
          } catch {
            embedding = undefined
          }
          return { memory, vectorScore: (cosine(queryEmbedding, embedding) + 1) / 2 }
        })
        .filter(item => item.vectorScore > 0)
        .sort((left, right) => right.vectorScore - left.vectorScore)
        .slice(0, options.limit * 8)
      for (const item of vectorScores) {
        const existing = candidates.get(item.memory.id)
        candidates.set(item.memory.id, {
          memory: item.memory,
          keywordScore: existing?.keywordScore,
          vectorScore: item.vectorScore,
        })
      }
    } catch (error: any) {
      options.setLastError?.(`Canonical vector search unavailable; using FTS only: ${error?.message || String(error)}`)
      options.logDiagnostic?.({
        subsystem: 'search',
        operation: 'canonical-search',
        stage: 'vector',
        status: 'fallback',
        error,
        metadata: {
          queryHash: sha(options.query).slice(0, 16),
          limit: options.limit,
        },
      })
    }
  }

  return coreBuildSoulMemoryCanonicalSearchHits<SearchHit>({
    candidates: Array.from(candidates.values()).map(item => ({
      id: item.memory.id,
      memoryKey: item.memory.memoryKey,
      displayText: canonicalDisplayText(item.memory),
      keywordScore: item.keywordScore,
      vectorScore: item.vectorScore,
    })),
    minScore: options.minScore,
    limit: options.limit,
  })
}

export function deleteCanonicalMemory(workspace: MemoryWorkspace, identifier: string): void {
  const existing = getCanonicalMemoryByIdOrKey(workspace, identifier, true)
  if (!existing) throw new Error('Canonical memory not found')
  const database = getDb(workspace)
  const deletedAt = Date.now()
  const tx = database.transaction(() => {
    database.prepare('UPDATE canonical_memories SET deleted_at = ?, updated_at = ? WHERE id = ?').run(
      deletedAt,
      deletedAt,
      existing.id,
    )
    database.prepare('DELETE FROM canonical_memories_fts WHERE id = ?').run(existing.id)
    appendCanonicalAudit(database, existing.id, 'delete', { deletedAt, previous: existing })
  })
  tx()
}

export function getCanonicalMemoryAudit(workspace: MemoryWorkspace, identifier: string): CanonicalMemoryAuditEvent[] {
  const existing = getCanonicalMemoryByIdOrKey(workspace, identifier, true)
  if (!existing) throw new Error('Canonical memory not found')
  const rows = getDb(workspace).prepare(`
    SELECT * FROM memory_events WHERE memory_id = ? ORDER BY created_at DESC LIMIT 200
  `).all(existing.id) as any[]
  return rows.map(rowToCanonicalAuditEvent)
}

export function buildCanonicalProfileSummary(workspace: MemoryWorkspace): string | null {
  if (!workspace.settings.canonicalMemory.enabled) return null
  const memories = listCanonicalMemories({
    workspace,
    limit: 80,
  })
  return coreBuildSoulMemoryCanonicalProfileSummary({
    memories,
    maxChars: workspace.settings.bootstrapMaxChars,
  })
}

export function buildGraphProfileSummary(workspace: MemoryWorkspace): string | null {
  if (!workspace.settings.canonicalMemory.enabled) return null
  ensureUserSelfEntity(workspace)
  const userObservations = listGraphObservations({
    workspace,
    entityId: CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
    limit: 80,
  })
  const userRelations = listGraphRelations({
    workspace,
    entityId: CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
    limit: 80,
  })

  const projectObservations = coreSelectSoulMemoryGraphRelatedProjectEntityIds(userRelations)
    .flatMap(entityId => listGraphObservations({ workspace, entityId, limit: 24 }))
  return coreBuildSoulMemoryGraphProfileSummary({
    userObservations,
    userRelations,
    projectObservations,
    maxChars: workspace.settings.bootstrapMaxChars,
    resolveEntityLabel: entityId => graphEntityLabel(workspace, entityId),
  })
}
