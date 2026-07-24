import type { JsonObject } from '../json.js'
import type { SoulMemorySettings } from './settings.js'

export type MemoryManagedFileKind = 'soul' | 'user' | 'memory' | 'dreams' | 'daily'
export type MemoryDiagnosticLevel = 'debug' | 'info' | 'warn' | 'error'
export type MemoryDiagnosticSubsystem =
  | 'capture'
  | 'daily'
  | 'review'
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

/** Runtime status of the background memory jobs (capture/review). */
export interface MemoryRuntimeStatus {
  lastError?: string
  lastCaptureAt?: number
  lastCaptureError?: string
  lastCaptureStatus?: string
  lastReviewAt?: number
  lastReviewError?: string
  lastReviewStatus?: string
  lastReviewTurn?: number
  lastReviewApplied?: number
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
  settings: Required<SoulMemorySettings>
  status: MemoryRuntimeStatus
  pendingCaptures: MemoryCapturePending[]
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

export interface MemoryAppendRequest {
  content: string
  agentId?: string
  target?: 'daily'
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
