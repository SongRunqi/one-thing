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
    appendPanel: vi.fn(async () => ({ relativePath: 'memory.md' })),
    saveManagedFile: vi.fn(async () => ({ relativePath: 'MEMORY.md' })),
    savePendingCapture: vi.fn(async () => ({ id: 'capture' })),
    discardPendingCapture: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('runtime memory IPC handlers', () => {
  it('wraps memory operations with success responses and diagnostics logs', async () => {
    const adapters = createAdapters()
    const handlers = createOnethingMemoryIpcHandlers(adapters)

    const response = await handlers.append({ target: 'daily', heading: 'Note', content: 'hello' })

    expect(response).toEqual({ success: true, target: { relativePath: 'memory.md' } })
    expect(adapters.appendPanel).toHaveBeenCalledWith({ target: 'daily', heading: 'Note', content: 'hello' })
    expect(adapters.logDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      subsystem: 'ipc',
      operation: 'memory-append',
      stage: 'request',
      status: 'started',
    }))
    expect(adapters.logDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      subsystem: 'ipc',
      operation: 'memory-append',
      stage: 'response',
      status: 'ok',
    }))
  })

  it('serves overview, read, and pending-capture operations', async () => {
    const adapters = createAdapters()
    const handlers = createOnethingMemoryIpcHandlers(adapters)

    await expect(handlers.overview({ agentId: 'agent-1' })).resolves.toEqual({
      success: true,
      overview: { enabled: true },
    })
    expect(adapters.getOverview).toHaveBeenCalledWith('agent-1')

    await expect(handlers.read({ path: 'MEMORY.md' })).resolves.toEqual({
      success: true,
      file: { content: 'file' },
    })
    expect(adapters.readManagedFile).toHaveBeenCalledWith({ path: 'MEMORY.md' })

    await expect(handlers.captureSave({ id: 'cap-1' })).resolves.toEqual({
      success: true,
      target: { id: 'capture' },
    })
    expect(adapters.savePendingCapture).toHaveBeenCalledWith('cap-1')

    await expect(handlers.captureDiscard({ id: 'cap-2' })).resolves.toEqual({ success: true })
    expect(adapters.discardPendingCapture).toHaveBeenCalledWith('cap-2')
  })

  it('converts adapter failures into IPC failure responses', async () => {
    const onError = vi.fn()
    const adapters = createAdapters({
      onError,
      saveManagedFile: vi.fn(async () => {
        throw new Error('cannot save file')
      }),
    })
    const handlers = createOnethingMemoryIpcHandlers(adapters)

    await expect(handlers.saveFile({ path: 'MEMORY.md', content: 'x' })).resolves.toEqual({
      success: false,
      error: 'cannot save file',
    })
    expect(onError).toHaveBeenCalledWith('save-file', expect.any(Error))
    expect(adapters.logDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'memory-save-file',
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
