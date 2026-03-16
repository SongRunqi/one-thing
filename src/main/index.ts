import { app, BrowserWindow, protocol, net } from 'electron'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { createWindow } from './window.js'
import { initializeIPC, initializeMCP, shutdownMCP, initializeSkills, initializeCustomAgents } from './ipc/handlers.js'
import { initializeStores } from './store.js'
import { initializeSettings } from './stores/settings.js'
import { sanitizeAllSessionsOnStartup } from './stores/sessions.js'
import { initializeToolRegistry } from './tools/index.js'
import { initializeStreamEngine, shutdownStreamEngine, getStreamEngine } from './engine/index.js'
import { initializeTextMemory } from './services/memory-text/index.js'
import { getMediaImagesDir } from './stores/paths.js'
import { initializePromptManager, startTemplateWatcher, stopTemplateWatcher } from './services/prompt/index.js'
import { initializePlugins, shutdownPlugins } from './plugins/index.js'
import { initializeEventSystem, shutdownEventSystem, initializeIPCBridge, shutdownIPCBridge } from './events/index.js'
import { initializeSessionLayer, shutdownSessionLayer } from './session/index.js'

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

  // Clean up interrupted sessions from previous app instance
  sanitizeAllSessionsOnStartup()

  // Initialize text-based memory system
  await initializeTextMemory()

  // Initialize PromptManager for template-based prompts
  await initializePromptManager()

  // Start template watcher in development mode (hot reload)
  startTemplateWatcher()

  // Initialize tool registry
  await initializeToolRegistry()

  // Initialize IPC handlers
  initializeIPC()

  // Initialize plugin system (loads plugins and executes app:init hooks)
  initializePlugins().catch(err => {
    console.error('[Plugins] Initialization failed (non-blocking):', err)
  })

  // Create window first for fast startup
  mainWindow = createWindow()

  // Initialize IPCBridge — the single exit point for all renderer IPC
  initializeIPCBridge(mainWindow.webContents)

  // Abort all active streams when the window closes to prevent background resource leaks
  mainWindow.on('closed', () => {
    shutdownIPCBridge()
    getStreamEngine().abortAll()
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

  // Initialize custom agents system asynchronously
  initializeCustomAgents().catch(err => {
    console.error('[CustomAgent] Initialization failed (non-blocking):', err)
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
    mainWindow.on('closed', () => {
      shutdownIPCBridge()
      getStreamEngine().abortAll()
      mainWindow = null
    })
  }
})

// Cleanup on quit
app.on('before-quit', async () => {
  // Shutdown plugins (executes app:quit hooks)
  await shutdownPlugins()

  // Stop template watcher
  stopTemplateWatcher()

  // Shutdown MCP
  await shutdownMCP()

  // Shutdown engine, session layer, and event system (reverse init order)
  shutdownStreamEngine()
  shutdownSessionLayer()
  shutdownEventSystem()
})

export { mainWindow }
