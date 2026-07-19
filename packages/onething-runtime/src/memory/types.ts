import type {
  CoreAppSettingsWithSoulMemory,
  CoreCaptureCandidate,
  CoreCaptureCandidateKind,
} from '../plugins/index.js'

export interface SoulMemoryCaptureSettings {
  /** Single on/off + behavior switch; 'off' replaces the old enabled flag. */
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
  capture?: SoulMemoryCaptureSettings
  review?: SoulMemoryReviewSettings
  read?: SoulMemoryReadSettings
  logging?: SoulMemoryLoggingSettings
}

export type ResolvedSoulMemorySettings = Omit<
  Required<SoulMemorySettings>,
  'capture' | 'review' | 'read' | 'logging'
> & {
  capture: Required<SoulMemoryCaptureSettings>
  review: Required<SoulMemoryReviewSettings>
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

export type CaptureCandidateKind = CoreCaptureCandidateKind

export interface CaptureCandidate extends CoreCaptureCandidate {}

export type MemoryRuntimeAppSettings = CoreAppSettingsWithSoulMemory

/**
 * Mutable runtime status for the memory background jobs (capture/review).
 * Historic name kept from the deleted FTS index era; holds no index state.
 */
export interface IndexStatus {
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
