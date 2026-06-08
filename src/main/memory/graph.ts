import Database from 'better-sqlite3'
import type {
  AppSettings,
  CanonicalMemoryAuditEvent,
  MemoryGraphAuditEvent,
  MemoryGraphDuplicate,
  MemoryGraphEntity,
  MemoryGraphEntityType,
  MemoryGraphObservation,
  MemoryGraphObservationKind,
  MemoryGraphOverview,
  MemoryGraphRelation,
  MemoryGraphStatus,
} from '../../shared/ipc.js'
import type {
  CaptureCandidate,
  CaptureCandidateKind,
  GraphEntityInput,
  GraphEvidenceInput,
  GraphMergeResult,
  GraphObservationInput,
  GraphRelationInput,
  MemoryWorkspace,
} from './types.js'
import { getDb } from './database.js'
import {
  canonicalKindFromCaptureKind,
  extractCandidateValue,
  isDurableCandidate,
  looksLikeNameValue,
  normalizeBulletText,
  normalizeForDedupe,
  sanitizeMemoryKey,
  sha,
  slugifyMemoryKeyPart,
  tokenJaccard,
  USER_SELF_ENTITY_ID,
} from './workspace.js'
import { logMemoryDiagnostic } from './diagnostics-logger.js'

export type GraphEmbeddingFn = (
  settings: AppSettings | undefined,
  text: string,
) => Promise<{ embedding?: number[]; provider?: string; model?: string }>

export function normalizeGraphStatus(value?: string): MemoryGraphStatus {
  return value === 'superseded' || value === 'conflict' || value === 'deleted' ? value : 'active'
}

export function normalizeEntityType(value?: string): MemoryGraphEntityType {
  const normalized = String(value || '').toLowerCase()
  if (
    normalized === 'user' ||
    normalized === 'project' ||
    normalized === 'tech' ||
    normalized === 'component' ||
    normalized === 'decision' ||
    normalized === 'concept' ||
    normalized === 'person' ||
    normalized === 'organization'
  ) {
    return normalized
  }
  return 'concept'
}

export function normalizeObservationKind(value?: string): MemoryGraphObservationKind {
  const normalized = String(value || '').toLowerCase()
  if (
    normalized === 'identity' ||
    normalized === 'preference' ||
    normalized === 'decision' ||
    normalized === 'project' ||
    normalized === 'constraint' ||
    normalized === 'summary' ||
    normalized === 'episodic'
  ) {
    return normalized
  }
  return 'fact'
}

export function normalizeRelationType(value: string): string {
  return slugifyMemoryKeyPart(value || 'related_to')
    .replace(/\./g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'related_to'
}

export function entityIdFor(type: MemoryGraphEntityType, name: string): string {
  if (type === 'user') return USER_SELF_ENTITY_ID
  const slug = slugifyMemoryKeyPart(name || type).replace(/\.+/g, '-').replace(/^-+|-+$/g, '')
  return `${type}:${slug || sha(name || type).slice(0, 10)}`
}

export function graphDisplayName(value: string): string {
  return normalizeBulletText(value).replace(/^["'“”]+|["'“”]+$/g, '').trim()
}

export function rowToGraphEntity(row: any): MemoryGraphEntity {
  let aliases: string[] = []
  try {
    const parsed = JSON.parse(row.aliases_json || '[]')
    aliases = Array.isArray(parsed) ? parsed.map(item => String(item)).filter(Boolean) : []
  } catch {
    aliases = []
  }
  return {
    id: row.id,
    entityType: normalizeEntityType(row.entity_type),
    name: row.name,
    displayName: row.display_name,
    aliases,
    confidence: row.confidence,
    sensitivity: row.sensitivity || 'normal',
    source: row.source,
    evidence: row.evidence || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || undefined,
  }
}

export function rowToGraphObservation(row: any): MemoryGraphObservation {
  return {
    id: row.id,
    entityId: row.entity_id,
    entityDisplayName: row.entity_display_name || undefined,
    kind: normalizeObservationKind(row.kind),
    slot: row.slot,
    value: row.value,
    text: row.text,
    confidence: row.confidence,
    sensitivity: row.sensitivity || 'normal',
    source: row.source,
    evidence: row.evidence || undefined,
    sessionId: row.session_id || undefined,
    messageId: row.message_id || undefined,
    status: normalizeGraphStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || undefined,
  }
}

export function rowToGraphRelation(row: any): MemoryGraphRelation {
  return {
    id: row.id,
    fromEntityId: row.from_entity_id,
    fromDisplayName: row.from_display_name || undefined,
    relationType: row.relation_type,
    toEntityId: row.to_entity_id,
    toDisplayName: row.to_display_name || undefined,
    text: row.text,
    confidence: row.confidence,
    sensitivity: row.sensitivity || 'normal',
    source: row.source,
    evidence: row.evidence || undefined,
    sessionId: row.session_id || undefined,
    messageId: row.message_id || undefined,
    status: normalizeGraphStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || undefined,
  }
}

export function rowToGraphDuplicate(row: any): MemoryGraphDuplicate {
  return {
    id: row.id,
    kind: row.kind,
    sourceId: row.source_id,
    targetId: row.target_id,
    score: row.score,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function rowToGraphAuditEvent(row: any): MemoryGraphAuditEvent {
  let payload: Record<string, unknown> = {}
  try {
    payload = JSON.parse(row.payload_json || '{}') as Record<string, unknown>
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

export function appendMemoryEvent(
  database: Database.Database,
  memoryId: string,
  action: CanonicalMemoryAuditEvent['action'],
  payload: Record<string, unknown>,
): void {
  const createdAt = Date.now()
  database.prepare(`
    INSERT INTO memory_events (id, memory_id, action, created_at, payload_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    sha(`${memoryId}:${action}:${createdAt}:${JSON.stringify(payload)}`),
    memoryId,
    action,
    createdAt,
    JSON.stringify(payload),
  )
}

export function appendGraphEvidence(
  database: Database.Database,
  ownerType: 'entity' | 'observation' | 'relation',
  ownerId: string,
  input: GraphEvidenceInput,
): void {
  if (!input.evidence && !input.sessionId && !input.messageId) return
  const createdAt = Date.now()
  database.prepare(`
    INSERT INTO memory_evidence (id, owner_type, owner_id, source, evidence, session_id, message_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sha(`${ownerType}:${ownerId}:${createdAt}:${input.source}:${input.evidence || ''}`),
    ownerType,
    ownerId,
    input.source,
    input.evidence || null,
    input.sessionId || null,
    input.messageId || null,
    createdAt,
  )
}

export function syncGraphFts(
  database: Database.Database,
  ownerType: 'entity' | 'observation' | 'relation',
  ownerId: string,
  content: string | null,
): void {
  const id = `${ownerType}:${ownerId}`
  database.prepare('DELETE FROM graph_memory_fts WHERE id = ?').run(id)
  if (content?.trim()) {
    database.prepare('INSERT INTO graph_memory_fts (id, owner_type, owner_id, content) VALUES (?, ?, ?, ?)').run(
      id,
      ownerType,
      ownerId,
      content.trim(),
    )
  }
}

export function ensureUserSelfEntity(workspace: MemoryWorkspace): MemoryGraphEntity {
  const existing = getGraphEntityById(workspace, USER_SELF_ENTITY_ID, false)
  if (existing) return existing
  return upsertGraphEntity(workspace, {
    id: USER_SELF_ENTITY_ID,
    entityType: 'user',
    name: 'self',
    displayName: 'User',
    confidence: 1,
    source: 'system',
  }).entity
}

export function upsertGraphEntity(
  workspace: MemoryWorkspace,
  input: GraphEntityInput,
  options: { settings?: AppSettings; action?: CanonicalMemoryAuditEvent['action'] } = {},
): { entity: MemoryGraphEntity; action: 'create' | 'update' | 'duplicate' } {
  const database = getDb(workspace)
  const now = Date.now()
  const entityType = normalizeEntityType(input.entityType)
  const name = graphDisplayName(input.name || input.displayName || entityType)
  const id = input.id || entityIdFor(entityType, name)
  const displayName = graphDisplayName(input.displayName || name || id)
  const aliases = Array.from(new Set([...(input.aliases || []), name, displayName].map(graphDisplayName).filter(Boolean)))
  const confidence = Math.max(0, Math.min(1, input.confidence ?? workspace.settings.canonicalMemory.highConfidenceThreshold))
  const existing = database.prepare('SELECT * FROM memory_entities WHERE id = ? AND deleted_at IS NULL').get(id) as any

  if (!existing) {
    const entity: MemoryGraphEntity = {
      id,
      entityType,
      name,
      displayName,
      aliases,
      confidence,
      sensitivity: input.sensitivity || 'normal',
      source: input.source,
      evidence: input.evidence,
      createdAt: now,
      updatedAt: now,
    }
    const tx = database.transaction(() => {
      database.prepare(`
        INSERT INTO memory_entities (
          id, entity_type, name, display_name, aliases_json, confidence, sensitivity, source, evidence,
          embedding_json, embedding_provider, embedding_model, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, NULL)
      `).run(
        entity.id,
        entity.entityType,
        entity.name,
        entity.displayName,
        JSON.stringify(entity.aliases),
        entity.confidence,
        entity.sensitivity,
        entity.source,
        entity.evidence || null,
        entity.createdAt,
        entity.updatedAt,
      )
      syncGraphFts(database, 'entity', entity.id, `${entity.id}\n${entity.entityType}\n${entity.displayName}\n${entity.aliases.join('\n')}`)
      appendGraphEvidence(database, 'entity', entity.id, input)
      appendMemoryEvent(database, entity.id, options.action || 'create', { input })
    })
    tx()
    return { entity, action: 'create' }
  }

  const entity = rowToGraphEntity(existing)
  const mergedAliases = Array.from(new Set([...entity.aliases, ...aliases]))
  const normalizedSame = normalizeForDedupe(entity.displayName) === normalizeForDedupe(displayName) &&
    JSON.stringify(entity.aliases) === JSON.stringify(mergedAliases) &&
    confidence <= entity.confidence
  if (normalizedSame) {
    appendMemoryEvent(database, entity.id, 'duplicate', { input })
    return { entity, action: 'duplicate' }
  }

  const updated: MemoryGraphEntity = {
    ...entity,
    displayName: displayName || entity.displayName,
    aliases: mergedAliases,
    confidence: Math.max(entity.confidence, confidence),
    sensitivity: input.sensitivity || entity.sensitivity,
    source: input.source || entity.source,
    evidence: input.evidence || entity.evidence,
    updatedAt: now,
  }
  const tx = database.transaction(() => {
    database.prepare(`
      UPDATE memory_entities SET
        display_name = ?, aliases_json = ?, confidence = ?, sensitivity = ?, source = ?, evidence = ?,
        updated_at = ?, deleted_at = NULL
      WHERE id = ?
    `).run(
      updated.displayName,
      JSON.stringify(updated.aliases),
      updated.confidence,
      updated.sensitivity,
      updated.source,
      updated.evidence || null,
      updated.updatedAt,
      updated.id,
    )
    syncGraphFts(database, 'entity', updated.id, `${updated.id}\n${updated.entityType}\n${updated.displayName}\n${updated.aliases.join('\n')}`)
    appendGraphEvidence(database, 'entity', updated.id, input)
    appendMemoryEvent(database, updated.id, options.action || 'update', { input, previous: entity })
  })
  tx()
  return { entity: updated, action: 'update' }
}

const SINGLETON_GRAPH_SLOTS = new Set(['name', 'language_preference', 'response_style_preference', 'call_sign'])
const SINGLETON_GRAPH_KINDS = new Set<MemoryGraphObservationKind>(['identity', 'preference', 'constraint'])

export function isSingletonGraphObservation(kind: MemoryGraphObservationKind, slot: string): boolean {
  return SINGLETON_GRAPH_SLOTS.has(slot) || SINGLETON_GRAPH_KINDS.has(kind)
}

export async function upsertGraphObservation(
  workspace: MemoryWorkspace,
  input: GraphObservationInput,
  options: { settings?: AppSettings; action?: CanonicalMemoryAuditEvent['action']; graphEmbedding?: GraphEmbeddingFn } = {},
): Promise<{ observation: MemoryGraphObservation; action: 'create' | 'update' | 'duplicate' | 'conflict' }> {
  const database = getDb(workspace)
  const now = Date.now()
  const kind = normalizeObservationKind(input.kind)
  const slot = slugifyMemoryKeyPart(input.slot || kind).replace(/\./g, '_')
  const value = normalizeBulletText(input.value)
  const text = normalizeBulletText(input.text || value)
  const normalizedText = normalizeForDedupe(`${input.entityId} ${slot} ${value} ${text}`)
  const confidence = Math.max(0, Math.min(1, input.confidence ?? workspace.settings.canonicalMemory.highConfidenceThreshold))
  const status = normalizeGraphStatus(input.status)
  if (input.id) {
    const existingById = getGraphObservationById(workspace, input.id, true)
    if (existingById) {
      const embedding = options.graphEmbedding ? await options.graphEmbedding(options.settings, `${input.entityId}\n${slot}\n${text}\n${value}`) : {}
      const updated: MemoryGraphObservation = {
        ...existingById,
        entityId: input.entityId,
        kind,
        slot,
        value,
        text,
        confidence,
        sensitivity: input.sensitivity || existingById.sensitivity,
        source: input.source || existingById.source,
        evidence: input.evidence || existingById.evidence,
        sessionId: input.sessionId || existingById.sessionId,
        messageId: input.messageId || existingById.messageId,
        status,
        updatedAt: now,
        deletedAt: undefined,
      }
      const tx = database.transaction(() => {
        database.prepare(`
          UPDATE memory_observations SET
            entity_id = ?, kind = ?, slot = ?, value = ?, text = ?, normalized_text = ?,
            confidence = ?, sensitivity = ?, source = ?, evidence = ?, session_id = ?, message_id = ?, status = ?,
            embedding_json = COALESCE(?, embedding_json),
            embedding_provider = COALESCE(?, embedding_provider),
            embedding_model = COALESCE(?, embedding_model),
            updated_at = ?, deleted_at = NULL
          WHERE id = ?
        `).run(
          updated.entityId,
          updated.kind,
          updated.slot,
          updated.value,
          updated.text,
          normalizedText,
          updated.confidence,
          updated.sensitivity,
          updated.source,
          updated.evidence || null,
          updated.sessionId || null,
          updated.messageId || null,
          updated.status,
          embedding.embedding ? JSON.stringify(embedding.embedding) : null,
          embedding.provider || null,
          embedding.model || null,
          updated.updatedAt,
          updated.id,
        )
        syncGraphFts(database, 'observation', updated.id, `${updated.entityId}\n${updated.kind}\n${updated.slot}\n${updated.value}\n${updated.text}`)
        appendGraphEvidence(database, 'observation', updated.id, input)
        appendMemoryEvent(database, updated.id, options.action || 'update', { input, previous: existingById })
      })
      tx()
      return { observation: updated, action: 'update' }
    }
  }
  const existingExact = database.prepare(`
    SELECT o.*, e.display_name AS entity_display_name
    FROM memory_observations o
    LEFT JOIN memory_entities e ON e.id = o.entity_id
    WHERE o.entity_id = ? AND o.slot = ? AND o.normalized_text = ? AND o.deleted_at IS NULL
    LIMIT 1
  `).get(input.entityId, slot, normalizedText) as any
  if (existingExact) {
    const observation = rowToGraphObservation(existingExact)
    appendMemoryEvent(database, observation.id, 'duplicate', { input })
    appendGraphEvidence(database, 'observation', observation.id, input)
    return { observation, action: 'duplicate' }
  }

  const activeSameSlot = database.prepare(`
    SELECT o.*, e.display_name AS entity_display_name
    FROM memory_observations o
    LEFT JOIN memory_entities e ON e.id = o.entity_id
    WHERE o.entity_id = ? AND o.slot = ? AND o.deleted_at IS NULL AND o.status = 'active'
    ORDER BY o.updated_at DESC
    LIMIT 1
  `).get(input.entityId, slot) as any
  if (
    activeSameSlot &&
    isSingletonGraphObservation(kind, slot) &&
    normalizeForDedupe(activeSameSlot.value || '') === normalizeForDedupe(value)
  ) {
    const observation = rowToGraphObservation(activeSameSlot)
    const nextConfidence = Math.max(observation.confidence, confidence)
    const nextEvidence = input.evidence || observation.evidence
    const tx = database.transaction(() => {
      database.prepare(`
        UPDATE memory_observations SET confidence = ?, evidence = ?, updated_at = ? WHERE id = ?
      `).run(nextConfidence, nextEvidence || null, now, observation.id)
      appendGraphEvidence(database, 'observation', observation.id, input)
      appendMemoryEvent(database, observation.id, 'duplicate', { input, duplicateReason: 'same singleton slot value' })
    })
    tx()
    return {
      observation: {
        ...observation,
        confidence: nextConfidence,
        evidence: nextEvidence,
        updatedAt: now,
      },
      action: 'duplicate',
    }
  }
  const id = input.id || sha(`${input.entityId}:${slot}:${normalizedText}:${now}`)
  const embedding = options.graphEmbedding ? await options.graphEmbedding(options.settings, `${input.entityId}\n${slot}\n${text}\n${value}`) : {}
  const observation: MemoryGraphObservation = {
    id,
    entityId: input.entityId,
    kind,
    slot,
    value,
    text,
    confidence,
    sensitivity: input.sensitivity || 'normal',
    source: input.source,
    evidence: input.evidence,
    sessionId: input.sessionId,
    messageId: input.messageId,
    status,
    createdAt: now,
    updatedAt: now,
  }
  const conflict = Boolean(activeSameSlot && isSingletonGraphObservation(kind, slot))
  const tx = database.transaction(() => {
    if (conflict) {
      database.prepare(`
        UPDATE memory_observations SET status = 'superseded', updated_at = ? WHERE id = ?
      `).run(now, activeSameSlot.id)
      appendMemoryEvent(database, activeSameSlot.id, 'conflict', { supersededBy: id, input })
    }
    database.prepare(`
      INSERT INTO memory_observations (
        id, entity_id, kind, slot, value, text, normalized_text, confidence, sensitivity,
        source, evidence, session_id, message_id, status,
        embedding_json, embedding_provider, embedding_model, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      observation.id,
      observation.entityId,
      observation.kind,
      observation.slot,
      observation.value,
      observation.text,
      normalizedText,
      observation.confidence,
      observation.sensitivity,
      observation.source,
      observation.evidence || null,
      observation.sessionId || null,
      observation.messageId || null,
      observation.status,
      embedding.embedding ? JSON.stringify(embedding.embedding) : null,
      embedding.provider || null,
      embedding.model || null,
      observation.createdAt,
      observation.updatedAt,
    )
    syncGraphFts(database, 'observation', observation.id, `${observation.entityId}\n${observation.kind}\n${observation.slot}\n${observation.value}\n${observation.text}`)
    appendGraphEvidence(database, 'observation', observation.id, input)
    appendMemoryEvent(database, observation.id, conflict ? 'conflict' : (options.action || 'create'), {
      input,
      ...(conflict ? { previous: rowToGraphObservation(activeSameSlot) } : {}),
    })
  })
  tx()
  maybeRecordObservationDuplicate(database, workspace, observation, normalizedText)
  return { observation, action: conflict ? 'conflict' : 'create' }
}

export function maybeRecordObservationDuplicate(
  database: Database.Database,
  workspace: MemoryWorkspace,
  observation: MemoryGraphObservation,
  normalizedText: string,
): void {
  const rows = database.prepare(`
    SELECT id, normalized_text, text FROM memory_observations
    WHERE id != ? AND entity_id = ? AND deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 80
  `).all(observation.id, observation.entityId) as any[]
  let best: { id: string; score: number; text: string } | null = null
  for (const row of rows) {
    const score = tokenJaccard(normalizedText, row.normalized_text || row.text)
    if (score >= workspace.settings.canonicalMemory.semanticDedupeThreshold && (!best || score > best.score)) {
      best = { id: row.id, score, text: row.text }
    }
  }
  if (!best) return
  const existing = database.prepare(`
    SELECT id FROM memory_possible_duplicates
    WHERE kind = 'observation' AND source_id = ? AND target_id = ? AND status = 'pending'
  `).get(observation.id, best.id)
  if (existing) return
  const now = Date.now()
  database.prepare(`
    INSERT INTO memory_possible_duplicates (id, kind, source_id, target_id, score, reason, status, created_at, updated_at)
    VALUES (?, 'observation', ?, ?, ?, ?, 'pending', ?, ?)
  `).run(
    sha(`observation:${observation.id}:${best.id}`),
    observation.id,
    best.id,
    best.score,
    `Similar observation: ${best.text}`,
    now,
    now,
  )
}

export function reconcileSingletonGraphObservations(workspace: MemoryWorkspace): number {
  const database = getDb(workspace)
  const rows = database.prepare(`
    SELECT *
    FROM memory_observations
    WHERE deleted_at IS NULL AND status = 'active'
    ORDER BY entity_id ASC, kind ASC, slot ASC, updated_at DESC
  `).all() as any[]
  const groups = new Map<string, any[]>()
  for (const row of rows) {
    const kind = normalizeObservationKind(row.kind)
    const slot = String(row.slot || '')
    if (!isSingletonGraphObservation(kind, slot)) continue
    const key = `${row.entity_id}:${kind}:${slot}`
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }

  let superseded = 0
  const now = Date.now()
  const tx = database.transaction(() => {
    for (const group of groups.values()) {
      if (group.length < 2) continue
      const [keeper, ...olderRows] = group.sort((a, b) => {
        const updatedDelta = Number(b.updated_at || 0) - Number(a.updated_at || 0)
        if (updatedDelta !== 0) return updatedDelta
        return Number(b.confidence || 0) - Number(a.confidence || 0)
      })
      for (const row of olderRows) {
        database.prepare(`
          UPDATE memory_observations
          SET status = 'superseded', updated_at = ?
          WHERE id = ? AND status = 'active'
        `).run(now, row.id)
        appendMemoryEvent(database, row.id, 'conflict', {
          supersededBy: keeper.id,
          reason: 'singleton observation slot reconciliation',
          entityId: row.entity_id,
          kind: row.kind,
          slot: row.slot,
        })
        superseded++
      }
    }
  })
  tx()
  if (superseded > 0) {
    logMemoryDiagnostic({
      subsystem: 'graph',
      operation: 'singleton-reconcile',
      stage: 'finish',
      status: 'ok',
      response: { superseded },
      summary: `Superseded ${superseded} duplicate singleton graph observations.`,
    })
  }
  return superseded
}

export async function upsertGraphRelation(
  workspace: MemoryWorkspace,
  input: GraphRelationInput,
  options: { settings?: AppSettings; action?: CanonicalMemoryAuditEvent['action']; graphEmbedding?: GraphEmbeddingFn } = {},
): Promise<{ relation: MemoryGraphRelation; action: 'create' | 'update' | 'duplicate' }> {
  const database = getDb(workspace)
  const now = Date.now()
  const relationType = normalizeRelationType(input.relationType)
  if (input.id) {
    const existingById = getGraphRelationById(workspace, input.id, true)
    if (existingById) {
      const fromEntity = getGraphEntityById(workspace, input.fromEntityId, true)
      const toEntity = getGraphEntityById(workspace, input.toEntityId, true)
      const text = normalizeBulletText(input.text || `${fromEntity?.displayName || input.fromEntityId} ${relationType.replace(/_/g, ' ')} ${toEntity?.displayName || input.toEntityId}.`)
      const confidence = Math.max(0, Math.min(1, input.confidence ?? existingById.confidence))
      const embedding = options.graphEmbedding ? await options.graphEmbedding(options.settings, `${input.fromEntityId}\n${relationType}\n${input.toEntityId}\n${text}`) : {}
      const updated: MemoryGraphRelation = {
        ...existingById,
        fromEntityId: input.fromEntityId,
        fromDisplayName: fromEntity?.displayName,
        relationType,
        toEntityId: input.toEntityId,
        toDisplayName: toEntity?.displayName,
        text,
        confidence,
        sensitivity: input.sensitivity || existingById.sensitivity,
        source: input.source || existingById.source,
        evidence: input.evidence || existingById.evidence,
        sessionId: input.sessionId || existingById.sessionId,
        messageId: input.messageId || existingById.messageId,
        status: normalizeGraphStatus(input.status || existingById.status),
        updatedAt: now,
        deletedAt: undefined,
      }
      const tx = database.transaction(() => {
        database.prepare(`
          UPDATE memory_relations SET
            from_entity_id = ?, relation_type = ?, to_entity_id = ?, text = ?, confidence = ?,
            sensitivity = ?, source = ?, evidence = ?, session_id = ?, message_id = ?, status = ?,
            embedding_json = COALESCE(?, embedding_json),
            embedding_provider = COALESCE(?, embedding_provider),
            embedding_model = COALESCE(?, embedding_model),
            updated_at = ?, deleted_at = NULL
          WHERE id = ?
        `).run(
          updated.fromEntityId,
          updated.relationType,
          updated.toEntityId,
          updated.text,
          updated.confidence,
          updated.sensitivity,
          updated.source,
          updated.evidence || null,
          updated.sessionId || null,
          updated.messageId || null,
          updated.status,
          embedding.embedding ? JSON.stringify(embedding.embedding) : null,
          embedding.provider || null,
          embedding.model || null,
          updated.updatedAt,
          updated.id,
        )
        syncGraphFts(database, 'relation', updated.id, `${updated.fromEntityId}\n${updated.relationType}\n${updated.toEntityId}\n${updated.text}`)
        appendGraphEvidence(database, 'relation', updated.id, input)
        appendMemoryEvent(database, updated.id, options.action || 'update', { input, previous: existingById })
      })
      tx()
      return { relation: updated, action: 'update' }
    }
  }
  const existing = database.prepare(`
    SELECT r.*, from_e.display_name AS from_display_name, to_e.display_name AS to_display_name
    FROM memory_relations r
    LEFT JOIN memory_entities from_e ON from_e.id = r.from_entity_id
    LEFT JOIN memory_entities to_e ON to_e.id = r.to_entity_id
    WHERE r.from_entity_id = ? AND r.relation_type = ? AND r.to_entity_id = ?
      AND r.deleted_at IS NULL AND r.status = 'active'
    LIMIT 1
  `).get(input.fromEntityId, relationType, input.toEntityId) as any
  if (existing) {
    const relation = rowToGraphRelation(existing)
    appendMemoryEvent(database, relation.id, 'duplicate', { input })
    appendGraphEvidence(database, 'relation', relation.id, input)
    return { relation, action: 'duplicate' }
  }

  const fromEntity = getGraphEntityById(workspace, input.fromEntityId, true)
  const toEntity = getGraphEntityById(workspace, input.toEntityId, true)
  const text = normalizeBulletText(input.text || `${fromEntity?.displayName || input.fromEntityId} ${relationType.replace(/_/g, ' ')} ${toEntity?.displayName || input.toEntityId}.`)
  const confidence = Math.max(0, Math.min(1, input.confidence ?? workspace.settings.canonicalMemory.highConfidenceThreshold))
  const id = sha(`${input.fromEntityId}:${relationType}:${input.toEntityId}`)
  const embedding = options.graphEmbedding ? await options.graphEmbedding(options.settings, `${input.fromEntityId}\n${relationType}\n${input.toEntityId}\n${text}`) : {}
  const relation: MemoryGraphRelation = {
    id,
    fromEntityId: input.fromEntityId,
    fromDisplayName: fromEntity?.displayName,
    relationType,
    toEntityId: input.toEntityId,
    toDisplayName: toEntity?.displayName,
    text,
    confidence,
    sensitivity: input.sensitivity || 'normal',
    source: input.source,
    evidence: input.evidence,
    sessionId: input.sessionId,
    messageId: input.messageId,
    status: normalizeGraphStatus(input.status),
    createdAt: now,
    updatedAt: now,
  }
  const tx = database.transaction(() => {
    database.prepare(`
      INSERT INTO memory_relations (
        id, from_entity_id, relation_type, to_entity_id, text, confidence, sensitivity, source,
        evidence, session_id, message_id, status, embedding_json, embedding_provider, embedding_model,
        created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      relation.id,
      relation.fromEntityId,
      relation.relationType,
      relation.toEntityId,
      relation.text,
      relation.confidence,
      relation.sensitivity,
      relation.source,
      relation.evidence || null,
      relation.sessionId || null,
      relation.messageId || null,
      relation.status,
      embedding.embedding ? JSON.stringify(embedding.embedding) : null,
      embedding.provider || null,
      embedding.model || null,
      relation.createdAt,
      relation.updatedAt,
    )
    syncGraphFts(database, 'relation', relation.id, `${relation.fromEntityId}\n${relation.relationType}\n${relation.toEntityId}\n${relation.text}`)
    appendGraphEvidence(database, 'relation', relation.id, input)
    appendMemoryEvent(database, relation.id, options.action || 'create', { input })
  })
  tx()
  return { relation, action: 'create' }
}

export function getGraphEntityById(workspace: MemoryWorkspace, id: string, includeDeleted = false): MemoryGraphEntity | null {
  const row = getDb(workspace).prepare(`
    SELECT * FROM memory_entities WHERE id = ? AND (${includeDeleted ? '1 = 1' : 'deleted_at IS NULL'}) LIMIT 1
  `).get(id) as any
  return row ? rowToGraphEntity(row) : null
}

export function getGraphObservationById(workspace: MemoryWorkspace, id: string, includeDeleted = false): MemoryGraphObservation | null {
  const row = getDb(workspace).prepare(`
    SELECT o.*, e.display_name AS entity_display_name
    FROM memory_observations o
    LEFT JOIN memory_entities e ON e.id = o.entity_id
    WHERE o.id = ? AND (${includeDeleted ? '1 = 1' : 'o.deleted_at IS NULL'})
    LIMIT 1
  `).get(id) as any
  return row ? rowToGraphObservation(row) : null
}

export function getGraphRelationById(workspace: MemoryWorkspace, id: string, includeDeleted = false): MemoryGraphRelation | null {
  const row = getDb(workspace).prepare(`
    SELECT r.*, from_e.display_name AS from_display_name, to_e.display_name AS to_display_name
    FROM memory_relations r
    LEFT JOIN memory_entities from_e ON from_e.id = r.from_entity_id
    LEFT JOIN memory_entities to_e ON to_e.id = r.to_entity_id
    WHERE r.id = ? AND (${includeDeleted ? '1 = 1' : 'r.deleted_at IS NULL'})
    LIMIT 1
  `).get(id) as any
  return row ? rowToGraphRelation(row) : null
}

export function getGraphMemoryByIdentifier(
  workspace: MemoryWorkspace,
  identifier: string,
  includeDeleted = false,
): { type: 'entity'; value: MemoryGraphEntity } | { type: 'observation'; value: MemoryGraphObservation } | { type: 'relation'; value: MemoryGraphRelation } | null {
  const clean = identifier.trim()
  if (!clean) return null
  const observationId = clean.replace(/^observation:/i, '')
  if (observationId !== clean || clean.startsWith('obs:')) {
    const id = clean.startsWith('obs:') ? clean.replace(/^obs:/i, '') : observationId
    const observation = getGraphObservationById(workspace, id, includeDeleted)
    return observation ? { type: 'observation', value: observation } : null
  }
  const relationId = clean.replace(/^relation:/i, '')
  if (relationId !== clean || clean.startsWith('rel:')) {
    const id = clean.startsWith('rel:') ? clean.replace(/^rel:/i, '') : relationId
    const relation = getGraphRelationById(workspace, id, includeDeleted)
    return relation ? { type: 'relation', value: relation } : null
  }
  const entityId = clean.replace(/^entity:/i, '')
  const entity = getGraphEntityById(workspace, entityId, includeDeleted)
  return entity ? { type: 'entity', value: entity } : null
}

export function graphEntityLabel(workspace: MemoryWorkspace, id: string): string {
  return getGraphEntityById(workspace, id, true)?.displayName || id
}

export function graphSearchContent(workspace: MemoryWorkspace, owner: ReturnType<typeof getGraphMemoryByIdentifier>): string {
  if (!owner) return ''
  if (owner.type === 'entity') {
    const entity = owner.value
    return `${entity.id}: ${entity.displayName} (${entity.entityType})${entity.aliases.length ? ` aliases: ${entity.aliases.join(', ')}` : ''}`
  }
  if (owner.type === 'observation') {
    const observation = owner.value
    return `${observation.entityDisplayName || graphEntityLabel(workspace, observation.entityId)} ${observation.slot}: ${observation.text}`
  }
  const relation = owner.value
  return `${relation.fromDisplayName || graphEntityLabel(workspace, relation.fromEntityId)} --${relation.relationType}--> ${relation.toDisplayName || graphEntityLabel(workspace, relation.toEntityId)}: ${relation.text}`
}

export function getGraphOverview(workspace: MemoryWorkspace): MemoryGraphOverview {
  const database = getDb(workspace)
  const userEntity = ensureUserSelfEntity(workspace)
  const entities = database.prepare('SELECT COUNT(*) AS count FROM memory_entities WHERE deleted_at IS NULL').get() as { count: number }
  const observations = database.prepare(`
    SELECT COUNT(*) AS count FROM memory_observations WHERE deleted_at IS NULL AND status = 'active'
  `).get() as { count: number }
  const relations = database.prepare(`
    SELECT COUNT(*) AS count FROM memory_relations WHERE deleted_at IS NULL AND status = 'active'
  `).get() as { count: number }
  const pendingDuplicates = database.prepare(`
    SELECT COUNT(*) AS count FROM memory_possible_duplicates WHERE status = 'pending'
  `).get() as { count: number }
  return {
    entities: entities.count,
    observations: observations.count,
    relations: relations.count,
    pendingDuplicates: pendingDuplicates.count,
    userEntity,
  }
}

export function listGraphEntities(options: {
  workspace: MemoryWorkspace
  query?: string
  includeDeleted?: boolean
  limit?: number
}): MemoryGraphEntity[] {
  const database = getDb(options.workspace)
  const limit = Math.max(1, Math.min(500, options.limit || 200))
  const includeDeleted = options.includeDeleted === true
  const query = options.query?.trim()
  if (query) {
    const like = `%${query.replace(/[%_]/g, '')}%`
    const rows = database.prepare(`
      SELECT *
      FROM memory_entities
      WHERE (${includeDeleted ? '1 = 1' : 'deleted_at IS NULL'})
        AND (id LIKE ? OR entity_type LIKE ? OR name LIKE ? OR display_name LIKE ? OR aliases_json LIKE ?)
      ORDER BY entity_type ASC, updated_at DESC
      LIMIT ?
    `).all(like, like, like, like, like, limit) as any[]
    return rows.map(rowToGraphEntity)
  }
  const rows = database.prepare(`
    SELECT *
    FROM memory_entities
    WHERE ${includeDeleted ? '1 = 1' : 'deleted_at IS NULL'}
    ORDER BY
      CASE entity_type
        WHEN 'user' THEN 0
        WHEN 'project' THEN 1
        WHEN 'component' THEN 2
        WHEN 'tech' THEN 3
        WHEN 'decision' THEN 4
        ELSE 5
      END,
      updated_at DESC
    LIMIT ?
  `).all(limit) as any[]
  return rows.map(rowToGraphEntity)
}

export function listGraphObservations(options: {
  workspace: MemoryWorkspace
  query?: string
  includeDeleted?: boolean
  limit?: number
  entityId?: string
}): MemoryGraphObservation[] {
  const database = getDb(options.workspace)
  const limit = Math.max(1, Math.min(500, options.limit || 200))
  const includeDeleted = options.includeDeleted === true
  const query = options.query?.trim()
  const clauses = [includeDeleted ? '1 = 1' : 'o.deleted_at IS NULL']
  const params: unknown[] = []
  if (options.entityId) {
    clauses.push('o.entity_id = ?')
    params.push(options.entityId)
  }
  if (query) {
    const like = `%${query.replace(/[%_]/g, '')}%`
    clauses.push('(o.id LIKE ? OR o.entity_id LIKE ? OR o.kind LIKE ? OR o.slot LIKE ? OR o.value LIKE ? OR o.text LIKE ? OR e.display_name LIKE ?)')
    params.push(like, like, like, like, like, like, like)
  }
  const rows = database.prepare(`
    SELECT o.*, e.display_name AS entity_display_name
    FROM memory_observations o
    LEFT JOIN memory_entities e ON e.id = o.entity_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY
      CASE o.entity_id WHEN '${USER_SELF_ENTITY_ID}' THEN 0 ELSE 1 END,
      CASE o.kind
        WHEN 'identity' THEN 0
        WHEN 'preference' THEN 1
        WHEN 'constraint' THEN 2
        WHEN 'decision' THEN 3
        WHEN 'project' THEN 4
        ELSE 5
      END,
      o.updated_at DESC
    LIMIT ?
  `).all(...params, limit) as any[]
  return rows.map(rowToGraphObservation)
}

export function listGraphRelations(options: {
  workspace: MemoryWorkspace
  query?: string
  includeDeleted?: boolean
  limit?: number
  entityId?: string
}): MemoryGraphRelation[] {
  const database = getDb(options.workspace)
  const limit = Math.max(1, Math.min(500, options.limit || 200))
  const includeDeleted = options.includeDeleted === true
  const query = options.query?.trim()
  const clauses = [includeDeleted ? '1 = 1' : 'r.deleted_at IS NULL']
  const params: unknown[] = []
  if (options.entityId) {
    clauses.push('(r.from_entity_id = ? OR r.to_entity_id = ?)')
    params.push(options.entityId, options.entityId)
  }
  if (query) {
    const like = `%${query.replace(/[%_]/g, '')}%`
    clauses.push('(r.id LIKE ? OR r.from_entity_id LIKE ? OR r.relation_type LIKE ? OR r.to_entity_id LIKE ? OR r.text LIKE ? OR from_e.display_name LIKE ? OR to_e.display_name LIKE ?)')
    params.push(like, like, like, like, like, like, like)
  }
  const rows = database.prepare(`
    SELECT r.*, from_e.display_name AS from_display_name, to_e.display_name AS to_display_name
    FROM memory_relations r
    LEFT JOIN memory_entities from_e ON from_e.id = r.from_entity_id
    LEFT JOIN memory_entities to_e ON to_e.id = r.to_entity_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY r.updated_at DESC
    LIMIT ?
  `).all(...params, limit) as any[]
  return rows.map(rowToGraphRelation)
}

export function listGraphDuplicates(options: {
  workspace: MemoryWorkspace
  query?: string
  limit?: number
}): MemoryGraphDuplicate[] {
  const database = getDb(options.workspace)
  const limit = Math.max(1, Math.min(500, options.limit || 200))
  const query = options.query?.trim()
  if (query) {
    const like = `%${query.replace(/[%_]/g, '')}%`
    const rows = database.prepare(`
      SELECT * FROM memory_possible_duplicates
      WHERE status = 'pending' AND (kind LIKE ? OR source_id LIKE ? OR target_id LIKE ? OR reason LIKE ?)
      ORDER BY score DESC, updated_at DESC
      LIMIT ?
    `).all(like, like, like, like, limit) as any[]
    return rows.map(rowToGraphDuplicate)
  }
  const rows = database.prepare(`
    SELECT * FROM memory_possible_duplicates
    WHERE status = 'pending'
    ORDER BY score DESC, updated_at DESC
    LIMIT ?
  `).all(limit) as any[]
  return rows.map(rowToGraphDuplicate)
}

export function graphSlotFromCandidate(candidate: CaptureCandidate, kind: MemoryGraphObservationKind, value: string): string {
  if (candidate.slot?.trim()) return normalizeRelationType(candidate.slot)
  const memoryKey = candidate.memoryKey ? sanitizeMemoryKey(candidate.memoryKey) : ''
  if (memoryKey === 'user.name' || memoryKey === 'user.identity.name') return 'name'
  if (memoryKey.includes('language')) return 'language_preference'
  if (memoryKey.includes('response') || memoryKey.includes('style') || memoryKey.includes('tone')) return 'response_style_preference'
  if (memoryKey.includes('call') || memoryKey.includes('nickname')) return 'call_sign'
  if (kind === 'identity' && looksLikeNameValue(value)) return 'name'
  if (kind === 'preference' && /language|中文|chinese|english|英文/i.test(`${candidate.text} ${value}`)) return 'language_preference'
  if (kind === 'preference' && /style|tone|response|回答|风格/i.test(`${candidate.text} ${value}`)) return 'response_style_preference'
  if (kind === 'preference') return `preference_${slugifyMemoryKeyPart(value).replace(/\./g, '_')}`
  if (kind === 'constraint') return `constraint_${slugifyMemoryKeyPart(value).replace(/\./g, '_')}`
  if (kind === 'decision') return `decision_${slugifyMemoryKeyPart(value).replace(/\./g, '_')}`
  if (kind === 'project') return `project_${slugifyMemoryKeyPart(value).replace(/\./g, '_')}`
  return `${kind}_${slugifyMemoryKeyPart(value).replace(/\./g, '_')}`
}

export function graphEntityInput(options: GraphEvidenceInput & {
  entityType: MemoryGraphEntityType
  name: string
  displayName?: string
  confidence?: number
  sensitivity?: 'normal' | 'sensitive' | 'secret'
}): GraphEntityInput {
  const entityType = normalizeEntityType(options.entityType)
  const name = graphDisplayName(options.name)
  if (entityType === 'user' || (entityType === 'person' && /^(self|user|the user|me|用户)$/i.test(name))) {
    return {
      ...options,
      id: USER_SELF_ENTITY_ID,
      entityType: 'user',
      name: 'self',
      displayName: options.displayName || 'User',
    }
  }
  return {
    ...options,
    entityType,
    name,
    displayName: graphDisplayName(options.displayName || options.name),
  }
}

export function graphInputsFromCandidate(
  candidate: CaptureCandidate,
  options: GraphEvidenceInput,
): { entities: GraphEntityInput[]; observations: GraphObservationInput[]; relations: GraphRelationInput[] } | null {
  if (!isDurableCandidate(candidate) || candidate.kind === 'ignore') return null
  const kind = normalizeObservationKind(canonicalKindFromCaptureKind(candidate.kind))
  const value = normalizeBulletText(candidate.value || extractCandidateValue(candidate.text))
  const text = normalizeBulletText(candidate.text || value)
  if (!value || !text) return null

  const entities: GraphEntityInput[] = []
  const observations: GraphObservationInput[] = []
  const relations: GraphRelationInput[] = []
  const confidence = candidate.confidence
  const sensitivity = candidate.sensitivity || 'normal'

  const relationType = candidate.relationType?.trim()
  const toName = candidate.toEntityName?.trim()
  if (relationType && toName) {
    const fromEntity = graphEntityInput({
      ...options,
      entityType: candidate.fromEntityType || 'user',
      name: candidate.fromEntityName || 'self',
      confidence,
      sensitivity,
    })
    const toEntity = graphEntityInput({
      ...options,
      entityType: candidate.toEntityType || candidate.entityType || (candidate.kind === 'project' || candidate.kind === 'decision' ? 'project' : 'concept'),
      name: toName,
      confidence,
      sensitivity,
    })
    entities.push(fromEntity, toEntity)
    relations.push({
      ...options,
      fromEntityId: fromEntity.id || entityIdFor(fromEntity.entityType, fromEntity.name),
      relationType,
      toEntityId: toEntity.id || entityIdFor(toEntity.entityType, toEntity.name),
      text,
      confidence,
      sensitivity,
      status: 'active',
    })
  }

  let observationEntity: GraphEntityInput
  const userScoped = candidate.kind === 'identity' ||
    candidate.kind === 'preference' ||
    candidate.kind === 'constraint' ||
    Boolean(candidate.memoryKey && sanitizeMemoryKey(candidate.memoryKey).startsWith('user.'))
  if (userScoped) {
    observationEntity = graphEntityInput({
      ...options,
      entityType: 'user',
      name: 'self',
      confidence: 1,
      sensitivity: 'normal',
    })
  } else if (candidate.entityName && candidate.entityType && candidate.entityType !== 'user') {
    observationEntity = graphEntityInput({
      ...options,
      entityType: candidate.entityType,
      name: candidate.entityName,
      confidence,
      sensitivity,
    })
  } else if ((candidate.kind === 'project' || candidate.kind === 'decision') && candidate.entityName) {
    observationEntity = graphEntityInput({
      ...options,
      entityType: 'project',
      name: candidate.entityName,
      confidence,
      sensitivity,
    })
  } else {
    observationEntity = graphEntityInput({
      ...options,
      entityType: 'user',
      name: 'self',
      confidence: 1,
      sensitivity: 'normal',
    })
  }

  entities.push(observationEntity)
  observations.push({
    ...options,
    entityId: observationEntity.id || entityIdFor(observationEntity.entityType, observationEntity.name),
    kind,
    slot: graphSlotFromCandidate(candidate, kind, value),
    value,
    text: candidate.memoryKey === 'user.name' || (kind === 'identity' && looksLikeNameValue(value))
      ? `User's name is ${value}.`
      : text,
    confidence,
    sensitivity,
    status: 'active',
  })

  return { entities, observations, relations }
}

export async function upsertGraphCandidates(options: {
  settings?: AppSettings
  workspace: MemoryWorkspace
  candidates: CaptureCandidate[]
  source: string
  evidence?: string
  sessionId?: string
  messageId?: string
  action?: CanonicalMemoryAuditEvent['action']
}): Promise<GraphMergeResult> {
  const entities = new Map<string, GraphEntityInput>()
  const observations: GraphObservationInput[] = []
  const relations: GraphRelationInput[] = []
  const evidence: GraphEvidenceInput = {
    source: options.source,
    evidence: options.evidence,
    sessionId: options.sessionId,
    messageId: options.messageId,
  }

  ensureUserSelfEntity(options.workspace)
  for (const candidate of options.candidates) {
    const graph = graphInputsFromCandidate(candidate, evidence)
    if (!graph) continue
    for (const entity of graph.entities) {
      const id = entity.id || entityIdFor(entity.entityType, entity.name)
      entities.set(id, { ...entity, id })
    }
    observations.push(...graph.observations)
    relations.push(...graph.relations)
  }

  let applied = 0
  let updated = 0
  let duplicates = 0
  let conflicts = 0
  const savedEntities: MemoryGraphEntity[] = []
  const savedObservations: MemoryGraphObservation[] = []
  const savedRelations: MemoryGraphRelation[] = []

  for (const entity of entities.values()) {
    const result = upsertGraphEntity(options.workspace, entity, { settings: options.settings, action: options.action })
    savedEntities.push(result.entity)
    if (result.action === 'create') applied++
    else if (result.action === 'update') updated++
    else duplicates++
  }

  const seenObservations = new Set<string>()
  for (const observation of observations) {
    const key = `${observation.entityId}:${normalizeRelationType(observation.slot)}:${normalizeForDedupe(observation.value)}`
    if (seenObservations.has(key)) {
      duplicates++
      continue
    }
    seenObservations.add(key)
    const result = await upsertGraphObservation(options.workspace, observation, {
      settings: options.settings,
      action: options.action,
    })
    savedObservations.push(result.observation)
    if (result.action === 'create') applied++
    else if (result.action === 'update') updated++
    else if (result.action === 'conflict') conflicts++
    else duplicates++
  }

  const seenRelations = new Set<string>()
  for (const relation of relations) {
    const key = `${relation.fromEntityId}:${normalizeRelationType(relation.relationType)}:${relation.toEntityId}`
    if (seenRelations.has(key)) {
      duplicates++
      continue
    }
    seenRelations.add(key)
    const result = await upsertGraphRelation(options.workspace, relation, {
      settings: options.settings,
      action: options.action,
    })
    savedRelations.push(result.relation)
    if (result.action === 'create') applied++
    else if (result.action === 'update') updated++
    else duplicates++
  }

  return {
    applied,
    updated,
    duplicates,
    conflicts,
    entities: savedEntities,
    observations: savedObservations,
    relations: savedRelations,
  }
}

export async function mergeGraphMemory(options: {
  workspace: MemoryWorkspace
  settings?: AppSettings
  agentId?: string
  candidates: Array<Pick<CaptureCandidate, 'kind' | 'text'> & Partial<CaptureCandidate>>
  source?: string
  evidence?: string
  sessionId?: string
  messageId?: string
  action?: CanonicalMemoryAuditEvent['action']
}): Promise<{ absolutePath: string; relativePath: string; applied: number; skipped: number; updated: number; conflicts: number }> {
  const startedAt = Date.now()
  const workspace = options.workspace
  if (!workspace.settings.enabled) {
    throw new Error('Soul-memory is disabled in settings')
  }
  if (!workspace.settings.canonicalMemory.enabled) {
    throw new Error('Graph memory is disabled in settings')
  }
  const candidates = options.candidates.map(candidate => ({
    kind: candidate.kind as CaptureCandidateKind,
    source: candidate.source || 'conversation',
    confidence: candidate.confidence ?? workspace.settings.canonicalMemory.highConfidenceThreshold,
    text: candidate.text,
    ...(candidate.memoryKey ? { memoryKey: candidate.memoryKey } : {}),
    ...(candidate.value ? { value: candidate.value } : {}),
    ...(candidate.entityType ? { entityType: candidate.entityType } : {}),
    ...(candidate.entityName ? { entityName: candidate.entityName } : {}),
    ...(candidate.slot ? { slot: candidate.slot } : {}),
    ...(candidate.relationType ? { relationType: candidate.relationType } : {}),
    ...(candidate.fromEntityType ? { fromEntityType: candidate.fromEntityType } : {}),
    ...(candidate.fromEntityName ? { fromEntityName: candidate.fromEntityName } : {}),
    ...(candidate.toEntityType ? { toEntityType: candidate.toEntityType } : {}),
    ...(candidate.toEntityName ? { toEntityName: candidate.toEntityName } : {}),
    sensitivity: candidate.sensitivity || 'normal',
    target: 'memory' as const,
    explicit: candidate.explicit,
  }))
  logMemoryDiagnostic({
    subsystem: 'graph',
    operation: 'merge-memory',
    stage: 'start',
    status: 'started',
    sessionId: options.sessionId,
    request: {
      source: options.source || 'manual',
      candidates: candidates.length,
      action: options.action || 'upsert',
    },
  })
  const result = await upsertGraphCandidates({
    settings: options.settings,
    workspace,
    candidates,
    source: options.source || 'manual',
    evidence: options.evidence,
    sessionId: options.sessionId,
    messageId: options.messageId,
    action: options.action,
  })
  logMemoryDiagnostic({
    subsystem: 'graph',
    operation: 'merge-memory',
    stage: 'finish',
    status: 'ok',
    durationMs: Date.now() - startedAt,
    sessionId: options.sessionId,
    response: {
      source: options.source || 'manual',
      created: result.applied,
      updated: result.updated,
      duplicates: result.duplicates,
      conflicts: result.conflicts,
      entities: result.entities.length,
      observations: result.observations.length,
      relations: result.relations.length,
    },
  })
  return {
    absolutePath: workspace.dbPath,
    relativePath: 'graph memory',
    applied: result.applied + result.updated + result.conflicts,
    skipped: result.duplicates,
    updated: result.updated,
    conflicts: result.conflicts,
  }
}
