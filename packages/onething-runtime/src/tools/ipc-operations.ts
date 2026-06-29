type MaybePromise<T> = T | Promise<T>

export interface OnethingToolsIpcLogger {
  log?: (...args: unknown[]) => void
}

export interface CancelOnethingToolForIpcOptions {
  toolCallId?: string
  logger?: OnethingToolsIpcLogger
}

export interface CancelOnethingToolForIpcResult {
  success: true
}

export async function cancelOnethingToolForIpc(
  options: CancelOnethingToolForIpcOptions,
): Promise<CancelOnethingToolForIpcResult> {
  options.logger?.log?.('[Tools IPC] Cancel tool requested:', options.toolCallId)
  return { success: true }
}

export interface ListOnethingBackgroundJobsForIpcOptions<TJob = unknown> {
  includeInactive?: boolean
  listJobs(options: { includeInactive?: boolean }): TJob[]
}

export type ListOnethingBackgroundJobsForIpcResult<TJob = unknown> =
  | { success: true; jobs: TJob[] }
  | { success: false; error: string }

export async function listOnethingBackgroundJobsForIpc<TJob>(
  options: ListOnethingBackgroundJobsForIpcOptions<TJob>,
): Promise<ListOnethingBackgroundJobsForIpcResult<TJob>> {
  try {
    return {
      success: true,
      jobs: options.listJobs({ includeInactive: options.includeInactive }),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list background jobs',
    }
  }
}

export interface StopOnethingBackgroundJobForIpcOptions {
  jobId: string
  stopJob(jobId: string): MaybePromise<boolean>
}

export type StopOnethingBackgroundJobForIpcResult =
  | { success: boolean }
  | { success: false; error: string }

export async function stopOnethingBackgroundJobForIpc(
  options: StopOnethingBackgroundJobForIpcOptions,
): Promise<StopOnethingBackgroundJobForIpcResult> {
  try {
    return { success: await options.stopJob(options.jobId) }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop background job',
    }
  }
}
