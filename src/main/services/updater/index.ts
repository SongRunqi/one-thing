/**
 * Auto-Update Service
 * Handles app updates using electron-updater with GitHub releases
 */

import type { UpdateInfo, ProgressInfo } from 'electron-updater'
import { BrowserWindow, app } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipc/channels.js'

// Lazy-loaded autoUpdater (only load in packaged builds)
let autoUpdater: any = null
let initialized = false

// State
let updateAvailable = false
let updateDownloaded = false
let currentUpdateInfo: UpdateInfo | null = null

/**
 * Get or initialize the autoUpdater instance
 */
function getAutoUpdater() {
  if (!autoUpdater && app.isPackaged) {
    try {
      // Dynamic require to avoid issues in dev mode or unsupported platforms
      const pkg = require('electron-updater')
      autoUpdater = pkg.autoUpdater
      autoUpdater.autoDownload = false
      autoUpdater.autoInstallOnAppQuit = true
    } catch (error) {
      console.error('[Updater] Failed to load electron-updater:', error)
      return null
    }
  }
  return autoUpdater
}

/**
 * Initialize the update service
 */
export function initializeUpdater(): void {
  // Skip in dev mode - auto-update only works in packaged builds
  if (!app.isPackaged) {
    console.log('[Updater] Skipping initialization in dev mode')
    return
  }

  if (initialized) {
    return
  }

  try {
    const updater = getAutoUpdater()
    if (!updater) {
      console.error('[Updater] Failed to initialize - autoUpdater not available')
      return
    }

    console.log('[Updater] Initializing auto-updater')

    // Setup event handlers
    updater.on('checking-for-update', () => {
      console.log('[Updater] Checking for update...')
    })

    updater.on('update-available', (info: UpdateInfo) => {
      console.log(`[Updater] Update available: ${info.version}`)
      updateAvailable = true
      currentUpdateInfo = info
      broadcastToWindows(IPC_CHANNELS.UPDATE_AVAILABLE, {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
        releaseName: info.releaseName,
      })
    })

    updater.on('update-not-available', () => {
      console.log('[Updater] No update available')
      updateAvailable = false
      broadcastToWindows(IPC_CHANNELS.UPDATE_NOT_AVAILABLE, {})
    })

    updater.on('download-progress', (progress: ProgressInfo) => {
      console.log(`[Updater] Download progress: ${progress.percent.toFixed(1)}%`)
      broadcastToWindows(IPC_CHANNELS.UPDATE_PROGRESS, {
        bytesPerSecond: progress.bytesPerSecond,
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
      })
    })

    updater.on('update-downloaded', (info: UpdateInfo) => {
      console.log(`[Updater] Update downloaded: ${info.version}`)
      updateDownloaded = true
      currentUpdateInfo = info
      broadcastToWindows(IPC_CHANNELS.UPDATE_DOWNLOADED, {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
        releaseName: info.releaseName,
      })
    })

    updater.on('error', (error: Error) => {
      console.error('[Updater] Error:', error.message)
      broadcastToWindows(IPC_CHANNELS.UPDATE_ERROR, {
        error: error.message,
      })
    })

    initialized = true

    // Check for updates after a short delay (don't block startup)
    setTimeout(() => {
      checkForUpdates().catch(err => {
        console.error('[Updater] Initial check failed:', err.message)
      })
    }, 10000) // 10 seconds after startup

  } catch (error) {
    console.error('[Updater] Initialization failed:', error)
  }
}

/**
 * Check for updates
 */
export async function checkForUpdates(): Promise<{
  available: boolean
  updateInfo?: UpdateInfo
  error?: string
}> {
  if (!app.isPackaged) {
    return { available: false, error: 'Auto-update disabled in dev mode' }
  }

  const updater = getAutoUpdater()
  if (!updater) {
    return { available: false, error: 'Auto-updater not available' }
  }

  try {
    const result = await updater.checkForUpdates()
    if (result && result.updateInfo) {
      return {
        available: true,
        updateInfo: result.updateInfo,
      }
    }
    return { available: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Check failed'
    console.error('[Updater] Check failed:', message)
    return {
      available: false,
      error: message,
    }
  }
}

/**
 * Download the available update
 */
export async function downloadUpdate(): Promise<{ error?: string }> {
  if (!app.isPackaged) {
    return { error: 'Auto-update disabled in dev mode' }
  }

  const updater = getAutoUpdater()
  if (!updater) {
    return { error: 'Auto-updater not available' }
  }

  try {
    await updater.downloadUpdate()
    return {}
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Download failed'
    console.error('[Updater] Download failed:', message)
    return { error: message }
  }
}

/**
 * Install the downloaded update and quit
 */
export function installUpdate(): void {
  if (!app.isPackaged) {
    console.log('[Updater] Cannot install update in dev mode')
    return
  }

  const updater = getAutoUpdater()
  if (!updater) {
    console.error('[Updater] Cannot install - autoUpdater not available')
    return
  }

  console.log('[Updater] Installing update and restarting...')
  updater.quitAndInstall(false, true)
}

/**
 * Get current update status
 */
export function getUpdateStatus(): {
  available: boolean
  downloaded: boolean
  updateInfo?: UpdateInfo
} {
  return {
    available: updateAvailable,
    downloaded: updateDownloaded,
    updateInfo: currentUpdateInfo || undefined,
  }
}

/**
 * Broadcast message to all windows
 */
function broadcastToWindows(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(channel, data)
  })
}
