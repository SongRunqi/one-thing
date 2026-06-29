import { IPC_CHANNELS } from '@shared/ipc.js'
import {
  addOnethingProjectDirForIpc,
  getOnethingProjectDirForIpc,
  listOnethingProjectDirsForIpc,
  removeOnethingProjectDirForIpc,
  updateOnethingProjectDirForIpc,
  type ProjectDirsAddRequest,
  type ProjectDirsGetRequest,
  type ProjectDirsRemoveRequest,
  type ProjectDirsUpdateRequest,
} from '@onething/runtime/project-dirs'
import { getProjectsStore } from '@onething/runtime/project-dirs/store'
import { registerElectronProjectDirsIpcHandlers } from './project-dirs-controller.js'

export { registerElectronProjectDirsIpcHandlers } from './project-dirs-controller.js'
export type {
  ElectronIpcMainLike,
  ElectronProjectDirsIpcChannels,
  RegisterElectronProjectDirsIpcHandlersOptions,
} from './project-dirs-controller.js'

export function registerProjectDirsHandlers(): void {
  registerElectronProjectDirsIpcHandlers({
    channels: {
      list: IPC_CHANNELS.PROJECT_DIRS_LIST,
      get: IPC_CHANNELS.PROJECT_DIRS_GET,
      add: IPC_CHANNELS.PROJECT_DIRS_ADD,
      update: IPC_CHANNELS.PROJECT_DIRS_UPDATE,
      remove: IPC_CHANNELS.PROJECT_DIRS_REMOVE,
    },
    listProjectDirs: () => {
      const store = getProjectsStore()
      return listOnethingProjectDirsForIpc({
        listEntries: () => store.list(),
        getProject: path => store.get(path),
      })
    },
    getProjectDir: (request: ProjectDirsGetRequest) => {
      return getOnethingProjectDirForIpc({
        request,
        getProject: path => getProjectsStore().get(path),
      })
    },
    addProjectDir: (request: ProjectDirsAddRequest) => {
      return addOnethingProjectDirForIpc({
        request,
        addProject: input => getProjectsStore().add(input),
      })
    },
    updateProjectDir: (request: ProjectDirsUpdateRequest) => {
      return updateOnethingProjectDirForIpc({
        request,
        updateProject: (path, patch) => getProjectsStore().update(path, patch),
      })
    },
    removeProjectDir: (request: ProjectDirsRemoveRequest) => {
      return removeOnethingProjectDirForIpc({
        request,
        removeProject: path => getProjectsStore().remove(path),
      })
    },
    logger: console,
  })
}
