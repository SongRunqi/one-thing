import { app, BrowserWindow, protocol, net } from 'electron'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { createWindow } from './window.js'
import { initializeIPC, initializeMCP, shutdownMCP, initializeSkills, initializeCustomAgents, initializeUpdater } from './ipc/handlers.js'
import { initializeStores } from './store.js'
import { initializeSettings } from './stores/settings.js'
import { sanitizeAllSessionsOnStartup } from './stores/sessions.js'
import { initializeToolRegistry } from './tools/index.js'
import { initializeTextMemory } from './services/memory-text/index.js'
import { getMediaImagesDir } from './stores/paths.js'
import { runMigration as runAgentMigration } from './services/migration/agent-migration.js'
import { initializePromptManager, startTemplateWatcher, stopTemplateWatcher } from './services/prompt/index.js'
import { initializePlugins, shutdownPlugins } from './plugins/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Global error handlers to prevent silent crashes
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled Rejection at:', promise, 'reason:', reason)
})

// Suppress security warnings in development mode
// These warnings are expected because Vite HMR requires 'unsafe-eval'
// Production builds use strict CSP and don't show these warnings
if (process.env.NODE_ENV === 'development') {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
}

let mainWindow: BrowserWindow | null = null

app.on('ready', async () => {
  try {
    console.log('[Startup] App ready, beginning initialization...')

    // Register custom protocol for media files
    protocol.handle('media', (request) => {
      const filename = decodeURIComponent(request.url.slice('media://'.length))
      const filePath = path.join(getMediaImagesDir(), filename)
      return net.fetch(pathToFileURL(filePath).toString())
    })
    console.log('[Startup] Media protocol registered')

    // Initialize stores and migrate data if needed
    initializeStores()
    console.log('[Startup] Stores initialized')

    // Initialize settings asynchronously (before any settings access)
    await initializeSettings()
    console.log('[Startup] Settings initialized')

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

    // Clean up interrupted sessions from previous app instance
    try {
      sanitizeAllSessionsOnStartup()
      console.log('[Startup] Sessions sanitized')
    } catch (error) {
      console.error('[Startup] Session sanitization failed:', error)
    }

    // Initialize text-based memory system
    try {
      await initializeTextMemory()
      console.log('[Startup] Text memory initialized')
    } catch (error) {
      console.error('[Startup] Text memory initialization failed:', error)
    }

    // Initialize PromptManager for template-based prompts
    try {
      await initializePromptManager()
      console.log('[Startup] Prompt manager initialized')
    } catch (error) {
      console.error('[Startup] Prompt manager initialization failed:', error)
    }

    // Start template watcher in development mode (hot reload)
    startTemplateWatcher()

    // Initialize tool registry
    try {
      await initializeToolRegistry()
      console.log('[Startup] Tool registry initialized')
    } catch (error) {
      console.error('[Startup] Tool registry initialization failed:', error)
    }

    // Initialize IPC handlers - CRITICAL: must succeed for app to work
    try {
      initializeIPC()
      console.log('[Startup] IPC handlers registered')
    } catch (error) {
      console.error('[Startup] CRITICAL: IPC initialization failed:', error)
    }

    // Initialize plugin system (loads plugins and executes app:init hooks)
    initializePlugins().catch(err => {
      console.error('[Plugins] Initialization failed (non-blocking):', err)
    })

    // Create window first for fast startup
    mainWindow = createWindow()
    console.log('[Startup] Main window created')

    // Initialize auto-updater (checks for updates after startup)
    try {
      initializeUpdater()
      console.log('[Startup] Updater initialized')
    } catch (error) {
      console.error('[Startup] Updater initialization failed (non-blocking):', error)
    }

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

    console.log('[Startup] Initialization complete')
  } catch (error) {
    console.error('[Startup] FATAL: Unhandled error during initialization:', error)
  }
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
})

export { mainWindow }
