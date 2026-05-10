/**
 * IPC types for the project-dirs subsystem.
 *
 * Shape mirrors the on-disk Project record minus the internal `id`
 * (clients work with `path`). New optional fields added to Project
 * propagate here as `.optional()` properties.
 */

export interface ProjectDirSummary {
  path: string
  description: string
  lastUsedAt: number
}

export interface ProjectDirRecord {
  path: string
  description: string
  addedAt: number
  lastUsedAt: number
  // Future: reflections?, tags?, etc.
}

export interface ProjectDirsListResponse {
  success: boolean
  entries?: ProjectDirSummary[]
  error?: string
  code?: string
}

export interface ProjectDirsGetRequest {
  path: string
}
export interface ProjectDirsGetResponse {
  success: boolean
  project?: ProjectDirRecord | null
  error?: string
  code?: string
}

export interface ProjectDirsAddRequest {
  path: string
  description?: string
}
export interface ProjectDirsAddResponse {
  success: boolean
  project?: ProjectDirRecord
  error?: string
  code?: string
}

export interface ProjectDirsUpdateRequest {
  path: string
  description: string
}
export interface ProjectDirsUpdateResponse {
  success: boolean
  project?: ProjectDirRecord
  error?: string
  code?: string
}

export interface ProjectDirsRemoveRequest {
  path: string
}
export interface ProjectDirsRemoveResponse {
  success: boolean
  error?: string
  code?: string
}
