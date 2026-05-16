export type SchedulerRunReason = 'startup' | 'scheduled' | 'manual'

export type SchedulerSchedule =
  | {
      kind: 'cron'
      expr: string
      timezone?: string
    }
  | {
      kind: 'interval'
      everyMs: number
      startDelayMs?: number
    }
  | {
      kind: 'at'
      atMs: number
    }

export interface SchedulerRunRecordDTO {
  taskId: string
  pluginId?: string
  reason: SchedulerRunReason
  scheduledFor: number
  startedAt: number
  finishedAt: number
  durationMs: number
  ok: boolean
  skipped?: boolean
  skippedReason?: string
  error?: string
  result?: unknown
}

export interface SchedulerTaskSnapshotDTO {
  id: string
  name?: string
  pluginId?: string
  enabled: boolean
  userEnabled?: boolean
  schedule?: SchedulerSchedule
  scheduleKey?: string
  tags: string[]
  inFlight: boolean
  nextRunAt?: number
  lastRunAt?: number
  lastSuccessAt?: number
  lastErrorAt?: number
  lastError?: string
  lastDurationMs?: number
  lastRunReason?: SchedulerRunReason
  lastScheduledFor?: number
  runCount: number
  successCount: number
  failureCount: number
  recentRuns?: SchedulerRunRecordDTO[]
}

export interface SchedulerListResponse {
  success: boolean
  tasks?: SchedulerTaskSnapshotDTO[]
  error?: string
}

export interface SchedulerGetRequest {
  id: string
}

export interface SchedulerGetResponse {
  success: boolean
  task?: SchedulerTaskSnapshotDTO
  error?: string
}

export interface SchedulerRunNowRequest {
  id: string
  force?: boolean
}

export interface SchedulerRunNowResponse {
  success: boolean
  record?: SchedulerRunRecordDTO
  error?: string
}

export interface SchedulerSetEnabledRequest {
  id: string
  enabled: boolean
}

export interface SchedulerSetEnabledResponse {
  success: boolean
  task?: SchedulerTaskSnapshotDTO
  error?: string
}
