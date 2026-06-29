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
  searchPanel(request: unknown): MaybePromise<unknown>
  appendPanel(request: unknown): MaybePromise<unknown>
  saveManagedFile(request: unknown): MaybePromise<unknown>
  rebuildIndex(agentId?: string): MaybePromise<unknown>
  runDreamingNow(agentId?: string): MaybePromise<unknown>

  listProfile(request: unknown): MaybePromise<unknown>
  searchProfile(request: unknown): MaybePromise<unknown>
  upsertProfile(request: unknown): MaybePromise<unknown>
  deleteProfile(request: unknown): MaybePromise<void>
  getProfileAudit(request: unknown): MaybePromise<unknown>
  exportProfile(agentId?: string): MaybePromise<unknown>

  getGraphOverview(agentId?: string): MaybePromise<unknown>
  listGraphEntities(request: unknown): MaybePromise<unknown>
  upsertGraphEntity(request: unknown): MaybePromise<unknown>
  deleteGraphEntity(request: unknown): MaybePromise<void>
  listGraphObservations(request: unknown): MaybePromise<unknown>
  upsertGraphObservation(request: unknown): MaybePromise<unknown>
  deleteGraphObservation(request: unknown): MaybePromise<void>
  listGraphRelations(request: unknown): MaybePromise<unknown>
  upsertGraphRelation(request: unknown): MaybePromise<unknown>
  deleteGraphRelation(request: unknown): MaybePromise<void>
  listGraphDuplicates(request: unknown): MaybePromise<unknown>
  mergeGraphDuplicate(request: unknown): MaybePromise<void>
  ignoreGraphDuplicate(request: unknown): MaybePromise<void>
  getGraphAudit(request: unknown): MaybePromise<unknown>

  savePendingCapture(id?: string): MaybePromise<unknown>
  discardPendingCapture(id?: string): MaybePromise<unknown>
}

export interface OnethingMemoryIpcHandlers {
  overview(request?: { agentId?: string }): Promise<Response<{ overview: unknown }>>
  read(request: unknown): Promise<Response<{ file: unknown }>>
  search(request: unknown): Promise<Response<{ hits: unknown }>>
  append(request: unknown): Promise<Response<{ target: unknown }>>
  saveFile(request: unknown): Promise<Response<{ file: unknown }>>
  index(request?: { agentId?: string }): Promise<Response<{ status: unknown }>>
  runDreaming(request?: { agentId?: string }): Promise<Response<{ result: unknown }>>
  profileList(request?: unknown): Promise<Response<{ memories: unknown }>>
  profileSearch(request?: unknown): Promise<Response<{ memories: unknown }>>
  profileUpsert(request: unknown): Promise<Response<{ memory: unknown }>>
  profileDelete(request: unknown): Promise<Response>
  profileAudit(request: unknown): Promise<Response<{ events: unknown }>>
  profileExport(request?: { agentId?: string }): Promise<Response<{ markdown: unknown }>>
  graphOverview(request?: { agentId?: string }): Promise<Response<{ overview: unknown }>>
  graphEntitiesList(request?: unknown): Promise<Response<{ entities: unknown }>>
  graphEntitiesUpsert(request: unknown): Promise<Response<{ entity: unknown }>>
  graphEntitiesDelete(request: unknown): Promise<Response>
  graphObservationsList(request?: unknown): Promise<Response<{ observations: unknown }>>
  graphObservationsUpsert(request: unknown): Promise<Response<{ observation: unknown }>>
  graphObservationsDelete(request: unknown): Promise<Response>
  graphRelationsList(request?: unknown): Promise<Response<{ relations: unknown }>>
  graphRelationsUpsert(request: unknown): Promise<Response<{ relation: unknown }>>
  graphRelationsDelete(request: unknown): Promise<Response>
  graphDuplicatesList(request?: unknown): Promise<Response<{ duplicates: unknown }>>
  graphDuplicatesMerge(request: unknown): Promise<Response>
  graphDuplicatesIgnore(request: unknown): Promise<Response>
  graphAudit(request: unknown): Promise<Response<{ events: unknown }>>
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

function numberField(request: unknown, field: string): number | undefined {
  const value = requestRecord(request)[field]
  return typeof value === 'number' ? value : undefined
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
    search: request => handle('search', async () => ({
      success: true,
      hits: await withMemoryIpcLog('memory-search', {
        queryPreview: stringField(request, 'query')?.slice(0, 160),
        limit: numberField(request, 'limit'),
      }, () => adapters.searchPanel(request)),
    })),
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
    index: request => handle('index', async () => ({
      success: true,
      status: await withMemoryIpcLog('memory-reindex', request, () => adapters.rebuildIndex(agentId(request))),
    })),
    runDreaming: request => handle('run-dreaming', async () => ({
      success: true,
      result: await withMemoryIpcLog('memory-run-dreaming', request, () => adapters.runDreamingNow(agentId(request))),
    })),
    profileList: request => handle('profile-list', async () => ({ success: true, memories: await adapters.listProfile(request || {}) })),
    profileSearch: request => handle('profile-search', async () => ({ success: true, memories: await adapters.searchProfile(request || {}) })),
    profileUpsert: request => handle('profile-upsert', async () => ({ success: true, memory: await adapters.upsertProfile(request) })),
    profileDelete: request => handle('profile-delete', async () => {
      await adapters.deleteProfile(request)
      return { success: true }
    }),
    profileAudit: request => handle('profile-audit', async () => ({ success: true, events: await adapters.getProfileAudit(request) })),
    profileExport: request => handle('profile-export', async () => ({ success: true, markdown: await adapters.exportProfile(agentId(request)) })),
    graphOverview: request => handle('graph-overview', async () => ({ success: true, overview: await adapters.getGraphOverview(agentId(request)) })),
    graphEntitiesList: request => handle('graph-entities-list', async () => ({ success: true, entities: await adapters.listGraphEntities(request || {}) })),
    graphEntitiesUpsert: request => handle('graph-entity-upsert', async () => ({
      success: true,
      entity: await withMemoryIpcLog('graph-entity-upsert', {
        id: stringField(request, 'id'),
        entityType: stringField(request, 'entityType'),
        name: stringField(request, 'name'),
      }, () => adapters.upsertGraphEntity(request)),
    })),
    graphEntitiesDelete: request => handle('graph-entity-delete', async () => {
      await withMemoryIpcLog('graph-entity-delete', requestRecord(request), () => adapters.deleteGraphEntity(request))
      return { success: true }
    }),
    graphObservationsList: request => handle('graph-observations-list', async () => ({ success: true, observations: await adapters.listGraphObservations(request || {}) })),
    graphObservationsUpsert: request => handle('graph-observation-upsert', async () => ({
      success: true,
      observation: await withMemoryIpcLog('graph-observation-upsert', {
        id: stringField(request, 'id'),
        entityId: stringField(request, 'entityId'),
        kind: stringField(request, 'kind'),
        slot: stringField(request, 'slot'),
        valuePreview: stringField(request, 'value')?.slice(0, 160),
      }, () => adapters.upsertGraphObservation(request)),
    })),
    graphObservationsDelete: request => handle('graph-observation-delete', async () => {
      await withMemoryIpcLog('graph-observation-delete', requestRecord(request), () => adapters.deleteGraphObservation(request))
      return { success: true }
    }),
    graphRelationsList: request => handle('graph-relations-list', async () => ({ success: true, relations: await adapters.listGraphRelations(request || {}) })),
    graphRelationsUpsert: request => handle('graph-relation-upsert', async () => ({
      success: true,
      relation: await withMemoryIpcLog('graph-relation-upsert', {
        id: stringField(request, 'id'),
        fromEntityId: stringField(request, 'fromEntityId'),
        relationType: stringField(request, 'relationType'),
        toEntityId: stringField(request, 'toEntityId'),
      }, () => adapters.upsertGraphRelation(request)),
    })),
    graphRelationsDelete: request => handle('graph-relation-delete', async () => {
      await withMemoryIpcLog('graph-relation-delete', requestRecord(request), () => adapters.deleteGraphRelation(request))
      return { success: true }
    }),
    graphDuplicatesList: request => handle('graph-duplicates-list', async () => ({ success: true, duplicates: await adapters.listGraphDuplicates(request || {}) })),
    graphDuplicatesMerge: request => handle('graph-duplicate-merge', async () => {
      await withMemoryIpcLog('graph-duplicate-merge', requestRecord(request), () => adapters.mergeGraphDuplicate(request))
      return { success: true }
    }),
    graphDuplicatesIgnore: request => handle('graph-duplicate-ignore', async () => {
      await withMemoryIpcLog('graph-duplicate-ignore', requestRecord(request), () => adapters.ignoreGraphDuplicate(request))
      return { success: true }
    }),
    graphAudit: request => handle('graph-audit', async () => ({ success: true, events: await adapters.getGraphAudit(request) })),
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
