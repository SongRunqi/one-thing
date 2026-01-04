import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, AIProvider, MessageAttachment } from '../shared/ipc.js'
import type { UIMessageStreamData } from '../shared/ipc.js'

const electronAPI = {
  // Chat methods
  sendMessage: (sessionId: string, message: string, attachments?: MessageAttachment[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE, { sessionId, message, attachments }),

  // Streaming chat methods (for reasoning models)
  sendMessageStream: (sessionId: string, message: string, attachments?: MessageAttachment[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE_STREAM, { sessionId, message, attachments }),

  // Stream event listeners
  onStreamChunk: (callback: (chunk: {
    type: 'text' | 'reasoning' | 'tool_call' | 'tool_result' | 'continuation' | 'replace' | 'tool_input_start' | 'tool_input_delta';
    content: string;
    messageId: string;
    sessionId?: string;
    reasoning?: string;
    toolCall?: any;
    toolCallId?: string;
    toolName?: string;
    argsTextDelta?: string;
  }) => void) => {
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

  onStreamComplete: (callback: (data: { messageId: string; text: string; reasoning?: string; sessionId?: string; sessionName?: string; usage?: { inputTokens: number; outputTokens: number; totalTokens: number } }) => void) => {
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

  // UIMessage stream (AI SDK 5.x compatible)
  onUIMessageStream: (callback: (data: UIMessageStreamData) => void) => {
    const listener = (_event: any, data: UIMessageStreamData) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.UI_MESSAGE_STREAM, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.UI_MESSAGE_STREAM, listener)
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

  getSession: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION, { sessionId }),

  deleteSession: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DELETE_SESSION, { sessionId }),

  renameSession: (sessionId: string, newName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.RENAME_SESSION, { sessionId, newName }),

  createBranch: (parentSessionId: string, branchFromMessageId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_BRANCH, { parentSessionId, branchFromMessageId }),

  updateSessionPin: (sessionId: string, isPinned: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SESSION_PIN, { sessionId, isPinned }),

  updateSessionModel: (sessionId: string, provider: string, model: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SESSION_MODEL, { sessionId, provider, model }),

  updateSessionArchived: (sessionId: string, isArchived: boolean, archivedAt?: number | null) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SESSION_ARCHIVED, { sessionId, isArchived, archivedAt }),

  updateSessionAgent: (sessionId: string, agentId: string | null) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SESSION_AGENT, { sessionId, agentId }),

  updateSessionWorkingDirectory: (sessionId: string, workingDirectory: string | null) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SESSION_WORKING_DIRECTORY, { sessionId, workingDirectory }),

  getSessionTokenUsage: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_TOKEN_USAGE, sessionId),

  onContextSizeUpdated: (callback: (data: { sessionId: string; contextSize: number }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.CONTEXT_SIZE_UPDATED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CONTEXT_SIZE_UPDATED, listener)
  },

  updateSessionMaxTokens: (sessionId: string, maxTokens: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SESSION_MAX_TOKENS, sessionId, maxTokens),

  // Builtin mode (Ask/Build) methods
  setSessionBuiltinMode: (sessionId: string, mode: 'build' | 'ask') =>
    ipcRenderer.invoke(IPC_CHANNELS.SET_SESSION_BUILTIN_MODE, { sessionId, mode }),

  getSessionBuiltinMode: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_BUILTIN_MODE, { sessionId }),

  // Plan update listener (for Planning workflow)
  onPlanUpdated: (callback: (data: { sessionId: string; plan: any }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.PLAN_UPDATED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PLAN_UPDATED, listener)
  },

  // Settings methods
  getSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),

  saveSettings: (settings: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, settings),

  openSettingsWindow: () =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_SETTINGS_WINDOW),

  onSettingsChanged: (callback: (settings: any) => void) => {
    const listener = (_event: any, settings: any) => callback(settings)
    ipcRenderer.on(IPC_CHANNELS.SETTINGS_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SETTINGS_CHANGED, listener)
  },

  getSystemTheme: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SYSTEM_THEME),

  onSystemThemeChanged: (callback: (theme: 'light' | 'dark') => void) => {
    const listener = (_event: any, theme: 'light' | 'dark') => callback(theme)
    ipcRenderer.on(IPC_CHANNELS.SYSTEM_THEME_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SYSTEM_THEME_CHANGED, listener)
  },

  // Theme methods
  getThemes: () =>
    ipcRenderer.invoke(IPC_CHANNELS.THEME_GET_ALL),

  getTheme: (themeId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.THEME_GET, themeId),

  applyTheme: (themeId: string, mode: 'dark' | 'light') =>
    ipcRenderer.invoke(IPC_CHANNELS.THEME_APPLY, themeId, mode),

  refreshThemes: (projectPath?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.THEME_REFRESH, projectPath),

  openThemesFolder: () =>
    ipcRenderer.invoke(IPC_CHANNELS.THEME_OPEN_FOLDER),

  // Models methods (legacy)
  fetchModels: (provider: AIProvider, apiKey: string, baseUrl?: string, forceRefresh?: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.FETCH_MODELS, { provider, apiKey, baseUrl, forceRefresh }),

  getCachedModels: (provider: AIProvider) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_CACHED_MODELS, { provider }),

  // Model registry methods (OpenRouter-based with capabilities)
  getModelsWithCapabilities: (providerId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_MODELS_WITH_CAPABILITIES, { providerId }),

  getAllModels: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_ALL_MODELS),

  searchModels: (query: string, providerId?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SEARCH_MODELS, { query, providerId }),

  refreshModelRegistry: () =>
    ipcRenderer.invoke(IPC_CHANNELS.REFRESH_MODEL_REGISTRY),

  getModelNameAliases: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_MODEL_NAME_ALIASES),

  getModelDisplayName: (modelId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_MODEL_DISPLAY_NAME, { modelId }),

  // Embedding models methods (from Models.dev registry)
  getEmbeddingModels: (providerId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_EMBEDDING_MODELS, { providerId }),

  getAllEmbeddingModels: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_ALL_EMBEDDING_MODELS),

  getEmbeddingDimension: (modelId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_EMBEDDING_DIMENSION, { modelId }),

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

  createWorkspace: (name: string, avatar: { type: 'emoji' | 'image'; value: string }, workingDirectory: string | undefined, systemPrompt: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_CREATE, { name, avatar, workingDirectory, systemPrompt }),

  updateWorkspace: (id: string, updates: { name?: string; avatar?: { type: 'emoji' | 'image'; value: string }; workingDirectory?: string; systemPrompt?: string }) =>
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

  deleteAgentMemory: (memoryId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_MEMORY_DELETE, { memoryId }),

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

  // Window methods
  setWindowButtonVisibility: (visible: boolean) =>
    ipcRenderer.invoke('window:set-button-visibility', visible),

  // Media methods
  saveImage: (data: {
    url?: string
    base64?: string
    prompt: string
    revisedPrompt?: string
    model: string
    sessionId: string
    messageId: string
  }) => ipcRenderer.invoke('media:save-image', data),

  loadAllMedia: () =>
    ipcRenderer.invoke('media:load-all'),

  deleteMedia: (id: string) =>
    ipcRenderer.invoke('media:delete', id),

  clearAllMedia: () =>
    ipcRenderer.invoke('media:clear-all'),

  readImageBase64: (filePath: string) =>
    ipcRenderer.invoke('media:read-image-base64', filePath),

  // Image preview methods
  openImagePreview: (src: string, alt?: string) => {
    console.log('[Preload] openImagePreview called:', { src: src.substring(0, 50), alt })
    return ipcRenderer.invoke(IPC_CHANNELS.OPEN_IMAGE_PREVIEW, { src, alt })
  },

  onImagePreviewUpdate: (callback: (data: { mode: 'single'; src: string; alt?: string }) => void) => {
    const listener = (_event: any, data: { mode: 'single'; src: string; alt?: string }) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.IMAGE_PREVIEW_UPDATE, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.IMAGE_PREVIEW_UPDATE, listener)
  },

  // Image gallery methods
  openImageGallery: (images: Array<{ id: string; src: string; alt?: string; thumbnail?: string }>, initialIndex?: number) => {
    console.log('[Preload] openImageGallery called:', { count: images.length, initialIndex })
    return ipcRenderer.invoke(IPC_CHANNELS.OPEN_IMAGE_GALLERY, { images, initialIndex })
  },

  onImageGalleryUpdate: (callback: (data: { mode: 'gallery'; images: Array<{ id: string; src: string; alt?: string; thumbnail?: string }>; currentIndex: number }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.IMAGE_GALLERY_UPDATE, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.IMAGE_GALLERY_UPDATE, listener)
  },

  // Permission methods
  respondToPermission: (request: {
    sessionId: string
    permissionId: string
    response: 'once' | 'always' | 'reject'
  }) => ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_RESPOND, request),

  getPendingPermissions: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_GET_PENDING, sessionId),

  clearSessionPermissions: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_CLEAR_SESSION, sessionId),

  onPermissionRequest: (callback: (info: {
    id: string
    type: string
    pattern?: string | string[]
    sessionId: string
    messageId: string
    callId?: string
    title: string
    metadata: Record<string, unknown>
    createdAt: number
  }) => void) => {
    const listener = (_event: any, info: any) => callback(info)
    ipcRenderer.on(IPC_CHANNELS.PERMISSION_REQUEST, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PERMISSION_REQUEST, listener)
  },

  // OAuth methods
  oauthStart: (providerId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OAUTH_START, { providerId }),

  oauthLogout: (providerId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OAUTH_LOGOUT, { providerId }),

  oauthGetStatus: (providerId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OAUTH_STATUS, { providerId }),

  oauthDevicePoll: (providerId: string, deviceCode: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OAUTH_DEVICE_POLL, { providerId, deviceCode }),

  oauthRefresh: (providerId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OAUTH_REFRESH, { providerId }),

  oauthCallback: (providerId: string, code: string, state: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OAUTH_CALLBACK, { providerId, code, state }),

  // Test OAuth API directly (for debugging)
  oauthTestDirect: (providerId: string) =>
    ipcRenderer.invoke('oauth:test-direct', providerId),

  // OAuth event listeners
  onOAuthTokenRefreshed: (callback: (data: { providerId: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.OAUTH_TOKEN_REFRESHED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OAUTH_TOKEN_REFRESHED, listener)
  },

  onOAuthTokenExpired: (callback: (data: { providerId: string; error?: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.OAUTH_TOKEN_EXPIRED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OAUTH_TOKEN_EXPIRED, listener)
  },

  // Menu event listeners
  onMenuNewChat: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('menu:new-chat', listener)
    return () => ipcRenderer.removeListener('menu:new-chat', listener)
  },

  onMenuCloseChat: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('menu:close-chat', listener)
    return () => ipcRenderer.removeListener('menu:close-chat', listener)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
