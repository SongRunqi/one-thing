import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, AIProvider } from '../shared/ipc.js'

const electronAPI = {
  // Chat methods
  sendMessage: (sessionId: string, message: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE, { sessionId, message }),

  getChatHistory: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_CHAT_HISTORY, { sessionId }),

  generateTitle: (message: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GENERATE_TITLE, { message }),

  editAndResend: (sessionId: string, messageId: string, newContent: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.EDIT_AND_RESEND, { sessionId, messageId, newContent }),

  // Session methods
  getSessions: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SESSIONS),

  createSession: (name: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_SESSION, { name }),

  switchSession: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SWITCH_SESSION, { sessionId }),

  deleteSession: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DELETE_SESSION, { sessionId }),

  renameSession: (sessionId: string, newName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.RENAME_SESSION, { sessionId, newName }),

  createBranch: (parentSessionId: string, branchFromMessageId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_BRANCH, { parentSessionId, branchFromMessageId }),

  // Settings methods
  getSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),

  saveSettings: (settings: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, settings),

  // Models methods
  fetchModels: (provider: AIProvider, apiKey: string, baseUrl?: string, forceRefresh?: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.FETCH_MODELS, { provider, apiKey, baseUrl, forceRefresh }),

  getCachedModels: (provider: AIProvider) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_CACHED_MODELS, { provider }),

  // Providers methods
  getProviders: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PROVIDERS),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
