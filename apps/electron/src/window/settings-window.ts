import { BrowserWindow } from 'electron'

export interface ElectronSettingsWindowOptions {
  currentWindow: BrowserWindow | null
  setCurrentWindow(window: BrowserWindow | null): void
  isDevelopment: boolean
  isMac: boolean
  backgroundColor: string
  effectiveTheme: 'light' | 'dark'
  colorTheme: string
  rendererDevUrl: string
  rendererIndexPath: string
  preloadPath: string
  logger?: Pick<Console, 'error' | 'log'>
}

export function openElectronSettingsWindow(options: ElectronSettingsWindowOptions): BrowserWindow {
  const logger = options.logger ?? console
  const currentWindow = options.currentWindow
  if (currentWindow && !currentWindow.isDestroyed()) {
    currentWindow.focus()
    return currentWindow
  }

  logger.log('[Settings] Creating settings window with preload:', options.preloadPath)
  logger.log('[Settings] isDevelopment:', options.isDevelopment)

  const settingsWindow = new BrowserWindow({
    width: 900,
    height: 620,
    minWidth: 700,
    minHeight: 500,
    show: false,
    transparent: options.isMac,
    backgroundColor: options.isMac ? undefined : options.backgroundColor,
    titleBarStyle: options.isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: options.isMac ? { x: 16, y: 16 } : undefined,
    modal: false,
    resizable: true,
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  options.setCurrentWindow(settingsWindow)

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show()
  })

  settingsWindow.on('closed', () => {
    options.setCurrentWindow(null)
  })

  const themeParams = `theme=${options.effectiveTheme}&colorTheme=${options.colorTheme}`
  if (options.isDevelopment) {
    const url = `${options.rendererDevUrl}/#/settings?${themeParams}`
    logger.log('[Settings] Loading URL:', url)
    settingsWindow.loadURL(url)
  } else {
    settingsWindow.loadFile(options.rendererIndexPath, {
      hash: `/settings?${themeParams}`,
    })
  }

  settingsWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logger.error('[Settings] Failed to load:', errorCode, errorDescription)
  })

  return settingsWindow
}
