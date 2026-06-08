/**
 * Search Everywhere — BrowserWindow lifecycle
 */

import { BrowserWindow, nativeTheme } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { getSettings } from '../stores/settings.js'
import { getThemeBackgroundColor } from '../themes/index.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { SearchWindowGuideState } from '../../shared/ipc/search.js'
import {
  getDefaultSearchWindowBounds,
  getSearchWindowGuideState,
  getSearchWindowSizeConstraints,
  SEARCH_WINDOW_MIN_HEIGHT,
  SEARCH_WINDOW_MIN_WIDTH,
} from './window-layout.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const HIDDEN_GUIDES: SearchWindowGuideState = {
  visible: false,
  centerX: false,
  defaultTop: false,
  defaultHeight: false,
  defaultBounds: false,
}
const GUIDE_HIDE_DELAY_MS = 700

function getRendererDevUrl(): string {
  return process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173'
}

let searchWindow: BrowserWindow | null = null
let searchParentWindow: BrowserWindow | null = null
let pendingShowParentWindow: BrowserWindow | null = null
let isSearchWindowReady = false
let guideHideTimer: ReturnType<typeof setTimeout> | null = null

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

function clearGuideHideTimer(): void {
  if (!guideHideTimer) return
  clearTimeout(guideHideTimer)
  guideHideTimer = null
}

function applySearchWindowConstraints(win: BrowserWindow, parentWindow: BrowserWindow): void {
  const constraints = getSearchWindowSizeConstraints(parentWindow.getBounds())
  win.setMinimumSize(constraints.minWidth, constraints.minHeight)
  win.setMaximumSize(constraints.maxWidth, constraints.maxHeight)
}

function getGuideParentWindow(): BrowserWindow | null {
  if (searchParentWindow && !searchParentWindow.isDestroyed()) return searchParentWindow
  const parentWindow = searchWindow?.getParentWindow()
  return parentWindow && !parentWindow.isDestroyed() ? parentWindow : null
}

function emitSearchWindowGuides(state: SearchWindowGuideState): void {
  if (!searchWindow || searchWindow.isDestroyed()) return
  searchWindow.webContents.send(IPC_CHANNELS.SEARCH_WINDOW_GUIDES, state)
}

function updateSearchWindowGuides(): void {
  if (!searchWindow || searchWindow.isDestroyed() || !searchWindow.isVisible()) return

  const parentWindow = getGuideParentWindow()
  if (!parentWindow) return

  clearGuideHideTimer()
  const defaultBounds = getDefaultSearchWindowBounds(parentWindow.getBounds())
  emitSearchWindowGuides(getSearchWindowGuideState(searchWindow.getBounds(), defaultBounds, true))
  guideHideTimer = setTimeout(() => {
    emitSearchWindowGuides(HIDDEN_GUIDES)
    guideHideTimer = null
  }, GUIDE_HIDE_DELAY_MS)
}

function positionSearchWindow(win: BrowserWindow, parentWindow: BrowserWindow): void {
  applySearchWindowConstraints(win, parentWindow)
  win.setBounds(getDefaultSearchWindowBounds(parentWindow.getBounds()))
}

function showSearchWindow(parentWindow: BrowserWindow): void {
  if (!searchWindow || searchWindow.isDestroyed()) return

  if (!isSearchWindowReady) {
    pendingShowParentWindow = parentWindow
    return
  }

  searchWindow.setParentWindow(parentWindow)
  searchParentWindow = parentWindow
  positionSearchWindow(searchWindow, parentWindow)
  searchWindow.show()
  searchWindow.focus()
  pendingShowParentWindow = null
  emitSearchWindowGuides(HIDDEN_GUIDES)
  searchWindow.webContents.send(IPC_CHANNELS.SEARCH_WINDOW_SHOWN)
}

function createSearchWindow(parentWindow: BrowserWindow, showOnReady: boolean): BrowserWindow {
  if (showOnReady) pendingShowParentWindow = parentWindow
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
    ...getDefaultSearchWindowBounds(parentWindow.getBounds()),
    minWidth: SEARCH_WINDOW_MIN_WIDTH,
    minHeight: SEARCH_WINDOW_MIN_HEIGHT,
    frame: false,
    titleBarStyle: 'customButtonsOnHover',
    trafficLightPosition: { x: -20, y: -20 },
    transparent: isMac,
    backgroundColor: isMac ? undefined : backgroundColor,
    resizable: true,
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
  searchParentWindow = parentWindow
  isSearchWindowReady = false
  positionSearchWindow(searchWindow, parentWindow)

  searchWindow.once('ready-to-show', () => {
    isSearchWindowReady = true
    const parent = pendingShowParentWindow
    if (parent && !parent.isDestroyed()) {
      showSearchWindow(parent)
    }
  })

  // Hide on blur (IDEA behavior), but keep the renderer warm for the next open.
  searchWindow.on('blur', () => {
    closeSearchWindow()
  })

  searchWindow.on('move', () => {
    updateSearchWindowGuides()
  })

  searchWindow.on('resize', () => {
    updateSearchWindowGuides()
  })

  searchWindow.on('closed', () => {
    clearGuideHideTimer()
    searchWindow = null
    searchParentWindow = null
    pendingShowParentWindow = null
    isSearchWindowReady = false
  })

  const themeParams = `theme=${effectiveTheme}&colorTheme=${colorTheme}`
  if (isDev) {
    searchWindow.loadURL(`${getRendererDevUrl()}/#/search?${themeParams}`)
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
    clearGuideHideTimer()
    pendingShowParentWindow = null
    emitSearchWindowGuides(HIDDEN_GUIDES)
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
