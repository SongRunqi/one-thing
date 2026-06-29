import { BrowserWindow } from 'electron'

export interface ElectronVoiceRuntimeWindowVisualOptions {
  isDevelopment: boolean
  rendererDevUrl: string
  rendererIndexPath: string
  preloadPath: string
  routeHash: string
}

export interface ElectronVoiceRuntimeWindowControllerOptions {
  commandChannel: string
  getVisualOptions(): ElectronVoiceRuntimeWindowVisualOptions
}

export interface ElectronVoiceRuntimeWindowController<TCommand> {
  getWindow(): BrowserWindow | null
  ensureWindow(): BrowserWindow
  sendCommand(command: TCommand): void
  markReady(): void
  isReady(): boolean
  flushCommands(): void
  destroyWindow(): void
}

export function createElectronVoiceRuntimeWindowController<TCommand>(
  options: ElectronVoiceRuntimeWindowControllerOptions,
): ElectronVoiceRuntimeWindowController<TCommand> {
  let runtimeWindow: BrowserWindow | null = null
  let runtimeReady = false
  let pendingCommands: TCommand[] = []

  function getWindow(): BrowserWindow | null {
    return runtimeWindow && !runtimeWindow.isDestroyed() ? runtimeWindow : null
  }

  function ensureWindow(): BrowserWindow {
    const existing = getWindow()
    if (existing) return existing

    const visualOptions = options.getVisualOptions()
    runtimeReady = false
    runtimeWindow = new BrowserWindow({
      width: 360,
      height: 240,
      show: false,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        preload: visualOptions.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })

    runtimeWindow.on('closed', () => {
      runtimeWindow = null
      runtimeReady = false
      pendingCommands = []
    })

    if (visualOptions.isDevelopment) {
      runtimeWindow.loadURL(`${visualOptions.rendererDevUrl}/#${visualOptions.routeHash}`)
    } else {
      runtimeWindow.loadFile(visualOptions.rendererIndexPath, {
        hash: visualOptions.routeHash,
      })
    }

    return runtimeWindow
  }

  function sendCommand(command: TCommand): void {
    const window = getWindow()
    if (!window || !runtimeReady) {
      pendingCommands.push(command)
      return
    }
    window.webContents.send(options.commandChannel, command)
  }

  function flushCommands(): void {
    const window = getWindow()
    if (!window || !runtimeReady || pendingCommands.length === 0) return

    const commands = pendingCommands
    pendingCommands = []
    for (const command of commands) {
      window.webContents.send(options.commandChannel, command)
    }
  }

  function destroyWindow(): void {
    const window = getWindow()
    if (window) {
      window.destroy()
    }
    runtimeWindow = null
    runtimeReady = false
    pendingCommands = []
  }

  return {
    getWindow,
    ensureWindow,
    sendCommand,
    markReady() {
      runtimeReady = true
    },
    isReady() {
      return runtimeReady && Boolean(getWindow())
    },
    flushCommands,
    destroyWindow,
  }
}
