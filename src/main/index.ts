import { app, BrowserWindow, protocol, net } from 'electron'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { createWindow } from './window.js'
import { initializeIPC, initializeMCP, shutdownMCP, initializeSkills, initializeCustomAgents } from './ipc/handlers.js'
import { initializeStores } from './store.js'
import { initializeSettings } from './stores/settings.js'
import { sanitizeAllSessionsOnStartup } from './stores/sessions.js'
import { initializeToolRegistry } from './tools/index.js'
import { initializeTextMemory } from './services/memory-text/index.js'
import { getMediaImagesDir } from './stores/paths.js'
import { runMigration as runAgentMigration } from './services/migration/agent-migration.js'
import { initializePromptManager, startTemplateWatcher, stopTemplateWatcher } from './services/prompt/index.js'
import { initializePlugins, shutdownPlugins } from './plugins/index.js'
import { initializeUpdater, shutdownUpdater } from './updater.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Suppress security warnings in development mode
// These warnings are expected because Vite HMR requires 'unsafe-eval'
// Production builds use strict CSP and don't show these warnings
if (process.env.NODE_ENV === 'development') {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
}

// Allow overriding userData path for E2E test isolation
if (process.env.ELECTRON_USER_DATA) {
  app.setPath('userData', process.env.ELECTRON_USER_DATA)
}

let mainWindow: BrowserWindow | null = null

app.on('ready', async () => {
  const t0 = performance.now()

  // Register custom protocol for media files
  protocol.handle('media', (request) => {
    const filename = decodeURIComponent(request.url.slice('media://'.length))
    const filePath = path.join(getMediaImagesDir(), filename)
    return net.fetch(pathToFileURL(filePath).toString())
  })

  // ========== Phase 1: Serial initialization (required before window) ==========
  // Initialize stores and migrate data if needed
  initializeStores()

  // Initialize settings asynchronously (before any settings access)
  await initializeSettings()
  console.log(`[Startup] Settings: ${(performance.now() - t0).toFixed(0)}ms`)

  // Run agent migration (from old Built-in Agent to CustomAgent format)
  // This must run after stores init but before custom agents are loaded
  try {
    const migratedCount = runAgentMigration()
    if (migratedCount >= 0) {
      console.log(`[Startup] Agent migration: ${migratedCount} agents migrated`)
    }
  } catch (error) {
    console.error('[Startup] Agent migration failed:', error)
  }
  console.log(`[Startup] Migration: ${(performance.now() - t0).toFixed(0)}ms`)

  // Clean up interrupted sessions from previous app instance
  sanitizeAllSessionsOnStartup()

  // Initialize IPC handlers (required for window communication)
  initializeIPC()

  // ========== Phase 2: Create window ASAP ==========
  mainWindow = createWindow()
  console.log(`[Startup] Window visible: ${(performance.now() - t0).toFixed(0)}ms`)

  // ========== Phase 3: Parallel initialization (after window) ==========
  await Promise.all([
    initializeTextMemory(),
    initializePromptManager().then(() => {
      // Start template watcher in development mode (hot reload)
      startTemplateWatcher()
    }),
    initializeToolRegistry(),
  ])
  console.log(`[Startup] Core systems: ${(performance.now() - t0).toFixed(0)}ms`)

  // ========== Phase 4: Fire-and-forget (low priority) ==========
  // Initialize plugin system (loads plugins and executes app:init hooks)
  initializePlugins().catch(err => {
    console.error('[Plugins] Initialization failed (non-blocking):', err)
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

  // Initialize updater (check for updates from GitHub)
  initializeUpdater(mainWindow)
  console.log(`[Startup] Fully ready: ${(performance.now() - t0).toFixed(0)}ms`)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    mainWindow = createWindow()
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

  // Shutdown updater
  shutdownUpdater()
})

export { mainWindow }
