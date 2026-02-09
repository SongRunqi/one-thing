/**
 * Application Updater
 * Checks for updates using GitHub Releases API (manual download approach)
 */

import { app, shell, BrowserWindow } from 'electron'
import type { UpdateStatus } from '../shared/ipc.js'

const GITHUB_REPO = 'SongRunqi/one-thing'
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours

let updateStatus: UpdateStatus = {
  checking: false,
  available: false,
  lastChecked: null,
}

let checkTimer: NodeJS.Timeout | null = null
let mainWindow: BrowserWindow | null = null

/**
 * Compare version strings (semver-like)
 * Returns: -1 if current < latest, 0 if equal, 1 if current > latest
 */
function compareVersions(current: string, latest: string): number {
  // Remove 'v' prefix if present
  const cleanCurrent = current.replace(/^v/, '')
  const cleanLatest = latest.replace(/^v/, '')

  const currentParts = cleanCurrent.split('.').map(Number)
  const latestParts = cleanLatest.split('.').map(Number)

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const currentPart = currentParts[i] || 0
    const latestPart = latestParts[i] || 0

    if (currentPart < latestPart) return -1
    if (currentPart > latestPart) return 1
  }

  return 0
}

/**
 * Fetch latest release from GitHub API
 */
async function fetchLatestRelease() {
  try {
    const response = await fetch(GITHUB_API_URL, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': '0neThing-App',
      },
    })

    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`)
    }

    const release = await response.json()

    return {
      version: release.tag_name as string,
      releaseNotes: release.body as string,
      releaseUrl: release.html_url as string,
      publishedAt: release.published_at as string,
    }
  } catch (error) {
    console.error('[Updater] Failed to fetch latest release:', error)
    throw error
  }
}

/**
 * Check for updates
 */
export async function checkForUpdates(manual = false): Promise<UpdateStatus> {
  if (updateStatus.checking) {
    return updateStatus
  }

  updateStatus = {
    checking: true,
    available: false,
  }

  try {
    const currentVersion = app.getVersion()
    const latestRelease = await fetchLatestRelease()

    const comparison = compareVersions(currentVersion, latestRelease.version)

    const now = Date.now()

    if (comparison < 0) {
      // New version available
      updateStatus = {
        checking: false,
        available: true,
        version: latestRelease.version,
        latestVersion: latestRelease.version,
        releaseNotes: latestRelease.releaseNotes,
        releaseUrl: latestRelease.releaseUrl,
        lastChecked: now,
      }

      // Notify renderer process
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:new-version', {
          version: latestRelease.version,
          releaseUrl: latestRelease.releaseUrl,
          releaseNotes: latestRelease.releaseNotes,
          publishedAt: latestRelease.publishedAt,
        })
      }

      console.log(`[Updater] New version available: ${latestRelease.version} (current: ${currentVersion})`)
    } else {
      // No update available
      updateStatus = {
        checking: false,
        available: false,
        lastChecked: now,
      }

      if (manual) {
        console.log(`[Updater] Already up to date (${currentVersion})`)
      }
    }

    return updateStatus
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    updateStatus = {
      checking: false,
      available: false,
      error: errorMessage,
    }

    console.error('[Updater] Check failed:', errorMessage)
    return updateStatus
  }
}

/**
 * Get current update status
 */
export function getUpdateStatus(): UpdateStatus {
  return {
    ...updateStatus,
    currentVersion: app.getVersion(),
  }
}

/**
 * Open release page in browser
 */
export async function openReleasePage(url?: string): Promise<void> {
  const releaseUrl = url || updateStatus.releaseUrl || `https://github.com/${GITHUB_REPO}/releases/latest`
  await shell.openExternal(releaseUrl)
  console.log(`[Updater] Opened release page: ${releaseUrl}`)
}

/**
 * Start periodic update checks
 */
function startPeriodicChecks() {
  // Check immediately on startup (with delay)
  setTimeout(() => {
    checkForUpdates(false).catch(err => {
      console.error('[Updater] Initial check failed:', err)
    })
  }, 5000) // 5 seconds delay after startup

  // Check every 4 hours
  checkTimer = setInterval(() => {
    checkForUpdates(false).catch(err => {
      console.error('[Updater] Periodic check failed:', err)
    })
  }, CHECK_INTERVAL_MS)

  console.log('[Updater] Periodic checks started (every 4 hours)')
}

/**
 * Stop periodic update checks
 */
function stopPeriodicChecks() {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
    console.log('[Updater] Periodic checks stopped')
  }
}

/**
 * Initialize updater
 */
export function initializeUpdater(window: BrowserWindow) {
  mainWindow = window
  console.log('[Updater] Initialized')

  // Auto-check is enabled by default
  // Settings store will be loaded asynchronously, so we start checks
  // The setting can disable future checks via the settings UI
  startPeriodicChecks()
}

/**
 * Shutdown updater
 */
export function shutdownUpdater() {
  stopPeriodicChecks()
  mainWindow = null
  console.log('[Updater] Shutdown')
}
