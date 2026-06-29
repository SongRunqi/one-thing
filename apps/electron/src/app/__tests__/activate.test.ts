import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  on: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    on: mocks.on,
  },
}))

describe('electron activate handler', () => {
  function createWindowStub() {
    const handlers = new Map<string, () => void>()
    return {
      webContents: { id: 'webcontents' },
      isDestroyed: vi.fn(() => false),
      on: vi.fn((event: string, handler: () => void) => {
        handlers.set(event, handler)
      }),
      emitClosed: () => handlers.get('closed')?.(),
    } as any
  }

  function createOptions(overrides: Record<string, unknown> = {}) {
    let mainWindow = (overrides.initialMainWindow ?? null) as any
    const createdWindow = createWindowStub()
    const schedules: Array<{ callback: () => void; delay: number }> = []
    const options = {
      getMainWindow: vi.fn(() => mainWindow),
      setMainWindow: vi.fn((window) => {
        mainWindow = window
      }),
      shouldSuppressMainWindowActivation: vi.fn(() => false),
      createWindow: vi.fn(() => createdWindow),
      attachVoiceTrayMainWindow: vi.fn(),
      registerGlobalWindowShortcuts: vi.fn(),
      initializeIPCBridge: vi.fn(),
      bindStreamEngine: vi.fn(),
      shutdownIPCBridge: vi.fn(),
      abortActiveStreams: vi.fn(),
      attachVoiceMainWindow: vi.fn(),
      warmSearchWindow: vi.fn(),
      warmTodoPlanWindow: vi.fn(),
      activateMainWindow: vi.fn(),
      schedule: vi.fn((callback, delay) => {
        schedules.push({ callback, delay })
      }),
      ...overrides,
    } as any
    return { options, createdWindow, schedules }
  }

  it('registers activate with Electron app by default', async () => {
    const { registerElectronActivateHandler } = await import('../activate.js')
    const { options } = createOptions()

    registerElectronActivateHandler(options)

    expect(mocks.on).toHaveBeenCalledWith('activate', expect.any(Function))
  })

  it('activates an existing main window', async () => {
    const { handleElectronActivate } = await import('../activate.js')
    const existingWindow = createWindowStub()
    const { options } = createOptions({ initialMainWindow: existingWindow })

    handleElectronActivate(options)

    expect(options.activateMainWindow).toHaveBeenCalledWith(existingWindow)
    expect(options.createWindow).not.toHaveBeenCalled()
  })

  it('skips window creation when activation is suppressed', async () => {
    const { handleElectronActivate } = await import('../activate.js')
    const { options } = createOptions({
      shouldSuppressMainWindowActivation: vi.fn(() => true),
    })

    handleElectronActivate(options)

    expect(options.createWindow).not.toHaveBeenCalled()
  })

  it('creates, binds, cleans up, and warms a new main window', async () => {
    const { handleElectronActivate } = await import('../activate.js')
    const { options, createdWindow, schedules } = createOptions()

    handleElectronActivate(options)

    expect(options.setMainWindow).toHaveBeenCalledWith(createdWindow)
    expect(options.attachVoiceTrayMainWindow).toHaveBeenCalledWith(createdWindow)
    expect(options.registerGlobalWindowShortcuts).toHaveBeenCalledWith(createdWindow)
    expect(options.initializeIPCBridge).toHaveBeenCalledWith(createdWindow.webContents)
    expect(options.bindStreamEngine).toHaveBeenCalledWith(createdWindow.webContents)
    expect(options.attachVoiceMainWindow).toHaveBeenCalledWith(createdWindow)
    expect(schedules.map(item => item.delay)).toEqual([1200, 1600])

    schedules[0].callback()
    schedules[1].callback()
    expect(options.warmSearchWindow).toHaveBeenCalledWith(createdWindow)
    expect(options.warmTodoPlanWindow).toHaveBeenCalledTimes(1)

    createdWindow.emitClosed()
    expect(options.shutdownIPCBridge).toHaveBeenCalledTimes(1)
    expect(options.abortActiveStreams).toHaveBeenCalledTimes(1)
    expect(options.setMainWindow).toHaveBeenLastCalledWith(null)
  })
})
