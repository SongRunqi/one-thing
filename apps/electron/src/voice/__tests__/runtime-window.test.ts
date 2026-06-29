import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  windows: [] as any[],
  BrowserWindow: vi.fn(),
}))

vi.mock('electron', () => {
  mocks.BrowserWindow.mockImplementation(function BrowserWindowMock(options: Record<string, unknown>) {
    const listeners = new Map<string, () => void>()
    const win = {
      options,
      webContents: {
        send: vi.fn(),
      },
      on: vi.fn((event: string, callback: () => void) => {
        listeners.set(event, callback)
      }),
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      isDestroyed: vi.fn(() => false),
      destroy: vi.fn(() => {
        listeners.get('closed')?.()
      }),
    }
    mocks.windows.push(win)
    return win
  })

  return {
    BrowserWindow: mocks.BrowserWindow,
  }
})

function createController(overrides: Record<string, unknown> = {}) {
  return import('../runtime-window-controller.js').then(({ createElectronVoiceRuntimeWindowController }) => {
    return createElectronVoiceRuntimeWindowController({
      commandChannel: 'voice:runtime-command',
      getVisualOptions: () => ({
        isDevelopment: true,
        rendererDevUrl: 'http://127.0.0.1:5173',
        rendererIndexPath: '/dist/renderer/index.html',
        preloadPath: '/dist/preload/index.js',
        routeHash: '/voice-runtime',
      }),
      ...overrides,
    })
  })
}

describe('electron voice runtime window controller', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.windows.length = 0
    mocks.BrowserWindow.mockClear()
  })

  it('creates a hidden runtime window and loads the voice runtime route', async () => {
    const controller = await createController()

    const win = controller.ensureWindow() as any

    expect(win.options).toMatchObject({
      width: 360,
      height: 240,
      show: false,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        preload: '/dist/preload/index.js',
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })
    expect(win.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173/#/voice-runtime')
  })

  it('queues commands until the hidden runtime reports ready', async () => {
    const controller = await createController()

    controller.ensureWindow()
    controller.sendCommand({ type: 'start-recording' } as any)

    expect(mocks.windows[0].webContents.send).not.toHaveBeenCalled()

    controller.markReady()
    controller.flushCommands()

    expect(mocks.windows[0].webContents.send).toHaveBeenCalledWith('voice:runtime-command', {
      type: 'start-recording',
    })
  })

  it('sends commands immediately after the runtime is ready', async () => {
    const controller = await createController()

    controller.ensureWindow()
    controller.markReady()
    controller.sendCommand({ type: 'stop', reason: 'user' } as any)

    expect(mocks.windows[0].webContents.send).toHaveBeenCalledWith('voice:runtime-command', {
      type: 'stop',
      reason: 'user',
    })
  })

  it('resets readiness and pending commands when destroyed', async () => {
    const controller = await createController()

    const win = controller.ensureWindow() as any
    controller.markReady()
    controller.destroyWindow()

    expect(win.destroy).toHaveBeenCalledTimes(1)
    expect(controller.getWindow()).toBeNull()
    expect(controller.isReady()).toBe(false)
  })
})
