/**
 * Updater Module (Method B: Check Update + Manual Download)
 * 
 * Instead of using electron-updater, this module:
 * - Checks GitHub Releases API for new versions
 * - Notifies the UI when a new version is available
 * - Opens the GitHub Release page for manual download
 */

import { BrowserWindow, shell } from 'electron'
import { app } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc/channels.js'

const GITHUB_REPO = 'SongRunqi/one-thing'
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours

interface UpdateInfo {
  version: string
  releaseUrl: string
  releaseNotes: string
  publishedAt: string
}

interface UpdateStatus {
  checking: boolean
  available: boolean
  currentVersion: string
  latestVersion?: string
  releaseUrl?: string
  releaseNotes?: string
  error?: string
  lastChecked?: number
}

const updateStatus: UpdateStatus = {
  checking: false,
  available: false,
  currentVersion: app.getVersion(),
}

let checkTimer: NodeJS.Timeout | null = null
let mainWindow: BrowserWindow | null = null

/**
 * Initialize updater (called from main/index.ts)
 */
export function initializeUpdater(window: BrowserWindow): void {
  mainWindow = window
  
  // Check on startup (after 3 seconds delay)
  setTimeout(() => {
    checkForUpdates(false).catch(err => {
      console.error('[Updater] Startup check failed:', err)
    })
  }, 3000)

  // Schedule periodic checks every 4 hours
  checkTimer = setInterval(() => {
    checkForUpdates(false).catch(err => {
      console.error('[Updater] Periodic check failed:', err)
    })
  }, CHECK_INTERVAL_MS)
}

/**
 * Cleanup updater (called on app quit)
 */
export function shutdownUpdater(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}

/**
 * Compare two semver versions (simple implementation)
 * @returns true if newVersion > currentVersion
 */
function isNewerVersion(currentVersion: string, newVersion: string): boolean {
  const normalize = (v: string) => {
    // Remove 'v' prefix if exists
    const cleaned = v.startsWith('v') ? v.slice(1) : v
    return cleaned.split('.').map(num => parseInt(num, 10) || 0)
  }

  const current = normalize(currentVersion)
  const latest = normalize(newVersion)

  for (let i = 0; i < Math.max(current.length, latest.length); i++) {
    const c = current[i] || 0
    const l = latest[i] || 0
    if (l > c) return true
    if (l < c) return false
  }
  
  return false
}

/**
 * Check for updates from GitHub Releases API
 * @param manual - true if triggered by user (show result even if no update)
 */
export async function checkForUpdates(manual: boolean): Promise<UpdateStatus> {
  if (updateStatus.checking) {
    console.log('[Updater] Check already in progress, skipping')
    return updateStatus
  }

  updateStatus.checking = true
  notifyStatusChange()

  try {
    console.log(`[Updater] Checking for updates... (current: v${updateStatus.currentVersion})`)

    const response = await fetch(GITHUB_API_URL, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': `0neThing/${updateStatus.currentVersion}`,
      },
    })

    if (!response.ok) {
      throw new Error(`GitHub API responded with ${response.status}: ${response.statusText}`)
    }

    const release = await response.json()
    const latestVersion = release.tag_name as string
    const releaseUrl = release.html_url as string
    const releaseNotes = release.body as string
    const publishedAt = release.published_at as string

    updateStatus.latestVersion = latestVersion
    updateStatus.lastChecked = Date.now()

    const hasUpdate = isNewerVersion(updateStatus.currentVersion, latestVersion)

    if (hasUpdate) {
      console.log(`[Updater] New version available: ${latestVersion}`)
      updateStatus.available = true
      updateStatus.releaseUrl = releaseUrl
      updateStatus.releaseNotes = releaseNotes
      updateStatus.error = undefined

      // Notify renderer process
      notifyNewVersion({
        version: latestVersion,
        releaseUrl,
        releaseNotes,
        publishedAt,
      })
    } else {
      console.log(`[Updater] Already on latest version: ${latestVersion}`)
      updateStatus.available = false
      updateStatus.error = undefined

      // If manual check, still notify to show "Already up to date" message
      if (manual && mainWindow) {
        mainWindow.webContents.send(IPC_CHANNELS.UPDATER_STATUS, updateStatus)
      }
    }
  } catch (error) {
    console.error('[Updater] Check failed:', error)
    updateStatus.error = error instanceof Error ? error.message : String(error)
    updateStatus.available = false
  } finally {
    updateStatus.checking = false
    notifyStatusChange()
  }

  return updateStatus
}

/**
 * Get current update status
 */
export function getUpdateStatus(): UpdateStatus {
  return { ...updateStatus }
}

/**
 * Open GitHub Release page in browser
 */
export function openReleasePage(): void {
  if (!updateStatus.releaseUrl) {
    console.warn('[Updater] No release URL available')
    return
  }
  
  console.log(`[Updater] Opening release page: ${updateStatus.releaseUrl}`)
  shell.openExternal(updateStatus.releaseUrl)
}

/**
 * Notify renderer process about status change
 */
function notifyStatusChange(): void {
  if (mainWindow) {
    mainWindow.webContents.send(IPC_CHANNELS.UPDATER_STATUS, updateStatus)
  }
}

/**
 * Notify renderer process about new version
 */
function notifyNewVersion(info: UpdateInfo): void {
  if (mainWindow) {
    mainWindow.webContents.send(IPC_CHANNELS.UPDATER_NEW_VERSION, info)
  }
}
