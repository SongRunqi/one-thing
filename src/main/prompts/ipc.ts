import { ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  type PromptCreateRequest,
  type PromptDeleteRequest,
  type PromptGetRequest,
  type PromptUpdateRequest,
} from '../../shared/ipc.js'
import {
  createPrompt,
  deletePrompt,
  getPrompt,
  listPrompts,
  updatePrompt,
} from './store.js'

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function registerPromptHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PROMPTS_LIST, async () => {
    try {
      return { success: true, prompts: listPrompts() }
    } catch (error) {
      return { success: false, error: errorMessage(error, 'Failed to list prompts') }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROMPTS_GET, async (_event, request: PromptGetRequest) => {
    try {
      const prompt = getPrompt(request.id)
      return prompt
        ? { success: true, prompt }
        : { success: false, error: 'Prompt not found' }
    } catch (error) {
      return { success: false, error: errorMessage(error, 'Failed to read prompt') }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROMPTS_CREATE, async (_event, request: PromptCreateRequest) => {
    try {
      if (!request.title?.trim()) return { success: false, error: 'Title is required' }
      return { success: true, prompt: createPrompt(request) }
    } catch (error) {
      return { success: false, error: errorMessage(error, 'Failed to create prompt') }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROMPTS_UPDATE, async (_event, request: PromptUpdateRequest) => {
    try {
      const prompt = updatePrompt(request)
      return prompt
        ? { success: true, prompt }
        : { success: false, error: 'Prompt not found' }
    } catch (error) {
      return { success: false, error: errorMessage(error, 'Failed to update prompt') }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROMPTS_DELETE, async (_event, request: PromptDeleteRequest) => {
    try {
      return { success: deletePrompt(request.id) }
    } catch (error) {
      return { success: false, error: errorMessage(error, 'Failed to delete prompt') }
    }
  })

  console.log('[prompts] IPC handlers registered')
}
