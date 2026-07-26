import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  recordCrash,
  getCrashLogEntries,
  dumpCrashLog,
  clearCrashLog,
  installGlobalCrashCapture,
} from '../crash-log'

function createStorageStub(): Storage {
  const map = new Map<string, string>()
  return {
    get length() { return map.size },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => { map.delete(key) },
    setItem: (key: string, value: string) => { map.set(key, value) },
  }
}

describe('crash-log', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageStub())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('records errors with message, stack and increasing seq', () => {
    recordCrash('error-boundary', new Error('first'))
    recordCrash('window-error', new Error('second'))

    const entries = getCrashLogEntries()
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ seq: 1, source: 'error-boundary', message: 'first' })
    expect(entries[0].stack).toContain('first')
    expect(entries[1]).toMatchObject({ seq: 2, source: 'window-error', message: 'second' })
  })

  it('survives across module usage via storage (reload scenario)', () => {
    recordCrash('error-boundary', new Error('before reload'))
    // A reload re-reads from the same storage — entries remain.
    expect(getCrashLogEntries()[0].message).toBe('before reload')
  })

  it('caps the ring buffer and keeps the newest entries', () => {
    for (let i = 0; i < 45; i++) recordCrash('window-error', new Error(`e${i}`))
    const entries = getCrashLogEntries()
    expect(entries).toHaveLength(40)
    expect(entries[entries.length - 1].message).toBe('e44')
    expect(entries[0].message).toBe('e5')
  })

  it('stringifies non-Error values', () => {
    recordCrash('unhandled-rejection', 'plain rejection reason')
    expect(getCrashLogEntries()[0].message).toBe('plain rejection reason')
  })

  it('truncates oversized stacks', () => {
    const err = new Error('big')
    err.stack = 'x'.repeat(10_000)
    recordCrash('error-boundary', err)
    const entry = getCrashLogEntries()[0]
    expect(entry.stack!.length).toBeLessThan(5_000)
    expect(entry.stack).toContain('[truncated]')
  })

  it('emits a single self-contained console line per error', () => {
    recordCrash('error-boundary', new Error('boom'), { info: 'component event handler' })
    expect(console.error).toHaveBeenCalledTimes(1)
    const line = vi.mocked(console.error).mock.calls[0][0] as string
    expect(line).toContain('[crash-log] #1 error-boundary: boom')
    expect(line).toContain('info: component event handler')
    expect(line).toContain('Error: boom')
  })

  it('dedupes repeated vue warns instead of flooding the buffer', () => {
    recordCrash('vue-warn', 'Invalid prop: foo')
    recordCrash('vue-warn', 'Invalid prop: foo')
    recordCrash('vue-warn', 'Invalid prop: foo')
    expect(getCrashLogEntries()).toHaveLength(1)
    expect(console.warn).toHaveBeenCalledTimes(3)
  })

  it('dump includes every entry and clear empties the log', () => {
    recordCrash('error-boundary', new Error('one'))
    recordCrash('vue-error-handler', new Error('two'))
    const dump = dumpCrashLog()
    expect(dump).toContain('one')
    expect(dump).toContain('two')

    clearCrashLog()
    expect(getCrashLogEntries()).toHaveLength(0)
    expect(dumpCrashLog()).toBe('[crash-log] empty')
  })

  it('tolerates a missing localStorage entirely', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => recordCrash('window-error', new Error('no storage'))).not.toThrow()
    expect(getCrashLogEntries()).toEqual([])
  })

  it('installGlobalCrashCapture wires vue handlers and is window-safe in node', () => {
    const app = { config: {} as Record<string, unknown> }
    installGlobalCrashCapture(app as unknown as Parameters<typeof installGlobalCrashCapture>[0])
    expect(typeof app.config.errorHandler).toBe('function')
    expect(typeof app.config.warnHandler).toBe('function')

    ;(app.config.errorHandler as (e: unknown, i: null, info: string) => void)(new Error('from handler'), null, 'render')
    const entries = getCrashLogEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ source: 'vue-error-handler', message: 'from handler', info: 'render' })
  })
})
