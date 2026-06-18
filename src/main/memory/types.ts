import type {
  MemoryGraphEntityType,
  MemoryGraphObservationKind,
  MemoryGraphStatus,
  SoulMemoryActiveSettings,
  SoulMemoryCanonicalSettings,
  SoulMemoryCaptureSettings,
  SoulMemoryDailyContextSettings,
  SoulMemoryDreamingSettings,
  SoulMemoryEmbeddingSettings,
  SoulMemoryFlushSettings,
  SoulMemoryLoggingSettings,
  SoulMemoryReadSettings,
  SoulMemoryReviewSettings,
  SoulMemorySearchSettings,
  SoulMemorySettings,
} from '../../shared/ipc.js'

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

export type CaptureCandidateKind =
  | 'identity'
  | 'preference'
  | 'decision'
  | 'project'
  | 'constraint'
  | 'fact'
  | 'summary'
  | 'episodic'
  | 'ignore'

export interface CaptureCandidate {
  kind: CaptureCandidateKind
  source: 'user' | 'assistant' | 'conversation'
  confidence: number
  text: string
  memoryKey?: string
  value?: string
  entityType?: MemoryGraphEntityType
  entityName?: string
  slot?: string
  relationType?: string
  fromEntityType?: MemoryGraphEntityType
  fromEntityName?: string
  toEntityType?: MemoryGraphEntityType
  toEntityName?: string
  reason?: string
  sensitivity?: 'normal' | 'sensitive' | 'secret'
  target?: 'memory' | 'daily' | 'ignore'
  explicit?: boolean
}

export interface CanonicalMemoryInput {
  memoryKey?: string
  kind: import('../../shared/ipc.js').CanonicalMemoryKind
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

export interface CanonicalUpsertResult {
  memory: import('../../shared/ipc.js').CanonicalMemoryRecord
  action: 'create' | 'update' | 'duplicate'
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

export interface GraphMergeResult {
  applied: number
  updated: number
  duplicates: number
  conflicts: number
  entities: import('../../shared/ipc.js').MemoryGraphEntity[]
  observations: import('../../shared/ipc.js').MemoryGraphObservation[]
  relations: import('../../shared/ipc.js').MemoryGraphRelation[]
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
