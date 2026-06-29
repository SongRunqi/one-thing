import {
  registerElectronPromptsIpcHandlers,
  type ElectronPromptCreateRequest,
  type ElectronPromptDeleteRequest,
  type ElectronPromptGetRequest,
  type ElectronPromptUpdateRequest,
} from '@onething/electron-host/ipc/prompts'
import {
  createOnethingPromptForIpc,
  deleteOnethingPromptForIpc,
  getOnethingPromptForIpc,
  listOnethingPromptsForIpc,
  updateOnethingPromptForIpc,
} from '@onething/runtime/prompts'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import {
  createPrompt,
  deletePrompt,
  getPrompt,
  listPrompts,
  updatePrompt,
} from './store.js'

export function registerPromptHandlers(): void {
  registerElectronPromptsIpcHandlers({
    channels: {
      list: IPC_CHANNELS.PROMPTS_LIST,
      get: IPC_CHANNELS.PROMPTS_GET,
      create: IPC_CHANNELS.PROMPTS_CREATE,
      update: IPC_CHANNELS.PROMPTS_UPDATE,
      delete: IPC_CHANNELS.PROMPTS_DELETE,
    },
    listPrompts: () => {
      return listOnethingPromptsForIpc({ listPrompts, logger: console })
    },
    getPrompt: (request: ElectronPromptGetRequest) => {
      return getOnethingPromptForIpc({ request, getPrompt, logger: console })
    },
    createPrompt: (request: ElectronPromptCreateRequest) => {
      return createOnethingPromptForIpc({ request, createPrompt, logger: console })
    },
    updatePrompt: (request: ElectronPromptUpdateRequest) => {
      return updateOnethingPromptForIpc({ request, updatePrompt, logger: console })
    },
    deletePrompt: (request: ElectronPromptDeleteRequest) => {
      return deleteOnethingPromptForIpc({ request, deletePrompt, logger: console })
    },
  })

  console.log('[prompts] IPC handlers registered')
}
