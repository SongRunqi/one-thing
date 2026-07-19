import { BrowserWindow, screen } from 'electron'
import { clampElectronWindowStateToDisplays } from './window-state'

export interface ElectronTodoPlanWindowState {
  width: number
  height: number
  x?: number
  y?: number
}

export interface ElectronTodoPlanWindowOptions {
  windowState: ElectronTodoPlanWindowState
  isDevelopment: boolean
  isMac: boolean
  backgroundColor: string
  routeHash: string
  rendererDevUrl: string
  rendererIndexPath: string
  preloadPath: string
  onCreated?(window: BrowserWindow): void
  onReadyToShow?(window: BrowserWindow): void
  onResize?(window: BrowserWindow): void
  onMove?(window: BrowserWindow): void
  onClose?(window: BrowserWindow): void
  onClosed?(): void
}

export function createElectronTodoPlanWindow(options: ElectronTodoPlanWindowOptions): BrowserWindow {
  const windowState = clampElectronWindowStateToDisplays(
    options.windowState,
    screen.getAllDisplays().map(display => display.workArea),
  )
  const todoPlanWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 320,
    minHeight: 280,
    show: false,
    type: options.isMac ? 'panel' : undefined,
    focusable: true,
    acceptFirstMouse: options.isMac ? true : undefined,
    skipTaskbar: options.isMac,
    transparent: options.isMac,
    backgroundColor: options.isMac ? undefined : options.backgroundColor,
    titleBarStyle: options.isMac ? 'hidden' : 'default',
    trafficLightPosition: options.isMac ? { x: 16, y: 9 } : undefined,
    resizable: true,
    alwaysOnTop: false,
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  options.onCreated?.(todoPlanWindow)

  todoPlanWindow.once('ready-to-show', () => {
    options.onReadyToShow?.(todoPlanWindow)
  })

  todoPlanWindow.on('resize', () => {
    options.onResize?.(todoPlanWindow)
  })
  todoPlanWindow.on('move', () => {
    options.onMove?.(todoPlanWindow)
  })
  todoPlanWindow.on('close', () => {
    options.onClose?.(todoPlanWindow)
  })
  todoPlanWindow.on('closed', () => {
    options.onClosed?.()
  })

  if (options.isDevelopment) {
    todoPlanWindow.loadURL(`${options.rendererDevUrl}/#${options.routeHash}`)
  } else {
    todoPlanWindow.loadFile(options.rendererIndexPath, {
      hash: options.routeHash,
    })
  }

  return todoPlanWindow
}
