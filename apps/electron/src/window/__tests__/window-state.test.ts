import { describe, expect, it, vi } from 'vitest'
import {
  readElectronSearchWindowSize,
  readElectronTodoPlanWindowState,
  readElectronWindowState,
  sanitizeElectronWindowState,
  saveElectronMainWindowState,
  saveElectronSearchWindowSize,
  saveElectronTodoPlanWindowState,
} from '../window-state.js'

function storage(initial: any) {
  return {
    path: '/tmp/window-state.json',
    readJsonFile: vi.fn((_path: string, fallback: any) => initial ?? fallback),
    writeJsonFile: vi.fn(),
  }
}

function windowMock(overrides: Record<string, unknown> = {}) {
  return {
    isMaximized: vi.fn(() => false),
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    getBounds: vi.fn(() => ({ width: 900, height: 700, x: 12, y: 24 })),
    ...overrides,
  } as any
}

describe('electron window state persistence', () => {
  it('sanitizes invalid persisted bounds with fallback dimensions', () => {
    expect(sanitizeElectronWindowState({
      width: -1,
      height: Number.NaN,
      x: 10,
      y: 'bad' as any,
      isMaximized: true,
    }, { width: 1000, height: 800 })).toEqual({
      width: 1000,
      height: 800,
      x: 10,
      y: undefined,
      isMaximized: true,
    })
  })

  it('reads main and todo plan window state with independent fallbacks', () => {
    const store = storage({
      width: 1200,
      height: 900,
      todoPlan: {
        width: 320,
        height: 0,
      },
    })

    expect(readElectronWindowState(store)).toEqual({
      width: 1200,
      height: 900,
      x: undefined,
      y: undefined,
      isMaximized: false,
      todoPlan: {
        width: 320,
        height: 640,
        x: undefined,
        y: undefined,
        isMaximized: false,
      },
    })
    expect(readElectronTodoPlanWindowState(store)).toEqual({
      width: 320,
      height: 640,
      x: undefined,
      y: undefined,
      isMaximized: false,
    })
  })

  it('saves maximized main window state without overwriting other fields', () => {
    const store = storage({ width: 800, height: 600, todoPlan: { width: 460, height: 640 } })
    const win = windowMock({ isMaximized: vi.fn(() => true) })

    saveElectronMainWindowState(win, store)

    expect(store.writeJsonFile).toHaveBeenCalledWith('/tmp/window-state.json', {
      width: 800,
      height: 600,
      x: undefined,
      y: undefined,
      isMaximized: true,
      todoPlan: {
        width: 460,
        height: 640,
        x: undefined,
        y: undefined,
        isMaximized: false,
      },
    })
  })

  it('saves normal main window bounds', () => {
    const store = storage({ width: 800, height: 600 })
    const win = windowMock()

    saveElectronMainWindowState(win, store)

    expect(store.writeJsonFile).toHaveBeenCalledWith('/tmp/window-state.json', {
      width: 900,
      height: 700,
      x: 12,
      y: 24,
      isMaximized: false,
    })
  })

  it('reads and saves the remembered search window size', () => {
    const store = storage({ width: 800, height: 600, searchWindow: { width: 700.4, height: 420 } })

    expect(readElectronSearchWindowSize(store)).toEqual({ width: 700, height: 420 })

    saveElectronSearchWindowSize(store, { width: 640, height: 360 })
    expect(store.writeJsonFile).toHaveBeenCalledWith('/tmp/window-state.json', {
      width: 800,
      height: 600,
      x: undefined,
      y: undefined,
      isMaximized: false,
      searchWindow: { width: 640, height: 360 },
    })
  })

  it('drops invalid search window sizes on read and refuses to persist them', () => {
    const store = storage({ width: 800, height: 600, searchWindow: { width: -5, height: 300 } })

    expect(readElectronSearchWindowSize(store)).toBeNull()

    saveElectronSearchWindowSize(store, { width: Number.NaN, height: 300 })
    expect(store.writeJsonFile).not.toHaveBeenCalled()
  })

  it('keeps the search window size when saving main window state', () => {
    const store = storage({ width: 800, height: 600, searchWindow: { width: 700, height: 420 } })
    const win = windowMock()

    saveElectronMainWindowState(win, store)

    expect(store.writeJsonFile).toHaveBeenCalledWith('/tmp/window-state.json', {
      width: 900,
      height: 700,
      x: 12,
      y: 24,
      isMaximized: false,
      searchWindow: { width: 700, height: 420 },
    })
  })

  it('saves todo plan bounds from stable bounds and skips unavailable windows', () => {
    const store = storage({ width: 800, height: 600 })
    const win = windowMock()

    saveElectronTodoPlanWindowState(win, store, { width: 500, height: 500, x: 1, y: 2 })
    saveElectronTodoPlanWindowState(null, store)

    expect(store.writeJsonFile).toHaveBeenCalledTimes(1)
    expect(store.writeJsonFile).toHaveBeenCalledWith('/tmp/window-state.json', {
      width: 800,
      height: 600,
      x: undefined,
      y: undefined,
      isMaximized: false,
      todoPlan: {
        width: 500,
        height: 500,
        x: 1,
        y: 2,
      },
    })
  })
})
