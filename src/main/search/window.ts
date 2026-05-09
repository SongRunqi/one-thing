/**
 * Search Everywhere — BrowserWindow lifecycle
 */

import { BrowserWindow, nativeTheme } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { getSettings } from '../stores/settings.js'
import { getThemeBackgroundColor, } from '../themes/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let searchWindow: BrowserWindow | null = null

function getEffectiveTheme(): 'light' | 'dark' {
  const settings = getSettings()
  if (settings.theme === 'system') {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  }
  return settings.theme === 'light' ? 'light' : 'dark'
}

function getEffectiveThemeId(mode: 'dark' | 'light'): string {
  const general = getSettings().general
  if (mode === 'dark') return general?.darkThemeId || general?.themeId || 'flexoki'
  return general?.lightThemeId || general?.themeId || 'flexoki'
}

export function openSearchWindow(parentWindow: BrowserWindow): BrowserWindow {
  if (searchWindow && !searchWindow.isDestroyed()) {
    searchWindow.focus()
    return searchWindow
  }

  const isDev = process.env.NODE_ENV === 'development'
  const isMac = process.platform === 'darwin'

  const effectiveTheme = getEffectiveTheme()
  const themeId = getEffectiveThemeId(effectiveTheme)
  const backgroundColor = getThemeBackgroundColor(themeId, effectiveTheme)
  const colorTheme = getSettings().general?.colorTheme || 'blue'

  const WIDTH = 640
  const HEIGHT = 480

  // Center horizontally, place at ~22% vertically relative to parent
  const parentBounds = parentWindow.getBounds()
  const x = Math.round(parentBounds.x + (parentBounds.width - WIDTH) / 2)
  const y = Math.round(parentBounds.y + parentBounds.height * 0.22)

  searchWindow = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x,
    y,
    frame: false,
    titleBarStyle: 'customButtonsOnHover',
    trafficLightPosition: { x: -20, y: -20 },
    transparent: isMac,
    backgroundColor: isMac ? undefined : backgroundColor,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    parent: parentWindow,
    modal: false,
    show: false,
    vibrancy: isMac ? 'popover' : undefined,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  searchWindow.once('ready-to-show', () => {
    searchWindow?.show()
  })

  // Close on blur (IDEA behavior)
  searchWindow.on('blur', () => {
    closeSearchWindow()
  })

  searchWindow.on('closed', () => {
    searchWindow = null
  })

  const themeParams = `theme=${effectiveTheme}&colorTheme=${colorTheme}`
  if (isDev) {
    searchWindow.loadURL(`http://127.0.0.1:5173/#/search?${themeParams}`)
  } else {
    searchWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: `/search?${themeParams}`,
    })
  }

  return searchWindow
}

export function closeSearchWindow(): void {
  if (searchWindow && !searchWindow.isDestroyed()) {
    searchWindow.close()
  }
  searchWindow = null
}

export function toggleSearchWindow(parentWindow: BrowserWindow): void {
  if (searchWindow && !searchWindow.isDestroyed()) {
    closeSearchWindow()
  } else {
    openSearchWindow(parentWindow)
  }
}

export function getSearchWindow(): BrowserWindow | null {
  return searchWindow
}
