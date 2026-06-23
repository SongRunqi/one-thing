import { app, BrowserWindow, protocol, net, powerMonitor } from 'electron'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import {
  activateMainWindow,
  createWindow,
  isTodoPlanBrowserWindow,
  recoverMainWindowAfterSystemResume,
  shouldSuppressMainWindowActivation,
  warmTodoPlanWindow,
} from './window.js'
import { initializeIPC, initializeMCP, shutdownMCP, initializeSkills, initializeACP, shutdownACP } from './ipc/handlers.js'
import { initializeStores, flushAllPendingSaves } from './store.js'
import { initializeSettings } from './stores/settings.js'
import { sanitizeAllSessionsOnStartup } from './stores/sessions.js'
import { initializeToolRegistry } from './tools/index.js'
import { initializeStreamEngine, shutdownStreamEngine, getStreamEngine, getStreamEngineSafe } from './engine/index.js'
import { registerBuiltinTriggers } from './engine/triggers/index.js'
import { getMediaImagesDir } from './stores/paths.js'
import { initializeEventSystem, shutdownEventSystem, initializeIPCBridge, shutdownIPCBridge, getEventBus } from './events/index.js'
import { initializeSessionLayer, shutdownSessionLayer } from './session/index.js'
import { Permission } from './permission/index.js'
import { bootstrapVariableSystem } from './variables/index.js'
import { bootstrapProjectDirs } from './project-dirs/index.js'
import { warmSearchWindow } from './search/index.js'
import { applyNetworkProxySettings } from './network/proxy.js'
import { registerGlobalWindowShortcuts, unregisterGlobalWindowShortcuts } from './shortcuts/global-shortcuts.js'
import { getVoiceService } from './voice/service.js'
import { attachVoiceTrayMainWindow, markVoiceQuitRequested } from './voice/tray.js'
import { killTrackedDetachedChildren } from './tools/core/bash-executor.js'
import { initializeAppLogging, shutdownAppLogging } from './logging/index.js'
import { hydrateProcessEnvFromLoginShell } from './utils/login-shell-env.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

initializeAppLogging()

/**
 * Refresh model metadata from models.dev on first startup.
 * Only runs if no model data exists yet for any configured provider.
 */
async function refreshModelsOnFirstStartup(): Promise<void> {
  const { getSettings } = await import('./stores/settings.js')
  const settings = getSettings()
  const providers = settings?.ai?.providers
  if (!providers) return

  // Check if any provider already has models
  let hasModels = false
  for (const pid of Object.keys(providers)) {
    const cfg = providers[pid] as any
    if (cfg?.models && Object.keys(cfg.models).length > 0) {
      hasModels = true
      break
    }
  }

  if (hasModels) {
    console.log('[Models] Model data already exists, skipping first-startup refresh')
    return
  }

  console.log('[Models] First startup detected, refreshing model registry...')
  const { refreshAllProviders } = await import('./providers/model-registry.js')
  await refreshAllProviders()
  console.log('[Models] First-startup refresh complete')
}

// Suppress security warnings in development mode
// These warnings are expected because Vite HMR requires 'unsafe-eval'
// Production builds use strict CSP and don't show these warnings
if (process.env.NODE_ENV === 'development') {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
}

let mainWindow: BrowserWindow | null = null

app.on('ready', async () => {
  if (app.isPackaged) {
    await hydrateProcessEnvFromLoginShell({ logger: console })
  }

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
  await applyNetworkProxySettings()

  // Initialize event system (EventBus + StreamChannel + SessionManager + StreamEngine)
  initializeEventSystem()
  initializeSessionLayer()
  initializeStreamEngine()
  registerBuiltinTriggers()

  // Initialize Permission system with EventBus and channel resolver
  Permission.initialize(
    getEventBus(),
    (sessionId) => getStreamEngine().getChannel(sessionId),
    (sessionId) => getStreamEngine().getPermissionMode(sessionId),
  )

  // Clean up interrupted sessions from previous app instance
  sanitizeAllSessionsOnStartup()

  // Bootstrap variable subsystem (registers built-in providers, bridges
  // change events to EventBus). Must run after EventBus init and before
  // tool registry so the variable tool finds a populated registry.
  bootstrapVariableSystem()

  // Bootstrap project-dirs subsystem (independent storage). Order doesn't
  // matter relative to variables, but must precede tool registry so the
  // project_dirs tool finds a warm store.
  bootstrapProjectDirs()

  // Initialize tool registry
  await initializeToolRegistry()

  // Initialize IPC handlers
  initializeIPC()

  // Create window first for fast startup
  mainWindow = createWindow()
  attachVoiceTrayMainWindow(mainWindow)
  registerGlobalWindowShortcuts(mainWindow)

  // Initialize IPCBridge — the single exit point for all renderer IPC
  initializeIPCBridge(mainWindow.webContents)
  // Bind StreamEngine to the window's WebContents for command handling
  getStreamEngine().bind(mainWindow.webContents)

  // Abort all active streams when the window closes to prevent background resource leaks
  mainWindow.on('closed', () => {
    shutdownIPCBridge()
    getStreamEngineSafe()?.abortAll()
    mainWindow = null
  })
  getVoiceService().attachMainWindow(mainWindow)
  getVoiceService().applySettings()

  powerMonitor.on('resume', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    recoverMainWindowAfterSystemResume(mainWindow, 'resume')
      .catch(err => console.error('[Window] Resume recovery failed:', err))
  })

  powerMonitor.on('unlock-screen', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    recoverMainWindowAfterSystemResume(mainWindow, 'unlock-screen')
      .catch(err => console.error('[Window] Unlock recovery failed:', err))
  })

  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      warmSearchWindow(mainWindow)
    }
  }, 1200)
  setTimeout(() => {
    warmTodoPlanWindow({
      activation: 'preserve-current-app',
      preserveMainWindowVisibility: true,
    })
  }, 1600)

  startPostWindowServices()

})

function startPostWindowServices(): void {
  const pluginsReady = (async () => {
    const { bootstrapPluginSystem } = await import('./plugins/index.js')
    await bootstrapPluginSystem(getEventBus(), getStreamEngine())
  })().catch(err => {
    console.error('[Plugins] Bootstrap failed (non-blocking):', err)
  })

  import('./scheduler/user-tasks.js')
    .then(({ initializeUserSchedulerTasks }) => initializeUserSchedulerTasks())
    .catch(err => {
      console.error('[Scheduler] User task initialization failed (non-blocking):', err)
    })

  // Initialize MCP system asynchronously (don't block startup)
  initializeMCP().catch(err => {
    console.error('[MCP] Initialization failed (non-blocking):', err)
  })

  try {
    initializeACP()
  } catch (err) {
    console.error('[ACP] Initialization failed (non-blocking):', err)
  }

  // Refresh model registry on first startup (non-blocking)
  refreshModelsOnFirstStartup().catch(err => {
    console.error('[Models] First-startup refresh failed (non-blocking):', err)
  })

  // Plugin roots can contribute skills, so load skills after plugin bootstrap
  // has had a chance to register its roots.
  pluginsReady.finally(() => {
    initializeSkills().catch(err => {
      console.error('[Skills] Initialization failed (non-blocking):', err)
    })
  })
}

app.on('window-all-closed', () => {
  if (getVoiceService().getState().enabled) {
    return
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    if (shouldSuppressMainWindowActivation()) {
      return
    }

    mainWindow = createWindow()
    attachVoiceTrayMainWindow(mainWindow)
    registerGlobalWindowShortcuts(mainWindow)
    initializeIPCBridge(mainWindow.webContents)
    getStreamEngine().bind(mainWindow.webContents)
    mainWindow.on('closed', () => {
      shutdownIPCBridge()
      getStreamEngineSafe()?.abortAll()
      mainWindow = null
    })
    getVoiceService().attachMainWindow(mainWindow)
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        warmSearchWindow(mainWindow)
      }
    }, 1200)
    setTimeout(() => {
      warmTodoPlanWindow({
        activation: 'preserve-current-app',
        preserveMainWindowVisibility: true,
      })
    }, 1600)
  } else {
    activateMainWindow(mainWindow)
  }
})

app.on('did-become-active', () => {
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return

    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (isTodoPlanBrowserWindow(focusedWindow)) {
      activateMainWindow(mainWindow)
    }
  }, 0)
})

// Cleanup on quit
app.on('before-quit', async () => {
  markVoiceQuitRequested()
  getVoiceService().shutdown()
  unregisterGlobalWindowShortcuts()

  // Shutdown MCP
  await shutdownMCP()
  await shutdownACP()

  // Stop any detached bash process groups that are still tracked.
  killTrackedDetachedChildren()

  // Shutdown engine, permission, session layer, and event system (reverse init order)
  shutdownStreamEngine()
  Permission.shutdown()
  shutdownSessionLayer()
  shutdownEventSystem()

  // Flush any pending throttled session writes so nothing is lost on exit
  try {
    await flushAllPendingSaves()
  } catch (err) {
    console.error('[Shutdown] flushAllPendingSaves error:', err)
  }
  await shutdownAppLogging()
})

export { mainWindow }
