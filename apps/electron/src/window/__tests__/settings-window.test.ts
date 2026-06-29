import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class MockBrowserWindow {
    static instances: MockBrowserWindow[] = []

    handlers = new Map<string, (...args: any[]) => void>()
    webContentsHandlers = new Map<string, (...args: any[]) => void>()
    focus = vi.fn()
    show = vi.fn()
    isDestroyed = vi.fn(() => false)
    loadURL = vi.fn()
    loadFile = vi.fn()
    webContents = {
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
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

describe('electron settings window', () => {
  function createOptions(overrides: Record<string, unknown> = {}) {
    let currentWindow = (overrides.currentWindow ?? null) as any
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
    }
    return {
      logger,
      options: {
        currentWindow,
        setCurrentWindow: vi.fn((window) => {
          currentWindow = window
        }),
        isDevelopment: true,
        isMac: false,
        backgroundColor: '#101010',
        effectiveTheme: 'dark',
        colorTheme: 'blue',
        rendererDevUrl: 'http://127.0.0.1:5173',
        rendererIndexPath: '/dist/renderer/index.html',
        preloadPath: '/dist/preload/index.js',
        logger,
        ...overrides,
      } as any,
    }
  }

  it('focuses an existing settings window', async () => {
    const { openElectronSettingsWindow } = await import('../settings-window.js')
    const existingWindow = {
      focus: vi.fn(),
      isDestroyed: vi.fn(() => false),
    }
    const { options } = createOptions({ currentWindow: existingWindow })

    const result = openElectronSettingsWindow(options)

    expect(result).toBe(existingWindow)
    expect(existingWindow.focus).toHaveBeenCalledTimes(1)
    expect(mocks.MockBrowserWindow.instances).toHaveLength(0)
  })

  it('creates and loads a development settings window', async () => {
    const { openElectronSettingsWindow } = await import('../settings-window.js')
    const { options } = createOptions()

    const result = openElectronSettingsWindow(options) as any

    expect(result.options).toMatchObject({
      width: 900,
      height: 620,
      backgroundColor: '#101010',
      titleBarStyle: 'default',
      webPreferences: {
        preload: '/dist/preload/index.js',
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    expect(options.setCurrentWindow).toHaveBeenCalledWith(result)
    expect(result.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173/#/settings?theme=dark&colorTheme=blue')

    result.emit('ready-to-show')
    expect(result.show).toHaveBeenCalledTimes(1)

    result.emitWebContents('did-fail-load', {}, 500, 'boom')
    expect(options.logger.error).toHaveBeenCalledWith('[Settings] Failed to load:', 500, 'boom')
  })

  it('loads the production settings route from the renderer index', async () => {
    const { openElectronSettingsWindow } = await import('../settings-window.js')
    const { options } = createOptions({
      isDevelopment: false,
      isMac: true,
      effectiveTheme: 'light',
      colorTheme: 'green',
    })

    const result = openElectronSettingsWindow(options) as any

    expect(result.options.transparent).toBe(true)
    expect(result.options.backgroundColor).toBeUndefined()
    expect(result.options.titleBarStyle).toBe('hiddenInset')
    expect(result.loadFile).toHaveBeenCalledWith('/dist/renderer/index.html', {
      hash: '/settings?theme=light&colorTheme=green',
    })

    result.emit('closed')
    expect(options.setCurrentWindow).toHaveBeenLastCalledWith(null)
  })
})
