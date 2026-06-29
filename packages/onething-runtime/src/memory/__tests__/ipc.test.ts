import { describe, expect, it, vi } from 'vitest'
import {
  createOnethingMemoryIpcHandlers,
  type OnethingMemoryIpcAdapters,
} from '../ipc.js'

function createAdapters(overrides: Partial<OnethingMemoryIpcAdapters> = {}): OnethingMemoryIpcAdapters {
  const logDiagnostic = vi.fn()
  return {
    logDiagnostic,
    diagnosticsLogger: {
      list: vi.fn(async () => ({ entries: [], total: 0, logDir: '/tmp/memory' })),
      stats: vi.fn(async () => ({ files: 0 })),
      cleanup: vi.fn(async () => ['old.jsonl']),
      getConfig: vi.fn(() => ({ retentionDays: 7 })),
      getLogDir: vi.fn(() => '/tmp/memory'),
    },
    getOverview: vi.fn(async () => ({ enabled: true })),
    readManagedFile: vi.fn(async () => ({ content: 'file' })),
    searchPanel: vi.fn(async () => [{ id: 'hit' }]),
    appendPanel: vi.fn(async () => ({ relativePath: 'memory.md' })),
    saveManagedFile: vi.fn(async () => ({ relativePath: 'MEMORY.md' })),
    rebuildIndex: vi.fn(async () => ({ indexedChunks: 1 })),
    runDreamingNow: vi.fn(async () => ({ applied: 1 })),
    listProfile: vi.fn(async () => []),
    searchProfile: vi.fn(async () => []),
    upsertProfile: vi.fn(async () => ({ id: 'profile' })),
    deleteProfile: vi.fn(async () => undefined),
    getProfileAudit: vi.fn(async () => []),
    exportProfile: vi.fn(async () => '# Profile'),
    getGraphOverview: vi.fn(async () => ({ entities: 1 })),
    listGraphEntities: vi.fn(async () => []),
    upsertGraphEntity: vi.fn(async () => ({ id: 'entity:user:self' })),
    deleteGraphEntity: vi.fn(async () => undefined),
    listGraphObservations: vi.fn(async () => []),
    upsertGraphObservation: vi.fn(async () => ({ id: 'obs' })),
    deleteGraphObservation: vi.fn(async () => undefined),
    listGraphRelations: vi.fn(async () => []),
    upsertGraphRelation: vi.fn(async () => ({ id: 'rel' })),
    deleteGraphRelation: vi.fn(async () => undefined),
    listGraphDuplicates: vi.fn(async () => []),
    mergeGraphDuplicate: vi.fn(async () => undefined),
    ignoreGraphDuplicate: vi.fn(async () => undefined),
    getGraphAudit: vi.fn(async () => []),
    savePendingCapture: vi.fn(async () => ({ id: 'capture' })),
    discardPendingCapture: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('runtime memory IPC handlers', () => {
  it('wraps memory operations with success responses and diagnostics logs', async () => {
    const adapters = createAdapters()
    const handlers = createOnethingMemoryIpcHandlers(adapters)

    const response = await handlers.search({ query: 'secret token', limit: 5 })

    expect(response).toEqual({ success: true, hits: [{ id: 'hit' }] })
    expect(adapters.searchPanel).toHaveBeenCalledWith({ query: 'secret token', limit: 5 })
    expect(adapters.logDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      subsystem: 'ipc',
      operation: 'memory-search',
      stage: 'request',
      status: 'started',
    }))
    expect(adapters.logDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      subsystem: 'ipc',
      operation: 'memory-search',
      stage: 'response',
      status: 'ok',
    }))
  })

  it('converts adapter failures into IPC failure responses', async () => {
    const onError = vi.fn()
    const adapters = createAdapters({
      onError,
      deleteGraphEntity: vi.fn(async () => {
        throw new Error('cannot delete self')
      }),
    })
    const handlers = createOnethingMemoryIpcHandlers(adapters)

    await expect(handlers.graphEntitiesDelete({ id: 'entity:user:self' })).resolves.toEqual({
      success: false,
      error: 'cannot delete self',
    })
    expect(onError).toHaveBeenCalledWith('graph-entity-delete', expect.any(Error))
    expect(adapters.logDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'graph-entity-delete',
      stage: 'response',
      status: 'error',
    }))
  })

  it('uses a host adapter for opening the memory logs folder', async () => {
    const openLogFolder = vi.fn(async () => undefined)
    const adapters = createAdapters({ openLogFolder })
    const handlers = createOnethingMemoryIpcHandlers(adapters)

    await expect(handlers.logsOpenFolder()).resolves.toEqual({ success: true })
    expect(adapters.diagnosticsLogger.cleanup).toHaveBeenCalledWith(7)
    expect(openLogFolder).toHaveBeenCalledWith('/tmp/memory')
  })
})
