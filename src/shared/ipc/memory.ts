import type { SoulMemorySettings } from './settings.js'

export type MemoryManagedFileKind = 'soul' | 'memory' | 'dreams' | 'daily'
export type CanonicalMemoryKind = 'identity' | 'preference' | 'decision' | 'project' | 'constraint' | 'fact'

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
  lastDreamingAt?: number
  lastDreamingError?: string
  lastDreamingApplied?: number
  lastDreamingStatus?: string
  lastDreamingSourceFiles?: string[]
  lastDreamingNextRunAt?: number
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
  root: string
  memoryDir: string
  soulPath: string
  memoryPath: string
  dreamsPath: string
  todayPath: string
  dbPath: string
  settings: Required<SoulMemorySettings>
  status: MemoryIndexStatus
  dreaming: MemoryDreamingStatus
  pendingCaptures: MemoryCapturePending[]
  canonicalCount?: number
  files: MemoryManagedFile[]
}

export interface MemoryReadRequest {
  path: string
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
  kind: 'memory' | 'daily' | 'canonical'
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
  limit?: number | string
}

export interface MemorySearchResponse {
  success: boolean
  hits?: MemorySearchHit[]
  error?: string
}

export interface MemoryAppendRequest {
  content: string
  target?: 'daily' | 'memory'
  heading?: string
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
  action: 'create' | 'update' | 'delete' | 'restore' | 'duplicate' | 'migrate'
  createdAt: number
  payload: Record<string, unknown>
}

export interface MemoryProfileListRequest {
  query?: string
  includeDeleted?: boolean
  limit?: number
}

export interface MemoryProfileListResponse {
  success: boolean
  memories?: CanonicalMemoryRecord[]
  error?: string
}

export interface MemoryProfileUpsertRequest {
  id?: string
  memoryKey?: string
  kind: CanonicalMemoryKind
  subject?: string
  value: string
  text?: string
  confidence?: number
  sensitivity?: 'normal' | 'sensitive' | 'secret'
  evidence?: string
}

export interface MemoryProfileUpsertResponse {
  success: boolean
  memory?: CanonicalMemoryRecord
  error?: string
}

export interface MemoryProfileDeleteRequest {
  id: string
}

export interface MemoryProfileDeleteResponse {
  success: boolean
  error?: string
}

export interface MemoryProfileAuditRequest {
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
