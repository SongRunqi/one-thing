import { BrowserWindow, session, shell, Menu, app } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { getWindowStatePath, readJsonFile, writeJsonFile } from './stores/paths.js'
import { getSettings } from './stores/settings.js'

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
      // Scripts: self, and unsafe-eval only in dev for HMR
      isDevelopment
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self'",
      // Styles: self and unsafe-inline (Vue uses inline styles)
      "style-src 'self' 'unsafe-inline'",
      // Images: self, data URIs, https, and media protocol for local images
      "img-src 'self' data: https: media:",
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
        {
          label: 'Close Chat',
          click: () => {
            mainWindow.webContents.send('menu:close-chat')
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

const defaultWindowState: WindowState = {
  width: 1000,
  height: 800,
}

function getWindowState(): WindowState {
  return readJsonFile(getWindowStatePath(), defaultWindowState)
}

function saveWindowState(window: BrowserWindow): void {
  if (window.isMaximized()) {
    writeJsonFile(getWindowStatePath(), { ...getWindowState(), isMaximized: true })
  } else {
    const bounds = window.getBounds()
    writeJsonFile(getWindowStatePath(), {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: false,
    })
  }
}

// Keep track of the settings window
let settingsWindow: BrowserWindow | null = null

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

  // Read theme from settings to set correct background color
  const settings = getSettings()
  const isLightTheme = settings.theme === 'light'
  const backgroundColor = isLightTheme ? '#FFFCF0' : '#1C1B1A'

  settingsWindow = new BrowserWindow({
    width: 900,
    height: 620,
    minWidth: 700,
    minHeight: 500,
    show: false,
    backgroundColor,
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

  // Load settings page
  if (isDevelopment) {
    settingsWindow.loadURL('http://127.0.0.1:5173/#/settings')
  } else {
    settingsWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: '/settings'
    })
  }

  return settingsWindow
}

export function createWindow() {
  // Setup Content Security Policy before creating window
  setupContentSecurityPolicy()

  const isDevelopment = process.env.NODE_ENV === 'development'
  const isMac = process.platform === 'darwin'
  const windowState = getWindowState()

  // Read theme from settings to set correct background color
  const settings = getSettings()
  const isLightTheme = settings.theme === 'light'
  const backgroundColor = isLightTheme ? '#FFFCF0' : '#1C1B1A'

  const mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 600,
    minHeight: 600,
    // Prevent flash: don't show until ready, use theme-aware background
    show: false,
    backgroundColor,
    // Use hidden title bar on macOS to keep traffic lights
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
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

  // Handle external links - open in system browser instead of navigating away
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appUrl = isDevelopment ? 'http://127.0.0.1:5173' : 'file://'
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
    // Load from Vite dev server
    mainWindow.loadURL('http://127.0.0.1:5173')
    mainWindow.webContents.openDevTools()
  } else {
    // Load from built files
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Setup application menu with keyboard shortcuts
  setupApplicationMenu(mainWindow)

  return mainWindow
}
