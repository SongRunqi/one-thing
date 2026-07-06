import type { JsonObject } from '../json.js'
import type { SoulMemorySettings } from './settings.js'

export type MemoryManagedFileKind = 'soul' | 'user' | 'memory' | 'dreams' | 'daily'
export type CanonicalMemoryKind = 'identity' | 'preference' | 'decision' | 'project' | 'constraint' | 'fact'
export type MemoryGraphEntityType = 'user' | 'project' | 'tech' | 'component' | 'decision' | 'concept' | 'person' | 'organization'
export type MemoryGraphObservationKind = CanonicalMemoryKind | 'summary' | 'episodic'
export type MemoryGraphStatus = 'active' | 'superseded' | 'conflict' | 'deleted'
export type MemoryGraphDuplicateStatus = 'pending' | 'merged' | 'ignored'
export type MemoryDiagnosticLevel = 'debug' | 'info' | 'warn' | 'error'
export type MemoryDiagnosticSubsystem =
  | 'embedding'
  | 'index'
  | 'search'
  | 'capture'
  | 'graph'
  | 'daily'
  | 'active-memory'
  | 'flush'
  | 'review'
  | 'dreaming'
  | 'scheduler'
  | 'ipc'
export type MemoryDiagnosticStatus = 'started' | 'ok' | 'error' | 'skipped' | 'fallback'

export interface MemoryDiagnosticLogEntry {
  id: string
  timestamp: number
  level: MemoryDiagnosticLevel
  subsystem: MemoryDiagnosticSubsystem
  operation: string
  stage: string
  status: MemoryDiagnosticStatus
  summary?: string
  durationMs?: number
  sessionId?: string
  runId?: string
  request?: JsonObject
  response?: JsonObject
  error?: JsonObject
  metadata?: JsonObject
}

export interface MemoryLogsListRequest {
  limit?: number
  query?: string
  level?: MemoryDiagnosticLevel | 'all'
  subsystem?: MemoryDiagnosticSubsystem | 'all'
  status?: MemoryDiagnosticStatus | 'all'
  since?: number
}

export interface MemoryLogsListResponse {
  success: boolean
  entries?: MemoryDiagnosticLogEntry[]
  total?: number
  logDir?: string
  error?: string
}

export interface MemoryLogsStatsResponse {
  success: boolean
  stats?: {
    logDir: string
    files: number
    entriesInBuffer: number
    retainedDays: number
    oldestFile?: string
    newestFile?: string
    byLevel: Record<string, number>
    bySubsystem: Record<string, number>
    lastError?: string
  }
  error?: string
}

export interface MemoryLogsCleanupResponse {
  success: boolean
  deleted?: string[]
  error?: string
}

export interface MemoryManagedFile {
  absolutePath: string
  relativePath: string
  kind: MemoryManagedFileKind
  date?: string
  size: number
  mtimeMs: number
  lineCount: number
  preview: string
}

export interface MemoryIndexStatus {
  indexedFiles: number
  indexedChunks: number
  ftsTokenizer: string
  embeddingProvider?: string
  embeddingModel?: string
  lastIndexedAt?: number
  lastError?: string
  lastFlushAt?: number
  lastFlushError?: string
  lastCaptureAt?: number
  lastCaptureError?: string
  lastCaptureStatus?: string
  lastReviewAt?: number
  lastReviewError?: string
  lastReviewStatus?: string
  lastReviewTurn?: number
  lastReviewApplied?: number
  lastDreamingAt?: number
  lastDreamingError?: string
  lastDreamingApplied?: number
  lastDreamingStatus?: string
  lastDreamingSourceFiles?: string[]
  lastDreamingNextRunAt?: number
}

export interface MemoryGraphOverview {
  entities: number
  observations: number
  relations: number
  pendingDuplicates: number
  userEntity?: MemoryGraphEntity
}

export interface MemoryDreamingStatus {
  enabled: boolean
  frequency: string
  timezone?: string
  model?: string
  sources?: string[]
  lookbackDays?: number
  maxSourceFiles?: number
  maxSessions?: number
  maxMessagesPerSession?: number
  maxPromotions?: number
  timeoutMs?: number
  nextRunAt?: number
  lastRunAt?: number
  lastApplied?: number
  lastStatus?: string
  lastError?: string
  lastSourceFiles: string[]
  inFlight?: boolean
}

export interface MemoryCapturePending {
  id: string
  sessionId: string
  agentId?: string
  createdAt: number
  target: 'daily' | 'memory'
  heading: string
  content: string
  confidence: number
  explicit: boolean
  reason?: string
  userPreview: string
  assistantPreview: string
}

export interface MemoryOverview {
  enabled: boolean
  agentId?: string
  root: string
  memoryDir: string
  soulPath: string
  userPath: string
  memoryPath: string
  dreamsPath: string
  todayPath: string
  dbPath: string
  settings: Required<SoulMemorySettings>
  status: MemoryIndexStatus
  dreaming: MemoryDreamingStatus
  pendingCaptures: MemoryCapturePending[]
  canonicalCount?: number
  graph?: MemoryGraphOverview
  files: MemoryManagedFile[]
}

export interface MemoryReadRequest {
  path: string
  agentId?: string
  startLine?: number
  endLine?: number
  lines?: number
  full?: boolean
}

export interface MemoryReadResponse {
  success: boolean
  file?: {
    relativePath: string
    text: string
    startLine: number
    endLine: number
    totalLines: number
    truncated: boolean
  }
  error?: string
}

export interface MemorySearchHit {
  id: string
  path: string
  kind: 'memory' | 'daily' | 'canonical' | 'graph'
  date?: string
  chunkIndex: number
  startLine: number
  endLine: number
  content: string
  score: number
  keywordScore?: number
  vectorScore?: number
}

export interface MemorySearchRequest {
  query: string
  agentId?: string
  limit?: number | string
  memoryScopeId?: string
}

export interface MemorySearchResponse {
  success: boolean
  hits?: MemorySearchHit[]
  error?: string
}

export interface MemoryAppendRequest {
  content: string
  agentId?: string
  target?: 'daily'
  heading?: string
  memoryScopeId?: string
}

export interface MemoryAppendResponse {
  success: boolean
  target?: {
    absolutePath: string
    relativePath: string
  }
  error?: string
}

export interface MemoryOverviewResponse {
  success: boolean
  overview?: MemoryOverview
  error?: string
}

export interface MemoryIndexResponse {
  success: boolean
  status?: MemoryIndexStatus
  error?: string
}

export interface MemoryCaptureDecisionRequest {
  id?: string
}

export interface MemoryCaptureDecisionResponse {
  success: boolean
  target?: {
    absolutePath: string
    relativePath: string
  }
  error?: string
}

export interface MemorySaveFileRequest {
  path: string
  content: string
  agentId?: string
}

export interface MemorySaveFileResponse {
  success: boolean
  file?: {
    absolutePath: string
    relativePath: string
  }
  error?: string
}

export interface MemoryRunDreamingResponse {
  success: boolean
  result?: {
    status: string
    applied: number
    sourceFiles: string[]
    report: string
    memory: string
    runAt: number
    nextRunAt?: number
  } | null
  error?: string
}

export interface CanonicalMemoryRecord {
  id: string
  memoryKey: string
  kind: CanonicalMemoryKind
  subject: string
  value: string
  text: string
  confidence: number
  sensitivity: 'normal' | 'sensitive' | 'secret'
  source: string
  evidence?: string
  sessionId?: string
  messageId?: string
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface CanonicalMemoryAuditEvent {
  id: string
  memoryId: string
  action: 'create' | 'update' | 'delete' | 'restore' | 'duplicate' | 'migrate' | 'conflict' | 'merge' | 'ignore'
  createdAt: number
  payload: JsonObject
}

export interface MemoryGraphEntity {
  id: string
  entityType: MemoryGraphEntityType
  name: string
  displayName: string
  aliases: string[]
  confidence: number
  sensitivity: 'normal' | 'sensitive' | 'secret'
  source: string
  evidence?: string
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface MemoryGraphObservation {
  id: string
  entityId: string
  entityDisplayName?: string
  kind: MemoryGraphObservationKind
  slot: string
  value: string
  text: string
  confidence: number
  sensitivity: 'normal' | 'sensitive' | 'secret'
  source: string
  evidence?: string
  sessionId?: string
  messageId?: string
  status: MemoryGraphStatus
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface MemoryGraphRelation {
  id: string
  fromEntityId: string
  fromDisplayName?: string
  relationType: string
  toEntityId: string
  toDisplayName?: string
  text: string
  confidence: number
  sensitivity: 'normal' | 'sensitive' | 'secret'
  source: string
  evidence?: string
  sessionId?: string
  messageId?: string
  status: MemoryGraphStatus
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface MemoryGraphDuplicate {
  id: string
  kind: 'entity' | 'observation' | 'relation'
  sourceId: string
  targetId: string
  score: number
  reason: string
  status: MemoryGraphDuplicateStatus
  createdAt: number
  updatedAt: number
}

export interface MemoryGraphAuditEvent {
  id: string
  memoryId: string
  action: CanonicalMemoryAuditEvent['action']
  createdAt: number
  payload: JsonObject
}

export interface MemoryGraphListRequest {
  agentId?: string
  query?: string
  includeDeleted?: boolean
  limit?: number
}

export interface MemoryGraphEntityUpsertRequest {
  agentId?: string
  id?: string
  entityType: MemoryGraphEntityType
  name: string
  displayName?: string
  aliases?: string[]
  confidence?: number
  sensitivity?: 'normal' | 'sensitive' | 'secret'
  evidence?: string
}

export interface MemoryGraphObservationUpsertRequest {
  agentId?: string
  id?: string
  entityId: string
  kind: MemoryGraphObservationKind
  slot: string
  value: string
  text?: string
  confidence?: number
  sensitivity?: 'normal' | 'sensitive' | 'secret'
  evidence?: string
  status?: MemoryGraphStatus
}

export interface MemoryGraphRelationUpsertRequest {
  agentId?: string
  id?: string
  fromEntityId: string
  relationType: string
  toEntityId: string
  text?: string
  confidence?: number
  sensitivity?: 'normal' | 'sensitive' | 'secret'
  evidence?: string
  status?: MemoryGraphStatus
}

export interface MemoryGraphDeleteRequest {
  agentId?: string
  id: string
}

export interface MemoryGraphDuplicateDecisionRequest {
  agentId?: string
  id: string
}

export interface MemoryGraphAuditRequest {
  agentId?: string
  id: string
}

export interface MemoryGraphOverviewResponse {
  success: boolean
  overview?: MemoryGraphOverview
  error?: string
}

export interface MemoryGraphEntitiesResponse {
  success: boolean
  entities?: MemoryGraphEntity[]
  error?: string
}

export interface MemoryGraphEntityResponse {
  success: boolean
  entity?: MemoryGraphEntity
  error?: string
}

export interface MemoryGraphObservationsResponse {
  success: boolean
  observations?: MemoryGraphObservation[]
  error?: string
}

export interface MemoryGraphObservationResponse {
  success: boolean
  observation?: MemoryGraphObservation
  error?: string
}

export interface MemoryGraphRelationsResponse {
  success: boolean
  relations?: MemoryGraphRelation[]
  error?: string
}

export interface MemoryGraphRelationResponse {
  success: boolean
  relation?: MemoryGraphRelation
  error?: string
}

export interface MemoryGraphDuplicatesResponse {
  success: boolean
  duplicates?: MemoryGraphDuplicate[]
  error?: string
}

export interface MemoryGraphAuditResponse {
  success: boolean
  events?: MemoryGraphAuditEvent[]
  error?: string
}

export interface MemoryProfileListRequest {
  agentId?: string
  query?: string
  includeDeleted?: boolean
  limit?: number
  memoryScopeId?: string
}

export interface MemoryProfileListResponse {
  success: boolean
  memories?: CanonicalMemoryRecord[]
  error?: string
}

export interface MemoryProfileUpsertRequest {
  agentId?: string
  id?: string
  memoryKey?: string
  kind: CanonicalMemoryKind
  subject?: string
  value: string
  text?: string
  confidence?: number
  sensitivity?: 'normal' | 'sensitive' | 'secret'
  evidence?: string
  memoryScopeId?: string
}

export interface MemoryProfileUpsertResponse {
  success: boolean
  memory?: CanonicalMemoryRecord
  error?: string
}

export interface MemoryProfileDeleteRequest {
  agentId?: string
  id: string
}

export interface MemoryProfileDeleteResponse {
  success: boolean
  error?: string
}

export interface MemoryProfileAuditRequest {
  agentId?: string
  id: string
}

export interface MemoryProfileAuditResponse {
  success: boolean
  events?: CanonicalMemoryAuditEvent[]
  error?: string
}

export interface MemoryProfileExportResponse {
  success: boolean
  markdown?: string
  error?: string
}
