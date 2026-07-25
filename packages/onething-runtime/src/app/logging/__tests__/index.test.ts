import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  logs: [] as Array<{ level: string; source: string; message: string; metadata?: Record<string, unknown> }>,
  setElectronAppLogsPath: vi.fn(),
  ensureDir: vi.fn(),
}))

vi.mock('@onething/electron-host/logging/console-capture', () => ({
  createElectronRendererConsoleCapture: () => ({
    attach: vi.fn(),
    detach: vi.fn(),
  }),
  setElectronAppLogsPath: mocks.setElectronAppLogsPath,
}))

vi.mock('../../stores/paths.js', () => ({
  ensureDir: mocks.ensureDir,
  getLogDir: () => '/tmp/onething-test-logs',
}))

vi.mock('../rolling-file-logger.js', () => ({
  RollingFileLogger: class {
    start = vi.fn()
    shutdown = vi.fn(async () => undefined)
    flushSync = vi.fn()
    getActiveLogPath = vi.fn(() => '/tmp/onething-test-logs/app.log')

    log(entry: { level: string; source: string; message: string; metadata?: Record<string, unknown> }): void {
      mocks.logs.push(entry)
    }
  },
}))

describe('main process logging', () => {
  const originalConsoleLog = console.log

  beforeEach(() => {
    vi.resetModules()
    mocks.logs.length = 0
    mocks.setElectronAppLogsPath.mockClear()
    mocks.ensureDir.mockClear()
  })

  afterEach(() => {
    console.log = originalConsoleLog
  })

  it('suppresses broken stdout pipes while still writing app logs', async () => {
    const brokenPipeError = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
    console.log = (() => {
      throw brokenPipeError
    }) as typeof console.log

    const logging = await import('../index.js')

    expect(() => logging.initializeAppLogging()).not.toThrow()
    expect(() => console.log('[IPCBridge] Unbound')).not.toThrow()

    await logging.shutdownAppLogging()

    expect(mocks.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        level: 'debug',
        source: 'process',
        message: 'Suppressed broken stdout/stderr pipe during shutdown',
        metadata: { code: 'EPIPE' },
      }),
      expect.objectContaining({
        level: 'info',
        source: 'main',
        message: '[IPCBridge] Unbound',
      }),
    ]))
  })
})
