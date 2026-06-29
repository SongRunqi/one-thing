import Database from 'better-sqlite3'
import { toJsonObject } from '@onething/core'
import type {
  CanonicalMemoryAuditEvent,
  CaptureCandidate,
  GraphEntityInput,
  GraphEvidenceInput,
  GraphMergeResult,
  GraphObservationInput,
  GraphRelationInput,
  MemoryGraphAuditEvent,
  MemoryGraphDuplicate,
  MemoryGraphEntity,
  MemoryGraphEntityType,
  MemoryGraphObservation,
  MemoryGraphObservationKind,
  MemoryGraphOverview,
  MemoryGraphRelation,
  MemoryGraphStatus,
  MemoryWorkspace,
  SearchHit,
} from './types.js'
import { getDb } from './database.js'
import {
  cosine,
  ftsQuery,
  normalizeForDedupe,
  sha,
  USER_SELF_ENTITY_ID,
} from './workspace.js'
import { logMemoryDiagnostic, type MemoryDiagnosticsLogInput } from './diagnostics-logger.js'
import {
  normalizeSoulMemoryGraphEntityType as coreNormalizeSoulMemoryGraphEntityType,
  normalizeSoulMemoryGraphObservationKind as coreNormalizeSoulMemoryGraphObservationKind,
  normalizeSoulMemoryGraphRelationType as coreNormalizeSoulMemoryGraphRelationType,
  normalizeSoulMemoryGraphStatus as coreNormalizeSoulMemoryGraphStatus,
  isSingletonSoulMemoryGraphObservation as coreIsSingletonSoulMemoryGraphObservation,
  buildSoulMemoryGraphSearchHits as coreBuildSoulMemoryGraphSearchHits,
  formatSoulMemoryGraphSearchContent as coreFormatSoulMemoryGraphSearchContent,
  normalizeSoulMemoryGraphMergeCandidates as coreNormalizeSoulMemoryGraphMergeCandidates,
  planSoulMemoryGraphEntityUpsert as corePlanSoulMemoryGraphEntityUpsert,
  planSoulMemoryGraphEntityDelete as corePlanSoulMemoryGraphEntityDelete,
  planSoulMemoryGraphDuplicateIgnore as corePlanSoulMemoryGraphDuplicateIgnore,
  planSoulMemoryGraphDuplicateMerge as corePlanSoulMemoryGraphDuplicateMerge,
  planSoulMemoryGraphObservationDelete as corePlanSoulMemoryGraphObservationDelete,
  planSoulMemoryGraphObservationUpsert as corePlanSoulMemoryGraphObservationUpsert,
  planSoulMemoryGraphRelationDelete as corePlanSoulMemoryGraphRelationDelete,
  planSoulMemoryGraphRelationUpsert as corePlanSoulMemoryGraphRelationUpsert,
  planSoulMemoryGraphSingletonObservationReconciliation as corePlanSoulMemoryGraphSingletonObservationReconciliation,
  prepareSoulMemoryGraphObservationInput as corePrepareSoulMemoryGraphObservationInput,
  rowToSoulMemoryGraphAuditEvent as coreRowToSoulMemoryGraphAuditEvent,
  rowToSoulMemoryGraphDuplicate as coreRowToSoulMemoryGraphDuplicate,
  rowToSoulMemoryGraphEntity as coreRowToSoulMemoryGraphEntity,
  rowToSoulMemoryGraphObservation as coreRowToSoulMemoryGraphObservation,
  rowToSoulMemoryGraphRelation as coreRowToSoulMemoryGraphRelation,
  selectSoulMemoryGraphObservationDuplicateCandidate as coreSelectSoulMemoryGraphObservationDuplicateCandidate,
  soulMemoryGraphDisplayName as coreSoulMemoryGraphDisplayName,
  soulMemoryGraphEntityIdFor as coreSoulMemoryGraphEntityIdFor,
  soulMemoryGraphEntityInput as coreSoulMemoryGraphEntityInput,
  soulMemoryGraphInputsFromCandidate as coreSoulMemoryGraphInputsFromCandidate,
  soulMemoryGraphSlotFromCandidate as coreSoulMemoryGraphSlotFromCandidate,
  type CoreSoulMemoryGraphAuditRow,
  type CoreSoulMemoryGraphDeletePlan,
  type CoreSoulMemoryGraphDuplicateRow,
  type CoreSoulMemoryGraphDuplicateDecisionPlan,
  type CoreSoulMemoryGraphEvidenceInput,
  type CoreSoulMemoryGraphEntityRow,
  type CoreSoulMemoryGraphObservationRow,
  type CoreSoulMemoryGraphRelationRow,
} from '@onething/runtime/plugins'

export type GraphEmbeddingFn<TSettings = unknown> = (
  settings: TSettings | undefined,
  text: string,
) => Promise<{ embedding?: number[]; provider?: string; model?: string }>

export type MemorySearchEmbeddingFn<TSettings = unknown> = (
  settings: TSettings | undefined,
  values: string[],
) => Promise<{ vectors: number[][] }>

export function normalizeGraphStatus(value?: string): MemoryGraphStatus {
  return coreNormalizeSoulMemoryGraphStatus(value) as MemoryGraphStatus
}

export function normalizeEntityType(value?: string): MemoryGraphEntityType {
  return coreNormalizeSoulMemoryGraphEntityType(value) as MemoryGraphEntityType
}

export function normalizeObservationKind(value?: string): MemoryGraphObservationKind {
  return coreNormalizeSoulMemoryGraphObservationKind(value) as MemoryGraphObservationKind
}

export function normalizeRelationType(value: string): string {
  return coreNormalizeSoulMemoryGraphRelationType(value)
}

export function entityIdFor(type: MemoryGraphEntityType, name: string): string {
  return coreSoulMemoryGraphEntityIdFor(type, name)
}

export function graphDisplayName(value: string): string {
  return coreSoulMemoryGraphDisplayName(value)
}

export function rowToGraphEntity(row: any): MemoryGraphEntity {
  return coreRowToSoulMemoryGraphEntity(row as CoreSoulMemoryGraphEntityRow) as MemoryGraphEntity
}

export function rowToGraphObservation(row: any): MemoryGraphObservation {
  return coreRowToSoulMemoryGraphObservation(row as CoreSoulMemoryGraphObservationRow) as MemoryGraphObservation
}

export function rowToGraphRelation(row: any): MemoryGraphRelation {
  return coreRowToSoulMemoryGraphRelation(row as CoreSoulMemoryGraphRelationRow) as MemoryGraphRelation
}

export function rowToGraphDuplicate(row: any): MemoryGraphDuplicate {
  return coreRowToSoulMemoryGraphDuplicate(row as CoreSoulMemoryGraphDuplicateRow) as MemoryGraphDuplicate
}

export function rowToGraphAuditEvent(row: any): MemoryGraphAuditEvent {
  return coreRowToSoulMemoryGraphAuditEvent(row as CoreSoulMemoryGraphAuditRow) as MemoryGraphAuditEvent
}

export function appendMemoryEvent(
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

export function upsertGraphEntity<TSettings = unknown>(
  workspace: MemoryWorkspace,
  input: GraphEntityInput,
  options: { settings?: TSettings; action?: CanonicalMemoryAuditEvent['action'] } = {},
): { entity: MemoryGraphEntity; action: 'create' | 'update' | 'duplicate' } {
  const database = getDb(workspace)
  const now = Date.now()
  const lookupEntityType = normalizeEntityType(input.entityType)
  const lookupName = graphDisplayName(input.name || input.displayName || lookupEntityType)
  const id = input.id || entityIdFor(lookupEntityType, lookupName)
  const existing = database.prepare('SELECT * FROM memory_entities WHERE id = ? AND deleted_at IS NULL').get(id) as any
  const plan = corePlanSoulMemoryGraphEntityUpsert({
    input,
    existing: existing ? rowToGraphEntity(existing) : null,
    now,
    highConfidenceThreshold: workspace.settings.canonicalMemory.highConfidenceThreshold,
  })

  if (plan.action === 'create') {
    const entity = plan.entity as MemoryGraphEntity
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
      syncGraphFts(database, 'entity', entity.id, plan.ftsContent)
      appendGraphEvidence(database, 'entity', entity.id, input)
      appendMemoryEvent(database, entity.id, options.action || 'create', { input })
    })
    tx()
    return { entity, action: 'create' }
  }

  const entity = rowToGraphEntity(existing)
  if (plan.action === 'duplicate') {
    appendMemoryEvent(database, entity.id, 'duplicate', { input })
    return { entity, action: 'duplicate' }
  }

  const updated = plan.entity as MemoryGraphEntity
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
    syncGraphFts(database, 'entity', updated.id, plan.ftsContent)
    appendGraphEvidence(database, 'entity', updated.id, input)
    appendMemoryEvent(database, updated.id, options.action || 'update', { input, previous: entity })
  })
  tx()
  return { entity: updated, action: 'update' }
}

export function isSingletonGraphObservation(kind: MemoryGraphObservationKind, slot: string): boolean {
  return coreIsSingletonSoulMemoryGraphObservation(kind, slot)
}

export async function upsertGraphObservation<TSettings = unknown>(
  workspace: MemoryWorkspace,
  input: GraphObservationInput,
  options: { settings?: TSettings; action?: CanonicalMemoryAuditEvent['action']; graphEmbedding?: GraphEmbeddingFn<TSettings> } = {},
): Promise<{ observation: MemoryGraphObservation; action: 'create' | 'update' | 'duplicate' | 'conflict' }> {
  const database = getDb(workspace)
  const now = Date.now()
  const prepared = corePrepareSoulMemoryGraphObservationInput({
    input,
    now,
    highConfidenceThreshold: workspace.settings.canonicalMemory.highConfidenceThreshold,
  })
  let existingById: MemoryGraphObservation | null = null
  if (input.id) {
    existingById = getGraphObservationById(workspace, input.id, true)
  }
  const existingExact = existingById ? null : database.prepare(`
    SELECT o.*, e.display_name AS entity_display_name
    FROM memory_observations o
    LEFT JOIN memory_entities e ON e.id = o.entity_id
    WHERE o.entity_id = ? AND o.slot = ? AND o.normalized_text = ? AND o.deleted_at IS NULL
    LIMIT 1
  `).get(prepared.entityId, prepared.slot, prepared.normalizedText) as any

  const activeSameSlot = existingById || existingExact ? null : database.prepare(`
    SELECT o.*, e.display_name AS entity_display_name
    FROM memory_observations o
    LEFT JOIN memory_entities e ON e.id = o.entity_id
    WHERE o.entity_id = ? AND o.slot = ? AND o.deleted_at IS NULL AND o.status = 'active'
    ORDER BY o.updated_at DESC
    LIMIT 1
  `).get(prepared.entityId, prepared.slot) as any

  const plan = corePlanSoulMemoryGraphObservationUpsert({
    prepared,
    existingById,
    existingExact: existingExact ? rowToGraphObservation(existingExact) : null,
    activeSameSlot: activeSameSlot ? rowToGraphObservation(activeSameSlot) : null,
  })

  if (plan.action === 'update') {
    const embedding = options.graphEmbedding ? await options.graphEmbedding(options.settings, plan.embeddingInput) : {}
    const updated = plan.observation as MemoryGraphObservation
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
        plan.normalizedText,
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
      syncGraphFts(database, 'observation', updated.id, plan.ftsContent)
      appendGraphEvidence(database, 'observation', updated.id, input)
      appendMemoryEvent(database, updated.id, options.action || 'update', { input, previous: existingById })
    })
    tx()
    return { observation: updated, action: 'update' }
  }

  if (plan.action === 'duplicate') {
    const observation = plan.observation as MemoryGraphObservation
    if (plan.duplicateReason) {
      const tx = database.transaction(() => {
        database.prepare(`
          UPDATE memory_observations SET confidence = ?, evidence = ?, updated_at = ? WHERE id = ?
        `).run(observation.confidence, observation.evidence || null, observation.updatedAt, observation.id)
        appendGraphEvidence(database, 'observation', observation.id, input)
        appendMemoryEvent(database, observation.id, 'duplicate', { input, duplicateReason: plan.duplicateReason })
      })
      tx()
      return { observation, action: 'duplicate' }
    }
    appendMemoryEvent(database, observation.id, 'duplicate', { input })
    appendGraphEvidence(database, 'observation', observation.id, input)
    return { observation, action: 'duplicate' }
  }

  const embedding = options.graphEmbedding ? await options.graphEmbedding(options.settings, plan.embeddingInput) : {}
  const observation = plan.observation as MemoryGraphObservation
  const tx = database.transaction(() => {
    if (plan.action === 'conflict' && plan.supersededObservation) {
      database.prepare(`
        UPDATE memory_observations SET status = 'superseded', updated_at = ? WHERE id = ?
      `).run(now, plan.supersededObservation.id)
      appendMemoryEvent(database, plan.supersededObservation.id, 'conflict', { supersededBy: observation.id, input })
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
      plan.normalizedText,
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
    syncGraphFts(database, 'observation', observation.id, plan.ftsContent)
    appendGraphEvidence(database, 'observation', observation.id, input)
    appendMemoryEvent(database, observation.id, plan.action === 'conflict' ? 'conflict' : (options.action || 'create'), {
      input,
      ...(plan.action === 'conflict' && plan.supersededObservation ? { previous: plan.supersededObservation } : {}),
    })
  })
  tx()
  maybeRecordObservationDuplicate(database, workspace, observation, plan.normalizedText)
  return { observation, action: plan.action }
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
  const best = coreSelectSoulMemoryGraphObservationDuplicateCandidate({
    normalizedText,
    candidates: rows.map(row => ({
      id: row.id,
      text: row.text,
      normalizedText: row.normalized_text,
    })),
    threshold: workspace.settings.canonicalMemory.semanticDedupeThreshold,
  })
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
    best.reason,
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
  const actions = corePlanSoulMemoryGraphSingletonObservationReconciliation(rows.map(rowToGraphObservation))

  const now = Date.now()
  const tx = database.transaction(() => {
    for (const action of actions) {
      database.prepare(`
        UPDATE memory_observations
        SET status = 'superseded', updated_at = ?
        WHERE id = ? AND status = 'active'
      `).run(now, action.observationId)
      appendMemoryEvent(database, action.observationId, 'conflict', {
        supersededBy: action.supersededBy,
        reason: action.reason,
        entityId: action.entityId,
        kind: action.kind,
        slot: action.slot,
      })
    }
  })
  tx()
  const superseded = actions.length
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

export async function upsertGraphRelation<TSettings = unknown>(
  workspace: MemoryWorkspace,
  input: GraphRelationInput,
  options: { settings?: TSettings; action?: CanonicalMemoryAuditEvent['action']; graphEmbedding?: GraphEmbeddingFn<TSettings> } = {},
): Promise<{ relation: MemoryGraphRelation; action: 'create' | 'update' | 'duplicate' }> {
  const database = getDb(workspace)
  const now = Date.now()
  const relationType = normalizeRelationType(input.relationType)
  let existingById: MemoryGraphRelation | null = null
  if (input.id) {
    existingById = getGraphRelationById(workspace, input.id, true)
  }
  const existing = existingById ? null : database.prepare(`
    SELECT r.*, from_e.display_name AS from_display_name, to_e.display_name AS to_display_name
    FROM memory_relations r
    LEFT JOIN memory_entities from_e ON from_e.id = r.from_entity_id
    LEFT JOIN memory_entities to_e ON to_e.id = r.to_entity_id
    WHERE r.from_entity_id = ? AND r.relation_type = ? AND r.to_entity_id = ?
      AND r.deleted_at IS NULL AND r.status = 'active'
    LIMIT 1
  `).get(input.fromEntityId, relationType, input.toEntityId) as any

  const fromEntity = getGraphEntityById(workspace, input.fromEntityId, true)
  const toEntity = getGraphEntityById(workspace, input.toEntityId, true)
  const plan = corePlanSoulMemoryGraphRelationUpsert({
    input,
    existingById,
    existingRelation: existing ? rowToGraphRelation(existing) : null,
    fromDisplayName: fromEntity?.displayName,
    toDisplayName: toEntity?.displayName,
    now,
    highConfidenceThreshold: workspace.settings.canonicalMemory.highConfidenceThreshold,
  })

  if (plan.action === 'update') {
    const embedding = options.graphEmbedding ? await options.graphEmbedding(options.settings, plan.embeddingInput) : {}
    const updated = plan.relation as MemoryGraphRelation
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
      syncGraphFts(database, 'relation', updated.id, plan.ftsContent)
      appendGraphEvidence(database, 'relation', updated.id, input)
      appendMemoryEvent(database, updated.id, options.action || 'update', { input, previous: existingById })
    })
    tx()
    return { relation: updated, action: 'update' }
  }

  if (plan.action === 'duplicate') {
    const relation = plan.relation as MemoryGraphRelation
    appendMemoryEvent(database, relation.id, 'duplicate', { input })
    appendGraphEvidence(database, 'relation', relation.id, input)
    return { relation, action: 'duplicate' }
  }

  const embedding = options.graphEmbedding ? await options.graphEmbedding(options.settings, plan.embeddingInput) : {}
  const relation = plan.relation as MemoryGraphRelation
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
    syncGraphFts(database, 'relation', relation.id, plan.ftsContent)
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
  return coreFormatSoulMemoryGraphSearchContent(owner, entityId => graphEntityLabel(workspace, entityId))
}

export async function searchGraphMemory<TSettings = unknown>(options: {
  settings?: TSettings
  workspace: MemoryWorkspace
  database?: Database.Database
  query: string
  limit: number
  minScore?: number
  embedTexts?: MemorySearchEmbeddingFn<TSettings>
  setLastError?: (message: string) => void
  logDiagnostic?: (input: MemoryDiagnosticsLogInput) => void
}): Promise<SearchHit[]> {
  if (!options.workspace.settings.canonicalMemory.enabled) return []
  const database = options.database || getDb(options.workspace)
  const candidates = new Map<string, {
    ownerType: 'entity' | 'observation' | 'relation'
    ownerId: string
    content: string
    keywordScore?: number
    vectorScore?: number
  }>()

  try {
    const rows = database.prepare(`
      SELECT owner_type, owner_id, content, bm25(graph_memory_fts) AS rank
      FROM graph_memory_fts
      WHERE graph_memory_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery(options.query), options.limit * 10) as any[]
    rows.forEach((row, index) => {
      const owner = getGraphMemoryByIdentifier(options.workspace, `${row.owner_type}:${row.owner_id}`)
      if (!owner) return
      candidates.set(`${row.owner_type}:${row.owner_id}`, {
        ownerType: row.owner_type,
        ownerId: row.owner_id,
        content: graphSearchContent(options.workspace, owner),
        keywordScore: 1 / (index + 1),
      })
    })
  } catch {
    const pattern = `%${options.query.replace(/[%_]/g, '')}%`
    const rows = [
      ...database.prepare(`
        SELECT 'entity' AS owner_type, id AS owner_id
        FROM memory_entities
        WHERE deleted_at IS NULL AND (id LIKE ? OR entity_type LIKE ? OR name LIKE ? OR display_name LIKE ? OR aliases_json LIKE ?)
        LIMIT ?
      `).all(pattern, pattern, pattern, pattern, pattern, options.limit * 4) as any[],
      ...database.prepare(`
        SELECT 'observation' AS owner_type, id AS owner_id
        FROM memory_observations
        WHERE deleted_at IS NULL AND (entity_id LIKE ? OR kind LIKE ? OR slot LIKE ? OR value LIKE ? OR text LIKE ?)
        LIMIT ?
      `).all(pattern, pattern, pattern, pattern, pattern, options.limit * 4) as any[],
      ...database.prepare(`
        SELECT 'relation' AS owner_type, id AS owner_id
        FROM memory_relations
        WHERE deleted_at IS NULL AND (from_entity_id LIKE ? OR relation_type LIKE ? OR to_entity_id LIKE ? OR text LIKE ?)
        LIMIT ?
      `).all(pattern, pattern, pattern, pattern, options.limit * 4) as any[],
    ]
    rows.forEach((row, index) => {
      const owner = getGraphMemoryByIdentifier(options.workspace, `${row.owner_type}:${row.owner_id}`)
      if (!owner) return
      candidates.set(`${row.owner_type}:${row.owner_id}`, {
        ownerType: row.owner_type,
        ownerId: row.owner_id,
        content: graphSearchContent(options.workspace, owner),
        keywordScore: 1 / (index + 1),
      })
    })
  }

  if (options.workspace.settings.embeddings?.enabled === true && options.embedTexts) {
    try {
      const queryEmbedding = (await options.embedTexts(options.settings, [options.query])).vectors[0]
      const rows = [
        ...database.prepare(`
          SELECT 'observation' AS owner_type, id AS owner_id, embedding_json
          FROM memory_observations
          WHERE deleted_at IS NULL AND embedding_json IS NOT NULL
        `).all() as any[],
        ...database.prepare(`
          SELECT 'relation' AS owner_type, id AS owner_id, embedding_json
          FROM memory_relations
          WHERE deleted_at IS NULL AND embedding_json IS NOT NULL
        `).all() as any[],
      ]
      const scored = rows
        .map(row => {
          let embedding: number[] | undefined
          try {
            embedding = JSON.parse(row.embedding_json)
          } catch {
            embedding = undefined
          }
          return { row, vectorScore: (cosine(queryEmbedding, embedding) + 1) / 2 }
        })
        .filter(item => item.vectorScore > 0)
        .sort((left, right) => right.vectorScore - left.vectorScore)
        .slice(0, options.limit * 10)
      for (const item of scored) {
        const key = `${item.row.owner_type}:${item.row.owner_id}`
        const owner = getGraphMemoryByIdentifier(options.workspace, key)
        if (!owner) continue
        const existing = candidates.get(key)
        candidates.set(key, {
          ownerType: item.row.owner_type,
          ownerId: item.row.owner_id,
          content: existing?.content || graphSearchContent(options.workspace, owner),
          keywordScore: existing?.keywordScore,
          vectorScore: item.vectorScore,
        })
      }
    } catch (error: any) {
      options.setLastError?.(`Graph vector search unavailable; using FTS only: ${error?.message || String(error)}`)
      options.logDiagnostic?.({
        subsystem: 'search',
        operation: 'graph-search',
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

  return coreBuildSoulMemoryGraphSearchHits<SearchHit>({
    candidates: Array.from(candidates.values()),
    minScore: options.minScore,
    limit: options.limit,
  })
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

export function applyGraphDecisionPlan(
  database: Database.Database,
  plan: CoreSoulMemoryGraphDuplicateDecisionPlan | CoreSoulMemoryGraphDeletePlan,
): void {
  for (const operation of plan.operations) {
    switch (operation.type) {
      case 'reassign-observation-entity':
        database.prepare('UPDATE memory_observations SET entity_id = ?, updated_at = ? WHERE entity_id = ?')
          .run(operation.targetId, operation.updatedAt, operation.sourceId)
        break
      case 'reassign-relation-from-entity':
        database.prepare('UPDATE memory_relations SET from_entity_id = ?, updated_at = ? WHERE from_entity_id = ?')
          .run(operation.targetId, operation.updatedAt, operation.sourceId)
        break
      case 'reassign-relation-to-entity':
        database.prepare('UPDATE memory_relations SET to_entity_id = ?, updated_at = ? WHERE to_entity_id = ?')
          .run(operation.targetId, operation.updatedAt, operation.sourceId)
        break
      case 'soft-delete-entity':
        database.prepare('UPDATE memory_entities SET deleted_at = ?, updated_at = ? WHERE id = ?')
          .run(operation.deletedAt, operation.deletedAt, operation.id)
        break
      case 'soft-delete-observation':
        database.prepare('UPDATE memory_observations SET status = ?, deleted_at = ?, updated_at = ? WHERE id = ?')
          .run(operation.status, operation.deletedAt, operation.deletedAt, operation.id)
        break
      case 'soft-delete-observations-by-entity':
        database.prepare('UPDATE memory_observations SET deleted_at = ?, status = ?, updated_at = ? WHERE entity_id = ?')
          .run(operation.deletedAt, operation.status, operation.deletedAt, operation.entityId)
        break
      case 'soft-delete-relation':
        database.prepare('UPDATE memory_relations SET status = ?, deleted_at = ?, updated_at = ? WHERE id = ?')
          .run(operation.status, operation.deletedAt, operation.deletedAt, operation.id)
        break
      case 'soft-delete-relations-by-entity':
        database.prepare('UPDATE memory_relations SET deleted_at = ?, status = ?, updated_at = ? WHERE from_entity_id = ? OR to_entity_id = ?')
          .run(operation.deletedAt, operation.status, operation.deletedAt, operation.entityId, operation.entityId)
        break
    }
  }

  for (const ftsDelete of plan.ftsDeletes) {
    if (ftsDelete.mode === 'owner-or-id') {
      database.prepare('DELETE FROM graph_memory_fts WHERE owner_id = ? OR id = ?').run(ftsDelete.ownerId, ftsDelete.id)
    } else {
      syncGraphFts(database, ftsDelete.ownerKind, ftsDelete.ownerId, null)
    }
  }

  if ('duplicateStatus' in plan) {
    database.prepare('UPDATE memory_possible_duplicates SET status = ?, updated_at = ? WHERE id = ?')
      .run(plan.duplicateStatus.status, plan.duplicateStatus.updatedAt, plan.duplicateStatus.id)
  }

  for (const event of plan.auditEvents) {
    appendMemoryEvent(database, event.memoryId, event.action, event.payload)
  }
}

export function deleteGraphEntity(workspace: MemoryWorkspace, id: string): void {
  const entity = getGraphEntityById(workspace, id, true)
  if (!entity) throw new Error('Graph entity not found')
  const database = getDb(workspace)
  const plan = corePlanSoulMemoryGraphEntityDelete(entity, Date.now())
  database.transaction(() => applyGraphDecisionPlan(database, plan))()
}

export function deleteGraphObservation(workspace: MemoryWorkspace, id: string): void {
  const observation = getGraphObservationById(workspace, id, true)
  if (!observation) throw new Error('Graph observation not found')
  const database = getDb(workspace)
  const plan = corePlanSoulMemoryGraphObservationDelete(observation, Date.now())
  database.transaction(() => applyGraphDecisionPlan(database, plan))()
}

export function deleteGraphRelation(workspace: MemoryWorkspace, id: string): void {
  const relation = getGraphRelationById(workspace, id, true)
  if (!relation) throw new Error('Graph relation not found')
  const database = getDb(workspace)
  const plan = corePlanSoulMemoryGraphRelationDelete(relation, Date.now())
  database.transaction(() => applyGraphDecisionPlan(database, plan))()
}

export function mergeGraphDuplicate(workspace: MemoryWorkspace, id: string): void {
  const database = getDb(workspace)
  const duplicate = database.prepare(`
    SELECT * FROM memory_possible_duplicates WHERE id = ? AND status = 'pending' LIMIT 1
  `).get(id) as CoreSoulMemoryGraphDuplicateRow | undefined
  if (!duplicate) throw new Error('Possible duplicate not found')
  const plan = corePlanSoulMemoryGraphDuplicateMerge(duplicate, Date.now())
  database.transaction(() => applyGraphDecisionPlan(database, plan))()
}

export function ignoreGraphDuplicate(workspace: MemoryWorkspace, id: string): void {
  const database = getDb(workspace)
  const duplicate = database.prepare(`
    SELECT * FROM memory_possible_duplicates WHERE id = ? AND status = 'pending' LIMIT 1
  `).get(id) as CoreSoulMemoryGraphDuplicateRow | undefined
  if (!duplicate) throw new Error('Possible duplicate not found')
  const plan = corePlanSoulMemoryGraphDuplicateIgnore(duplicate, Date.now())
  database.transaction(() => applyGraphDecisionPlan(database, plan))()
}

export function getGraphAudit(workspace: MemoryWorkspace, id: string): MemoryGraphAuditEvent[] {
  const clean = id.replace(/^(entity|observation|relation):/i, '')
  const rows = getDb(workspace).prepare(`
    SELECT * FROM memory_events WHERE memory_id = ? ORDER BY created_at DESC LIMIT 200
  `).all(clean) as any[]
  return rows.map(rowToGraphAuditEvent)
}

export function graphSlotFromCandidate(candidate: CaptureCandidate, kind: MemoryGraphObservationKind, value: string): string {
  return coreSoulMemoryGraphSlotFromCandidate(candidate, kind, value)
}

export function graphEntityInput(options: GraphEvidenceInput & {
  entityType: MemoryGraphEntityType
  name: string
  displayName?: string
  confidence?: number
  sensitivity?: 'normal' | 'sensitive' | 'secret'
}): GraphEntityInput {
  return coreSoulMemoryGraphEntityInput(options) as GraphEntityInput
}

export function graphInputsFromCandidate(
  candidate: CaptureCandidate,
  options: GraphEvidenceInput,
): { entities: GraphEntityInput[]; observations: GraphObservationInput[]; relations: GraphRelationInput[] } | null {
  return coreSoulMemoryGraphInputsFromCandidate(
    candidate,
    options as CoreSoulMemoryGraphEvidenceInput,
  ) as { entities: GraphEntityInput[]; observations: GraphObservationInput[]; relations: GraphRelationInput[] } | null
}

export async function upsertGraphCandidates<TSettings = unknown>(options: {
  settings?: TSettings
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
    const result = upsertGraphEntity(options.workspace, entity, { action: options.action })
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

export async function mergeGraphMemory<TSettings = unknown>(options: {
  workspace: MemoryWorkspace
  settings?: TSettings
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
  const candidates = coreNormalizeSoulMemoryGraphMergeCandidates(
    options.candidates,
    workspace.settings.canonicalMemory.highConfidenceThreshold,
  ) as CaptureCandidate[]
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
