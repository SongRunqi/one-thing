/**
 * Updates Store
 * Manages auto-update state and actions for the renderer process
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface UpdateInfo {
  version: string
  releaseDate: string
  releaseNotes?: string | null
  releaseName?: string | null
}

export interface UpdateProgress {
  bytesPerSecond: number
  percent: number
  transferred: number
  total: number
}

export const useUpdatesStore = defineStore('updates', () => {
  // State
  const checking = ref(false)
  const downloading = ref(false)
  const available = ref(false)
  const downloaded = ref(false)
  const dismissed = ref(false)
  const error = ref<string | null>(null)
  const updateInfo = ref<UpdateInfo | null>(null)
  const progress = ref<UpdateProgress | null>(null)

  // Computed
  const shouldShowNotification = computed(() => {
    return (available.value || downloaded.value) && !dismissed.value
  })

  const downloadPercent = computed(() => {
    return progress.value?.percent ?? 0
  })

  // Actions
  async function checkForUpdate() {
    if (checking.value) return

    checking.value = true
    error.value = null

    try {
      const result = await window.electronAPI.checkForUpdate()
      if (!result.success && result.error) {
        error.value = result.error
      }
      // Update events will be handled by listeners
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Check failed'
    } finally {
      checking.value = false
    }
  }

  async function downloadUpdate() {
    if (downloading.value || !available.value) return

    downloading.value = true
    error.value = null

    try {
      const result = await window.electronAPI.downloadUpdate()
      if (!result.success && result.error) {
        error.value = result.error
        downloading.value = false
      }
      // Download progress will be handled by listeners
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Download failed'
      downloading.value = false
    }
  }

  async function installUpdate() {
    if (!downloaded.value) return

    try {
      await window.electronAPI.installUpdate()
      // App will quit and install
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Install failed'
    }
  }

  function dismiss() {
    dismissed.value = true
  }

  function reset() {
    checking.value = false
    downloading.value = false
    available.value = false
    downloaded.value = false
    dismissed.value = false
    error.value = null
    updateInfo.value = null
    progress.value = null
  }

  // Event handlers
  function handleUpdateAvailable(info: UpdateInfo) {
    available.value = true
    updateInfo.value = info
    dismissed.value = false
    console.log('[Updates] Update available:', info.version)
  }

  function handleUpdateNotAvailable() {
    available.value = false
    console.log('[Updates] No update available')
  }

  function handleUpdateProgress(prog: UpdateProgress) {
    progress.value = prog
  }

  function handleUpdateDownloaded(info: UpdateInfo) {
    downloading.value = false
    downloaded.value = true
    updateInfo.value = info
    dismissed.value = false
    progress.value = null
    console.log('[Updates] Update downloaded:', info.version)
  }

  function handleUpdateError(data: { error: string }) {
    error.value = data.error
    downloading.value = false
    console.error('[Updates] Error:', data.error)
  }

  // Setup IPC listeners
  let cleanupFunctions: Array<() => void> = []

  function setupListeners() {
    // Clean up existing listeners first
    cleanupListeners()

    cleanupFunctions = [
      window.electronAPI.onUpdateAvailable(handleUpdateAvailable),
      window.electronAPI.onUpdateNotAvailable(handleUpdateNotAvailable),
      window.electronAPI.onUpdateProgress(handleUpdateProgress),
      window.electronAPI.onUpdateDownloaded(handleUpdateDownloaded),
      window.electronAPI.onUpdateError(handleUpdateError),
    ]

    console.log('[Updates] Listeners setup complete')
  }

  function cleanupListeners() {
    cleanupFunctions.forEach(cleanup => cleanup())
    cleanupFunctions = []
  }

  // Fetch initial status
  async function fetchStatus() {
    try {
      const status = await window.electronAPI.getUpdateStatus()
      if (status.available) {
        available.value = status.available
      }
      if (status.downloaded) {
        downloaded.value = status.downloaded
      }
      if (status.updateInfo) {
        updateInfo.value = status.updateInfo
      }
    } catch (e) {
      console.error('[Updates] Failed to fetch status:', e)
    }
  }

  return {
    // State
    checking,
    downloading,
    available,
    downloaded,
    dismissed,
    error,
    updateInfo,
    progress,

    // Computed
    shouldShowNotification,
    downloadPercent,

    // Actions
    checkForUpdate,
    downloadUpdate,
    installUpdate,
    dismiss,
    reset,

    // Listeners
    setupListeners,
    cleanupListeners,
    fetchStatus,
  }
})
