/**
 * Search Everywhere — BrowserWindow lifecycle
 */

import { BrowserWindow, nativeTheme } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { getSettings } from '../stores/settings.js'
import { getThemeBackgroundColor, } from '../themes/index.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let searchWindow: BrowserWindow | null = null
let shouldShowWhenReady = false

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

function positionSearchWindow(win: BrowserWindow, parentWindow: BrowserWindow): void {
  const WIDTH = 640
  const HEIGHT = 480
  const parentBounds = parentWindow.getBounds()
  const x = Math.round(parentBounds.x + (parentBounds.width - WIDTH) / 2)
  const y = Math.round(parentBounds.y + parentBounds.height * 0.22)
  win.setBounds({ width: WIDTH, height: HEIGHT, x, y })
}

function showSearchWindow(parentWindow: BrowserWindow): void {
  if (!searchWindow || searchWindow.isDestroyed()) return
  positionSearchWindow(searchWindow, parentWindow)
  searchWindow.show()
  searchWindow.focus()
  searchWindow.webContents.send(IPC_CHANNELS.SEARCH_WINDOW_SHOWN)
}

function createSearchWindow(parentWindow: BrowserWindow, showOnReady: boolean): BrowserWindow {
  shouldShowWhenReady = showOnReady
  if (searchWindow && !searchWindow.isDestroyed()) {
    if (showOnReady) showSearchWindow(parentWindow)
    return searchWindow
  }

  const isDev = process.env.NODE_ENV === 'development'
  const isMac = process.platform === 'darwin'

  const effectiveTheme = getEffectiveTheme()
  const themeId = getEffectiveThemeId(effectiveTheme)
  const backgroundColor = getThemeBackgroundColor(themeId, effectiveTheme)
  const colorTheme = getSettings().general?.colorTheme || 'blue'

  searchWindow = new BrowserWindow({
    width: 640,
    height: 480,
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
  positionSearchWindow(searchWindow, parentWindow)

  searchWindow.once('ready-to-show', () => {
    if (shouldShowWhenReady && searchWindow && !searchWindow.isDestroyed()) {
      showSearchWindow(parentWindow)
    }
  })

  // Hide on blur (IDEA behavior), but keep the renderer warm for the next open.
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

export function openSearchWindow(parentWindow: BrowserWindow): BrowserWindow {
  return createSearchWindow(parentWindow, true)
}

export function warmSearchWindow(parentWindow: BrowserWindow): BrowserWindow {
  return createSearchWindow(parentWindow, false)
}

export function closeSearchWindow(): void {
  if (searchWindow && !searchWindow.isDestroyed()) {
    shouldShowWhenReady = false
    searchWindow.hide()
  }
}

export function toggleSearchWindow(parentWindow: BrowserWindow): void {
  if (searchWindow && !searchWindow.isDestroyed() && searchWindow.isVisible()) {
    closeSearchWindow()
  } else {
    openSearchWindow(parentWindow)
  }
}

export function getSearchWindow(): BrowserWindow | null {
  return searchWindow
}
