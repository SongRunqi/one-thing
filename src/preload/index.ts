import { contextBridge, ipcRenderer } from 'electron'

// IPC Channel constants - inlined to avoid sandbox module resolution issues
// Keep in sync with src/shared/ipc.ts
const IPC_CHANNELS = {
  // Chat related
  SEND_MESSAGE: 'chat:send-message',
  GET_CHAT_HISTORY: 'chat:get-history',
  CLEAR_CHAT: 'chat:clear',
  GENERATE_TITLE: 'chat:generate-title',
  EDIT_AND_RESEND: 'chat:edit-and-resend',
  // Session related
  GET_SESSIONS: 'sessions:get-all',
  CREATE_SESSION: 'sessions:create',
  SWITCH_SESSION: 'sessions:switch',
  DELETE_SESSION: 'sessions:delete',
  RENAME_SESSION: 'sessions:rename',
  CREATE_BRANCH: 'sessions:create-branch',
  // Settings related
  GET_SETTINGS: 'settings:get',
  SAVE_SETTINGS: 'settings:save',
} as const

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
  getSessions: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SESSIONS),

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
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),

  saveSettings: (settings: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, settings),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
