import { openElectronPath } from '@onething/electron-host/shell/operations'
import { registerElectronMemoryIpcHandlers } from '@onething/electron-host/ipc/memory'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type {
  MemoryAppendRequest,
  MemoryCaptureDecisionRequest,
  MemoryGraphAuditRequest,
  MemoryGraphDeleteRequest,
  MemoryGraphDuplicateDecisionRequest,
  MemoryGraphEntityUpsertRequest,
  MemoryGraphListRequest,
  MemoryGraphObservationUpsertRequest,
  MemoryGraphRelationUpsertRequest,
  MemoryLogsListRequest,
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
  deleteSoulMemoryGraphEntity,
  deleteSoulMemoryGraphObservation,
  deleteSoulMemoryGraphRelation,
  deleteSoulMemoryProfile,
  discardSoulMemoryPendingCapture,
  exportSoulMemoryProfile,
  getSoulMemoryGraphAudit,
  getSoulMemoryGraphOverview,
  getSoulMemoryOverview,
  getSoulMemoryProfileAudit,
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
import { createOnethingMemoryIpcHandlers } from '@onething/runtime/memory/ipc'

function logMemoryIpcError(operation: string, error: unknown): void {
  console.error(`[MemoryIPC] ${operation} error:`, error)
}

async function openMemoryLogFolder(logDir: string): Promise<void> {
  const result = await openElectronPath(logDir)
  if (result) throw new Error(result)
}

export function registerMemoryHandlers(): void {
  const handlers = createOnethingMemoryIpcHandlers({
    logDiagnostic: logMemoryDiagnostic,
    diagnosticsLogger: memoryDiagnosticsLogger,
    openLogFolder: openMemoryLogFolder,
    onError: logMemoryIpcError,

    getOverview: getSoulMemoryOverview,
    readManagedFile: request => readSoulMemoryManagedFile(request as MemoryReadRequest),
    searchPanel: request => searchSoulMemoryPanel(request as MemorySearchRequest),
    appendPanel: request => appendSoulMemoryPanel(request as MemoryAppendRequest),
    saveManagedFile: request => saveSoulMemoryManagedFile(request as MemorySaveFileRequest),
    rebuildIndex: rebuildSoulMemoryIndex,
    runDreamingNow: runSoulMemoryDreamingNow,

    listProfile: request => listSoulMemoryProfile(request as MemoryProfileListRequest),
    searchProfile: request => searchSoulMemoryProfile(request as MemoryProfileListRequest),
    upsertProfile: request => upsertSoulMemoryProfile(request as MemoryProfileUpsertRequest),
    deleteProfile: request => deleteSoulMemoryProfile(request as MemoryProfileDeleteRequest),
    getProfileAudit: request => getSoulMemoryProfileAudit(request as MemoryProfileAuditRequest),
    exportProfile: exportSoulMemoryProfile,

    getGraphOverview: getSoulMemoryGraphOverview,
    listGraphEntities: request => listSoulMemoryGraphEntities(request as MemoryGraphListRequest),
    upsertGraphEntity: request => upsertSoulMemoryGraphEntity(request as MemoryGraphEntityUpsertRequest),
    deleteGraphEntity: request => deleteSoulMemoryGraphEntity(request as MemoryGraphDeleteRequest),
    listGraphObservations: request => listSoulMemoryGraphObservations(request as MemoryGraphListRequest & { entityId?: string }),
    upsertGraphObservation: request => upsertSoulMemoryGraphObservation(request as MemoryGraphObservationUpsertRequest),
    deleteGraphObservation: request => deleteSoulMemoryGraphObservation(request as MemoryGraphDeleteRequest),
    listGraphRelations: request => listSoulMemoryGraphRelations(request as MemoryGraphListRequest & { entityId?: string }),
    upsertGraphRelation: request => upsertSoulMemoryGraphRelation(request as MemoryGraphRelationUpsertRequest),
    deleteGraphRelation: request => deleteSoulMemoryGraphRelation(request as MemoryGraphDeleteRequest),
    listGraphDuplicates: request => listSoulMemoryGraphDuplicates(request as MemoryGraphListRequest),
    mergeGraphDuplicate: request => mergeSoulMemoryGraphDuplicate(request as MemoryGraphDuplicateDecisionRequest),
    ignoreGraphDuplicate: request => ignoreSoulMemoryGraphDuplicate(request as MemoryGraphDuplicateDecisionRequest),
    getGraphAudit: request => getSoulMemoryGraphAudit(request as MemoryGraphAuditRequest),

    savePendingCapture: saveSoulMemoryPendingCapture,
    discardPendingCapture: discardSoulMemoryPendingCapture,
  })

  registerElectronMemoryIpcHandlers({
    handlers: [
      {
        channel: IPC_CHANNELS.MEMORY_OVERVIEW,
        handle: request => handlers.overview(request as { agentId?: string } | undefined),
      },
      {
        channel: IPC_CHANNELS.MEMORY_READ,
        handle: request => handlers.read(request as MemoryReadRequest),
      },
      {
        channel: IPC_CHANNELS.MEMORY_SEARCH,
        handle: request => handlers.search(request as MemorySearchRequest),
      },
      {
        channel: IPC_CHANNELS.MEMORY_APPEND,
        handle: request => handlers.append(request as MemoryAppendRequest),
      },
      {
        channel: IPC_CHANNELS.MEMORY_SAVE_FILE,
        handle: request => handlers.saveFile(request as MemorySaveFileRequest),
      },
      {
        channel: IPC_CHANNELS.MEMORY_INDEX,
        handle: request => handlers.index(request as { agentId?: string } | undefined),
      },
      {
        channel: IPC_CHANNELS.MEMORY_RUN_DREAMING,
        handle: request => handlers.runDreaming(request as { agentId?: string } | undefined),
      },
      {
        channel: IPC_CHANNELS.MEMORY_PROFILE_LIST,
        handle: request => handlers.profileList(request as MemoryProfileListRequest | undefined),
      },
      {
        channel: IPC_CHANNELS.MEMORY_PROFILE_SEARCH,
        handle: request => handlers.profileSearch(request as MemoryProfileListRequest),
      },
      {
        channel: IPC_CHANNELS.MEMORY_PROFILE_UPSERT,
        handle: request => handlers.profileUpsert(request as MemoryProfileUpsertRequest),
      },
      {
        channel: IPC_CHANNELS.MEMORY_PROFILE_DELETE,
        handle: request => handlers.profileDelete(request as MemoryProfileDeleteRequest),
      },
      {
        channel: IPC_CHANNELS.MEMORY_PROFILE_AUDIT,
        handle: request => handlers.profileAudit(request as MemoryProfileAuditRequest),
      },
      {
        channel: IPC_CHANNELS.MEMORY_PROFILE_EXPORT,
        handle: request => handlers.profileExport(request as { agentId?: string } | undefined),
      },
      {
        channel: IPC_CHANNELS.MEMORY_GRAPH_OVERVIEW,
        handle: request => handlers.graphOverview(request as { agentId?: string } | undefined),
      },
      {
        channel: IPC_CHANNELS.MEMORY_GRAPH_ENTITIES_LIST,
        handle: request => handlers.graphEntitiesList(request as MemoryGraphListRequest | undefined),
      },
      {
        channel: IPC_CHANNELS.MEMORY_GRAPH_ENTITIES_UPSERT,
        handle: request => handlers.graphEntitiesUpsert(request as MemoryGraphEntityUpsertRequest),
      },
      {
        channel: IPC_CHANNELS.MEMORY_GRAPH_ENTITIES_DELETE,
        handle: request => handlers.graphEntitiesDelete(request as MemoryGraphDeleteRequest),
      },
      {
        channel: IPC_CHANNELS.MEMORY_GRAPH_OBSERVATIONS_LIST,
        handle: request =>
          handlers.graphObservationsList(request as (MemoryGraphListRequest & { entityId?: string }) | undefined),
      },
      {
        channel: IPC_CHANNELS.MEMORY_GRAPH_OBSERVATIONS_UPSERT,
        handle: request => handlers.graphObservationsUpsert(request as MemoryGraphObservationUpsertRequest),
      },
      {
        channel: IPC_CHANNELS.MEMORY_GRAPH_OBSERVATIONS_DELETE,
        handle: request => handlers.graphObservationsDelete(request as MemoryGraphDeleteRequest),
      },
      {
        channel: IPC_CHANNELS.MEMORY_GRAPH_RELATIONS_LIST,
        handle: request =>
          handlers.graphRelationsList(request as (MemoryGraphListRequest & { entityId?: string }) | undefined),
      },
      {
        channel: IPC_CHANNELS.MEMORY_GRAPH_RELATIONS_UPSERT,
        handle: request => handlers.graphRelationsUpsert(request as MemoryGraphRelationUpsertRequest),
      },
      {
        channel: IPC_CHANNELS.MEMORY_GRAPH_RELATIONS_DELETE,
        handle: request => handlers.graphRelationsDelete(request as MemoryGraphDeleteRequest),
      },
      {
        channel: IPC_CHANNELS.MEMORY_GRAPH_DUPLICATES_LIST,
        handle: request => handlers.graphDuplicatesList(request as MemoryGraphListRequest | undefined),
      },
      {
        channel: IPC_CHANNELS.MEMORY_GRAPH_DUPLICATES_MERGE,
        handle: request => handlers.graphDuplicatesMerge(request as MemoryGraphDuplicateDecisionRequest),
      },
      {
        channel: IPC_CHANNELS.MEMORY_GRAPH_DUPLICATES_IGNORE,
        handle: request => handlers.graphDuplicatesIgnore(request as MemoryGraphDuplicateDecisionRequest),
      },
      {
        channel: IPC_CHANNELS.MEMORY_GRAPH_AUDIT,
        handle: request => handlers.graphAudit(request as MemoryGraphAuditRequest),
      },
      {
        channel: IPC_CHANNELS.MEMORY_LOGS_LIST,
        handle: request => handlers.logsList(request as MemoryLogsListRequest | undefined),
      },
      {
        channel: IPC_CHANNELS.MEMORY_LOGS_STATS,
        handle: () => handlers.logsStats(),
      },
      {
        channel: IPC_CHANNELS.MEMORY_LOGS_OPEN_FOLDER,
        handle: () => handlers.logsOpenFolder(),
      },
      {
        channel: IPC_CHANNELS.MEMORY_LOGS_CLEANUP,
        handle: () => handlers.logsCleanup(),
      },
      {
        channel: IPC_CHANNELS.MEMORY_CAPTURE_SAVE,
        handle: request => handlers.captureSave(request as MemoryCaptureDecisionRequest | undefined),
      },
      {
        channel: IPC_CHANNELS.MEMORY_CAPTURE_DISCARD,
        handle: request => handlers.captureDiscard(request as MemoryCaptureDecisionRequest | undefined),
      },
    ],
  })
}
