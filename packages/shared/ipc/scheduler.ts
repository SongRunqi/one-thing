import type { JsonObject, JsonValue } from '../json.js'

export type SchedulerRunReason = 'startup' | 'scheduled' | 'manual'
export type SchedulerTaskKind = 'agent' | 'plugin'
export type SchedulerTaskSource = 'user' | 'plugin'
export type SchedulerRunStatus = 'running' | 'succeeded' | 'failed' | 'blocked' | 'skipped' | 'cancelled'

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
  runId?: string
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
  result?: JsonValue
}

export interface SchedulerRunTimelineEntryDTO {
  id: string
  timestamp: number
  type: string
  title: string
  detail?: string
  durationMs?: number
  toolCallId?: string
  stepId?: string
  status?: string
  metadata?: JsonObject
}

export interface SchedulerRunToolCallDTO {
  id: string
  toolName: string
  status: string
  startedAt?: number
  finishedAt?: number
  durationMs?: number
  argumentsPreview?: string
  resultPreview?: string
  error?: string
}

export interface SchedulerRunStepDTO {
  id: string
  title: string
  status: string
  timestamp: number
  finishedAt?: number
  durationMs?: number
  toolCallId?: string
  resultPreview?: string
  error?: string
}

export interface SchedulerRunDetailDTO extends SchedulerRunRecordDTO {
  status: SchedulerRunStatus
  agentId?: string
  sessionId?: string
  assistantMessageId?: string
  resultPreview?: string
  steps?: SchedulerRunStepDTO[]
  toolCalls?: SchedulerRunToolCallDTO[]
  timeline?: SchedulerRunTimelineEntryDTO[]
}

export interface SchedulerTaskSnapshotDTO {
  id: string
  name?: string
  pluginId?: string
  kind: SchedulerTaskKind
  source: SchedulerTaskSource
  readonly: boolean
  agentId?: string
  prompt?: string
  promptPreview?: string
  workingDirectory?: string
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

export interface SchedulerUserTaskDTO {
  id: string
  name: string
  prompt: string
  agentId: string
  enabled: boolean
  schedule: SchedulerSchedule
  workingDirectory?: string
  createdAt: number
  updatedAt: number
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

export interface SchedulerCreateTaskRequest {
  name: string
  prompt: string
  agentId: string
  enabled?: boolean
  schedule: SchedulerSchedule
  workingDirectory?: string
}

export interface SchedulerUpdateTaskRequest {
  id: string
  name?: string
  prompt?: string
  agentId?: string
  enabled?: boolean
  schedule?: SchedulerSchedule
  workingDirectory?: string | null
}

export interface SchedulerDeleteTaskRequest {
  id: string
}

export interface SchedulerWriteTaskResponse {
  success: boolean
  task?: SchedulerTaskSnapshotDTO
  error?: string
}

export interface SchedulerDeleteTaskResponse {
  success: boolean
  error?: string
}

export interface SchedulerListRunsRequest {
  taskId: string
  limit?: number
}

export interface SchedulerListRunsResponse {
  success: boolean
  runs?: SchedulerRunDetailDTO[]
  error?: string
}

export interface SchedulerGetRunRequest {
  taskId: string
  runId: string
}

export interface SchedulerGetRunResponse {
  success: boolean
  run?: SchedulerRunDetailDTO
  error?: string
}
