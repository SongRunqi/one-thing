import Database from 'better-sqlite3'
import { toJsonObject, type JsonObject } from '../../shared/json.js'
import type {
  CanonicalMemoryAuditEvent,
  CanonicalMemoryKind,
  CanonicalMemoryRecord,
  AppSettings,
} from '../../shared/ipc.js'
import type {
  CanonicalMemoryInput,
  CanonicalUpsertResult,
  CaptureCandidate,
  MemoryWorkspace,
} from './types.js'
import {
  canonicalKindFromCaptureKind,
  cosine,
  extractCandidateValue,
  isDurableCandidate,
  looksLikeNameValue,
  normalizeBulletText,
  normalizeForDedupe,
  sanitizeMemoryKey,
  sha,
  slugifyMemoryKeyPart,
  tokenJaccard,
  truncate,
  USER_SELF_ENTITY_ID,
} from './workspace.js'
import { getDb } from './database.js'
import {
  ensureUserSelfEntity,
  graphEntityLabel,
  listGraphObservations,
  listGraphRelations,
} from './graph.js'

export type CanonicalEmbeddingFn = (
  settings: AppSettings | undefined,
  text: string,
) => Promise<{ embedding?: number[]; provider?: string; model?: string }>

export function deriveCanonicalMemoryInput(
  candidate: CaptureCandidate,
  options: {
    source: string
    evidence?: string
    sessionId?: string
    messageId?: string
  },
): CanonicalMemoryInput | null {
  if (!isDurableCandidate(candidate) || candidate.kind === 'ignore') return null
  const kind = canonicalKindFromCaptureKind(candidate.kind)
  const rawValue = normalizeBulletText(candidate.value || extractCandidateValue(candidate.text))
  if (!rawValue) return null
  let memoryKey = candidate.memoryKey ? sanitizeMemoryKey(candidate.memoryKey) : ''
  const subject = kind === 'project' || kind === 'decision' ? 'project' : 'user'

  if (!memoryKey) {
    if (kind === 'identity') {
      memoryKey = looksLikeNameValue(rawValue) ? 'user.name' : `user.identity.${slugifyMemoryKeyPart(rawValue)}`
    } else if (kind === 'preference') {
      memoryKey = `user.preference.${slugifyMemoryKeyPart(rawValue)}`
    } else if (kind === 'constraint') {
      memoryKey = `user.constraint.${slugifyMemoryKeyPart(rawValue)}`
    } else if (kind === 'decision') {
      memoryKey = `project.decision.${slugifyMemoryKeyPart(rawValue)}`
    } else if (kind === 'project') {
      memoryKey = `project.fact.${slugifyMemoryKeyPart(rawValue)}`
    } else {
      memoryKey = `user.fact.${slugifyMemoryKeyPart(rawValue)}`
    }
  }

  const text = memoryKey === 'user.name'
    ? `User's name is ${rawValue}.`
    : normalizeBulletText(candidate.text)
  return {
    memoryKey,
    kind,
    subject,
    value: rawValue,
    text,
    confidence: candidate.confidence,
    sensitivity: candidate.sensitivity || 'normal',
    source: options.source,
    evidence: options.evidence,
    sessionId: options.sessionId,
    messageId: options.messageId,
  }
}

export function rowToCanonicalMemory(row: any): CanonicalMemoryRecord {
  return {
    id: row.id,
    memoryKey: row.memory_key,
    kind: row.kind,
    subject: row.subject,
    value: row.value,
    text: row.text,
    confidence: row.confidence,
    sensitivity: row.sensitivity || 'normal',
    source: row.source,
    evidence: row.evidence || undefined,
    sessionId: row.session_id || undefined,
    messageId: row.message_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || undefined,
  }
}

export function rowToCanonicalAuditEvent(row: any): CanonicalMemoryAuditEvent {
  let payload: JsonObject = {}
  try {
    payload = toJsonObject(JSON.parse(row.payload_json || '{}'))
  } catch {
    payload = {}
  }
  return {
    id: row.id,
    memoryId: row.memory_id,
    action: row.action,
    createdAt: row.created_at,
    payload,
  }
}

export function canonicalDisplayText(memory: CanonicalMemoryRecord): string {
  return `${memory.memoryKey}: ${memory.text}`
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
  input: CanonicalMemoryInput & { normalizedText: string; embedding?: number[] },
  threshold: number,
): CanonicalMemoryRecord | null {
  const sameKey = database.prepare(`
    SELECT * FROM canonical_memories WHERE memory_key = ? AND deleted_at IS NULL
  `).get(input.memoryKey) as any
  if (sameKey) return rowToCanonicalMemory(sameKey)

  const rows = database.prepare(`
    SELECT * FROM canonical_memories WHERE deleted_at IS NULL AND (kind = ? OR subject = ?)
  `).all(input.kind, input.subject || 'user') as any[]
  let best: { row: any; score: number } | null = null
  for (const row of rows) {
    const textScore = Math.max(
      tokenJaccard(input.normalizedText, row.normalized_text || row.text),
      normalizeForDedupe(input.normalizedText) === normalizeForDedupe(row.normalized_text || row.text) ? 1 : 0,
    )
    let vectorScore = 0
    if (input.embedding && row.embedding_json) {
      try {
        vectorScore = (cosine(input.embedding, JSON.parse(row.embedding_json)) + 1) / 2
      } catch {
        vectorScore = 0
      }
    }
    const score = Math.max(textScore, vectorScore)
    if (score >= threshold && (!best || score > best.score)) {
      best = { row, score }
    }
  }
  return best ? rowToCanonicalMemory(best.row) : null
}

export async function upsertCanonicalMemory(
  workspace: MemoryWorkspace,
  input: CanonicalMemoryInput,
  options: {
    settings?: AppSettings
    action?: CanonicalMemoryAuditEvent['action']
    canonicalEmbedding?: CanonicalEmbeddingFn
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

export async function upsertCanonicalCandidates(options: {
  settings?: AppSettings
  workspace: MemoryWorkspace
  candidates: CaptureCandidate[]
  source: string
  evidence?: string
  sessionId?: string
  messageId?: string
  action?: CanonicalMemoryAuditEvent['action']
  canonicalEmbedding?: CanonicalEmbeddingFn
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

export function buildCanonicalProfileSummary(workspace: MemoryWorkspace): string | null {
  if (!workspace.settings.canonicalMemory.enabled) return null
  const memories = listCanonicalMemories({
    workspace,
    limit: 80,
  })
  if (memories.length === 0) return null
  const grouped = new Map<CanonicalMemoryKind, CanonicalMemoryRecord[]>()
  for (const memory of memories) {
    const group = grouped.get(memory.kind) || []
    group.push(memory)
    grouped.set(memory.kind, group)
  }
  const labels: Record<CanonicalMemoryKind, string> = {
    identity: 'Identity',
    preference: 'Preferences',
    constraint: 'Constraints',
    decision: 'Decisions',
    project: 'Project Context',
    fact: 'Facts',
  }
  const parts: string[] = []
  for (const kind of ['identity', 'preference', 'constraint', 'decision', 'project', 'fact'] as CanonicalMemoryKind[]) {
    const items = grouped.get(kind) || []
    if (items.length === 0) continue
    parts.push(`## ${labels[kind]}`)
    for (const item of items.slice(0, 24)) {
      const confidence = Number.isFinite(item.confidence) ? ` (${item.confidence.toFixed(2)})` : ''
      parts.push(`- ${item.memoryKey}: ${item.text}${confidence}`)
    }
    parts.push('')
  }
  return truncate(parts.join('\n').trim(), workspace.settings.bootstrapMaxChars)
}

export function buildGraphProfileSummary(workspace: MemoryWorkspace): string | null {
  if (!workspace.settings.canonicalMemory.enabled) return null
  ensureUserSelfEntity(workspace)
  const userObservations = listGraphObservations({
    workspace,
    entityId: USER_SELF_ENTITY_ID,
    limit: 80,
  }).filter(observation => observation.status === 'active')
  const userRelations = listGraphRelations({
    workspace,
    entityId: USER_SELF_ENTITY_ID,
    limit: 80,
  }).filter(relation => relation.status === 'active')
  const relatedProjectIds = new Set<string>()
  for (const relation of userRelations) {
    if (relation.fromEntityId === USER_SELF_ENTITY_ID && relation.toEntityId.startsWith('project:')) {
      relatedProjectIds.add(relation.toEntityId)
    }
    if (relation.toEntityId === USER_SELF_ENTITY_ID && relation.fromEntityId.startsWith('project:')) {
      relatedProjectIds.add(relation.fromEntityId)
    }
  }

  const projectObservations = Array.from(relatedProjectIds)
    .flatMap(entityId => listGraphObservations({ workspace, entityId, limit: 24 }))
    .filter(observation => observation.status === 'active')

  const parts: string[] = []
  if (userObservations.length > 0) {
    parts.push('## User')
    for (const observation of userObservations.slice(0, 40)) {
      const confidence = Number.isFinite(observation.confidence) ? ` (${observation.confidence.toFixed(2)})` : ''
      parts.push(`- ${observation.slot}: ${observation.text}${confidence}`)
    }
    parts.push('')
  }
  if (userRelations.length > 0) {
    parts.push('## User Relations')
    for (const relation of userRelations.slice(0, 24)) {
      const from = relation.fromDisplayName || graphEntityLabel(workspace, relation.fromEntityId)
      const to = relation.toDisplayName || graphEntityLabel(workspace, relation.toEntityId)
      parts.push(`- ${from} --${relation.relationType}--> ${to}: ${relation.text}`)
    }
    parts.push('')
  }
  if (projectObservations.length > 0) {
    parts.push('## Related Projects')
    for (const observation of projectObservations.slice(0, 40)) {
      parts.push(`- ${observation.entityDisplayName || observation.entityId} / ${observation.slot}: ${observation.text}`)
    }
    parts.push('')
  }
  if (parts.length === 0) return null
  return truncate(parts.join('\n').trim(), workspace.settings.bootstrapMaxChars)
}
