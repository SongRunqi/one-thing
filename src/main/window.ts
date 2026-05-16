import { BrowserWindow, session, shell, Menu, app, nativeTheme, type Rectangle } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { getWindowStatePath, readJsonFile, writeJsonFile } from './stores/paths.js'
import { getSettings } from './stores/settings.js'
import { IPC_CHANNELS } from '../shared/ipc.js'
import type { TodoPlanActivationMode, TodoPlanWindowActionRequest } from '../shared/ipc.js'
import { getThemeBackgroundColor, initializeThemes } from './themes/index.js'
import { isMainAppWindowUrl } from './search/window-target.js'
import {
  configureNonActivatingPanel,
  hideNonActivatingPanel,
  isNonActivatingPanelFrontmost,
  setNonActivatingPanelPinned,
  showNonActivatingPanel,
} from './native/macos-panel.js'

/**
 * Get the effective theme (resolves 'system' to actual theme)
 * This is called before window creation to set correct background color
 */
function getEffectiveTheme(): 'light' | 'dark' {
  const settings = getSettings()
  const settingsTheme = settings.theme
  const nativeIsDark = nativeTheme.shouldUseDarkColors

  let effectiveTheme: 'light' | 'dark'
  if (settingsTheme === 'system') {
    effectiveTheme = nativeIsDark ? 'dark' : 'light'
  } else {
    effectiveTheme = settingsTheme === 'light' ? 'light' : 'dark'
  }

  console.log('[Theme] getEffectiveTheme:', {
    settingsTheme,
    nativeIsDark,
    effectiveTheme
  })

  return effectiveTheme
}

/**
 * Get the effective theme ID based on mode
 * Supports dual theme system: darkThemeId for dark mode, lightThemeId for light mode
 */
function getEffectiveThemeId(mode: 'dark' | 'light'): string {
  const settings = getSettings()
  const general = settings.general

  // Priority: mode-specific > legacy themeId > default
  if (mode === 'dark') {
    return general?.darkThemeId || general?.themeId || 'flexoki'
  } else {
    return general?.lightThemeId || general?.themeId || 'flexoki'
  }
}

/**
 * Configure Content Security Policy
 */
function setupContentSecurityPolicy() {
  const isDevelopment = process.env.NODE_ENV === 'development'

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Build CSP directives
    const cspDirectives = [
      // Default: only allow from self
      "default-src 'self'",
      // Scripts: self, and unsafe-inline for theme caching scripts in index.html
      // unsafe-eval only in dev for HMR
      isDevelopment
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
      // Styles: self and unsafe-inline (Vue uses inline styles)
      "style-src 'self' 'unsafe-inline'",
      // Images: self, data URIs, https, file, and media protocol for local images
      "img-src 'self' data: https: file: media:",
      // Fonts: self and data URIs
      "font-src 'self' data:",
      // Connect: allow API calls to various AI providers
      "connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.deepseek.com https://api.moonshot.cn https://open.bigmodel.cn https://*.zhipuai.cn ws://127.0.0.1:* http://127.0.0.1:*",
      // Workers: self
      "worker-src 'self' blob:",
      // Frame: none (no iframes)
      "frame-src 'none'",
      // Object: none (no plugins)
      "object-src 'none'",
      // Base URI: self
      "base-uri 'self'",
      // Form action: self
      "form-action 'self'",
    ]

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspDirectives.join('; ')],
      },
    })
  })
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function getRendererDevUrl(): string {
  return process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173'
}

/**
 * Setup application menu with keyboard shortcuts
 */
function setupApplicationMenu(mainWindow: BrowserWindow) {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        {
          label: 'Settings...',
          accelerator: 'Cmd+,',
          click: () => {
            openSettingsWindow(mainWindow)
          },
        },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    // File menu
    // Note: Keyboard shortcuts are handled by useShortcuts in the renderer
    // for configurability. Menu items are click-only.
    {
      label: 'File',
      submenu: [
        {
          label: 'New Chat',
          click: () => {
            mainWindow.webContents.send('menu:new-chat')
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' as const },
          { role: 'delete' as const },
          { role: 'selectAll' as const },
        ] : [
          { role: 'delete' as const },
          { type: 'separator' as const },
          { role: 'selectAll' as const },
        ]),
      ],
    },
    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
        ] : [
          { role: 'close' as const },
        ]),
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized?: boolean
}

interface WindowStateFile extends WindowState {
  todoPlan?: WindowState
}

interface MainWindowVisibilitySnapshot {
  window: BrowserWindow
  visible: boolean
}

interface TodoPlanWindowActionOptions extends TodoPlanWindowActionRequest {
  mainWindowVisibilitySnapshot?: MainWindowVisibilitySnapshot[]
}

interface NormalizedTodoPlanWindowActionOptions {
  activation: TodoPlanActivationMode
  preserveMainWindowVisibility: boolean
  mainWindowVisibilitySnapshot?: MainWindowVisibilitySnapshot[]
}

const defaultWindowState: WindowState = {
  width: 1000,
  height: 800,
}

const defaultTodoPlanWindowState: WindowState = {
  width: 460,
  height: 640,
}

function sanitizeWindowState(state: Partial<WindowState> | null | undefined, fallback: WindowState): WindowState {
  const width = Number(state?.width)
  const height = Number(state?.height)
  const x = Number(state?.x)
  const y = Number(state?.y)

  return {
    width: Number.isFinite(width) && width > 0 ? width : fallback.width,
    height: Number.isFinite(height) && height > 0 ? height : fallback.height,
    x: Number.isFinite(x) ? x : undefined,
    y: Number.isFinite(y) ? y : undefined,
    isMaximized: state?.isMaximized === true,
  }
}

function getWindowState(): WindowStateFile {
  const state = readJsonFile<WindowStateFile | null>(getWindowStatePath(), defaultWindowState)
  const mainState = sanitizeWindowState(state, defaultWindowState)
  const todoPlan = state?.todoPlan
    ? sanitizeWindowState(state.todoPlan, defaultTodoPlanWindowState)
    : undefined
  return {
    ...mainState,
    todoPlan,
  }
}

function getTodoPlanWindowState(): WindowState {
  return getWindowState().todoPlan || defaultTodoPlanWindowState
}

function saveWindowState(window: BrowserWindow): void {
  const current = getWindowState()
  if (window.isMaximized()) {
    writeJsonFile(getWindowStatePath(), { ...current, isMaximized: true })
  } else {
    const bounds = window.getBounds()
    writeJsonFile(getWindowStatePath(), {
      ...current,
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: false,
    })
  }
}

function saveTodoPlanWindowState(window: BrowserWindow | null, stableBounds?: Rectangle): void {
  if (!window || window.isDestroyed() || window.isMinimized()) return
  const bounds = stableBounds || window.getBounds()
  writeJsonFile(getWindowStatePath(), {
    ...getWindowState(),
    todoPlan: {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
    },
  })
}

// Keep track of the settings window
let settingsWindow: BrowserWindow | null = null
let todoPlanWindow: BrowserWindow | null = null
let todoPlanPinned = false
let isHidingTodoPlanWindow = false
let isSyncingTodoPlanNativeFrame = false
let todoPlanNativeFrameGuardToken = 0
let suppressMainWindowActivationUntil = 0
const AUXILIARY_CLOSE_ACTIVATION_SUPPRESSION_MS = 2500

function isMainAppWindow(win: BrowserWindow | null | undefined): win is BrowserWindow {
  if (!win || win.isDestroyed()) return false
  const url = win.webContents.getURL()
  return !url || isMainAppWindowUrl(url)
}

function captureMainWindowVisibility(): MainWindowVisibilitySnapshot[] {
  return BrowserWindow.getAllWindows()
    .filter(isMainAppWindow)
    .map(window => ({
      window,
      visible: window.isVisible(),
    }))
}

function restoreHiddenMainWindows(snapshot: MainWindowVisibilitySnapshot[]): void {
  const hiddenMainWindows = snapshot.filter(item => !item.visible)
  if (!hiddenMainWindows.length) return

  const restore = () => {
    for (const item of hiddenMainWindows) {
      if (!item.window.isDestroyed() && item.window.isVisible()) {
        item.window.hide()
      }
    }
  }

  for (const delay of [0, 80, 250, 600, 1200, 2400]) {
    setTimeout(restore, delay)
  }
}

function normalizeTodoPlanWindowActionOptions(
  options: TodoPlanWindowActionOptions = {},
): NormalizedTodoPlanWindowActionOptions {
  return {
    activation: options.activation || 'preserve-current-app',
    preserveMainWindowVisibility: options.preserveMainWindowVisibility !== false,
    mainWindowVisibilitySnapshot: options.mainWindowVisibilitySnapshot,
  }
}

function shouldPreserveCurrentMacApp(options: NormalizedTodoPlanWindowActionOptions): boolean {
  if (process.platform !== 'darwin') return false
  if (options.activation === 'preserve-current-app') return true
  return !BrowserWindow.getFocusedWindow()
}

function prepareTodoPlanWindowAction(options: TodoPlanWindowActionOptions = {}): {
  options: NormalizedTodoPlanWindowActionOptions
  mainWindowVisibilitySnapshot: MainWindowVisibilitySnapshot[]
} {
  const normalized = normalizeTodoPlanWindowActionOptions(options)
  if (shouldPreserveCurrentMacApp(normalized)) {
    suppressMainWindowActivationFromTodoPanel()
  }

  return {
    options: normalized,
    mainWindowVisibilitySnapshot: normalized.preserveMainWindowVisibility
      ? normalized.mainWindowVisibilitySnapshot || captureMainWindowVisibility()
      : [],
  }
}

function suppressMainWindowActivationFromTodoPanel(): void {
  if (process.platform !== 'darwin') return
  suppressMainWindowActivationUntil = Date.now() + AUXILIARY_CLOSE_ACTIVATION_SUPPRESSION_MS
}

function runWithTodoPlanNativeFrameGuard<T>(action: () => T): T {
  const token = ++todoPlanNativeFrameGuardToken
  isSyncingTodoPlanNativeFrame = true
  try {
    return action()
  } finally {
    setTimeout(() => {
      if (token === todoPlanNativeFrameGuardToken) {
        isSyncingTodoPlanNativeFrame = false
      }
    }, 80)
  }
}

function configureTodoPlanNativePanel(window: BrowserWindow): boolean {
  if (process.platform !== 'darwin') return false
  return runWithTodoPlanNativeFrameGuard(() => configureNonActivatingPanel(window))
}

function presentTodoPlanWindow(
  window: BrowserWindow,
  options: NormalizedTodoPlanWindowActionOptions,
): void {
  if (shouldPreserveCurrentMacApp(options)) {
    const shownNatively = runWithTodoPlanNativeFrameGuard(() => showNonActivatingPanel(window))
    if (!shownNatively) {
      window.showInactive()
      window.moveTop()
    }
    return
  }

  window.show()
  window.focus()
}

function isTodoPlanWindowFrontmost(window: BrowserWindow): boolean {
  if (process.platform === 'darwin') {
    return isNonActivatingPanelFrontmost(window) || window.isFocused()
  }
  return window.isFocused()
}

export function shouldSuppressMainWindowActivation(): boolean {
  return Date.now() < suppressMainWindowActivationUntil
}

function hideTodoPlanWindowPreservingBounds(): boolean {
  if (!todoPlanWindow || todoPlanWindow.isDestroyed() || !todoPlanWindow.isVisible()) {
    return false
  }

  const stableBounds = todoPlanWindow.getBounds()
  isHidingTodoPlanWindow = true
  try {
    saveTodoPlanWindowState(todoPlanWindow, stableBounds)
    const hiddenNatively = hideNonActivatingPanel(todoPlanWindow)
    if (!hiddenNatively) {
      todoPlanWindow.hide()
    }
  } finally {
    isHidingTodoPlanWindow = false
  }
  return true
}

export function hideUnpinnedTodoPlanWindowForMainActivation(): boolean {
  if (process.platform !== 'darwin') return false
  if (todoPlanPinned) return false
  return hideTodoPlanWindowPreservingBounds()
}

/**
 * Create or focus the settings window
 */
export function openSettingsWindow(parentWindow?: BrowserWindow) {
  // If settings window already exists, focus it
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return settingsWindow
  }

  const isDevelopment = process.env.NODE_ENV === 'development'
  const isMac = process.platform === 'darwin'

  // Get effective theme (resolves 'system' to actual theme)
  const effectiveTheme = getEffectiveTheme()

  // Get the actual theme's background color (supports dual theme system)
  const settings = getSettings()
  const themeId = getEffectiveThemeId(effectiveTheme)
  const backgroundColor = getThemeBackgroundColor(themeId, effectiveTheme)
  const colorTheme = settings.general?.colorTheme || 'blue'

  settingsWindow = new BrowserWindow({
    width: 900,
    height: 620,
    minWidth: 700,
    minHeight: 500,
    show: false,
    transparent: isMac,
    backgroundColor: isMac ? undefined : backgroundColor,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    parent: parentWindow,
    modal: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  settingsWindow.once('ready-to-show', () => {
    settingsWindow?.show()
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  // Load settings page with theme parameters
  const themeParams = `theme=${effectiveTheme}&colorTheme=${colorTheme}`
  const preloadPath = path.join(__dirname, '../preload/index.js')
  console.log('[Settings] Creating settings window with preload:', preloadPath)
  console.log('[Settings] isDevelopment:', isDevelopment)

  if (isDevelopment) {
    const url = `${getRendererDevUrl()}/#/settings?${themeParams}`
    console.log('[Settings] Loading URL:', url)
    settingsWindow.loadURL(url)
  } else {
    settingsWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: `/settings?${themeParams}`
    })
  }

  // Add error handling
  settingsWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Settings] Failed to load:', errorCode, errorDescription)
  })

  return settingsWindow
}

export function openTodoPlanWindow(options: TodoPlanWindowActionOptions = {}) {
  const prepared = prepareTodoPlanWindowAction(options)
  const { mainWindowVisibilitySnapshot } = prepared

  if (todoPlanWindow && !todoPlanWindow.isDestroyed()) {
    if (todoPlanWindow.isMinimized()) todoPlanWindow.restore()
    presentTodoPlanWindow(todoPlanWindow, prepared.options)
    restoreHiddenMainWindows(mainWindowVisibilitySnapshot)
    return todoPlanWindow
  }

  const isDevelopment = process.env.NODE_ENV === 'development'
  const isMac = process.platform === 'darwin'
  const effectiveTheme = getEffectiveTheme()
  const themeId = getEffectiveThemeId(effectiveTheme)
  const backgroundColor = getThemeBackgroundColor(themeId, effectiveTheme)
  const windowState = getTodoPlanWindowState()

  todoPlanWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 320,
    minHeight: 280,
    show: false,
    type: isMac ? 'panel' : undefined,
    focusable: true,
    acceptFirstMouse: isMac ? true : undefined,
    skipTaskbar: isMac,
    transparent: isMac,
    backgroundColor: isMac ? undefined : backgroundColor,
    titleBarStyle: isMac ? 'customButtonsOnHover' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    resizable: true,
    alwaysOnTop: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (isMac) configureTodoPlanNativePanel(todoPlanWindow)
  restoreHiddenMainWindows(mainWindowVisibilitySnapshot)

  todoPlanWindow.once('ready-to-show', () => {
    if (todoPlanWindow && !todoPlanWindow.isDestroyed()) {
      if (isMac) configureTodoPlanNativePanel(todoPlanWindow)
      presentTodoPlanWindow(todoPlanWindow, prepared.options)
    }
    restoreHiddenMainWindows(mainWindowVisibilitySnapshot)
  })

  todoPlanWindow.on('resize', () => {
    if (!isHidingTodoPlanWindow && !isSyncingTodoPlanNativeFrame) saveTodoPlanWindowState(todoPlanWindow)
  })
  todoPlanWindow.on('move', () => {
    if (!isHidingTodoPlanWindow && !isSyncingTodoPlanNativeFrame) saveTodoPlanWindowState(todoPlanWindow)
  })

  todoPlanWindow.on('close', () => {
    saveTodoPlanWindowState(todoPlanWindow)
    if (shouldPreserveCurrentMacApp(prepared.options)) {
      suppressMainWindowActivationFromTodoPanel()
    }
  })

  todoPlanWindow.on('closed', () => {
    todoPlanWindow = null
  })

  const themeParams = `theme=${effectiveTheme}`
  if (isDevelopment) {
    todoPlanWindow.loadURL(`${getRendererDevUrl()}/#/todo-plan?${themeParams}`)
  } else {
    todoPlanWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: `/todo-plan?${themeParams}`
    })
  }

  return todoPlanWindow
}

export function hideTodoPlanWindow(options: TodoPlanWindowActionOptions = {}): boolean {
  if (!todoPlanWindow || todoPlanWindow.isDestroyed() || !todoPlanWindow.isVisible()) {
    return false
  }

  const { mainWindowVisibilitySnapshot } = prepareTodoPlanWindowAction(options)
  const hidden = hideTodoPlanWindowPreservingBounds()
  restoreHiddenMainWindows(mainWindowVisibilitySnapshot)
  return hidden
}

export function toggleTodoPlanWindow(options: TodoPlanWindowActionOptions = {}) {
  if (todoPlanWindow && !todoPlanWindow.isDestroyed() && todoPlanWindow.isVisible()) {
    if (isTodoPlanWindowFrontmost(todoPlanWindow)) {
      hideTodoPlanWindow(options)
      return null
    }
    return openTodoPlanWindow(options)
  }
  return openTodoPlanWindow(options)
}

export function setTodoPlanWindowPinned(pinned: boolean): boolean {
  todoPlanPinned = pinned
  if (!todoPlanWindow || todoPlanWindow.isDestroyed()) return todoPlanPinned
  const pinnedNatively = runWithTodoPlanNativeFrameGuard(() => {
    return setNonActivatingPanelPinned(todoPlanWindow!, pinned)
  })
  if (!pinnedNatively) {
    todoPlanWindow.setAlwaysOnTop(pinned, pinned ? 'floating' : 'normal')
    return todoPlanWindow.isAlwaysOnTop()
  }
  if (pinned && todoPlanWindow.isVisible()) {
    presentTodoPlanWindow(todoPlanWindow, normalizeTodoPlanWindowActionOptions())
  }
  return todoPlanPinned
}

export function createWindow() {
  // Setup Content Security Policy before creating window
  setupContentSecurityPolicy()

  // Initialize themes before getting background color
  initializeThemes()

  const isDevelopment = process.env.NODE_ENV === 'development'
  const isMac = process.platform === 'darwin'
  const windowState = getWindowState()

  // Get effective theme (resolves 'system' to actual theme)
  const effectiveTheme = getEffectiveTheme()

  // Get the actual theme's background color (supports dual theme system)
  const themeId = getEffectiveThemeId(effectiveTheme)
  const backgroundColor = getThemeBackgroundColor(themeId, effectiveTheme)

  console.log('[Window] Creating main window with theme:', { themeId, effectiveTheme, backgroundColor })

  const mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 600,
    minHeight: 600,
    icon: path.join(__dirname, '../../resources/onething.png'),
    // Prevent flash: don't show until ready, use theme-aware background
    show: false,
    transparent: isMac,
    backgroundColor: isMac ? undefined : backgroundColor,
    // Use a full-size content view so renderer drag regions work around
    // the traffic lights and toolbar buttons.
    titleBarStyle: isMac ? 'hidden' : 'default',
    // Position traffic lights - in sidebar header area
    trafficLightPosition: isMac ? { x: 16, y: 17 } : undefined,
    webPreferences: {
      // Preload is bundled with esbuild to dist/preload/index.js
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Show window only after content is ready (prevents white flash)
  mainWindow.once('ready-to-show', () => {
    if (shouldSuppressMainWindowActivation()) {
      mainWindow.hide()
      return
    }
    // Restore maximized state before showing
    if (windowState.isMaximized) {
      mainWindow.maximize()
    }
    mainWindow.show()
  })

  // Save window state on resize and move
  mainWindow.on('resize', () => saveWindowState(mainWindow))
  mainWindow.on('move', () => saveWindowState(mainWindow))
  mainWindow.on('close', () => saveWindowState(mainWindow))
  mainWindow.on('focus', () => {
    hideUnpinnedTodoPlanWindowForMainActivation()
  })

  // Handle external links - open in system browser instead of navigating away
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appUrl = isDevelopment ? getRendererDevUrl() : 'file://'
    // Allow navigation within the app, block external navigation
    if (!url.startsWith(appUrl)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  // Handle window.open() calls - open in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDevelopment) {
    // Load from Vite dev server with theme parameter
    mainWindow.loadURL(`${getRendererDevUrl()}#theme=${effectiveTheme}`)
    mainWindow.webContents.openDevTools()
  } else {
    // Load from built files with theme parameter
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: `theme=${effectiveTheme}`
    })
  }

  // Setup application menu with keyboard shortcuts
  setupApplicationMenu(mainWindow)

  return mainWindow
}

// Keep track of the image preview window
let imagePreviewWindow: BrowserWindow | null = null

// Types for image preview
type ImagePreviewData =
  | { mode: 'single'; previewId?: string; src?: string; alt?: string }
  | { mode: 'gallery'; mediaId: string }

/**
 * Open or update the image preview window
 * - Single mode: for non-media images (attachments), previewId passed in URL and data loaded via IPC pull
 * - Gallery mode: for media images, mediaId passed in URL, component loads data itself
 */
export function openImagePreviewWindow(data: ImagePreviewData) {
  console.log('[Window] openImagePreviewWindow called:', data.mode === 'single'
    ? {
        mode: data.mode,
        previewId: data.previewId,
        alt: data.alt,
        hasInlineSrc: Boolean(data.src),
        inlineSrcLength: data.src?.length,
      }
    : data)

  const isDevelopment = process.env.NODE_ENV === 'development'
  const isMac = process.platform === 'darwin'

  // Build URL params based on mode
  const effectiveTheme = getEffectiveTheme()
  let urlParams = `theme=${effectiveTheme}&mode=${data.mode}`
  if (data.mode === 'gallery') {
    urlParams += `&mediaId=${data.mediaId}`
  } else if (data.previewId) {
    urlParams += `&previewId=${encodeURIComponent(data.previewId)}`
  }

  // If window already exists, navigate to new URL and focus
  if (imagePreviewWindow && !imagePreviewWindow.isDestroyed()) {
    console.log('[Window] Updating existing preview window')
    if (data.mode === 'single') {
      // Single mode updates are small: the preview window pulls full data by previewId.
      imagePreviewWindow.webContents.send(IPC_CHANNELS.IMAGE_PREVIEW_UPDATE, data)
    } else {
      // Gallery mode: reload with new mediaId in URL
      if (isDevelopment) {
        imagePreviewWindow.loadURL(`${getRendererDevUrl()}/#/image-preview?${urlParams}`)
      } else {
        imagePreviewWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
          hash: `/image-preview?${urlParams}`
        })
      }
    }
    if (imagePreviewWindow.isMinimized()) {
      imagePreviewWindow.restore()
    }
    imagePreviewWindow.show()
    imagePreviewWindow.focus()
    return imagePreviewWindow
  }
  console.log('[Window] Creating new preview window')

  // Get effective theme and background color
  const themeId = getEffectiveThemeId(effectiveTheme)
  const backgroundColor = getThemeBackgroundColor(themeId, effectiveTheme)

  // Gallery mode needs wider window for sidebar
  const windowWidth = data.mode === 'gallery' ? 1100 : 900

  imagePreviewWindow = new BrowserWindow({
    width: windowWidth,
    height: 700,
    minWidth: data.mode === 'gallery' ? 700 : 500,
    minHeight: 400,
    show: false, // Show after ready to ensure proper initialization
    transparent: isMac,
    backgroundColor: isMac ? undefined : backgroundColor,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // For single mode, send a small previewId update as a backup; the URL also contains previewId.
  if (data.mode === 'single') {
    imagePreviewWindow.webContents.once('dom-ready', () => {
      console.log('[Window] Preview window dom-ready, sending single image preview reference')
      setTimeout(() => {
        imagePreviewWindow?.webContents.send(IPC_CHANNELS.IMAGE_PREVIEW_UPDATE, data)
      }, 50)
    })
  }

  imagePreviewWindow.once('ready-to-show', () => {
    console.log('[Window] Preview window ready-to-show')
    imagePreviewWindow?.show()
  })

  imagePreviewWindow.on('closed', () => {
    imagePreviewWindow = null
  })

  // Load image preview page with params in URL
  if (isDevelopment) {
    console.log('[Window] Loading preview URL (dev):', urlParams)
    imagePreviewWindow.loadURL(`${getRendererDevUrl()}/#/image-preview?${urlParams}`)
  } else {
    console.log('[Window] Loading preview file (prod):', urlParams)
    imagePreviewWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: `/image-preview?${urlParams}`
    })
  }

  return imagePreviewWindow
}
