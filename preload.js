// 开发模式下的预加载脚本
// Preload runs in a Node context; keep it CommonJS for compatibility.
const { contextBridge, ipcRenderer } = require('electron')

const electronAPI = {
  // Chat methods
  sendMessage: (sessionId, message) =>
    ipcRenderer.invoke('chat:send-message', { sessionId, message }),

  sendMessageStream: (sessionId, message) =>
    ipcRenderer.invoke('chat:send-message-stream', { sessionId, message }),

  getChatHistory: (sessionId) =>
    ipcRenderer.invoke('chat:get-history', { sessionId }),

  generateTitle: (message) =>
    ipcRenderer.invoke('chat:generate-title', { message }),

  // Stream event listeners
  onStreamChunk: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('chat:stream-chunk', listener)
    return () => ipcRenderer.removeListener('chat:stream-chunk', listener)
  },

  onStreamComplete: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('chat:stream-complete', listener)
    return () => ipcRenderer.removeListener('chat:stream-complete', listener)
  },

  onStreamError: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('chat:stream-error', listener)
    return () => ipcRenderer.removeListener('chat:stream-error', listener)
  },

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

  // Models methods
  fetchModels: (provider, apiKey, baseUrl, forceRefresh) =>
    ipcRenderer.invoke('models:fetch', { provider, apiKey, baseUrl, forceRefresh }),

  getCachedModels: (provider) =>
    ipcRenderer.invoke('models:get-cached', { provider }),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
