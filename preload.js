// 开发模式下的预加载脚本
// Preload runs in a Node context; keep it CommonJS for compatibility.
const { contextBridge, ipcRenderer } = require('electron')

const electronAPI = {
  // Chat methods
  sendMessage: (sessionId, message) =>
    ipcRenderer.invoke('chat:send-message', { sessionId, message }),

  getChatHistory: (sessionId) =>
    ipcRenderer.invoke('chat:get-history', { sessionId }),

  // Session methods
  getSessions: () =>
    ipcRenderer.invoke('sessions:get-all'),

  createSession: (name) =>
    ipcRenderer.invoke('sessions:create', { name }),

  switchSession: (sessionId) =>
    ipcRenderer.invoke('sessions:switch', { sessionId }),

  deleteSession: (sessionId) =>
    ipcRenderer.invoke('sessions:delete', { sessionId }),

  renameSession: (sessionId, newName) =>
    ipcRenderer.invoke('sessions:rename', { sessionId, newName }),

  // Settings methods
  getSettings: () =>
    ipcRenderer.invoke('settings:get'),

  saveSettings: (settings) =>
    ipcRenderer.invoke('settings:save', settings),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
