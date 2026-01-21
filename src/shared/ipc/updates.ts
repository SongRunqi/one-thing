/**
 * Update Module
 * Type definitions for auto-update IPC communication
 */

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

// IPC Request/Response types
export interface CheckUpdateResponse {
  success: boolean
  available: boolean
  updateInfo?: UpdateInfo
  error?: string
}

export interface DownloadUpdateResponse {
  success: boolean
  error?: string
}

export interface InstallUpdateResponse {
  success: boolean
  error?: string
}
