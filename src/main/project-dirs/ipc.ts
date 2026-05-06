/**
 * IPC handlers for project-dirs.
 *
 * Five RPCs cover everything the renderer needs today. Adding a new
 * data kind tomorrow (e.g. reflections) means adding focused
 * `note_add` / `note_list` handlers alongside these — no churn to
 * existing endpoints.
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type {
  ProjectDirRecord,
  ProjectDirsAddRequest,
  ProjectDirsAddResponse,
  ProjectDirsGetRequest,
  ProjectDirsGetResponse,
  ProjectDirsListResponse,
  ProjectDirsRemoveRequest,
  ProjectDirsRemoveResponse,
  ProjectDirsUpdateRequest,
  ProjectDirsUpdateResponse,
} from '../../shared/ipc/project-dirs.js'
import { getProjectsStore } from './store/index.js'
import type { Project } from './types.js'

function toRecord(p: Project): ProjectDirRecord {
  return {
    path: p.path,
    description: p.description,
    addedAt: p.addedAt,
    lastUsedAt: p.lastUsedAt,
  }
}

function toErrorPayload(err: unknown): { error: string; code: string } {
  return {
    error: err instanceof Error ? err.message : 'Unknown project-dirs error',
    code: 'INTERNAL',
  }
}

export function registerProjectDirsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PROJECT_DIRS_LIST, async (): Promise<ProjectDirsListResponse> => {
    try {
      const store = getProjectsStore()
      const entries = store.list().map((e) => {
        const project = store.get(e.path)
        return {
          path: e.path,
          description: project?.description ?? '',
          lastUsedAt: e.lastUsedAt,
        }
      })
      return { success: true, entries }
    } catch (err) {
      return { success: false, ...toErrorPayload(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_DIRS_GET, async (
    _event,
    req: ProjectDirsGetRequest,
  ): Promise<ProjectDirsGetResponse> => {
    try {
      const project = getProjectsStore().get(req.path)
      return { success: true, project: project ? toRecord(project) : null }
    } catch (err) {
      return { success: false, ...toErrorPayload(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_DIRS_ADD, async (
    _event,
    req: ProjectDirsAddRequest,
  ): Promise<ProjectDirsAddResponse> => {
    try {
      const project = getProjectsStore().add({
        path: req.path,
        description: req.description,
      })
      return { success: true, project: toRecord(project) }
    } catch (err) {
      return { success: false, ...toErrorPayload(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_DIRS_UPDATE, async (
    _event,
    req: ProjectDirsUpdateRequest,
  ): Promise<ProjectDirsUpdateResponse> => {
    try {
      const project = getProjectsStore().update(req.path, { description: req.description })
      if (!project) {
        return { success: false, error: `No project for path "${req.path}"`, code: 'NOT_FOUND' }
      }
      return { success: true, project: toRecord(project) }
    } catch (err) {
      return { success: false, ...toErrorPayload(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_DIRS_REMOVE, async (
    _event,
    req: ProjectDirsRemoveRequest,
  ): Promise<ProjectDirsRemoveResponse> => {
    try {
      const removed = getProjectsStore().remove(req.path)
      if (!removed) {
        return { success: false, error: `No project for path "${req.path}"`, code: 'NOT_FOUND' }
      }
      return { success: true }
    } catch (err) {
      return { success: false, ...toErrorPayload(err) }
    }
  })

  console.log('[project-dirs] IPC handlers registered (list/get/add/update/remove)')
}
