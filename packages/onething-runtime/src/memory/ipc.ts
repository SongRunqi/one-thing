import { toJsonObject } from '@onething/core'
import type {
  MemoryDiagnosticsLogInput,
  MemoryLogsListRequest,
} from './diagnostics-logger.js'

type MaybePromise<T> = T | Promise<T>
type Success<T extends object = {}> = { success: true } & T
type Failure = { success: false; error: string }
type Response<T extends object = {}> = Success<T> | Failure
type RequestRecord = Record<string, unknown>

export interface MemoryDiagnosticsLoggerLike {
  list(request?: MemoryLogsListRequest): MaybePromise<object>
  stats(): MaybePromise<object>
  cleanup(retentionDays?: number): MaybePromise<string[]>
  getConfig(): { retentionDays: number }
  getLogDir(): string
}

export interface OnethingMemoryIpcAdapters {
  logDiagnostic(input: MemoryDiagnosticsLogInput): unknown
  diagnosticsLogger: MemoryDiagnosticsLoggerLike
  openLogFolder?(logDir: string): MaybePromise<void>
  onError?(operation: string, error: unknown): void

  getOverview(agentId?: string): MaybePromise<unknown>
  readManagedFile(request: unknown): MaybePromise<unknown>
  appendPanel(request: unknown): MaybePromise<unknown>
  saveManagedFile(request: unknown): MaybePromise<unknown>

  savePendingCapture(id?: string): MaybePromise<unknown>
  discardPendingCapture(id?: string): MaybePromise<unknown>
}

export interface OnethingMemoryIpcHandlers {
  overview(request?: { agentId?: string }): Promise<Response<{ overview: unknown }>>
  read(request: unknown): Promise<Response<{ file: unknown }>>
  append(request: unknown): Promise<Response<{ target: unknown }>>
  saveFile(request: unknown): Promise<Response<{ file: unknown }>>
  logsList(request?: MemoryLogsListRequest): Promise<Response>
  logsStats(): Promise<Response<{ stats: unknown }>>
  logsOpenFolder(): Promise<Response<{ logDir?: string }>>
  logsCleanup(): Promise<Response<{ deleted: string[] }>>
  captureSave(request?: { id?: string }): Promise<Response<{ target: unknown }>>
  captureDiscard(request?: { id?: string }): Promise<Response>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function requestRecord(request: unknown): RequestRecord {
  return request && typeof request === 'object' && !Array.isArray(request)
    ? request as RequestRecord
    : {}
}

function stringField(request: unknown, field: string): string | undefined {
  const value = requestRecord(request)[field]
  return typeof value === 'string' ? value : undefined
}

function agentId(request?: { agentId?: string }): string | undefined {
  return typeof request?.agentId === 'string' ? request.agentId : undefined
}

export function createOnethingMemoryIpcHandlers(adapters: OnethingMemoryIpcAdapters): OnethingMemoryIpcHandlers {
  async function withMemoryIpcLog<T>(
    operation: string,
    request: object | undefined,
    run: () => MaybePromise<T>,
  ): Promise<T> {
    const startedAt = Date.now()
    const runId = `ipc:${operation}:${startedAt}`
    adapters.logDiagnostic({
      subsystem: 'ipc',
      operation,
      stage: 'request',
      status: 'started',
      runId,
      request: request ? toJsonObject(request) : undefined,
    })
    try {
      const result = await run()
      adapters.logDiagnostic({
        subsystem: 'ipc',
        operation,
        stage: 'response',
        status: 'ok',
        durationMs: Date.now() - startedAt,
        runId,
      })
      return result
    } catch (error) {
      adapters.logDiagnostic({
        subsystem: 'ipc',
        operation,
        stage: 'response',
        status: 'error',
        durationMs: Date.now() - startedAt,
        runId,
        error,
      })
      throw error
    }
  }

  async function handle<TSuccess extends { success: true }>(
    operation: string,
    run: () => MaybePromise<TSuccess>,
  ): Promise<TSuccess | Failure> {
    try {
      return await run()
    } catch (error) {
      adapters.onError?.(operation, error)
      return { success: false, error: errorMessage(error) }
    }
  }

  return {
    overview: request => handle('overview', async () => ({ success: true, overview: await adapters.getOverview(agentId(request)) })),
    read: request => handle('read', async () => ({ success: true, file: await adapters.readManagedFile(request) })),
    append: request => handle('append', async () => ({
      success: true,
      target: await withMemoryIpcLog('memory-append', {
        target: stringField(request, 'target') || 'daily',
        heading: stringField(request, 'heading') || '',
        chars: stringField(request, 'content')?.length || 0,
      }, () => adapters.appendPanel(request)),
    })),
    saveFile: request => handle('save-file', async () => ({
      success: true,
      file: await withMemoryIpcLog('memory-save-file', {
        path: stringField(request, 'path'),
        chars: stringField(request, 'content')?.length || 0,
      }, () => adapters.saveManagedFile(request)),
    })),
    logsList: request => handle('logs-list', async () => ({ success: true, ...await adapters.diagnosticsLogger.list(request || {}) })),
    logsStats: () => handle('logs-stats', async () => ({ success: true, stats: await adapters.diagnosticsLogger.stats() })),
    logsOpenFolder: () => handle('logs-open-folder', async () => {
      await adapters.diagnosticsLogger.cleanup(adapters.diagnosticsLogger.getConfig().retentionDays)
      const logDir = adapters.diagnosticsLogger.getLogDir()
      await adapters.openLogFolder?.(logDir)
      return { success: true, ...(adapters.openLogFolder ? {} : { logDir }) }
    }),
    logsCleanup: () => handle('logs-cleanup', async () => ({ success: true, deleted: await adapters.diagnosticsLogger.cleanup() })),
    captureSave: request => handle('capture-save', async () => ({ success: true, target: await adapters.savePendingCapture(request?.id) })),
    captureDiscard: request => handle('capture-discard', async () => {
      await adapters.discardPendingCapture(request?.id)
      return { success: true }
    }),
  }
}
