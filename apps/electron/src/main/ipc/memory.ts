import { shell } from 'electron'
import { registerElectronMemoryIpcHandlers } from '@onething/electron-host/ipc/memory'
import { createOnethingMemoryIpcHandlers } from '@onething/runtime/memory/ipc'
import { IPC_CHANNELS } from '@shared/ipc.js'
import type {
  MemoryAppendRequest,
  MemoryReadRequest,
  MemorySaveFileRequest,
} from '@shared/ipc.js'
import {
  logMemoryDiagnostic,
  memoryDiagnosticsLogger,
} from '../memory/diagnostics-logger.js'
import {
  appendSoulMemoryPanel,
  discardSoulMemoryPendingCapture,
  getSoulMemoryOverview,
  readSoulMemoryManagedFile,
  saveSoulMemoryManagedFile,
  saveSoulMemoryPendingCapture,
} from '../plugins/builtin/soul-memory.js'

export function registerMemoryHandlers(): void {
  // Memory is plain markdown owned by this process; the panel talks to the
  // soul-memory plugin directly instead of proxying to the headless server.
  const handlers = createOnethingMemoryIpcHandlers({
    logDiagnostic: input => logMemoryDiagnostic(input),
    diagnosticsLogger: memoryDiagnosticsLogger,
    openLogFolder: async (logDir) => {
      await shell.openPath(logDir)
    },
    onError: (operation, error) => {
      console.error(`[Memory] ${operation} error:`, error)
    },
    getOverview: agentId => getSoulMemoryOverview(agentId),
    readManagedFile: request => readSoulMemoryManagedFile(request as MemoryReadRequest),
    appendPanel: request => appendSoulMemoryPanel(request as MemoryAppendRequest),
    saveManagedFile: request => saveSoulMemoryManagedFile(request as MemorySaveFileRequest),
    savePendingCapture: id => saveSoulMemoryPendingCapture(id),
    discardPendingCapture: id => discardSoulMemoryPendingCapture(id),
  })

  registerElectronMemoryIpcHandlers({
    handlers: [
      { channel: IPC_CHANNELS.MEMORY_OVERVIEW, handle: request => handlers.overview(request as { agentId?: string } | undefined) },
      { channel: IPC_CHANNELS.MEMORY_READ, handle: request => handlers.read(request) },
      { channel: IPC_CHANNELS.MEMORY_APPEND, handle: request => handlers.append(request) },
      { channel: IPC_CHANNELS.MEMORY_SAVE_FILE, handle: request => handlers.saveFile(request) },
      { channel: IPC_CHANNELS.MEMORY_LOGS_LIST, handle: request => handlers.logsList(request as Parameters<typeof handlers.logsList>[0]) },
      { channel: IPC_CHANNELS.MEMORY_LOGS_STATS, handle: () => handlers.logsStats() },
      { channel: IPC_CHANNELS.MEMORY_LOGS_OPEN_FOLDER, handle: () => handlers.logsOpenFolder() },
      { channel: IPC_CHANNELS.MEMORY_LOGS_CLEANUP, handle: () => handlers.logsCleanup() },
      { channel: IPC_CHANNELS.MEMORY_CAPTURE_SAVE, handle: request => handlers.captureSave(request as { id?: string } | undefined) },
      { channel: IPC_CHANNELS.MEMORY_CAPTURE_DISCARD, handle: request => handlers.captureDiscard(request as { id?: string } | undefined) },
    ],
  })
}
