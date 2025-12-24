import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, AIProvider, MessageAttachment } from '../shared/ipc.js'

const electronAPI = {
  // Chat methods
  sendMessage: (sessionId: string, message: string, attachments?: MessageAttachment[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE, { sessionId, message, attachments }),

  // Streaming chat methods (for reasoning models)
  sendMessageStream: (sessionId: string, message: string, attachments?: MessageAttachment[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE_STREAM, { sessionId, message, attachments }),

  // Stream event listeners
  onStreamChunk: (callback: (chunk: { type: 'text' | 'reasoning' | 'tool_call' | 'tool_result' | 'continuation' | 'replace'; content: string; messageId: string; sessionId?: string; reasoning?: string; toolCall?: any }) => void) => {
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

  onStreamComplete: (callback: (data: { messageId: string; text: string; reasoning?: string; sessionId?: string; sessionName?: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.STREAM_COMPLETE, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STREAM_COMPLETE, listener)
  },

  onStreamError: (callback: (data: { messageId?: string; sessionId?: string; error: string; errorDetails?: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.STREAM_ERROR, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STREAM_ERROR, listener)
  },

  onSkillActivated: (callback: (data: { sessionId: string; messageId: string; skillName: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.SKILL_ACTIVATED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SKILL_ACTIVATED, listener)
  },

  onStepAdded: (callback: (data: { sessionId: string; messageId: string; step: any }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.STEP_ADDED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STEP_ADDED, listener)
  },

  onStepUpdated: (callback: (data: { sessionId: string; messageId: string; stepId: string; updates: any }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.STEP_UPDATED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STEP_UPDATED, listener)
  },

  onImageGenerated: (callback: (data: { id: string; url: string; prompt: string; revisedPrompt?: string; model: string; sessionId: string; messageId: string; createdAt: number }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.IMAGE_GENERATED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.IMAGE_GENERATED, listener)
  },

  abortStream: (sessionId?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ABORT_STREAM, { sessionId }),

  getActiveStreams: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_ACTIVE_STREAMS),

  getChatHistory: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_CHAT_HISTORY, { sessionId }),

  generateTitle: (message: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GENERATE_TITLE, { message }),

  editAndResend: (sessionId: string, messageId: string, newContent: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.EDIT_AND_RESEND, { sessionId, messageId, newContent }),

  editAndResendStream: (sessionId: string, messageId: string, newContent: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.EDIT_AND_RESEND_STREAM, { sessionId, messageId, newContent }),

  resumeAfterToolConfirm: (sessionId: string, messageId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.RESUME_AFTER_TOOL_CONFIRM, { sessionId, messageId }),

  // Session methods
  getSessions: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SESSIONS),

  createSession: (name: string, workspaceId?: string, agentId?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_SESSION, { name, workspaceId, agentId }),

  switchSession: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SWITCH_SESSION, { sessionId }),

  deleteSession: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DELETE_SESSION, { sessionId }),

  renameSession: (sessionId: string, newName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.RENAME_SESSION, { sessionId, newName }),

  createBranch: (parentSessionId: string, branchFromMessageId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_BRANCH, { parentSessionId, branchFromMessageId }),

  updateSessionPin: (sessionId: string, isPinned: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SESSION_PIN, { sessionId, isPinned }),

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

  updateToolCall: (sessionId: string, messageId: string, toolCallId: string, updates: Record<string, any>) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_TOOL_CALL, { sessionId, messageId, toolCallId, updates }),

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

  mcpReadConfigFile: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_READ_CONFIG_FILE, { filePath }),

  // Skills methods (Official Claude Code Skills)
  getSkills: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILLS_GET_ALL),

  refreshSkills: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILLS_REFRESH),

  readSkillFile: (skillId: string, fileName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILLS_READ_FILE, { skillId, fileName }),

  openSkillDirectory: (skillId?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILLS_OPEN_DIRECTORY, { skillId }),

  createSkill: (name: string, description: string, instructions: string, source: 'user' | 'project') =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILLS_CREATE, { name, description, instructions, source }),

  deleteSkill: (skillId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILLS_DELETE, { skillId }),

  toggleSkillEnabled: (skillId: string, enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILLS_TOGGLE_ENABLED, { skillId, enabled }),

  // Message update methods
  updateMessageThinkingTime: (sessionId: string, messageId: string, thinkingTime: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_MESSAGE_THINKING_TIME, { sessionId, messageId, thinkingTime }),

  // Dialog methods
  showOpenDialog: (options: { properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>; title?: string; defaultPath?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHOW_OPEN_DIALOG, options),

  // Workspace methods
  getWorkspaces: () =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET_ALL),

  createWorkspace: (name: string, avatar: { type: 'emoji' | 'image'; value: string }, systemPrompt: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_CREATE, { name, avatar, systemPrompt }),

  updateWorkspace: (id: string, updates: { name?: string; avatar?: { type: 'emoji' | 'image'; value: string }; systemPrompt?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_UPDATE, { id, ...updates }),

  deleteWorkspace: (workspaceId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_DELETE, { workspaceId }),

  switchWorkspace: (workspaceId: string | null) =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SWITCH, { workspaceId }),

  uploadWorkspaceAvatar: (workspaceId: string, imageData: string, mimeType: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_UPLOAD_AVATAR, { workspaceId, imageData, mimeType }),

  // Agent methods
  getAgents: () =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_GET_ALL),

  createAgent: (
    name: string,
    avatar: { type: 'emoji' | 'image'; value: string },
    systemPrompt: string,
    options?: {
      tagline?: string
      personality?: string[]
      primaryColor?: string
      voice?: { enabled: boolean; voiceURI?: string; rate?: number; pitch?: number; volume?: number }
    }
  ) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_CREATE, { name, avatar, systemPrompt, ...options }),

  updateAgent: (id: string, updates: {
    name?: string
    avatar?: { type: 'emoji' | 'image'; value: string }
    systemPrompt?: string
    tagline?: string
    personality?: string[]
    primaryColor?: string
    voice?: { enabled: boolean; voiceURI?: string; rate?: number; pitch?: number; volume?: number }
  }) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_UPDATE, { id, ...updates }),

  deleteAgent: (agentId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_DELETE, { agentId }),

  uploadAgentAvatar: (agentId: string, imageData: string, mimeType: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_UPLOAD_AVATAR, { agentId, imageData, mimeType }),

  pinAgent: (agentId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_PIN, { agentId }),

  unpinAgent: (agentId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_UNPIN, { agentId }),

  // User Profile methods
  getUserProfile: () =>
    ipcRenderer.invoke(IPC_CHANNELS.USER_PROFILE_GET),

  addUserFact: (
    content: string,
    category: 'personal' | 'preference' | 'goal' | 'trait',
    confidence?: number,
    sourceAgentId?: string
  ) =>
    ipcRenderer.invoke(IPC_CHANNELS.USER_PROFILE_ADD_FACT, {
      content,
      category,
      confidence,
      sourceAgentId,
    }),

  updateUserFact: (
    factId: string,
    updates: {
      content?: string
      category?: 'personal' | 'preference' | 'goal' | 'trait'
      confidence?: number
    }
  ) =>
    ipcRenderer.invoke(IPC_CHANNELS.USER_PROFILE_UPDATE_FACT, { factId, ...updates }),

  deleteUserFact: (factId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.USER_PROFILE_DELETE_FACT, { factId }),

  // Agent Memory methods
  getAgentRelationship: (agentId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_MEMORY_GET_RELATIONSHIP, { agentId }),

  addAgentMemory: (
    agentId: string,
    content: string,
    category: 'observation' | 'event' | 'feeling' | 'learning',
    emotionalWeight?: number
  ) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_MEMORY_ADD_MEMORY, {
      agentId,
      content,
      category,
      emotionalWeight,
    }),

  recallAgentMemory: (agentId: string, memoryId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_MEMORY_RECALL, { agentId, memoryId }),

  getActiveAgentMemories: (agentId: string, limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_MEMORY_GET_ACTIVE, { agentId, limit }),

  updateAgentRelationship: (
    agentId: string,
    updates: {
      trustLevel?: number
      familiarity?: number
      mood?: 'happy' | 'neutral' | 'concerned' | 'excited'
      moodNotes?: string
    }
  ) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_MEMORY_UPDATE_RELATIONSHIP, { agentId, updates }),

  recordAgentInteraction: (agentId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_MEMORY_RECORD_INTERACTION, { agentId }),

  // Shell methods
  openPath: (filePath: string) =>
    ipcRenderer.invoke('shell:open-path', filePath),

  getDataPath: () =>
    ipcRenderer.invoke('app:get-data-path'),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
