import { BrowserWindow, nativeTheme } from 'electron'

export interface ElectronSearchWindowRectangle {
  x: number
  y: number
  width: number
  height: number
}

export interface ElectronSearchWindowSizeConstraints {
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
}

export interface ElectronSearchWindowGuideState {
  visible: boolean
  centerX: boolean
  defaultTop: boolean
  defaultHeight: boolean
  defaultBounds: boolean
}

export interface ElectronSearchWindowVisualOptions {
  isDevelopment: boolean
  isMac: boolean
  backgroundColor: string
  routeHash: string
  rendererDevUrl: string
  rendererIndexPath: string
  preloadPath: string
}

export interface ElectronSearchWindowLayoutOptions {
  minWidth: number
  minHeight: number
  getSizeConstraints(parentBounds: ElectronSearchWindowRectangle): ElectronSearchWindowSizeConstraints
  getDefaultBounds(parentBounds: ElectronSearchWindowRectangle): ElectronSearchWindowRectangle
  getGuideState(
    currentBounds: ElectronSearchWindowRectangle,
    defaultBounds: ElectronSearchWindowRectangle,
    visible: boolean,
  ): ElectronSearchWindowGuideState
}

export interface ElectronSearchWindowControllerOptions {
  shownChannel: string
  guidesChannel: string
  hiddenGuides: ElectronSearchWindowGuideState
  layout: ElectronSearchWindowLayoutOptions
  getVisualOptions(): ElectronSearchWindowVisualOptions
  guideHideDelayMs?: number
  schedule?: (callback: () => void, delayMs: number) => unknown
  clearScheduled?: (timer: unknown) => void
}

export interface ElectronSearchWindowController {
  open(parentWindow: BrowserWindow): BrowserWindow
  warm(parentWindow: BrowserWindow): BrowserWindow
  close(): void
  toggle(parentWindow: BrowserWindow): void
  getWindow(): BrowserWindow | null
}

const DEFAULT_GUIDE_HIDE_DELAY_MS = 700

export function getElectronSystemShouldUseDarkColors(): boolean {
  return nativeTheme.shouldUseDarkColors
}

export function createElectronSearchWindowController(
  options: ElectronSearchWindowControllerOptions,
): ElectronSearchWindowController {
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs))
  const clearScheduled = options.clearScheduled ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>))
  const guideHideDelayMs = options.guideHideDelayMs ?? DEFAULT_GUIDE_HIDE_DELAY_MS

  let searchWindow: BrowserWindow | null = null
  let searchParentWindow: BrowserWindow | null = null
  let pendingShowParentWindow: BrowserWindow | null = null
  let isSearchWindowReady = false
  let guideHideTimer: unknown = null

  function clearGuideHideTimer(): void {
    if (!guideHideTimer) return
    clearScheduled(guideHideTimer)
    guideHideTimer = null
  }

  function applyConstraints(window: BrowserWindow, parentWindow: BrowserWindow): void {
    const constraints = options.layout.getSizeConstraints(parentWindow.getBounds())
    window.setMinimumSize(constraints.minWidth, constraints.minHeight)
    window.setMaximumSize(constraints.maxWidth, constraints.maxHeight)
  }

  function getGuideParentWindow(): BrowserWindow | null {
    if (searchParentWindow && !searchParentWindow.isDestroyed()) return searchParentWindow
    const parentWindow = searchWindow?.getParentWindow()
    return parentWindow && !parentWindow.isDestroyed() ? parentWindow : null
  }

  function emitGuides(state: ElectronSearchWindowGuideState): void {
    if (!searchWindow || searchWindow.isDestroyed()) return
    searchWindow.webContents.send(options.guidesChannel, state)
  }

  function updateGuides(): void {
    if (!searchWindow || searchWindow.isDestroyed() || !searchWindow.isVisible()) return

    const parentWindow = getGuideParentWindow()
    if (!parentWindow) return

    clearGuideHideTimer()
    const defaultBounds = options.layout.getDefaultBounds(parentWindow.getBounds())
    emitGuides(options.layout.getGuideState(searchWindow.getBounds(), defaultBounds, true))
    guideHideTimer = schedule(() => {
      emitGuides(options.hiddenGuides)
      guideHideTimer = null
    }, guideHideDelayMs)
  }

  function position(window: BrowserWindow, parentWindow: BrowserWindow): void {
    applyConstraints(window, parentWindow)
    window.setBounds(options.layout.getDefaultBounds(parentWindow.getBounds()))
  }

  function show(parentWindow: BrowserWindow): void {
    if (!searchWindow || searchWindow.isDestroyed()) return

    if (!isSearchWindowReady) {
      pendingShowParentWindow = parentWindow
      return
    }

    searchWindow.setParentWindow(parentWindow)
    searchParentWindow = parentWindow
    position(searchWindow, parentWindow)
    searchWindow.show()
    searchWindow.focus()
    pendingShowParentWindow = null
    emitGuides(options.hiddenGuides)
    searchWindow.webContents.send(options.shownChannel)
  }

  function loadRoute(window: BrowserWindow, visualOptions: ElectronSearchWindowVisualOptions): void {
    if (visualOptions.isDevelopment) {
      window.loadURL(`${visualOptions.rendererDevUrl}/#${visualOptions.routeHash}`)
      return
    }

    window.loadFile(visualOptions.rendererIndexPath, {
      hash: visualOptions.routeHash,
    })
  }

  function create(parentWindow: BrowserWindow, showOnReady: boolean): BrowserWindow {
    if (showOnReady) pendingShowParentWindow = parentWindow
    if (searchWindow && !searchWindow.isDestroyed()) {
      if (showOnReady) show(parentWindow)
      return searchWindow
    }

    const visualOptions = options.getVisualOptions()
    searchWindow = new BrowserWindow({
      ...options.layout.getDefaultBounds(parentWindow.getBounds()),
      minWidth: options.layout.minWidth,
      minHeight: options.layout.minHeight,
      frame: false,
      titleBarStyle: 'customButtonsOnHover',
      trafficLightPosition: { x: -20, y: -20 },
      transparent: visualOptions.isMac,
      backgroundColor: visualOptions.isMac ? undefined : visualOptions.backgroundColor,
      resizable: true,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      parent: parentWindow,
      modal: false,
      show: false,
      vibrancy: visualOptions.isMac ? 'popover' : undefined,
      webPreferences: {
        preload: visualOptions.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    searchParentWindow = parentWindow
    isSearchWindowReady = false
    position(searchWindow, parentWindow)

    searchWindow.once('ready-to-show', () => {
      isSearchWindowReady = true
      const parent = pendingShowParentWindow
      if (parent && !parent.isDestroyed()) {
        show(parent)
      }
    })

    searchWindow.on('blur', () => {
      controller.close()
    })

    searchWindow.on('move', () => {
      updateGuides()
    })

    searchWindow.on('resize', () => {
      updateGuides()
    })

    searchWindow.on('closed', () => {
      clearGuideHideTimer()
      searchWindow = null
      searchParentWindow = null
      pendingShowParentWindow = null
      isSearchWindowReady = false
    })

    loadRoute(searchWindow, visualOptions)
    return searchWindow
  }

  const controller: ElectronSearchWindowController = {
    open(parentWindow) {
      return create(parentWindow, true)
    },
    warm(parentWindow) {
      return create(parentWindow, false)
    },
    close() {
      if (searchWindow && !searchWindow.isDestroyed()) {
        clearGuideHideTimer()
        pendingShowParentWindow = null
        emitGuides(options.hiddenGuides)
        searchWindow.hide()
      }
    },
    toggle(parentWindow) {
      if (searchWindow && !searchWindow.isDestroyed() && searchWindow.isVisible()) {
        controller.close()
      } else {
        controller.open(parentWindow)
      }
    },
    getWindow() {
      return searchWindow
    },
  }

  return controller
}
