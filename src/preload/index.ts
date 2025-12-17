import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, AIProvider } from '../shared/ipc.js'

const electronAPI = {
  // Chat methods
  sendMessage: (sessionId: string, message: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE, { sessionId, message }),

  // Streaming chat methods (for reasoning models)
  sendMessageStream: (sessionId: string, message: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE_STREAM, { sessionId, message }),

  // Stream event listeners
  onStreamChunk: (callback: (chunk: { type: 'text' | 'reasoning' | 'tool_call' | 'tool_result'; content: string; messageId: string; reasoning?: string; toolCall?: any }) => void) => {
    const listener = (_event: any, chunk: any) => callback(chunk)
    ipcRenderer.on(IPC_CHANNELS.STREAM_CHUNK, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STREAM_CHUNK, listener)
  },

  onStreamReasoningDelta: (callback: (data: { messageId: string; delta: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.STREAM_REASONING_DELTA, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STREAM_REASONING_DELTA, listener)
  },

  onStreamTextDelta: (callback: (data: { messageId: string; delta: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.STREAM_TEXT_DELTA, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STREAM_TEXT_DELTA, listener)
  },

  onStreamComplete: (callback: (data: { messageId: string; text: string; reasoning?: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.STREAM_COMPLETE, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STREAM_COMPLETE, listener)
  },

  onStreamError: (callback: (data: { messageId?: string; error: string; errorDetails?: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.STREAM_ERROR, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STREAM_ERROR, listener)
  },

  abortStream: () =>
    ipcRenderer.invoke(IPC_CHANNELS.ABORT_STREAM),

  getChatHistory: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_CHAT_HISTORY, { sessionId }),

  generateTitle: (message: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GENERATE_TITLE, { message }),

  editAndResend: (sessionId: string, messageId: string, newContent: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.EDIT_AND_RESEND, { sessionId, messageId, newContent }),

  editAndResendStream: (sessionId: string, messageId: string, newContent: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.EDIT_AND_RESEND_STREAM, { sessionId, messageId, newContent }),

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

  // Tools methods
  getTools: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_TOOLS),

  executeTool: (toolId: string, args: Record<string, any>, messageId: string, sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.EXECUTE_TOOL, { toolId, arguments: args, messageId, sessionId }),

  cancelTool: (toolCallId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CANCEL_TOOL, { toolCallId }),

  updateContentParts: (sessionId: string, messageId: string, contentParts: any[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CONTENT_PARTS, { sessionId, messageId, contentParts }),

  // MCP methods
  mcpGetServers: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_SERVERS),

  mcpAddServer: (config: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_ADD_SERVER, { config }),

  mcpUpdateServer: (config: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_UPDATE_SERVER, { config }),

  mcpRemoveServer: (serverId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_REMOVE_SERVER, { serverId }),

  mcpConnectServer: (serverId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_CONNECT_SERVER, { serverId }),

  mcpDisconnectServer: (serverId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_DISCONNECT_SERVER, { serverId }),

  mcpRefreshServer: (serverId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_REFRESH_SERVER, { serverId }),

  mcpGetTools: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_TOOLS),

  mcpCallTool: (serverId: string, toolName: string, args: Record<string, any>) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_CALL_TOOL, { serverId, toolName, arguments: args }),

  mcpGetResources: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_RESOURCES),

  mcpReadResource: (serverId: string, uri: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_READ_RESOURCE, { serverId, uri }),

  mcpGetPrompts: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_PROMPTS),

  mcpGetPrompt: (serverId: string, name: string, args?: Record<string, string>) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_PROMPT, { serverId, name, arguments: args }),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
