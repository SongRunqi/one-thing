import { app, BrowserWindow, protocol, net } from 'electron'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { createWindow } from './window.js'
import { initializeIPC, initializeMCP, shutdownMCP, initializeSkills } from './ipc/handlers.js'
import { initializeStores } from './store.js'
import { initializeSettings } from './stores/settings.js'
import { sanitizeAllSessionsOnStartup } from './stores/sessions.js'
import { initializeToolRegistry } from './tools/index.js'
import { initializeStreamEngine, shutdownStreamEngine, getStreamEngine } from './engine/index.js'
import { getMediaImagesDir } from './stores/paths.js'
import { initializePromptManager, startTemplateWatcher, stopTemplateWatcher } from './engine/prompt/index.js'
import { initializeEventSystem, shutdownEventSystem, initializeIPCBridge, shutdownIPCBridge } from './events/index.js'
import { initializeSessionLayer, shutdownSessionLayer } from './session/index.js'
import { Permission } from './permission/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Suppress security warnings in development mode
// These warnings are expected because Vite HMR requires 'unsafe-eval'
// Production builds use strict CSP and don't show these warnings
if (process.env.NODE_ENV === 'development') {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
}

let mainWindow: BrowserWindow | null = null

app.on('ready', async () => {
  // Register custom protocol for media files
  protocol.handle('media', (request) => {
    const filename = decodeURIComponent(request.url.slice('media://'.length))
    const filePath = path.join(getMediaImagesDir(), filename)
    return net.fetch(pathToFileURL(filePath).toString())
  })

  // Initialize stores and migrate data if needed
  initializeStores()

  // Initialize settings asynchronously (before any settings access)
  await initializeSettings()

  // Initialize event system (EventBus + StreamChannel + SessionManager + StreamEngine)
  initializeEventSystem()
  initializeSessionLayer()
  initializeStreamEngine()

  // Initialize Permission system with EventBus and channel resolver
  Permission.initialize(
    (await import('./events/index.js')).getEventBus(),
    (sessionId) => getStreamEngine().getChannel(sessionId),
  )

  // Clean up interrupted sessions from previous app instance
  sanitizeAllSessionsOnStartup()

  // Initialize PromptManager for template-based prompts
  await initializePromptManager()

  // Start template watcher in development mode (hot reload)
  startTemplateWatcher()

  // Initialize tool registry
  await initializeToolRegistry()

  // Initialize IPC handlers
  initializeIPC()

  // Create window first for fast startup
  mainWindow = createWindow()

  // Initialize IPCBridge — the single exit point for all renderer IPC
  initializeIPCBridge(mainWindow.webContents)
  // Bind StreamEngine to the window's WebContents for command handling
  getStreamEngine().bind(mainWindow.webContents)

  // Abort all active streams when the window closes to prevent background resource leaks
  mainWindow.on('closed', () => {
    shutdownIPCBridge()
    try { getStreamEngine().abortAll() } catch { /* already shut down */ }
    mainWindow = null
  })

  // Initialize MCP system asynchronously (don't block startup)
  initializeMCP().catch(err => {
    console.error('[MCP] Initialization failed (non-blocking):', err)
  })

  // Initialize skills system asynchronously
  initializeSkills().catch(err => {
    console.error('[Skills] Initialization failed (non-blocking):', err)
  })

})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    mainWindow = createWindow()
    initializeIPCBridge(mainWindow.webContents)
    getStreamEngine().bind(mainWindow.webContents)
    mainWindow.on('closed', () => {
      shutdownIPCBridge()
      try { getStreamEngine().abortAll() } catch { /* already shut down */ }
      mainWindow = null
    })
  }
})

// Cleanup on quit
app.on('before-quit', async () => {
  // Stop template watcher
  stopTemplateWatcher()

  // Shutdown MCP
  await shutdownMCP()

  // Shutdown engine, permission, session layer, and event system (reverse init order)
  shutdownStreamEngine()
  Permission.shutdown()
  shutdownSessionLayer()
  shutdownEventSystem()
})

export { mainWindow }
