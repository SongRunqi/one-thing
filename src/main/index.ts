import { app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { createWindow } from './window.js'
import { initializeIPC, initializeMCP, shutdownMCP, initializeSkills } from './ipc/handlers.js'
import { initializeStores } from './store.js'
import { initializeToolRegistry } from './tools/index.js'
import { initializeStorage, closeStorage } from './storage/index.js'
import { startMemoryScheduler, stopMemoryScheduler } from './services/memory-scheduler.js'

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
  // Initialize stores and migrate data if needed
  initializeStores()

  // Initialize SQLite storage with vector support
  await initializeStorage('sqlite')

  // Start memory scheduler for periodic decay
  await startMemoryScheduler({
    decayIntervalMs: 4 * 60 * 60 * 1000, // 4 hours
    runOnStart: true,
    debug: process.env.NODE_ENV === 'development',
  })

  // Initialize tool registry
  await initializeToolRegistry()

  // Initialize IPC handlers
  initializeIPC()

  // Create window first for fast startup
  mainWindow = createWindow()

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
  }
})

// Cleanup on quit
app.on('before-quit', async () => {
  // Stop memory scheduler
  stopMemoryScheduler()

  // Close storage connections
  await closeStorage()

  // Shutdown MCP
  await shutdownMCP()
})

export { mainWindow }
