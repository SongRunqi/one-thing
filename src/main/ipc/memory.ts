import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type {
  MemoryAppendRequest,
  MemoryCaptureDecisionRequest,
  MemoryProfileAuditRequest,
  MemoryProfileDeleteRequest,
  MemoryProfileListRequest,
  MemoryProfileUpsertRequest,
  MemoryReadRequest,
  MemorySaveFileRequest,
  MemorySearchRequest,
} from '../../shared/ipc.js'
import {
  appendSoulMemoryPanel,
  deleteSoulMemoryProfile,
  discardSoulMemoryPendingCapture,
  exportSoulMemoryProfile,
  getSoulMemoryProfileAudit,
  getSoulMemoryOverview,
  listSoulMemoryProfile,
  readSoulMemoryManagedFile,
  rebuildSoulMemoryIndex,
  runSoulMemoryDreamingNow,
  saveSoulMemoryManagedFile,
  saveSoulMemoryPendingCapture,
  searchSoulMemoryPanel,
  searchSoulMemoryProfile,
  upsertSoulMemoryProfile,
} from '../plugins/builtin/soul-memory.js'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
      return { success: true, hits: await searchSoulMemoryPanel(request) }
    } catch (error) {
      console.error('[MemoryIPC] search error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_APPEND, async (_event, request: MemoryAppendRequest) => {
    try {
      return { success: true, target: await appendSoulMemoryPanel(request) }
    } catch (error) {
      console.error('[MemoryIPC] append error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_SAVE_FILE, async (_event, request: MemorySaveFileRequest) => {
    try {
      return { success: true, file: await saveSoulMemoryManagedFile(request) }
    } catch (error) {
      console.error('[MemoryIPC] save-file error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_INDEX, async () => {
    try {
      return { success: true, status: await rebuildSoulMemoryIndex() }
    } catch (error) {
      console.error('[MemoryIPC] index error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_RUN_DREAMING, async () => {
    try {
      return { success: true, result: await runSoulMemoryDreamingNow() }
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
