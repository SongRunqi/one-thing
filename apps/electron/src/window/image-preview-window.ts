import { BrowserWindow } from 'electron'

export interface ElectronImagePreviewWindowOptions<TPayload> {
  currentWindow: BrowserWindow | null
  setCurrentWindow(window: BrowserWindow | null): void
  payload: TPayload
  mode: 'single' | 'gallery'
  routeHash: string
  updateChannel: string
  isDevelopment: boolean
  isMac: boolean
  backgroundColor: string
  rendererDevUrl: string
  rendererIndexPath: string
  preloadPath: string
  logger?: Pick<Console, 'log'>
  schedule?: (callback: () => void, delayMs: number) => unknown
}

export function openElectronImagePreviewWindow<TPayload>(
  options: ElectronImagePreviewWindowOptions<TPayload>,
): BrowserWindow {
  const logger = options.logger ?? console
  const currentWindow = options.currentWindow
  if (currentWindow && !currentWindow.isDestroyed()) {
    logger.log('[Window] Updating existing preview window')
    if (options.mode === 'single') {
      currentWindow.webContents.send(options.updateChannel, options.payload)
    } else {
      loadElectronImagePreviewRoute(currentWindow, options)
    }

    if (currentWindow.isMinimized()) {
      currentWindow.restore()
    }
    currentWindow.show()
    currentWindow.focus()
    return currentWindow
  }

  logger.log('[Window] Creating new preview window')
  const windowWidth = options.mode === 'gallery' ? 1100 : 900

  const imagePreviewWindow = new BrowserWindow({
    width: windowWidth,
    height: 700,
    minWidth: options.mode === 'gallery' ? 700 : 500,
    minHeight: 400,
    show: false,
    transparent: options.isMac,
    backgroundColor: options.isMac ? undefined : options.backgroundColor,
    titleBarStyle: options.isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: options.isMac ? { x: 16, y: 16 } : undefined,
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  options.setCurrentWindow(imagePreviewWindow)

  if (options.mode === 'single') {
    imagePreviewWindow.webContents.once('dom-ready', () => {
      logger.log('[Window] Preview window dom-ready, sending single image preview reference')
      const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs))
      schedule(() => {
        imagePreviewWindow.webContents.send(options.updateChannel, options.payload)
      }, 50)
    })
  }

  imagePreviewWindow.once('ready-to-show', () => {
    logger.log('[Window] Preview window ready-to-show')
    imagePreviewWindow.show()
  })

  imagePreviewWindow.on('closed', () => {
    options.setCurrentWindow(null)
  })

  loadElectronImagePreviewRoute(imagePreviewWindow, options)
  return imagePreviewWindow
}

function loadElectronImagePreviewRoute<TPayload>(
  imagePreviewWindow: BrowserWindow,
  options: ElectronImagePreviewWindowOptions<TPayload>,
): void {
  if (options.isDevelopment) {
    loggerFor(options).log('[Window] Loading preview URL (dev):', options.routeHash)
    imagePreviewWindow.loadURL(`${options.rendererDevUrl}/#${options.routeHash}`)
  } else {
    loggerFor(options).log('[Window] Loading preview file (prod):', options.routeHash)
    imagePreviewWindow.loadFile(options.rendererIndexPath, {
      hash: options.routeHash,
    })
  }
}

function loggerFor(options: { logger?: Pick<Console, 'log'> }): Pick<Console, 'log'> {
  return options.logger ?? console
}
