import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, AIProvider, MessageAttachment } from '../shared/ipc.js'
import type {
  GetSessionMessagesPageRequest,
  MediaQuery,
  ProviderUsageResponse,
  TodoPlanWindowActionRequest,
  UIMessageStreamData,
} from '../shared/ipc.js'

const electronAPI = {
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
    // ipcRenderer.on 接收main进程的消息
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

  // UIMessage stream (AI SDK 6.x compatible)
  onUIMessageStream: (callback: (data: UIMessageStreamData) => void) => {
    const listener = (_event: any, data: UIMessageStreamData) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.UI_MESSAGE_STREAM, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.UI_MESSAGE_STREAM, listener)
  },

  // ── Unified event-driven channels (Phase 4) ──────
  onSessionEvent: (callback: (envelope: any) => void) => {
    const listener = (_event: any, envelope: any) => callback(envelope)
    ipcRenderer.on(IPC_CHANNELS.SESSION_EVENT, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_EVENT, listener)
  },

  onSessionStream: (callback: (data: { sessionId: string; chunk: any }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.SESSION_STREAM, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_STREAM, listener)
  },

  emitCommand: (sessionId: string, command: any) =>
      // 给main线程发送消息
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_COMMAND, { sessionId, command }),

  // ── Legacy streaming methods ────────────────────
  abortStream: (sessionId?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ABORT_STREAM, { sessionId }),

  getActiveStreams: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_ACTIVE_STREAMS),

  getChatHistory: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_CHAT_HISTORY, { sessionId }),

  generateTitle: (message: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GENERATE_TITLE, { message }),

  resumeAfterToolConfirm: (sessionId: string, messageId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.RESUME_AFTER_TOOL_CONFIRM, { sessionId, messageId }),

  // Session methods
  getSessions: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SESSIONS),

  createSession: (name: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_SESSION, { name }),

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

  updateSessionWorkingDirectory: (sessionId: string, workingDirectory: string | null) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SESSION_WORKING_DIRECTORY, { sessionId, workingDirectory }),

  // ── Variables subsystem ─────────────────────────────────────
  // Live updates arrive through the existing session:variables-updated
  // event; these RPCs are for explicit fetches and writes.
  listVariables: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.VARIABLES_LIST, { sessionId }),

  setVariable: (sessionId: string, name: string, value: string, description?: string, scope?: 'global' | 'session') =>
    ipcRenderer.invoke(IPC_CHANNELS.VARIABLES_SET, { sessionId, name, value, description, scope }),

  deleteVariable: (sessionId: string, name: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.VARIABLES_DELETE, { sessionId, name }),

  // Project directories — independent module
  projectDirsList: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DIRS_LIST),

  projectDirsGet: (path: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DIRS_GET, { path }),

  projectDirsAdd: (path: string, description?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DIRS_ADD, { path, description }),

  projectDirsUpdate: (path: string, description: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DIRS_UPDATE, { path, description }),

  projectDirsRemove: (path: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DIRS_REMOVE, { path }),

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

  // Get a cursor-addressed page of session messages
  getSessionMessagesPage: (request: GetSessionMessagesPageRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_MESSAGES_PAGE, request),

  // Get lightweight user-message markers for navigation
  getSessionUserMarkers: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_USER_MARKERS, { sessionId }),

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

  testProxy: (proxy: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.TEST_PROXY, {
      proxy: JSON.parse(JSON.stringify(proxy)),
    }),

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

  // Model registry methods (reads from settings.json modelRegistry)
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

  // Providers methods
  getProviders: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PROVIDERS),

  getProviderUsage: (providerId: string): Promise<ProviderUsageResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PROVIDER_USAGE, { providerId }),

  // Tools methods
  getTools: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_TOOLS),

  executeTool: (toolId: string, args: Record<string, any>, messageId: string, sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.EXECUTE_TOOL, { toolId, arguments: args, messageId, sessionId }),

  cancelTool: (toolCallId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CANCEL_TOOL, { toolCallId }),

  updateToolCall: (sessionId: string, messageId: string, toolCallId: string, updates: Record<string, any>) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_TOOL_CALL, { sessionId, messageId, toolCallId, updates }),

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
  getSkills: (workingDirectory?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILLS_GET_ALL, { workingDirectory }),

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

  listMediaAssets: (query?: MediaQuery) =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_MEDIA_ASSETS, query),

  hideMediaAsset: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.HIDE_MEDIA_ASSET, id),

  rebuildMediaLibrary: () =>
    ipcRenderer.invoke(IPC_CHANNELS.REBUILD_MEDIA_LIBRARY),

  getMediaGallery: (assetId: string, query?: MediaQuery) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_MEDIA_GALLERY, { assetId, query }),

  // Image preview methods
  openImagePreview: (src: string, alt?: string) => {
    console.log('[Preload] openImagePreview called:', { src: src.substring(0, 50), alt })
    return ipcRenderer.invoke(IPC_CHANNELS.OPEN_IMAGE_PREVIEW, { src, alt })
  },

  getImagePreview: (previewId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_IMAGE_PREVIEW, previewId),

  onImagePreviewUpdate: (callback: (data: { mode: 'single'; previewId?: string; src?: string; alt?: string }) => void) => {
    const listener = (_event: any, data: { mode: 'single'; previewId?: string; src?: string; alt?: string }) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.IMAGE_PREVIEW_UPDATE, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.IMAGE_PREVIEW_UPDATE, listener)
  },

  // Image gallery methods (now uses mediaId - gallery loads its own data)
  openImageGallery: (mediaId: string) => {
    console.log('[Preload] openImageGallery called:', { mediaId })
    return ipcRenderer.invoke(IPC_CHANNELS.OPEN_IMAGE_GALLERY, { mediaId })
  },

  // Permission methods
  // Note: respondToPermission removed — responses now go through emitCommand()
  // with type: 'command:permission-respond' (EventBus channel affinity validation)
  // Note: onPermissionRequest removed — permission requests now arrive via
  // session:event channel as 'permission:request' events

  /** @deprecated Use emitCommand with command:permission-respond instead */
  respondToPermission: (request: {
    sessionId: string
    permissionId: string
    response: 'once' | 'session' | 'workdir' | 'workspace' | 'reject' | 'always'
    rejectReason?: string
  }) => ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_RESPOND, request),

  getPendingPermissions: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_GET_PENDING, sessionId),

  clearSessionPermissions: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_CLEAR_SESSION, sessionId),

  // OAuth methods
  oauthStart: (providerId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OAUTH_START, { providerId }),

  oauthLogout: (providerId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OAUTH_LOGOUT, { providerId }),

  oauthGetStatus: (providerId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OAUTH_STATUS, { providerId }),

  oauthDevicePoll: (providerId: string, flowId?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OAUTH_DEVICE_POLL, { providerId, flowId }),

  oauthRefresh: (providerId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OAUTH_REFRESH, { providerId }),

  oauthCallback: (providerId: string, code: string, state: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OAUTH_CALLBACK, { providerId, code, state }),

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

  // File content reading/writing (for file preview panel)
  readFileContent: (filePath: string, maxSize?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_READ_CONTENT, { path: filePath, maxSize }),
  saveFileContent: (filePath: string, content: string, expectedMtimeMs?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE_CONTENT, { path: filePath, content, expectedMtimeMs }),
  listDirectory: (dirPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_LIST_DIRECTORY, { path: dirPath }),
  createFile: (filePath: string, content?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_CREATE, { path: filePath, content }),
  createDirectory: (dirPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_CREATE_DIRECTORY, { path: dirPath }),
  renamePath: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_RENAME, { oldPath, newPath }),
  deletePath: (targetPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_DELETE, { path: targetPath }),
  statPath: (targetPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_STAT, { path: targetPath }),
  revealPath: (targetPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_REVEAL, { path: targetPath }),
  watchWorkspace: (root: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_WATCH_START, { root }),
  unwatchWorkspace: (root: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_WATCH_STOP, { root }),
  onWorkspaceFileChanged: (callback: (data: { root: string; path: string; eventType: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.FILE_WATCH_EVENT, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.FILE_WATCH_EVENT, listener)
  },

  // ── Plugin management ───────────────────────────
  getPlugins: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGINS_LIST),

  enablePlugin: (pluginId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGINS_ENABLE, { pluginId }),

  disablePlugin: (pluginId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGINS_DISABLE, { pluginId }),

  refreshPlugins: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGINS_REFRESH),

  getPluginCommands: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGINS_COMMANDS),

  executePluginCommand: (commandName: string, args: string, sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGINS_EXECUTE_COMMAND, { commandName, args, sessionId }),

  // ── Soul / Memory panel ────────────────────────
  getMemoryOverview: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_OVERVIEW),

  readMemoryFile: (request: { path: string; startLine?: number; endLine?: number; lines?: number; full?: boolean }) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_READ, request),

  searchMemory: (request: { query: string; limit?: number | string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_SEARCH, request),

  appendMemory: (request: { content: string; target?: 'daily' | 'memory'; heading?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_APPEND, request),

  saveMemoryFile: (request: { path: string; content: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_SAVE_FILE, request),

  rebuildMemoryIndex: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_INDEX),

  runMemoryDreaming: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_RUN_DREAMING),

  listMemoryProfile: (request?: { query?: string; includeDeleted?: boolean; limit?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_PROFILE_LIST, request),

  searchMemoryProfile: (request: { query?: string; includeDeleted?: boolean; limit?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_PROFILE_SEARCH, request),

  upsertMemoryProfile: (request: {
    id?: string
    memoryKey?: string
    kind: string
    subject?: string
    value: string
    text?: string
    confidence?: number
    sensitivity?: string
    evidence?: string
  }) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_PROFILE_UPSERT, request),

  deleteMemoryProfile: (request: { id: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_PROFILE_DELETE, request),

  getMemoryProfileAudit: (request: { id: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_PROFILE_AUDIT, request),

  exportMemoryProfile: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_PROFILE_EXPORT),

  saveMemoryCapture: (request?: { id?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_CAPTURE_SAVE, request),

  discardMemoryCapture: (request?: { id?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_CAPTURE_DISCARD, request),

  listSchedulerTasks: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_LIST),

  getSchedulerTask: (request: { id: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_GET, request),

  runSchedulerTaskNow: (request: { id: string; force?: boolean }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_RUN_NOW, request),

  setSchedulerTaskEnabled: (request: { id: string; enabled: boolean }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_SET_ENABLED, request),

  // ── App State (restore on startup) ─────────────
  getAppState: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_APP_STATE),

  saveUIState: (uiState: {
    openTabs?: Array<{ type: string; sessionId?: string; filePath?: string; title?: string }>
    activeTabIndex?: number
    sidebarCollapsed?: boolean
  }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_UI_STATE, uiState),

  // ── Search Everywhere ──────────────────────────
  toggleSearchWindow: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SEARCH_WINDOW_TOGGLE),

  closeSearchWindow: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SEARCH_WINDOW_CLOSE),

  onSearchWindowShown: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on(IPC_CHANNELS.SEARCH_WINDOW_SHOWN, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SEARCH_WINDOW_SHOWN, listener)
  },

  searchQuery: (req: { query: string; category: string; limit?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SEARCH_QUERY, req),

  searchExecuteAction: (actionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SEARCH_EXECUTE_ACTION, actionId),

  onSearchAction: (callback: (actionId: string) => void) => {
    const listener = (_event: any, actionId: string) => callback(actionId)
    ipcRenderer.on('search:action', listener)
    return () => ipcRenderer.removeListener('search:action', listener)
  },

  // Todo / Plan
  getTodoPlan: (request?: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_GET, request),

  createTodoPlanNote: (request: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_CREATE, request),

  updateTodoPlan: (request: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_UPDATE, request),

  renameTodoPlanNote: (request: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_RENAME, request),

  deleteTodoPlanNote: (request: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_DELETE, request),

  revealTodoPlanDirectory: () =>
    ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_REVEAL_DIRECTORY),

  openTodoPlanWindow: (request?: TodoPlanWindowActionRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_OPEN_WINDOW, request),

  hideTodoPlanWindow: (request?: TodoPlanWindowActionRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_HIDE_WINDOW, request),

  toggleTodoPlanWindow: (request?: TodoPlanWindowActionRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_TOGGLE_WINDOW, request),

  setTodoPlanWindowPinned: (pinned: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.TODO_PLAN_SET_WINDOW_PINNED, { pinned }),

  onTodoPlanChanged: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.TODO_PLAN_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TODO_PLAN_CHANGED, listener)
  },

}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
