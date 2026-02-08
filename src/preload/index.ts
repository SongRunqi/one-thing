import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, AIProvider, MessageAttachment, PLUGIN_CHANNELS } from '../shared/ipc.js'
import type { UIMessageStreamData, InstallPluginRequest, UpdatePluginConfigRequest } from '../shared/ipc.js'
import { createRouterAPI } from './create-api.js'
import { memoryFeedbackRouter } from '../shared/ipc/memory-feedback.js'

const electronAPI = {
  // Chat methods
  sendMessage: (sessionId: string, message: string, attachments?: MessageAttachment[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE, { sessionId, message, attachments }),

  // Streaming chat methods (for reasoning models)
  sendMessageStream: (sessionId: string, message: string, attachments?: MessageAttachment[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE_STREAM, { sessionId, message, attachments }),

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

  onContextCompactStarted: (callback: (data: { sessionId: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.CONTEXT_COMPACT_STARTED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CONTEXT_COMPACT_STARTED, listener)
  },

  onContextCompactCompleted: (callback: (data: { sessionId: string; success: boolean; error?: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.CONTEXT_COMPACT_COMPLETED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CONTEXT_COMPACT_COMPLETED, listener)
  },

  updateSessionMaxTokens: (sessionId: string, maxTokens: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SESSION_MAX_TOKENS, sessionId, maxTokens),

  // Builtin mode (Ask/Build) methods
  setSessionBuiltinMode: (sessionId: string, mode: 'build' | 'ask') =>
    ipcRenderer.invoke(IPC_CHANNELS.SET_SESSION_BUILTIN_MODE, { sessionId, mode }),

  getSessionBuiltinMode: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_BUILTIN_MODE, { sessionId }),

  // ============================================================================
  // Optimized Session Loading (Phase 4: Metadata Separation)
  // ============================================================================

  // Get sessions list (metadata only, no messages) - for fast startup
  getSessionsList: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SESSIONS_LIST),

  // Activate session (returns details, no messages) - for session switching
  activateSession: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ACTIVATE_SESSION, { sessionId }),

  // Get session messages (on-demand loading) - only when messages need to be displayed
  getSessionMessages: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_MESSAGES, { sessionId }),

  // Listen for messages changed event (for real-time sync)
  onSessionMessagesChanged: (callback: (data: { sessionId: string; action: 'added' | 'updated' | 'deleted'; messageId?: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.SESSION_MESSAGES_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_MESSAGES_CHANGED, listener)
  },

  // System message methods (for /files command persistence)
  addSystemMessage: (sessionId: string, message: { id: string; role: string; content: string; timestamp: number }) =>
    ipcRenderer.invoke('add-system-message', { sessionId, message }),

  removeFilesChangedMessage: (sessionId: string) =>
    ipcRenderer.invoke('remove-files-changed-message', { sessionId }),

  removeGitStatusMessage: (sessionId: string) =>
    ipcRenderer.invoke('remove-git-status-message', { sessionId }),

  // Generic remove message by ID (for close button functionality)
  removeMessage: (sessionId: string, messageId: string) =>
    ipcRenderer.invoke('remove-message', { sessionId, messageId }),

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

  // Settings import/export methods
  settingsExport: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_EXPORT),

  settingsExportWithDialog: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_EXPORT_WITH_DIALOG),

  settingsImport: (data: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_IMPORT, data),

  settingsImportWithDialog: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_IMPORT_WITH_DIALOG),

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

  // Custom Agent methods
  getCustomAgents: (workingDirectory?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_AGENT_GET_ALL, { workingDirectory }),

  refreshCustomAgents: (workingDirectory?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_AGENT_REFRESH, { workingDirectory }),

  openCustomAgentsDirectory: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_AGENT_OPEN_DIRECTORY),

  getCustomAgent: (agentId: string, workingDirectory?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_AGENT_GET, { agentId, workingDirectory }),

  createCustomAgent: (config: {
    name: string
    description: string
    systemPrompt: string
    customTools: Array<{
      id: string
      name: string
      description: string
      parameters: Array<{
        name: string
        type: 'string' | 'number' | 'boolean' | 'object' | 'array'
        description: string
        required: boolean
        default?: unknown
        enum?: string[]
      }>
      execution: { type: 'bash'; command: string; env?: Record<string, string>; timeout?: number }
        | { type: 'http'; method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'; url: string; headers?: Record<string, string>; bodyTemplate?: string; timeout?: number }
        | { type: 'builtin'; toolId: string; argsMapping?: Record<string, string> }
    }>
    avatar?: { type: 'emoji' | 'image'; value: string }
    allowBuiltinTools?: boolean
    allowedBuiltinTools?: string[]
    maxToolCalls?: number
    timeoutMs?: number
    enableMemory?: boolean
  }, source?: 'user' | 'project', workingDirectory?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_AGENT_CREATE, { config, source, workingDirectory }),

  updateCustomAgent: (agentId: string, updates: Partial<{
    name: string
    description: string
    systemPrompt: string
    customTools: Array<any>
    avatar: { type: 'emoji' | 'image'; value: string }
    allowBuiltinTools: boolean
    allowedBuiltinTools: string[]
    maxToolCalls: number
    timeoutMs: number
    enableMemory: boolean
  }>, workingDirectory?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_AGENT_UPDATE, { agentId, updates, workingDirectory }),

  deleteCustomAgent: (agentId: string, workingDirectory?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_AGENT_DELETE, { agentId, workingDirectory }),

  getAvailableBuiltinTools: (): Promise<Array<{ id: string; name: string; description: string }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_AGENT_GET_AVAILABLE_BUILTIN_TOOLS),

  // CustomAgent permission handling
  respondToCustomAgentPermission: (requestId: string, decision: 'allow' | 'always' | 'reject'): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_AGENT_PERMISSION_RESPOND, { requestId, decision }),

  // CustomAgent pin/unpin (for sidebar display)
  pinCustomAgent: (agentId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_AGENT_PIN, { agentId }),

  unpinCustomAgent: (agentId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_AGENT_UNPIN, { agentId }),

  onCustomAgentPermissionRequest: (callback: (data: {
    requestId: string
    sessionId: string
    messageId: string
    stepId: string
    toolCall: {
      id: string
      toolName: string
      arguments: Record<string, unknown>
      commandType?: 'read-only' | 'dangerous' | 'forbidden'
      error?: string
    }
  }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.CUSTOM_AGENT_PERMISSION_REQUEST, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CUSTOM_AGENT_PERMISSION_REQUEST, listener)
  },

  // Refresh async tools (invalidate cache and re-initialize)
  // Call this after creating/modifying/deleting CustomAgents
  refreshAsyncTools: (workingDirectory?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.REFRESH_ASYNC_TOOLS, { workingDirectory }),

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

  // Memory Feedback methods (legacy - use memoryFeedback router API instead)
  /** @deprecated Use memoryFeedback.record() instead */
  recordMemoryFeedback: (filePath: string, feedbackType: 'positive' | 'negative') =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_FEEDBACK_RECORD, { filePath, feedbackType }),

  /** @deprecated Use memoryFeedback.getStats() instead */
  getMemoryFeedbackStats: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_FEEDBACK_GET_STATS, { filePath }),

  // Router-based API: memory feedback
  memoryFeedback: createRouterAPI(memoryFeedbackRouter),

  // Memory Management methods
  memoryListFiles: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_LIST_FILES),

  memoryGetFile: (path: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_GET_FILE, { path }),

  memoryUpdateFile: (path: string, content: string, metadata?: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_UPDATE_FILE, { path, content, metadata }),

  memoryDeleteFile: (path: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_DELETE_FILE, { path }),

  memoryDeleteFiles: (paths: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_DELETE_FILES, { paths }),

  memoryExport: (options: { includeMetadata: boolean; filter?: { tags?: string[]; dateRange?: [string, string] } }) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_EXPORT, { options }),

  memoryExportWithDialog: (options: { includeMetadata: boolean; filter?: { tags?: string[]; dateRange?: [string, string] } }) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_EXPORT_WITH_DIALOG, { options }),

  memoryImport: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_IMPORT, { filePath }),

  memoryImportWithDialog: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_IMPORT_WITH_DIALOG),

  memoryGetTags: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_GET_TAGS),

  memoryRenameTag: (oldTag: string, newTag: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_RENAME_TAG, { oldTag, newTag }),

  memoryDeleteTag: (tag: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_DELETE_TAG, { tag }),

  memoryGetStats: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_GET_STATS),

  memoryRebuildIndex: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_REBUILD_INDEX),

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

  // Image gallery methods (now uses mediaId - gallery loads its own data)
  openImageGallery: (mediaId: string) => {
    console.log('[Preload] openImageGallery called:', { mediaId })
    return ipcRenderer.invoke(IPC_CHANNELS.OPEN_IMAGE_GALLERY, { mediaId })
  },

  // Permission methods
  respondToPermission: (request: {
    sessionId: string
    permissionId: string
    response: 'once' | 'session' | 'workspace' | 'reject' | 'always'  // 'always' for legacy compatibility
    rejectReason?: string
    rejectMode?: 'stop' | 'continue'  // 'stop' = end loop, 'continue' = try another way
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
    /** Working directory for workspace-level permissions */
    workingDirectory?: string
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

  // Files methods (for @ file search)
  listFiles: (options: { cwd: string; query?: string; limit?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILES_LIST, options),

  // File rollback (for /files command)
  rollbackFile: (options: { filePath: string; originalContent: string; isNew: boolean }) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_ROLLBACK, options),

  // Directories listing (for /cd path completion)
  listDirs: (options: { basePath: string; query?: string; limit?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIRS_LIST, options),

  // File tree methods (for right sidebar file browser)
  fileTreeList: (options: { directory: string; depth?: number; includeHidden?: boolean; respectGitignore?: boolean }) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_TREE_LIST, options),

  // File content reading (for file preview panel)
  readFileContent: (filePath: string, maxSize?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_READ_CONTENT, { path: filePath, maxSize }),

  // Plugin methods
  getPlugins: () =>
    ipcRenderer.invoke(PLUGIN_CHANNELS.GET_ALL),

  getPlugin: (pluginId: string) =>
    ipcRenderer.invoke(PLUGIN_CHANNELS.GET, pluginId),

  installPlugin: (request: InstallPluginRequest) =>
    ipcRenderer.invoke(PLUGIN_CHANNELS.INSTALL, request),

  uninstallPlugin: (pluginId: string) =>
    ipcRenderer.invoke(PLUGIN_CHANNELS.UNINSTALL, pluginId),

  enablePlugin: (pluginId: string) =>
    ipcRenderer.invoke(PLUGIN_CHANNELS.ENABLE, pluginId),

  disablePlugin: (pluginId: string) =>
    ipcRenderer.invoke(PLUGIN_CHANNELS.DISABLE, pluginId),

  reloadPlugin: (pluginId: string) =>
    ipcRenderer.invoke(PLUGIN_CHANNELS.RELOAD, pluginId),

  updatePluginConfig: (request: UpdatePluginConfigRequest) =>
    ipcRenderer.invoke(PLUGIN_CHANNELS.UPDATE_CONFIG, request),

  getPluginDirectories: () =>
    ipcRenderer.invoke(PLUGIN_CHANNELS.GET_DIRECTORIES),

  openPluginDirectory: (dirType: 'plugins' | 'npm' | 'local') =>
    ipcRenderer.invoke(PLUGIN_CHANNELS.OPEN_DIRECTORY, dirType),

  // Updater methods (Method B: Check update + manual download)
  updaterCheck: () =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATER_CHECK),

  updaterGetStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATER_STATUS),

  updaterOpenRelease: () =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATER_OPEN_RELEASE),

  onUpdaterNewVersion: (callback: (info: { version: string; releaseUrl: string; releaseNotes: string; publishedAt: string }) => void) => {
    const listener = (_event: any, info: any) => callback(info)
    ipcRenderer.on(IPC_CHANNELS.UPDATER_NEW_VERSION, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_NEW_VERSION, listener)
  },

  onUpdaterStatusChange: (callback: (status: any) => void) => {
    const listener = (_event: any, status: any) => callback(status)
    ipcRenderer.on(IPC_CHANNELS.UPDATER_STATUS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_STATUS, listener)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
