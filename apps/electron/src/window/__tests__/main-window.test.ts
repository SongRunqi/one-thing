import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class MockBrowserWindow {
    static instances: MockBrowserWindow[] = []

    handlers = new Map<string, (...args: any[]) => void>()
    hide = vi.fn()
    maximize = vi.fn()
    show = vi.fn()
    webContents = {
      openDevTools: vi.fn(),
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
  }

  return { MockBrowserWindow }
})

vi.mock('electron', () => ({
  BrowserWindow: mocks.MockBrowserWindow,
}))

describe('electron main window', () => {
  beforeEach(() => {
    mocks.MockBrowserWindow.instances = []
  })

  function createOptions(overrides: Record<string, unknown> = {}) {
    return {
      windowState: { width: 1000, height: 800, x: 10, y: 20 },
      isDevelopment: false,
      isMac: false,
      backgroundColor: '#202020',
      iconPath: '/resources/onething.png',
      preloadPath: '/dist/preload/index.js',
      shouldSuppressActivation: vi.fn(() => false),
      shouldHideForVoice: vi.fn(() => false),
      saveWindowState: vi.fn(),
      ...overrides,
    } as any
  }

  it('creates a main BrowserWindow with desktop defaults', async () => {
    const { createElectronMainWindow } = await import('../main-window.js')
    const options = createOptions()

    const mainWindow = createElectronMainWindow(options) as any

    expect(mainWindow.options).toMatchObject({
      width: 1000,
      height: 800,
      x: 10,
      y: 20,
      minWidth: 600,
      minHeight: 600,
      icon: '/resources/onething.png',
      show: false,
      backgroundColor: '#202020',
      titleBarStyle: 'default',
      webPreferences: {
        preload: '/dist/preload/index.js',
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })
  })

  it('maximizes and shows the window when ready', async () => {
    const { createElectronMainWindow } = await import('../main-window.js')
    const options = createOptions({
      windowState: { width: 1000, height: 800, isMaximized: true },
    })

    const mainWindow = createElectronMainWindow(options) as any
    mainWindow.emit('ready-to-show')

    expect(mainWindow.maximize).toHaveBeenCalledTimes(1)
    expect(mainWindow.show).toHaveBeenCalledTimes(1)
  })

  it('hides the ready window when activation is suppressed', async () => {
    const { createElectronMainWindow } = await import('../main-window.js')
    const options = createOptions({
      shouldSuppressActivation: vi.fn(() => true),
    })

    const mainWindow = createElectronMainWindow(options) as any
    mainWindow.emit('ready-to-show')

    expect(mainWindow.hide).toHaveBeenCalledTimes(1)
    expect(mainWindow.show).not.toHaveBeenCalled()
  })

  it('saves state on resize and move', async () => {
    const { createElectronMainWindow } = await import('../main-window.js')
    const options = createOptions()

    const mainWindow = createElectronMainWindow(options) as any
    mainWindow.emit('resize')
    mainWindow.emit('move')

    expect(options.saveWindowState).toHaveBeenCalledTimes(2)
    expect(options.saveWindowState).toHaveBeenCalledWith(mainWindow)
  })

  it('prevents close and hides when voice keep-alive wants the main window hidden', async () => {
    const { createElectronMainWindow } = await import('../main-window.js')
    const options = createOptions({
      shouldHideForVoice: vi.fn(() => true),
    })

    const mainWindow = createElectronMainWindow(options) as any
    const event = { preventDefault: vi.fn() }
    mainWindow.emit('close', event)

    expect(options.saveWindowState).toHaveBeenCalledWith(mainWindow)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(mainWindow.hide).toHaveBeenCalledTimes(1)
  })

  it('opens devtools in development', async () => {
    const { createElectronMainWindow } = await import('../main-window.js')
    const options = createOptions({ isDevelopment: true })

    const mainWindow = createElectronMainWindow(options) as any

    expect(mainWindow.webContents.openDevTools).toHaveBeenCalledTimes(1)
  })
})
