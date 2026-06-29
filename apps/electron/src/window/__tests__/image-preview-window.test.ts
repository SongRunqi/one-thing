import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class MockBrowserWindow {
    static instances: MockBrowserWindow[] = []

    handlers = new Map<string, (...args: any[]) => void>()
    webContentsHandlers = new Map<string, (...args: any[]) => void>()
    focused = false
    minimized = false
    destroyed = false
    focus = vi.fn(() => {
      this.focused = true
    })
    show = vi.fn()
    restore = vi.fn(() => {
      this.minimized = false
    })
    isDestroyed = vi.fn(() => this.destroyed)
    isMinimized = vi.fn(() => this.minimized)
    loadURL = vi.fn()
    loadFile = vi.fn()
    webContents = {
      send: vi.fn(),
      once: vi.fn((event: string, handler: (...args: any[]) => void) => {
        this.webContentsHandlers.set(event, handler)
      }),
    }

    constructor(public readonly options: Record<string, unknown>) {
      MockBrowserWindow.instances.push(this)
    }

    once(event: string, handler: (...args: any[]) => void) {
      this.handlers.set(event, handler)
    }

    on(event: string, handler: (...args: any[]) => void) {
      this.handlers.set(event, handler)
    }

    emit(event: string, ...args: any[]) {
      this.handlers.get(event)?.(...args)
    }

    emitWebContents(event: string, ...args: any[]) {
      this.webContentsHandlers.get(event)?.(...args)
    }
  }

  return { MockBrowserWindow }
})

vi.mock('electron', () => ({
  BrowserWindow: mocks.MockBrowserWindow,
}))

describe('electron image preview window', () => {
  beforeEach(() => {
    mocks.MockBrowserWindow.instances = []
  })

  function createOptions(overrides: Record<string, unknown> = {}) {
    let currentWindow = (overrides.currentWindow ?? null) as any
    const logger = { log: vi.fn() }
    return {
      logger,
      options: {
        currentWindow,
        setCurrentWindow: vi.fn((window) => {
          currentWindow = window
        }),
        payload: { mode: 'single', previewId: 'preview-1' },
        mode: 'single',
        routeHash: '/image-preview?theme=dark&mode=single&previewId=preview-1',
        updateChannel: 'image-preview:update',
        isDevelopment: true,
        isMac: false,
        backgroundColor: '#111111',
        rendererDevUrl: 'http://127.0.0.1:5173',
        rendererIndexPath: '/dist/renderer/index.html',
        preloadPath: '/dist/preload/index.js',
        logger,
        ...overrides,
      } as any,
    }
  }

  it('updates an existing single-image preview window through IPC', async () => {
    const { openElectronImagePreviewWindow } = await import('../image-preview-window.js')
    const existingWindow = new mocks.MockBrowserWindow({})
    existingWindow.minimized = true
    const payload = { mode: 'single', previewId: 'preview-2' }
    const { options } = createOptions({ currentWindow: existingWindow, payload })

    const result = openElectronImagePreviewWindow(options)

    expect(result).toBe(existingWindow)
    expect(existingWindow.webContents.send).toHaveBeenCalledWith('image-preview:update', payload)
    expect(existingWindow.restore).toHaveBeenCalledTimes(1)
    expect(existingWindow.show).toHaveBeenCalledTimes(1)
    expect(existingWindow.focus).toHaveBeenCalledTimes(1)
    expect(existingWindow.loadURL).not.toHaveBeenCalled()
  })

  it('reloads an existing gallery preview route', async () => {
    const { openElectronImagePreviewWindow } = await import('../image-preview-window.js')
    const existingWindow = new mocks.MockBrowserWindow({})
    const { options } = createOptions({
      currentWindow: existingWindow,
      payload: { mode: 'gallery', mediaId: 'media-1' },
      mode: 'gallery',
      routeHash: '/image-preview?theme=dark&mode=gallery&mediaId=media-1',
    })

    openElectronImagePreviewWindow(options)

    expect(existingWindow.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173/#/image-preview?theme=dark&mode=gallery&mediaId=media-1')
    expect(existingWindow.webContents.send).not.toHaveBeenCalled()
  })

  it('creates a single-image preview window and sends payload after dom-ready', async () => {
    const { openElectronImagePreviewWindow } = await import('../image-preview-window.js')
    const schedules: Array<{ callback: () => void; delay: number }> = []
    const payload = { mode: 'single', previewId: 'preview-3' }
    const { options } = createOptions({
      payload,
      schedule: vi.fn((callback, delay) => {
        schedules.push({ callback, delay })
      }),
    })

    const result = openElectronImagePreviewWindow(options) as any

    expect(result.options).toMatchObject({
      width: 900,
      height: 700,
      minWidth: 500,
      backgroundColor: '#111111',
      titleBarStyle: 'default',
      webPreferences: {
        preload: '/dist/preload/index.js',
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    expect(options.setCurrentWindow).toHaveBeenCalledWith(result)
    expect(result.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173/#/image-preview?theme=dark&mode=single&previewId=preview-1')

    result.emitWebContents('dom-ready')
    expect(schedules.map(item => item.delay)).toEqual([50])
    schedules[0].callback()
    expect(result.webContents.send).toHaveBeenCalledWith('image-preview:update', payload)

    result.emit('ready-to-show')
    expect(result.show).toHaveBeenCalledTimes(1)

    result.emit('closed')
    expect(options.setCurrentWindow).toHaveBeenLastCalledWith(null)
  })

  it('creates a production gallery preview window with wider dimensions', async () => {
    const { openElectronImagePreviewWindow } = await import('../image-preview-window.js')
    const { options } = createOptions({
      payload: { mode: 'gallery', mediaId: 'media-2' },
      mode: 'gallery',
      routeHash: '/image-preview?theme=light&mode=gallery&mediaId=media-2',
      isDevelopment: false,
      isMac: true,
    })

    const result = openElectronImagePreviewWindow(options) as any

    expect(result.options.width).toBe(1100)
    expect(result.options.minWidth).toBe(700)
    expect(result.options.transparent).toBe(true)
    expect(result.options.backgroundColor).toBeUndefined()
    expect(result.options.titleBarStyle).toBe('hiddenInset')
    expect(result.loadFile).toHaveBeenCalledWith('/dist/renderer/index.html', {
      hash: '/image-preview?theme=light&mode=gallery&mediaId=media-2',
    })
  })
})
