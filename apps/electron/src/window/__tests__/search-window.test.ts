import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class MockBrowserWindow {
    static instances: MockBrowserWindow[] = []

    handlers = new Map<string, (...args: any[]) => void>()
    visible = false
    destroyed = false
    parentWindow: MockBrowserWindow | null = null
    bounds = { x: 120, y: 140, width: 600, height: 320 }
    webContents = {
      send: vi.fn(),
    }
    setMinimumSize = vi.fn()
    setMaximumSize = vi.fn()
    setBounds = vi.fn((bounds) => {
      this.bounds = bounds
    })
    getBounds = vi.fn(() => this.bounds)
    setParentWindow = vi.fn((parent) => {
      this.parentWindow = parent
    })
    getParentWindow = vi.fn(() => this.parentWindow)
    show = vi.fn(() => {
      this.visible = true
    })
    focus = vi.fn()
    hide = vi.fn(() => {
      this.visible = false
    })
    isVisible = vi.fn(() => this.visible)
    isDestroyed = vi.fn(() => this.destroyed)
    loadURL = vi.fn()
    loadFile = vi.fn()

    constructor(public readonly options: Record<string, unknown>) {
      this.parentWindow = options.parent as MockBrowserWindow | null
      this.bounds = {
        x: options.x as number,
        y: options.y as number,
        width: options.width as number,
        height: options.height as number,
      }
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
  nativeTheme: {
    shouldUseDarkColors: true,
  },
}))

const hiddenGuides = {
  visible: false,
  centerX: false,
  defaultTop: false,
  defaultHeight: false,
  defaultBounds: false,
}

function parentWindow(bounds = { x: 10, y: 20, width: 1000, height: 800 }) {
  const parent = new mocks.MockBrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  })
  parent.bounds = bounds
  return parent as any
}

async function createController(overrides: Record<string, unknown> = {}) {
  const { createElectronSearchWindowController } = await import('../search-window.js')
  return createElectronSearchWindowController({
    shownChannel: 'search:shown',
    guidesChannel: 'search:guides',
    hiddenGuides,
    guideHideDelayMs: 25,
    schedule: vi.fn((callback: () => void) => {
      callback()
      return 1
    }),
    clearScheduled: vi.fn(),
    getVisualOptions: () => ({
      isDevelopment: true,
      isMac: false,
      backgroundColor: '#202020',
      routeHash: '/search?theme=dark&colorTheme=blue',
      rendererDevUrl: 'http://127.0.0.1:5173',
      rendererIndexPath: '/dist/renderer/index.html',
      preloadPath: '/dist/preload/index.js',
    }),
    layout: {
      minWidth: 520,
      minHeight: 240,
      getSizeConstraints: () => ({
        minWidth: 520,
        minHeight: 240,
        maxWidth: 920,
        maxHeight: 624,
      }),
      getDefaultBounds: () => ({ x: 100, y: 120, width: 640, height: 320 }),
      getGuideState: () => ({
        visible: true,
        centerX: true,
        defaultTop: true,
        defaultHeight: true,
        defaultBounds: true,
      }),
    },
    ...overrides,
  } as any)
}

describe('electron search window controller', () => {
  beforeEach(() => {
    mocks.MockBrowserWindow.instances = []
  })

  it('creates a hidden frameless search window and loads the dev route', async () => {
    const controller = await createController()
    const parent = parentWindow()

    const win = controller.warm(parent) as any

    expect(win.options).toMatchObject({
      x: 100,
      y: 120,
      width: 640,
      height: 320,
      minWidth: 520,
      minHeight: 240,
      frame: false,
      show: false,
      parent,
      backgroundColor: '#202020',
      webPreferences: {
        preload: '/dist/preload/index.js',
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    expect(win.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173/#/search?theme=dark&colorTheme=blue')
    expect(win.show).not.toHaveBeenCalled()
  })

  it('defers showing until ready and notifies the renderer', async () => {
    const controller = await createController()
    const parent = parentWindow()

    const win = controller.open(parent) as any
    expect(win.show).not.toHaveBeenCalled()

    win.emit('ready-to-show')

    expect(win.setParentWindow).toHaveBeenCalledWith(parent)
    expect(win.setBounds).toHaveBeenCalledWith({ x: 100, y: 120, width: 640, height: 320 })
    expect(win.show).toHaveBeenCalledTimes(1)
    expect(win.focus).toHaveBeenCalledTimes(1)
    expect(win.webContents.send).toHaveBeenCalledWith('search:guides', hiddenGuides)
    expect(win.webContents.send).toHaveBeenCalledWith('search:shown', null)
  })

  it('forwards the open payload to the renderer on shown', async () => {
    const controller = await createController()
    const parent = parentWindow()
    const payload = { intent: { type: 'split-panel', panelId: 'main' } }

    const win = controller.open(parent, payload) as any
    win.emit('ready-to-show')

    expect(win.webContents.send).toHaveBeenCalledWith('search:shown', payload)

    // Re-presenting without a payload resets to a plain search.
    win.webContents.send.mockClear()
    controller.open(parent)
    expect(win.webContents.send).toHaveBeenCalledWith('search:shown', null)
  })

  it('re-presents a visible window instead of closing when toggled with a payload', async () => {
    const controller = await createController()
    const parent = parentWindow()
    const win = controller.open(parent) as any
    win.emit('ready-to-show')
    win.webContents.send.mockClear()

    controller.toggle(parent, { intent: { type: 'split-panel', panelId: 'main' } })

    expect(win.hide).not.toHaveBeenCalled()
    expect(win.webContents.send).toHaveBeenCalledWith('search:shown', {
      intent: { type: 'split-panel', panelId: 'main' },
    })
  })

  it('uses the remembered size clamped to constraints, centered on the default bounds', async () => {
    const controller = await createController({
      getPreferredSize: () => ({ width: 800, height: 700 }),
    })
    const parent = parentWindow()

    const win = controller.open(parent) as any
    win.emit('ready-to-show')

    // width 800 within max 920; height 700 clamped to 624; x recentered around
    // the default bounds' center (100 + 640/2 = 420).
    expect(win.setBounds).toHaveBeenLastCalledWith({ x: 20, y: 120, width: 800, height: 624 })
  })

  it('persists the current size when the window is dismissed', async () => {
    const savePreferredSize = vi.fn()
    const controller = await createController({ savePreferredSize })
    const parent = parentWindow()
    const win = controller.open(parent) as any
    win.emit('ready-to-show')
    win.bounds = { x: 90, y: 130, width: 700, height: 400 }

    controller.close()

    expect(savePreferredSize).toHaveBeenCalledWith({ width: 700, height: 400 })
  })

  it('updates and hides guide overlays when moved while visible', async () => {
    const schedule = vi.fn((callback: () => void) => {
      callback()
      return 'timer'
    })
    const controller = await createController({ schedule })
    const parent = parentWindow()
    const win = controller.open(parent) as any
    win.emit('ready-to-show')
    win.webContents.send.mockClear()

    win.emit('move')

    expect(win.webContents.send).toHaveBeenCalledWith('search:guides', {
      visible: true,
      centerX: true,
      defaultTop: true,
      defaultHeight: true,
      defaultBounds: true,
    })
    expect(win.webContents.send).toHaveBeenCalledWith('search:guides', hiddenGuides)
    expect(schedule).toHaveBeenCalledTimes(1)
  })

  it('closes by hiding the warm window instead of destroying it', async () => {
    const controller = await createController()
    const parent = parentWindow()
    const win = controller.open(parent) as any
    win.emit('ready-to-show')
    win.webContents.send.mockClear()

    controller.close()

    expect(win.webContents.send).toHaveBeenCalledWith('search:guides', hiddenGuides)
    expect(win.hide).toHaveBeenCalledTimes(1)
    expect(controller.getWindow()).toBe(win)
  })

  it('toggles the visible window closed', async () => {
    const controller = await createController()
    const parent = parentWindow()
    const win = controller.open(parent) as any
    win.emit('ready-to-show')

    controller.toggle(parent)

    expect(win.hide).toHaveBeenCalledTimes(1)
  })
})
