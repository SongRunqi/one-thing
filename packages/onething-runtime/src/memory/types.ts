import type {
  CoreCanonicalMemoryKind,
  CoreAppSettingsWithSoulMemory,
  CoreCaptureCandidate,
  CoreCaptureCandidateKind,
  CoreSoulMemoryCanonicalMemoryRecord,
  CoreSoulMemoryGraphDuplicate,
  CoreSoulMemoryGraphEntity,
  CoreSoulMemoryGraphEntityType,
  CoreSoulMemoryGraphObservation,
  CoreSoulMemoryGraphObservationKind,
  CoreSoulMemoryGraphRelation,
  CoreSoulMemoryGraphStatus,
} from '../plugins/index.js'
import type { JsonObject } from '@onething/core'

export interface SoulMemoryActiveSettings {
  enabled?: boolean
  queryMode?: 'message' | 'recent' | 'full'
  promptStyle?: 'balanced' | 'strict' | 'contextual' | 'recall-heavy' | 'precision-heavy' | 'preference-only'
  timeoutMs?: number
  cacheTtlMs?: number
  maxSummaryChars?: number
  recentUserTurns?: number
  recentAssistantTurns?: number
  recentUserChars?: number
  recentAssistantChars?: number
  circuitBreakerMaxTimeouts?: number
  circuitBreakerCooldownMs?: number
}

export interface SoulMemorySearchSettings {
  enabled?: boolean
  chunkTokens?: number
  chunkOverlap?: number
  maxResults?: number
  mmrEnabled?: boolean
  temporalDecayHalfLifeDays?: number
}

export interface SoulMemoryEmbeddingSettings {
  enabled?: boolean
  providerId?: 'auto' | 'openai' | 'openrouter' | 'gemini' | 'custom' | 'ollama' | string
  customProviderId?: string
  apiKey?: string
  model?: string
  baseUrl?: string
  dimensions?: number
}

export interface SoulMemoryFlushSettings {
  enabled?: boolean
  maxInputChars?: number
}

export interface SoulMemoryCaptureSettings {
  enabled?: boolean
  mode?: 'explicit-only' | 'auto' | 'off'
  maxInputChars?: number
  timeoutMs?: number
}

export interface SoulMemoryReviewSettings {
  enabled?: boolean
  interval?: number
  maxInputChars?: number
  timeoutMs?: number
  maxCandidates?: number
  minConfidence?: number
}

export interface SoulMemoryCanonicalSettings {
  enabled?: boolean
  store?: 'sqlite'
  highConfidenceThreshold?: number
  semanticDedupeThreshold?: number
}

export interface SoulMemoryDreamingSettings {
  enabled?: boolean
  frequency?: string
  timezone?: string
  model?: string
  sources?: Array<'daily'>
  lookbackDays?: number
  maxSourceFiles?: number
  maxSessions?: number
  maxMessagesPerSession?: number
  maxInputChars?: number
  maxPromotions?: number
  minScore?: number
  minRecallCount?: number
  minUniqueSources?: number
  timeoutMs?: number
}

export interface SoulMemoryDailyContextSettings {
  enabled?: boolean
  mode?: 'session-start' | 'always'
  daysBack?: number
  maxChars?: number
}

export interface SoulMemoryReadSettings {
  defaultLines?: number
  maxLines?: number
}

export type SoulMemoryLogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface SoulMemoryLoggingSettings {
  enabled?: boolean
  retentionDays?: number
  level?: SoulMemoryLogLevel
  maxPreviewChars?: number
  includeHttpErrorBody?: boolean
}

export interface SoulMemorySettings {
  enabled?: boolean
  directoryMode?: 'ai-note-dir' | 'custom'
  customDirectory?: string
  bootstrapMaxChars?: number
  activeMemory?: SoulMemoryActiveSettings
  search?: SoulMemorySearchSettings
  embeddings?: SoulMemoryEmbeddingSettings
  memoryFlush?: SoulMemoryFlushSettings
  capture?: SoulMemoryCaptureSettings
  review?: SoulMemoryReviewSettings
  canonicalMemory?: SoulMemoryCanonicalSettings
  dreaming?: SoulMemoryDreamingSettings
  dailyContext?: SoulMemoryDailyContextSettings
  read?: SoulMemoryReadSettings
  logging?: SoulMemoryLoggingSettings
}

export type ResolvedSoulMemorySettings = Omit<
  Required<SoulMemorySettings>,
  'activeMemory' | 'search' | 'embeddings' | 'memoryFlush' | 'capture' | 'review' | 'dreaming' | 'dailyContext' | 'read' | 'logging'
> & {
  activeMemory: Required<SoulMemoryActiveSettings>
  search: Required<SoulMemorySearchSettings>
  embeddings: Required<SoulMemoryEmbeddingSettings>
  memoryFlush: Required<SoulMemoryFlushSettings>
  capture: Required<SoulMemoryCaptureSettings>
  review: Required<SoulMemoryReviewSettings>
  canonicalMemory: Required<SoulMemoryCanonicalSettings>
  dreaming: Required<SoulMemoryDreamingSettings>
  dailyContext: Required<SoulMemoryDailyContextSettings>
  read: Required<SoulMemoryReadSettings>
  logging: Required<SoulMemoryLoggingSettings>
}

export interface MemoryWorkspace {
  settings: ResolvedSoulMemorySettings
  agentId: string
  root: string
  memoryDir: string
  soulPath: string
  userPath: string
  memoryPath: string
  dreamsPath: string
  todayPath: string
  dbPath: string
}

export interface MemoryChunk {
  id: string
  path: string
  kind: 'memory' | 'daily'
  date?: string
  chunkIndex: number
  startLine: number
  endLine: number
  content: string
  hash: string
  tokenCount: number
  embedding?: number[]
  embeddingProvider?: string
  embeddingModel?: string
  mtimeMs: number
}

export interface MemoryIndexFile {
  absolutePath: string
  relativePath: string
  kind: 'memory' | 'daily'
  date?: string
}

export interface MemoryIndexFileStat extends MemoryIndexFile {
  mtimeMs: number
  size: number
}

export interface SearchHit {
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

export type MemoryGraphEntityType = CoreSoulMemoryGraphEntityType
export type MemoryGraphObservationKind = CoreSoulMemoryGraphObservationKind
export type MemoryGraphStatus = CoreSoulMemoryGraphStatus
export type MemoryGraphDuplicateStatus = 'pending' | 'merged' | 'ignored'
export type CanonicalMemoryKind = CoreCanonicalMemoryKind
export type CaptureCandidateKind = CoreCaptureCandidateKind

export interface CaptureCandidate extends CoreCaptureCandidate {}

export interface CanonicalMemoryInput {
  memoryKey?: string
  kind: CanonicalMemoryKind
  subject?: string
  value: string
  text?: string
  confidence?: number
  sensitivity?: 'normal' | 'sensitive' | 'secret'
  source?: string
  evidence?: string
  sessionId?: string
  messageId?: string
}

export type CanonicalMemoryRecord = CoreSoulMemoryCanonicalMemoryRecord & {
  kind: CanonicalMemoryKind
  sensitivity: 'normal' | 'sensitive' | 'secret'
}

export interface CanonicalUpsertResult {
  memory: CanonicalMemoryRecord
  action: 'create' | 'update' | 'duplicate'
}

export type MemoryRuntimeAppSettings = CoreAppSettingsWithSoulMemory

export type MemoryAuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'restore'
  | 'duplicate'
  | 'migrate'
  | 'conflict'
  | 'merge'
  | 'ignore'

export interface CanonicalMemoryAuditEvent {
  id: string
  memoryId: string
  action: MemoryAuditAction
  createdAt: number
  payload: JsonObject
}

export interface GraphEvidenceInput {
  source: string
  evidence?: string
  sessionId?: string
  messageId?: string
}

export interface GraphEntityInput extends GraphEvidenceInput {
  id?: string
  entityType: MemoryGraphEntityType
  name: string
  displayName?: string
  aliases?: string[]
  confidence?: number
  sensitivity?: 'normal' | 'sensitive' | 'secret'
}

export interface GraphObservationInput extends GraphEvidenceInput {
  id?: string
  entityId: string
  kind: MemoryGraphObservationKind
  slot: string
  value: string
  text?: string
  confidence?: number
  sensitivity?: 'normal' | 'sensitive' | 'secret'
  status?: MemoryGraphStatus
}

export interface GraphRelationInput extends GraphEvidenceInput {
  id?: string
  fromEntityId: string
  relationType: string
  toEntityId: string
  text?: string
  confidence?: number
  sensitivity?: 'normal' | 'sensitive' | 'secret'
  status?: MemoryGraphStatus
}

export type MemoryGraphEntity = CoreSoulMemoryGraphEntity
export type MemoryGraphObservation = CoreSoulMemoryGraphObservation
export type MemoryGraphRelation = CoreSoulMemoryGraphRelation
export type MemoryGraphDuplicate = CoreSoulMemoryGraphDuplicate

export interface MemoryGraphAuditEvent {
  id: string
  memoryId: string
  action: MemoryAuditAction
  createdAt: number
  payload: JsonObject
}

export interface GraphMergeResult {
  applied: number
  updated: number
  duplicates: number
  conflicts: number
  entities: MemoryGraphEntity[]
  observations: MemoryGraphObservation[]
  relations: MemoryGraphRelation[]
}

export interface MemoryGraphOverview {
  entities: number
  observations: number
  relations: number
  pendingDuplicates: number
  userEntity?: MemoryGraphEntity
}

export interface DreamingSource {
  sourceType: 'daily'
  relativePath: string
  content: string
  mtimeMs: number
}

export interface IndexStatus {
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
