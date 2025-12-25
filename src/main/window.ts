import { BrowserWindow, session, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { getWindowStatePath, readJsonFile, writeJsonFile } from './stores/paths.js'

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

export function createWindow() {
  // Setup Content Security Policy before creating window
  setupContentSecurityPolicy()

  const isDevelopment = process.env.NODE_ENV === 'development'
  const isMac = process.platform === 'darwin'
  const windowState = getWindowState()

  const mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 600,
    minHeight: 600,
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

  // Restore maximized state
  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

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

  return mainWindow
}
