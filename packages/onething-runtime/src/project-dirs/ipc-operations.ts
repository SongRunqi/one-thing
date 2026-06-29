import type { Project, ProjectIndexEntry } from './types.js'

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
}

export interface ProjectDirsGetRequest {
  path: string
}

export interface ProjectDirsAddRequest {
  path: string
  description?: string
}

export interface ProjectDirsUpdateRequest {
  path: string
  description: string
}

export interface ProjectDirsRemoveRequest {
  path: string
}

export interface OnethingProjectDirsIpcError {
  success: false
  error: string
  code: string
}

export type OnethingProjectDirsIpcResult<TPayload extends object = {}> =
  | ({ success: true } & TPayload)
  | OnethingProjectDirsIpcError

export function projectToOnethingProjectDirRecord(project: Project): ProjectDirRecord {
  return {
    path: project.path,
    description: project.description,
    addedAt: project.addedAt,
    lastUsedAt: project.lastUsedAt,
  }
}

export function listOnethingProjectDirsForIpc(
  options: {
    listEntries(): ProjectIndexEntry[]
    getProject(path: string): Project | null
  },
): OnethingProjectDirsIpcResult<{ entries: ProjectDirSummary[] }> {
  try {
    const entries = options.listEntries().map(entry => {
      const project = options.getProject(entry.path)
      return {
        path: entry.path,
        description: project?.description ?? '',
        lastUsedAt: entry.lastUsedAt,
      }
    })
    return { success: true, entries }
  } catch (error) {
    return projectDirsIpcError(error)
  }
}

export function getOnethingProjectDirForIpc(
  options: {
    request: ProjectDirsGetRequest
    getProject(path: string): Project | null
  },
): OnethingProjectDirsIpcResult<{ project: ProjectDirRecord | null }> {
  try {
    const project = options.getProject(options.request.path)
    return { success: true, project: project ? projectToOnethingProjectDirRecord(project) : null }
  } catch (error) {
    return projectDirsIpcError(error)
  }
}

export function addOnethingProjectDirForIpc(
  options: {
    request: ProjectDirsAddRequest
    addProject(input: ProjectDirsAddRequest): Project
  },
): OnethingProjectDirsIpcResult<{ project: ProjectDirRecord }> {
  try {
    return {
      success: true,
      project: projectToOnethingProjectDirRecord(options.addProject(options.request)),
    }
  } catch (error) {
    return projectDirsIpcError(error)
  }
}

export function updateOnethingProjectDirForIpc(
  options: {
    request: ProjectDirsUpdateRequest
    updateProject(path: string, patch: { description: string }): Project | null
  },
): OnethingProjectDirsIpcResult<{ project: ProjectDirRecord }> {
  try {
    const project = options.updateProject(options.request.path, { description: options.request.description })
    if (!project) return projectDirsNotFound(options.request.path)
    return { success: true, project: projectToOnethingProjectDirRecord(project) }
  } catch (error) {
    return projectDirsIpcError(error)
  }
}

export function removeOnethingProjectDirForIpc(
  options: {
    request: ProjectDirsRemoveRequest
    removeProject(path: string): boolean
  },
): OnethingProjectDirsIpcResult {
  try {
    if (!options.removeProject(options.request.path)) return projectDirsNotFound(options.request.path)
    return { success: true }
  } catch (error) {
    return projectDirsIpcError(error)
  }
}

function projectDirsNotFound(path: string): OnethingProjectDirsIpcError {
  return {
    success: false,
    error: `No project for path "${path}"`,
    code: 'NOT_FOUND',
  }
}

function projectDirsIpcError(error: unknown): OnethingProjectDirsIpcError {
  return {
    success: false,
    error: error instanceof Error ? error.message : 'Unknown project-dirs error',
    code: 'INTERNAL',
  }
}
