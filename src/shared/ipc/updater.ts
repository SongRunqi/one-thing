/**
 * Updater IPC Types
 * Types for application auto-update functionality
 */

// ========== Update Status ==========
export interface UpdateStatus {
  checking: boolean
  available: boolean
  currentVersion?: string
  version?: string
  latestVersion?: string // Alias for version (backward compatibility)
  releaseNotes?: string
  releaseUrl?: string
  error?: string
  lastChecked?: number | null
}

// ========== IPC Requests/Responses ==========

export interface CheckUpdateRequest {
  manual?: boolean // true if triggered by user (show feedback even if no update)
}

export interface CheckUpdateResponse {
  status: UpdateStatus
}

export interface GetUpdateStatusResponse {
  status: UpdateStatus
}

export interface OpenReleasePageRequest {
  url?: string // Optional: specific release URL, otherwise uses latest
}

export interface OpenReleasePageResponse {
  success: boolean
}
