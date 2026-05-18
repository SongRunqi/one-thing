import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type {
  MemoryAppendRequest,
  MemoryCaptureDecisionRequest,
  MemoryGraphAuditRequest,
  MemoryGraphDeleteRequest,
  MemoryGraphDuplicateDecisionRequest,
  MemoryGraphEntityUpsertRequest,
  MemoryGraphListRequest,
  MemoryLogsListRequest,
  MemoryGraphObservationUpsertRequest,
  MemoryGraphRelationUpsertRequest,
  MemoryProfileAuditRequest,
  MemoryProfileDeleteRequest,
  MemoryProfileListRequest,
  MemoryProfileUpsertRequest,
  MemoryReadRequest,
  MemorySaveFileRequest,
  MemorySearchRequest,
} from '../../shared/ipc.js'
import {
  logMemoryDiagnostic,
  memoryDiagnosticsLogger,
} from '../memory/diagnostics-logger.js'
import {
  appendSoulMemoryPanel,
  deleteSoulMemoryProfile,
  deleteSoulMemoryGraphEntity,
  deleteSoulMemoryGraphObservation,
  deleteSoulMemoryGraphRelation,
  discardSoulMemoryPendingCapture,
  exportSoulMemoryProfile,
  getSoulMemoryGraphAudit,
  getSoulMemoryGraphOverview,
  getSoulMemoryProfileAudit,
  getSoulMemoryOverview,
  ignoreSoulMemoryGraphDuplicate,
  listSoulMemoryGraphDuplicates,
  listSoulMemoryGraphEntities,
  listSoulMemoryGraphObservations,
  listSoulMemoryGraphRelations,
  listSoulMemoryProfile,
  mergeSoulMemoryGraphDuplicate,
  readSoulMemoryManagedFile,
  rebuildSoulMemoryIndex,
  runSoulMemoryDreamingNow,
  saveSoulMemoryManagedFile,
  saveSoulMemoryPendingCapture,
  searchSoulMemoryPanel,
  searchSoulMemoryProfile,
  upsertSoulMemoryGraphEntity,
  upsertSoulMemoryGraphObservation,
  upsertSoulMemoryGraphRelation,
  upsertSoulMemoryProfile,
} from '../plugins/builtin/soul-memory.js'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function withMemoryIpcLog<T>(
  operation: string,
  request: object | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now()
  const runId = `ipc:${operation}:${startedAt}`
  logMemoryDiagnostic({
    subsystem: 'ipc',
    operation,
    stage: 'request',
    status: 'started',
    runId,
    request: request as Record<string, unknown> | undefined,
  })
  try {
    const result = await run()
    logMemoryDiagnostic({
      subsystem: 'ipc',
      operation,
      stage: 'response',
      status: 'ok',
      durationMs: Date.now() - startedAt,
      runId,
    })
    return result
  } catch (error) {
    logMemoryDiagnostic({
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

export function registerMemoryHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.MEMORY_OVERVIEW, async () => {
    try {
      return { success: true, overview: await getSoulMemoryOverview() }
    } catch (error) {
      console.error('[MemoryIPC] overview error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_READ, async (_event, request: MemoryReadRequest) => {
    try {
      return { success: true, file: await readSoulMemoryManagedFile(request) }
    } catch (error) {
      console.error('[MemoryIPC] read error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_SEARCH, async (_event, request: MemorySearchRequest) => {
    try {
      return {
        success: true,
        hits: await withMemoryIpcLog('memory-search', {
          queryPreview: request.query?.slice(0, 160),
          limit: request.limit,
        }, () => searchSoulMemoryPanel(request)),
      }
    } catch (error) {
      console.error('[MemoryIPC] search error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_APPEND, async (_event, request: MemoryAppendRequest) => {
    try {
      return {
        success: true,
        target: await withMemoryIpcLog('memory-append', {
          target: request.target || 'daily',
          heading: request.heading || '',
          chars: request.content?.length || 0,
        }, () => appendSoulMemoryPanel(request)),
      }
    } catch (error) {
      console.error('[MemoryIPC] append error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_SAVE_FILE, async (_event, request: MemorySaveFileRequest) => {
    try {
      return {
        success: true,
        file: await withMemoryIpcLog('memory-save-file', {
          path: request.path,
          chars: request.content?.length || 0,
        }, () => saveSoulMemoryManagedFile(request)),
      }
    } catch (error) {
      console.error('[MemoryIPC] save-file error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_INDEX, async () => {
    try {
      return { success: true, status: await withMemoryIpcLog('memory-reindex', undefined, () => rebuildSoulMemoryIndex()) }
    } catch (error) {
      console.error('[MemoryIPC] index error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_RUN_DREAMING, async () => {
    try {
      return { success: true, result: await withMemoryIpcLog('memory-run-dreaming', undefined, () => runSoulMemoryDreamingNow()) }
    } catch (error) {
      console.error('[MemoryIPC] run dreaming error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_PROFILE_LIST, async (_event, request?: MemoryProfileListRequest) => {
    try {
      return { success: true, memories: await listSoulMemoryProfile(request || {}) }
    } catch (error) {
      console.error('[MemoryIPC] profile list error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_PROFILE_SEARCH, async (_event, request: MemoryProfileListRequest) => {
    try {
      return { success: true, memories: await searchSoulMemoryProfile(request || {}) }
    } catch (error) {
      console.error('[MemoryIPC] profile search error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_PROFILE_UPSERT, async (_event, request: MemoryProfileUpsertRequest) => {
    try {
      return { success: true, memory: await upsertSoulMemoryProfile(request) }
    } catch (error) {
      console.error('[MemoryIPC] profile upsert error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_PROFILE_DELETE, async (_event, request: MemoryProfileDeleteRequest) => {
    try {
      await deleteSoulMemoryProfile(request)
      return { success: true }
    } catch (error) {
      console.error('[MemoryIPC] profile delete error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_PROFILE_AUDIT, async (_event, request: MemoryProfileAuditRequest) => {
    try {
      return { success: true, events: await getSoulMemoryProfileAudit(request) }
    } catch (error) {
      console.error('[MemoryIPC] profile audit error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_PROFILE_EXPORT, async () => {
    try {
      return { success: true, markdown: await exportSoulMemoryProfile() }
    } catch (error) {
      console.error('[MemoryIPC] profile export error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_GRAPH_OVERVIEW, async () => {
    try {
      return { success: true, overview: await getSoulMemoryGraphOverview() }
    } catch (error) {
      console.error('[MemoryIPC] graph overview error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_GRAPH_ENTITIES_LIST, async (_event, request?: MemoryGraphListRequest) => {
    try {
      return { success: true, entities: await listSoulMemoryGraphEntities(request || {}) }
    } catch (error) {
      console.error('[MemoryIPC] graph entities list error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_GRAPH_ENTITIES_UPSERT, async (_event, request: MemoryGraphEntityUpsertRequest) => {
    try {
      return {
        success: true,
        entity: await withMemoryIpcLog('graph-entity-upsert', {
          id: request.id,
          entityType: request.entityType,
          name: request.name,
        }, () => upsertSoulMemoryGraphEntity(request)),
      }
    } catch (error) {
      console.error('[MemoryIPC] graph entity upsert error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_GRAPH_ENTITIES_DELETE, async (_event, request: MemoryGraphDeleteRequest) => {
    try {
      await withMemoryIpcLog('graph-entity-delete', request, () => deleteSoulMemoryGraphEntity(request))
      return { success: true }
    } catch (error) {
      console.error('[MemoryIPC] graph entity delete error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_GRAPH_OBSERVATIONS_LIST, async (_event, request?: MemoryGraphListRequest & { entityId?: string }) => {
    try {
      return { success: true, observations: await listSoulMemoryGraphObservations(request || {}) }
    } catch (error) {
      console.error('[MemoryIPC] graph observations list error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_GRAPH_OBSERVATIONS_UPSERT, async (_event, request: MemoryGraphObservationUpsertRequest) => {
    try {
      return {
        success: true,
        observation: await withMemoryIpcLog('graph-observation-upsert', {
          id: request.id,
          entityId: request.entityId,
          kind: request.kind,
          slot: request.slot,
          valuePreview: request.value?.slice(0, 160),
        }, () => upsertSoulMemoryGraphObservation(request)),
      }
    } catch (error) {
      console.error('[MemoryIPC] graph observation upsert error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_GRAPH_OBSERVATIONS_DELETE, async (_event, request: MemoryGraphDeleteRequest) => {
    try {
      await withMemoryIpcLog('graph-observation-delete', request, () => deleteSoulMemoryGraphObservation(request))
      return { success: true }
    } catch (error) {
      console.error('[MemoryIPC] graph observation delete error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_GRAPH_RELATIONS_LIST, async (_event, request?: MemoryGraphListRequest & { entityId?: string }) => {
    try {
      return { success: true, relations: await listSoulMemoryGraphRelations(request || {}) }
    } catch (error) {
      console.error('[MemoryIPC] graph relations list error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_GRAPH_RELATIONS_UPSERT, async (_event, request: MemoryGraphRelationUpsertRequest) => {
    try {
      return {
        success: true,
        relation: await withMemoryIpcLog('graph-relation-upsert', {
          id: request.id,
          fromEntityId: request.fromEntityId,
          relationType: request.relationType,
          toEntityId: request.toEntityId,
        }, () => upsertSoulMemoryGraphRelation(request)),
      }
    } catch (error) {
      console.error('[MemoryIPC] graph relation upsert error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_GRAPH_RELATIONS_DELETE, async (_event, request: MemoryGraphDeleteRequest) => {
    try {
      await withMemoryIpcLog('graph-relation-delete', request, () => deleteSoulMemoryGraphRelation(request))
      return { success: true }
    } catch (error) {
      console.error('[MemoryIPC] graph relation delete error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_GRAPH_DUPLICATES_LIST, async (_event, request?: MemoryGraphListRequest) => {
    try {
      return { success: true, duplicates: await listSoulMemoryGraphDuplicates(request || {}) }
    } catch (error) {
      console.error('[MemoryIPC] graph duplicates list error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_GRAPH_DUPLICATES_MERGE, async (_event, request: MemoryGraphDuplicateDecisionRequest) => {
    try {
      await withMemoryIpcLog('graph-duplicate-merge', request, () => mergeSoulMemoryGraphDuplicate(request))
      return { success: true }
    } catch (error) {
      console.error('[MemoryIPC] graph duplicate merge error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_GRAPH_DUPLICATES_IGNORE, async (_event, request: MemoryGraphDuplicateDecisionRequest) => {
    try {
      await withMemoryIpcLog('graph-duplicate-ignore', request, () => ignoreSoulMemoryGraphDuplicate(request))
      return { success: true }
    } catch (error) {
      console.error('[MemoryIPC] graph duplicate ignore error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_GRAPH_AUDIT, async (_event, request: MemoryGraphAuditRequest) => {
    try {
      return { success: true, events: await getSoulMemoryGraphAudit(request) }
    } catch (error) {
      console.error('[MemoryIPC] graph audit error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_LOGS_LIST, async (_event, request?: MemoryLogsListRequest) => {
    try {
      return { success: true, ...(await memoryDiagnosticsLogger.list(request || {})) }
    } catch (error) {
      console.error('[MemoryIPC] logs list error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_LOGS_STATS, async () => {
    try {
      return { success: true, stats: await memoryDiagnosticsLogger.stats() }
    } catch (error) {
      console.error('[MemoryIPC] logs stats error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_LOGS_OPEN_FOLDER, async () => {
    try {
      await memoryDiagnosticsLogger.cleanup(memoryDiagnosticsLogger.getConfig().retentionDays)
      const result = await shell.openPath(memoryDiagnosticsLogger.getLogDir())
      if (result) throw new Error(result)
      return { success: true }
    } catch (error) {
      console.error('[MemoryIPC] logs open folder error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_LOGS_CLEANUP, async () => {
    try {
      return { success: true, deleted: await memoryDiagnosticsLogger.cleanup() }
    } catch (error) {
      console.error('[MemoryIPC] logs cleanup error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_CAPTURE_SAVE, async (_event, request?: MemoryCaptureDecisionRequest) => {
    try {
      return { success: true, target: await saveSoulMemoryPendingCapture(request?.id) }
    } catch (error) {
      console.error('[MemoryIPC] capture save error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_CAPTURE_DISCARD, async (_event, request?: MemoryCaptureDecisionRequest) => {
    try {
      discardSoulMemoryPendingCapture(request?.id)
      return { success: true }
    } catch (error) {
      console.error('[MemoryIPC] capture discard error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })
}
