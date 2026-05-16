import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class MockBrowserWindow {
    static instances: MockBrowserWindow[] = []
    static focusedWindow: MockBrowserWindow | null = null
    static getFocusedWindow = vi.fn(() => MockBrowserWindow.focusedWindow)
    static getAllWindows = vi.fn(() => MockBrowserWindow.instances)

    bounds: { width: number; height: number; x?: number; y?: number }
    visible = false
    destroyed = false
    minimized = false
    focused = false
    frontmost = false
    alwaysOnTop = false
    url = ''
    listeners = new Map<string, Array<(...args: unknown[]) => void>>()
    show = vi.fn(() => {
      this.visible = true
      this.frontmost = true
    })
    showInactive = vi.fn(() => {
      this.visible = true
      this.frontmost = true
    })
    moveTop = vi.fn()
    hide = vi.fn(() => {
      this.visible = false
      this.focused = false
      this.frontmost = false
      if (MockBrowserWindow.focusedWindow === this) MockBrowserWindow.focusedWindow = null
    })
    focus = vi.fn(() => {
      this.focused = true
      this.frontmost = true
      MockBrowserWindow.focusedWindow = this
    })
    restore = vi.fn(() => {
      this.minimized = false
    })
    loadURL = vi.fn((url: string) => {
      this.url = url
    })
    loadFile = vi.fn((_file: string, options?: { hash?: string }) => {
      this.url = options?.hash || ''
    })
    setAlwaysOnTop = vi.fn((pinned: boolean) => {
      this.alwaysOnTop = pinned
    })
    getNativeWindowHandle = vi.fn(() => Buffer.alloc(8))
    getBounds = vi.fn(() => this.bounds)
    isMaximized = vi.fn(() => false)
    webContents = {
      getURL: vi.fn(() => this.url),
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      openDevTools: vi.fn(),
    }

    constructor(public options: Record<string, unknown>) {
      this.visible = options.show !== false
      this.bounds = {
        width: Number(options.width),
        height: Number(options.height),
        x: typeof options.x === 'number' ? options.x : undefined,
        y: typeof options.y === 'number' ? options.y : undefined,
      }
      MockBrowserWindow.instances.push(this)
    }

    isDestroyed() {
      return this.destroyed
    }

    isMinimized() {
      return this.minimized
    }

    isVisible() {
      return this.visible
    }

    isFocused() {
      return this.focused
    }

    isAlwaysOnTop() {
      return this.alwaysOnTop
    }

    once(event: string, listener: (...args: unknown[]) => void) {
      this.listeners.set(event, [listener])
      return this
    }

    on(event: string, listener: (...args: unknown[]) => void) {
      const listeners = this.listeners.get(event) || []
      listeners.push(listener)
      this.listeners.set(event, listeners)
      return this
    }

    emit(event: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(event) || []) listener(...args)
    }
  }

  return {
    MockBrowserWindow,
    app: { hide: vi.fn() },
    isMainAppWindowUrl: vi.fn(() => false),
    configureNonActivatingPanel: vi.fn(() => true),
    showNonActivatingPanel: vi.fn((window: MockBrowserWindow) => {
      window.visible = true
      window.frontmost = true
      return true
    }),
    hideNonActivatingPanel: vi.fn((window: MockBrowserWindow) => {
      window.visible = false
      window.frontmost = false
      return true
    }),
    isNonActivatingPanelFrontmost: vi.fn((window: MockBrowserWindow) => window.frontmost),
    setNonActivatingPanelPinned: vi.fn((window: MockBrowserWindow, pinned: boolean) => {
      window.alwaysOnTop = pinned
      return true
    }),
    readJsonFile: vi.fn((_path: string, defaultValue: unknown) => defaultValue),
    writeJsonFile: vi.fn(),
  }
})

vi.mock('electron', () => ({
  BrowserWindow: mocks.MockBrowserWindow,
  session: {
    defaultSession: {
      webRequest: {
        onHeadersReceived: vi.fn(),
      },
    },
  },
  shell: { openExternal: vi.fn() },
  Menu: {
    buildFromTemplate: vi.fn(() => ({})),
    setApplicationMenu: vi.fn(),
  },
  app: mocks.app,
  nativeTheme: { shouldUseDarkColors: false },
}))

vi.mock('../stores/paths.js', () => ({
  getWindowStatePath: vi.fn(() => '/tmp/window-state.json'),
  readJsonFile: mocks.readJsonFile,
  writeJsonFile: mocks.writeJsonFile,
}))

vi.mock('../stores/settings.js', () => ({
  getSettings: vi.fn(() => ({
    theme: 'dark',
    general: {},
  })),
}))

vi.mock('../themes/index.js', () => ({
  getThemeBackgroundColor: vi.fn(() => '#111111'),
  initializeThemes: vi.fn(),
}))

vi.mock('../search/window-target.js', () => ({
  isMainAppWindowUrl: mocks.isMainAppWindowUrl,
}))

vi.mock('../native/macos-panel.js', () => ({
  configureNonActivatingPanel: mocks.configureNonActivatingPanel,
  showNonActivatingPanel: mocks.showNonActivatingPanel,
  hideNonActivatingPanel: mocks.hideNonActivatingPanel,
  isNonActivatingPanelFrontmost: mocks.isNonActivatingPanelFrontmost,
  setNonActivatingPanelPinned: mocks.setNonActivatingPanelPinned,
}))

async function loadWindowModule() {
  vi.resetModules()
  return import('../window.js')
}

describe('todo plan standalone window controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.MockBrowserWindow.instances.length = 0
    mocks.MockBrowserWindow.focusedWindow = null
    mocks.MockBrowserWindow.getAllWindows.mockReturnValue(mocks.MockBrowserWindow.instances)
    mocks.configureNonActivatingPanel.mockReturnValue(true)
    mocks.showNonActivatingPanel.mockImplementation((window: InstanceType<typeof mocks.MockBrowserWindow>) => {
      window.visible = true
      window.frontmost = true
      return true
    })
    mocks.hideNonActivatingPanel.mockImplementation((window: InstanceType<typeof mocks.MockBrowserWindow>) => {
      window.visible = false
      window.frontmost = false
      return true
    })
    mocks.isNonActivatingPanelFrontmost.mockImplementation((window: InstanceType<typeof mocks.MockBrowserWindow>) => {
      return window.frontmost
    })
    mocks.setNonActivatingPanelPinned.mockImplementation((window: InstanceType<typeof mocks.MockBrowserWindow>, pinned: boolean) => {
      window.alwaysOnTop = pinned
      return true
    })
    mocks.isMainAppWindowUrl.mockReturnValue(false)
    mocks.readJsonFile.mockImplementation((_path: string, defaultValue: unknown) => defaultValue)
    mocks.writeJsonFile.mockClear()
  })

  it('hides the standalone window without creating or focusing another one', async () => {
    const { hideTodoPlanWindow, openTodoPlanWindow } = await loadWindowModule()
    const win = openTodoPlanWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>
    win.visible = true
    win.focused = false

    expect(hideTodoPlanWindow()).toBe(true)

    expect(mocks.hideNonActivatingPanel).toHaveBeenCalledWith(win)
    expect(win.hide).not.toHaveBeenCalled()
    expect(win.visible).toBe(false)
    expect(win.focus).not.toHaveBeenCalled()
    expect(mocks.MockBrowserWindow.instances).toHaveLength(1)
  })

  it('toggles a visible but covered standalone window by bringing it forward', async () => {
    const { openTodoPlanWindow, toggleTodoPlanWindow } = await loadWindowModule()
    const win = openTodoPlanWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>
    win.visible = true
    win.focused = false
    win.frontmost = false

    const result = toggleTodoPlanWindow()

    expect(result).toBe(win)
    if (process.platform === 'darwin') {
      expect(mocks.isNonActivatingPanelFrontmost).toHaveBeenCalledWith(win)
      expect(mocks.showNonActivatingPanel).toHaveBeenCalledWith(win)
      expect(win.showInactive).not.toHaveBeenCalled()
    } else {
      expect(win.show).toHaveBeenCalledTimes(1)
      expect(win.focus).toHaveBeenCalledTimes(1)
    }
    expect(mocks.hideNonActivatingPanel).not.toHaveBeenCalled()
    expect(win.hide).not.toHaveBeenCalled()
    expect(mocks.MockBrowserWindow.instances).toHaveLength(1)
  })

  it('toggles a visible frontmost standalone window by hiding it', async () => {
    const { openTodoPlanWindow, toggleTodoPlanWindow } = await loadWindowModule()
    const win = openTodoPlanWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>
    win.visible = true
    win.focused = false
    win.frontmost = true

    const result = toggleTodoPlanWindow()

    expect(result).toBeNull()
    expect(mocks.hideNonActivatingPanel).toHaveBeenCalledWith(win)
    expect(mocks.showNonActivatingPanel).not.toHaveBeenCalledWith(win)
    expect(win.hide).not.toHaveBeenCalled()
    expect(win.show).not.toHaveBeenCalled()
    expect(win.focus).not.toHaveBeenCalled()
    expect(mocks.MockBrowserWindow.instances).toHaveLength(1)
  })

  it('toggles a hidden existing standalone window without activating the current app by default', async () => {
    const { openTodoPlanWindow, toggleTodoPlanWindow } = await loadWindowModule()
    const win = openTodoPlanWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>
    win.visible = false

    const result = toggleTodoPlanWindow()

    expect(result).toBe(win)
    if (process.platform === 'darwin') {
      expect(mocks.showNonActivatingPanel).toHaveBeenCalledWith(win)
      expect(win.showInactive).not.toHaveBeenCalled()
      expect(win.moveTop).not.toHaveBeenCalled()
      expect(win.show).not.toHaveBeenCalled()
      expect(win.focus).not.toHaveBeenCalled()
    } else {
      expect(win.show).toHaveBeenCalledTimes(1)
      expect(win.focus).toHaveBeenCalledTimes(1)
    }
    expect(mocks.MockBrowserWindow.instances).toHaveLength(1)
  })

  it('falls back to Electron inactive show when native panel show is unavailable', async () => {
    mocks.showNonActivatingPanel.mockReturnValue(false)
    const { openTodoPlanWindow, toggleTodoPlanWindow } = await loadWindowModule()
    const win = openTodoPlanWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>
    win.visible = false

    const result = toggleTodoPlanWindow()

    expect(result).toBe(win)
    if (process.platform === 'darwin') {
      expect(mocks.showNonActivatingPanel).toHaveBeenCalledWith(win)
      expect(win.showInactive).toHaveBeenCalledTimes(1)
      expect(win.moveTop).toHaveBeenCalledTimes(1)
      expect(win.show).not.toHaveBeenCalled()
      expect(win.focus).not.toHaveBeenCalled()
    }
  })

  it('focuses todo when requested and the app is already active', async () => {
    const main = new mocks.MockBrowserWindow({
      width: 1000,
      height: 800,
      show: true,
    })
    mocks.MockBrowserWindow.focusedWindow = main

    const { openTodoPlanWindow, toggleTodoPlanWindow } = await loadWindowModule()
    const win = openTodoPlanWindow({ activation: 'focus-if-app-active' }) as unknown as InstanceType<typeof mocks.MockBrowserWindow>
    win.visible = false
    mocks.MockBrowserWindow.focusedWindow = main

    const result = toggleTodoPlanWindow({ activation: 'focus-if-app-active' })

    expect(result).toBe(win)
    expect(win.show).toHaveBeenCalledTimes(1)
    expect(win.focus).toHaveBeenCalledTimes(1)
    expect(win.showInactive).not.toHaveBeenCalled()
  })

  it('does not leave a previously hidden main window visible when a shortcut opens todo', async () => {
    mocks.isMainAppWindowUrl.mockImplementation((url?: string) => String(url || '').includes('#/chat'))
    const main = new mocks.MockBrowserWindow({
      width: 1000,
      height: 800,
      show: false,
    })
    main.url = 'app://local/#/chat'

    const { openTodoPlanWindow } = await loadWindowModule()
    const todo = openTodoPlanWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>
    todo.visible = false

    openTodoPlanWindow({ preserveMainWindowVisibility: true })
    main.visible = true
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(main.hide).toHaveBeenCalledTimes(1)
    expect(main.visible).toBe(false)
  })

  it('captures a not-yet-loaded main window when shortcut opens todo', async () => {
    const main = new mocks.MockBrowserWindow({
      width: 1000,
      height: 800,
      show: false,
    })
    main.url = ''

    const { openTodoPlanWindow } = await loadWindowModule()
    openTodoPlanWindow({ preserveMainWindowVisibility: true })
    main.visible = true
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(main.hide).toHaveBeenCalledTimes(1)
    expect(main.visible).toBe(false)
  })

  it('does not show a pending main window when todo shortcut is triggered first', async () => {
    const { createWindow, openTodoPlanWindow } = await loadWindowModule()
    const main = createWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>
    main.visible = false
    main.show.mockClear()

    openTodoPlanWindow({ preserveMainWindowVisibility: true })
    main.emit('ready-to-show')

    expect(main.show).not.toHaveBeenCalled()
    expect(main.hide).toHaveBeenCalled()
    expect(main.visible).toBe(false)
  })

  it('shows a newly-created todo window inactive by default on macOS', async () => {
    const { openTodoPlanWindow } = await loadWindowModule()
    const win = openTodoPlanWindow({
      activation: 'preserve-current-app',
      preserveMainWindowVisibility: true,
    }) as unknown as InstanceType<typeof mocks.MockBrowserWindow>

    win.emit('ready-to-show')

    if (process.platform === 'darwin') {
      expect(mocks.showNonActivatingPanel).toHaveBeenCalledWith(win)
      expect(win.showInactive).not.toHaveBeenCalled()
      expect(win.moveTop).not.toHaveBeenCalled()
      expect(win.show).not.toHaveBeenCalled()
      expect(win.focus).not.toHaveBeenCalled()
    } else {
      expect(win.show).toHaveBeenCalledTimes(1)
      expect(win.focus).toHaveBeenCalledTimes(1)
    }
  })

  it('does not leave a previously hidden main window visible when a shortcut hides todo', async () => {
    mocks.isMainAppWindowUrl.mockImplementation((url?: string) => String(url || '').includes('#/chat'))
    const main = new mocks.MockBrowserWindow({
      width: 1000,
      height: 800,
      show: false,
    })
    main.url = 'app://local/#/chat'

    const { openTodoPlanWindow, toggleTodoPlanWindow } = await loadWindowModule()
    const todo = openTodoPlanWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>
    todo.visible = true
    todo.frontmost = true

    toggleTodoPlanWindow({ preserveMainWindowVisibility: true })
    main.visible = true
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(mocks.hideNonActivatingPanel).toHaveBeenCalledWith(todo)
    expect(todo.hide).not.toHaveBeenCalled()
    expect(main.hide).toHaveBeenCalledTimes(1)
    expect(main.visible).toBe(false)
  })

  it('uses native hover-only macOS window buttons for the standalone todo window', async () => {
    const { openTodoPlanWindow } = await loadWindowModule()
    const win = openTodoPlanWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>

    expect(win.options.minHeight).toBe(280)
    expect(win.options.focusable).toBe(true)

    if (process.platform === 'darwin') {
      expect(mocks.configureNonActivatingPanel).toHaveBeenCalledWith(win)
      expect(win.options.type).toBe('panel')
      expect(win.options.acceptFirstMouse).toBe(true)
      expect(win.options.skipTaskbar).toBe(true)
      expect(win.options.titleBarStyle).toBe('customButtonsOnHover')
      expect(win.options.trafficLightPosition).toEqual({ x: 16, y: 16 })
    } else {
      expect(win.options.titleBarStyle).toBe('default')
    }
  })

  it('restores saved standalone todo window bounds', async () => {
    mocks.readJsonFile.mockReturnValue({
      width: 1000,
      height: 800,
      x: 10,
      y: 20,
      todoPlan: {
        width: 560,
        height: 720,
        x: 44,
        y: 55,
      },
    })

    const { openTodoPlanWindow } = await loadWindowModule()
    const win = openTodoPlanWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>

    expect(win.options.width).toBe(560)
    expect(win.options.height).toBe(720)
    expect(win.options.x).toBe(44)
    expect(win.options.y).toBe(55)
  })

  it('saves standalone todo window bounds without overwriting main window state', async () => {
    mocks.readJsonFile.mockReturnValue({
      width: 1000,
      height: 800,
      x: 10,
      y: 20,
      isMaximized: false,
    })

    const { hideTodoPlanWindow, openTodoPlanWindow } = await loadWindowModule()
    const win = openTodoPlanWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>
    win.visible = true
    win.bounds = {
      width: 620,
      height: 760,
      x: 88,
      y: 99,
    }

    hideTodoPlanWindow()

    expect(mocks.writeJsonFile).toHaveBeenLastCalledWith('/tmp/window-state.json', {
      width: 1000,
      height: 800,
      x: 10,
      y: 20,
      isMaximized: false,
      todoPlan: {
        width: 620,
        height: 760,
        x: 88,
        y: 99,
      },
    })
  })

  it('falls back to Electron hide when native panel hide is unavailable', async () => {
    mocks.hideNonActivatingPanel.mockReturnValue(false)
    const { hideTodoPlanWindow, openTodoPlanWindow } = await loadWindowModule()
    const win = openTodoPlanWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>
    win.visible = true

    expect(hideTodoPlanWindow()).toBe(true)

    expect(mocks.hideNonActivatingPanel).toHaveBeenCalledWith(win)
    expect(win.hide).toHaveBeenCalledTimes(1)
    expect(win.visible).toBe(false)
  })

  it('does not persist transient move or resize bounds while hiding natively', async () => {
    mocks.readJsonFile.mockReturnValue({
      width: 1000,
      height: 800,
      x: 10,
      y: 20,
      isMaximized: false,
    })

    const { hideTodoPlanWindow, openTodoPlanWindow } = await loadWindowModule()
    const win = openTodoPlanWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>
    win.visible = true
    win.bounds = {
      width: 620,
      height: 760,
      x: 88,
      y: 99,
    }
    mocks.writeJsonFile.mockClear()
    mocks.hideNonActivatingPanel.mockImplementation((window: InstanceType<typeof mocks.MockBrowserWindow>) => {
      window.bounds = {
        width: 320,
        height: 280,
        x: 0,
        y: 0,
      }
      window.emit('move')
      window.emit('resize')
      window.visible = false
      return true
    })

    expect(hideTodoPlanWindow()).toBe(true)

    expect(mocks.writeJsonFile).toHaveBeenCalledTimes(1)
    expect(mocks.writeJsonFile).toHaveBeenLastCalledWith('/tmp/window-state.json', {
      width: 1000,
      height: 800,
      x: 10,
      y: 20,
      isMaximized: false,
      todoPlan: {
        width: 620,
        height: 760,
        x: 88,
        y: 99,
      },
    })
  })

  it('does not persist transient native show resize as todo window height', async () => {
    vi.useFakeTimers()
    mocks.readJsonFile.mockReturnValue({
      width: 1000,
      height: 800,
      x: 10,
      y: 20,
      isMaximized: false,
      todoPlan: {
        width: 620,
        height: 640,
        x: 88,
        y: 99,
      },
    })
    mocks.showNonActivatingPanel.mockImplementation((window: InstanceType<typeof mocks.MockBrowserWindow>) => {
      window.visible = true
      window.frontmost = true
      window.bounds = {
        ...window.bounds,
        height: Number(window.bounds.height) + 28,
      }
      window.emit('resize')
      return true
    })

    try {
      const { openTodoPlanWindow, toggleTodoPlanWindow } = await loadWindowModule()
      const win = openTodoPlanWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>
      win.visible = false
      mocks.writeJsonFile.mockClear()

      toggleTodoPlanWindow()

      expect(mocks.showNonActivatingPanel).toHaveBeenCalledWith(win)
      expect(mocks.writeJsonFile).not.toHaveBeenCalled()

      vi.advanceTimersByTime(80)
      win.bounds = {
        ...win.bounds,
        height: 700,
      }
      win.emit('resize')

      expect(mocks.writeJsonFile).toHaveBeenCalledTimes(1)
      expect(mocks.writeJsonFile).toHaveBeenLastCalledWith('/tmp/window-state.json', {
        width: 1000,
        height: 800,
        x: 10,
        y: 20,
        isMaximized: false,
        todoPlan: {
          width: 620,
          height: 700,
          x: 88,
          y: 99,
        },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('hides todo without hiding the app or a previously visible main window', async () => {
    mocks.isMainAppWindowUrl.mockImplementation((url?: string) => String(url || '').includes('#/chat'))
    const main = new mocks.MockBrowserWindow({
      width: 1000,
      height: 800,
      show: true,
    })
    main.url = 'app://local/#/chat'

    const { hideTodoPlanWindow, openTodoPlanWindow } = await loadWindowModule()
    const todo = openTodoPlanWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>
    todo.visible = true

    expect(hideTodoPlanWindow({
      activation: 'preserve-current-app',
      preserveMainWindowVisibility: true,
    })).toBe(true)

    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mocks.hideNonActivatingPanel).toHaveBeenCalledWith(todo)
    expect(todo.hide).not.toHaveBeenCalled()
    expect(main.visible).toBe(true)
    expect(main.hide).not.toHaveBeenCalled()
    expect(mocks.app.hide).not.toHaveBeenCalled()
  })

  it('keeps the standalone todo window visible when it loses focus', async () => {
    const { openTodoPlanWindow, setTodoPlanWindowPinned } = await loadWindowModule()
    const todo = openTodoPlanWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>
    todo.visible = true
    todo.frontmost = false
    mocks.hideNonActivatingPanel.mockClear()

    todo.emit('blur')

    expect(mocks.hideNonActivatingPanel).not.toHaveBeenCalled()
    expect(todo.hide).not.toHaveBeenCalled()
    expect(todo.visible).toBe(true)

    expect(setTodoPlanWindowPinned(true)).toBe(true)
    expect(setTodoPlanWindowPinned(false)).toBe(false)
    mocks.hideNonActivatingPanel.mockClear()

    todo.emit('blur')

    expect(mocks.hideNonActivatingPanel).not.toHaveBeenCalled()
    expect(todo.hide).not.toHaveBeenCalled()
    expect(todo.visible).toBe(true)
    expect(mocks.setNonActivatingPanelPinned).toHaveBeenNthCalledWith(1, todo, true)
    expect(mocks.setNonActivatingPanelPinned).toHaveBeenNthCalledWith(2, todo, false)
  })

  it('parks an unpinned todo window when the main window gains focus', async () => {
    const { createWindow, openTodoPlanWindow } = await loadWindowModule()
    const main = createWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>
    main.visible = true
    const todo = openTodoPlanWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>
    todo.visible = true
    todo.frontmost = true
    mocks.hideNonActivatingPanel.mockClear()

    main.emit('focus')

    if (process.platform === 'darwin') {
      expect(mocks.hideNonActivatingPanel).toHaveBeenCalledWith(todo)
      expect(todo.visible).toBe(false)
      expect(todo.frontmost).toBe(false)
    } else {
      expect(mocks.hideNonActivatingPanel).not.toHaveBeenCalled()
      expect(todo.visible).toBe(true)
    }
    expect(todo.hide).not.toHaveBeenCalled()
  })

  it('does not park a pinned todo window when the main window gains focus', async () => {
    const { createWindow, openTodoPlanWindow, setTodoPlanWindowPinned } = await loadWindowModule()
    const main = createWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>
    main.visible = true
    const todo = openTodoPlanWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>
    todo.visible = true
    todo.frontmost = true

    expect(setTodoPlanWindowPinned(true)).toBe(true)
    mocks.hideNonActivatingPanel.mockClear()

    main.emit('focus')

    expect(mocks.hideNonActivatingPanel).not.toHaveBeenCalled()
    expect(todo.hide).not.toHaveBeenCalled()
    expect(todo.visible).toBe(true)
    expect(todo.frontmost).toBe(true)
  })

  it('keeps shortcut toggle semantics after pin is turned on and off', async () => {
    const { openTodoPlanWindow, setTodoPlanWindowPinned, toggleTodoPlanWindow } = await loadWindowModule()
    const todo = openTodoPlanWindow() as unknown as InstanceType<typeof mocks.MockBrowserWindow>
    todo.visible = true
    todo.frontmost = true

    expect(setTodoPlanWindowPinned(true)).toBe(true)
    expect(setTodoPlanWindowPinned(false)).toBe(false)
    expect(mocks.setNonActivatingPanelPinned).toHaveBeenNthCalledWith(1, todo, true)
    expect(mocks.setNonActivatingPanelPinned).toHaveBeenNthCalledWith(2, todo, false)

    expect(toggleTodoPlanWindow({
      activation: 'preserve-current-app',
      preserveMainWindowVisibility: true,
    })).toBeNull()
    expect(mocks.hideNonActivatingPanel).toHaveBeenCalledWith(todo)
    expect(todo.hide).not.toHaveBeenCalled()
    expect(todo.show).not.toHaveBeenCalled()
    expect(todo.focus).not.toHaveBeenCalled()
  })
})
