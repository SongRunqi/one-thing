import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  app: {
    quit: vi.fn(),
  },
  menu: {
    buildFromTemplate: vi.fn((template: unknown) => template),
  },
  nativeImage: {
    createFromPath: vi.fn(),
    createEmpty: vi.fn(() => ({ kind: 'empty-image' })),
  },
  Tray: vi.fn(),
  trays: [] as any[],
}))

function imageMock(empty = false) {
  return {
    isEmpty: vi.fn(() => empty),
    resize: vi.fn((size: { width: number; height: number }) => ({ kind: 'resized-image', size })),
  }
}

vi.mock('electron', () => {
  mocks.Tray.mockImplementation(function TrayMock(image: unknown) {
    const listeners = new Map<string, () => void>()
    const tray = {
      image,
      menu: null as unknown,
      listeners,
      setToolTip: vi.fn(),
      on: vi.fn((event: string, callback: () => void) => {
        listeners.set(event, callback)
      }),
      setContextMenu: vi.fn((menu: unknown) => {
        tray.menu = menu
      }),
      destroy: vi.fn(),
    }
    mocks.trays.push(tray)
    return tray
  })

  return {
    app: mocks.app,
    BrowserWindow: class BrowserWindow {},
    Menu: mocks.menu,
    Tray: mocks.Tray,
    nativeImage: mocks.nativeImage,
  }
})

async function createController(options: {
  state?: { enabled?: boolean; alwaysOn?: boolean }
  platform?: NodeJS.Platform
  shutdownVoiceService?: () => void | Promise<void>
} = {}) {
  const { createElectronVoiceTrayController } = await import('../tray-controller.js')
  const state = options.state ?? { enabled: true, alwaysOn: true }
  const shutdownVoiceService = options.shutdownVoiceService ?? vi.fn()
  return {
    state,
    shutdownVoiceService,
    controller: createElectronVoiceTrayController({
      getVoiceState: () => state,
      getIconPath: () => '/resources/onething.png',
      getPlatform: () => options.platform ?? 'linux',
      shutdownVoiceService,
    }),
  }
}

describe('electron voice tray controller', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.app.quit.mockReset()
    mocks.menu.buildFromTemplate.mockClear()
    mocks.nativeImage.createFromPath.mockReset()
    mocks.nativeImage.createFromPath.mockReturnValue(imageMock(false))
    mocks.nativeImage.createEmpty.mockClear()
    mocks.Tray.mockClear()
    mocks.trays.length = 0
  })

  it('hides the main window only for non-mac always-on voice sessions', async () => {
    const linux = await createController({ platform: 'linux' })
    expect(linux.controller.shouldHideMainWindowForVoice()).toBe(true)

    linux.controller.markQuitRequested()
    expect(linux.controller.shouldHideMainWindowForVoice()).toBe(false)

    const mac = await createController({ platform: 'darwin' })
    expect(mac.controller.shouldHideMainWindowForVoice()).toBe(false)

    const disabled = await createController({
      state: { enabled: false, alwaysOn: true },
      platform: 'linux',
    })
    expect(disabled.controller.shouldHideMainWindowForVoice()).toBe(false)
  })

  it('creates and destroys the tray from voice state', async () => {
    const { controller, state } = await createController()

    controller.update()

    expect(mocks.nativeImage.createFromPath).toHaveBeenCalledWith('/resources/onething.png')
    expect(mocks.Tray).toHaveBeenCalledTimes(1)
    expect(mocks.trays[0].image).toEqual({
      kind: 'resized-image',
      size: { width: 18, height: 18 },
    })
    expect(mocks.trays[0].setToolTip).toHaveBeenCalledWith('onething')
    expect(mocks.trays[0].setContextMenu).toHaveBeenCalledTimes(1)

    state.alwaysOn = false
    controller.update()

    expect(mocks.trays[0].destroy).toHaveBeenCalledTimes(1)
  })

  it('falls back to an empty image when the tray icon cannot be loaded', async () => {
    mocks.nativeImage.createFromPath.mockReturnValue(imageMock(true))
    const { controller } = await createController()

    controller.update()

    expect(mocks.nativeImage.createEmpty).toHaveBeenCalledTimes(1)
    expect(mocks.trays[0].image).toEqual({ kind: 'empty-image' })
  })

  it('shows and focuses the attached main window from tray actions', async () => {
    const { controller } = await createController()
    const mainWindow = {
      isDestroyed: vi.fn(() => false),
      show: vi.fn(),
      focus: vi.fn(),
    }

    controller.attachMainWindow(mainWindow as any)
    mocks.trays[0].listeners.get('click')?.()

    expect(mainWindow.show).toHaveBeenCalledTimes(1)
    expect(mainWindow.focus).toHaveBeenCalledTimes(1)

    const showItem = (mocks.trays[0].menu as any[]).find(item => item.label === 'Show onething')
    showItem.click()

    expect(mainWindow.show).toHaveBeenCalledTimes(2)
    expect(mainWindow.focus).toHaveBeenCalledTimes(2)
  })

  it('marks quit, shuts down voice, and quits from the tray menu', async () => {
    const shutdownVoiceService = vi.fn()
    const { controller } = await createController({ shutdownVoiceService })

    controller.update()
    const quitItem = (mocks.trays[0].menu as any[]).find(item => item.label === 'Quit')

    quitItem.click()

    expect(shutdownVoiceService).toHaveBeenCalledTimes(1)
    expect(mocks.app.quit).toHaveBeenCalledTimes(1)
    expect(controller.shouldHideMainWindowForVoice()).toBe(false)
  })

  it('configures the voice tray facade from injected runtime state', async () => {
    const {
      attachVoiceTrayMainWindow,
      configureVoiceTray,
      shouldHideMainWindowForVoice,
      updateVoiceTray,
    } = await import('../tray.js')
    const state = { enabled: true, alwaysOn: true }
    const shutdownVoiceService = vi.fn()

    configureVoiceTray({
      getVoiceState: () => state,
      getIconPath: () => '/resources/onething.png',
      getPlatform: () => 'linux',
      shutdownVoiceService,
    })

    expect(shouldHideMainWindowForVoice()).toBe(true)
    updateVoiceTray()
    expect(mocks.Tray).toHaveBeenCalledTimes(1)

    attachVoiceTrayMainWindow({
      isDestroyed: vi.fn(() => false),
      show: vi.fn(),
      focus: vi.fn(),
    } as any)

    const quitItem = (mocks.trays[0].menu as any[]).find(item => item.label === 'Quit')
    quitItem.click()

    expect(shutdownVoiceService).toHaveBeenCalledTimes(1)
    expect(mocks.app.quit).toHaveBeenCalledTimes(1)
    expect(shouldHideMainWindowForVoice()).toBe(false)
  })
})
