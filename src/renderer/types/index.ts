import type {
  ChatMessage,
  ChatSession,
  SessionMeta,
  SessionDetails,
  CachedProviderConfig,
  GetSessionsListResponse,
  ActivateSessionResponse,
  GetSessionMessagesResponse,
  AISettings,
  AppSettings,
  AIProvider,
  ProviderConfig,
  CustomProviderConfig,
  ProviderInfo,
  ModelInfo,
  OpenRouterModel,
  ColorTheme,
  BaseTheme,
  MessageListDensity,
  KeyboardShortcut,
  ShortcutSettings,
  ChatSettings,
  MessageAttachment,
  AttachmentMediaType,
  SendMessageResponse,
  EditAndResendResponse,
  GetChatHistoryResponse,
  GetSessionsResponse,
  CreateSessionResponse,
  SwitchSessionResponse,
  DeleteSessionResponse,
  RenameSessionResponse,
  CreateBranchResponse,
  UpdateSessionPinResponse,
  GetSettingsResponse,
  SaveSettingsResponse,
  GenerateTitleResponse,
  FetchModelsResponse,
  GetCachedModelsResponse,
  GetProvidersResponse,
  ToolDefinition,
  ToolCall,
  ToolSettings,
  BashToolSettings,
  GetToolsResponse,
  ExecuteToolResponse,
  ContentPart,
  Step,
  StepType,
  // UIMessage types (AI SDK 6.x compatible)
  UIMessage,
  UIMessagePart,
  TextUIPart,
  ReasoningUIPart,
  ToolUIPart,
  ToolUIState,
  FileUIPart,
  StepUIPart,
  ErrorUIPart,
  MessageMetadata,
  UIMessageChunk,
  UIMessageStreamData,
  // MCP types
  MCPServerConfig,
  MCPServerState,
  MCPToolInfo,
  MCPResourceInfo,
  MCPPromptInfo,
  MCPSettings,
  MCPGetServersResponse,
  MCPAddServerResponse,
  MCPUpdateServerResponse,
  MCPRemoveServerResponse,
  MCPConnectServerResponse,
  MCPDisconnectServerResponse,
  MCPRefreshServerResponse,
  MCPGetToolsResponse,
  MCPCallToolResponse,
  MCPGetResourcesResponse,
  MCPReadResourceResponse,
  MCPGetPromptsResponse,
  MCPGetPromptResponse,
  MCPReadConfigFileResponse,
  // Skills types (Official Claude Code Skills)
  SkillDefinition,
  SkillFile,
  SkillSource,
  SkillSettings,
  GetSkillsResponse,
  RefreshSkillsResponse,
  ReadSkillFileResponse,
  OpenSkillDirectoryResponse,
  CreateSkillResponse,
  // Builtin Mode (Ask/Build)

  // Permission types
  PermissionInfo,
  PermissionResponse,
  // Theme types
  ThemeMeta,
  Theme,
  GetThemesResponse,
  GetThemeResponse,
  ApplyThemeResponse,
  RefreshThemesResponse,
  // File Tree types (for right sidebar)
  FileTreeNode,
  FileTreeListRequest,
  FileTreeListResponse,
  ExtractedDocument,
  // File Preview types
  FilePreview,
  FileReadRequest,
  FileReadResponse,
} from '../../shared/ipc'

export type {
  ChatMessage,
  ChatSession,
  SessionMeta,
  SessionDetails,
  CachedProviderConfig,
  GetSessionsListResponse,
  ActivateSessionResponse,
  GetSessionMessagesResponse,
  AISettings,
  AppSettings,
  AIProvider,
  ProviderConfig,
  CustomProviderConfig,
  ProviderInfo,
  ModelInfo,
  OpenRouterModel,
  ColorTheme,
  BaseTheme,
  MessageListDensity,
  KeyboardShortcut,
  ShortcutSettings,
  ChatSettings,
  MessageAttachment,
  AttachmentMediaType,
  ToolDefinition,
  ToolCall,
  ToolSettings,
  BashToolSettings,
  ContentPart,
  Step,
  StepType,
  // UIMessage types (AI SDK 6.x compatible)
  UIMessage,
  UIMessagePart,
  TextUIPart,
  ReasoningUIPart,
  ToolUIPart,
  ToolUIState,
  FileUIPart,
  StepUIPart,
  ErrorUIPart,
  MessageMetadata,
  UIMessageChunk,
  UIMessageStreamData,
  // MCP types
  MCPServerConfig,
  MCPServerState,
  MCPToolInfo,
  MCPResourceInfo,
  MCPPromptInfo,
  MCPSettings,
  // Skills types (Official Claude Code Skills)
  SkillDefinition,
  SkillFile,
  SkillSource,
  SkillSettings,
  // Builtin Mode (Ask/Build)

  // Permission types
  PermissionInfo,
  PermissionResponse,
  // Theme types
  ThemeMeta,
  Theme,
  // File Tree types (for right sidebar)
  FileTreeNode,
  FileTreeListRequest,
  FileTreeListResponse,
  ExtractedDocument,
  // File Preview types
  FilePreview,
  FileReadRequest,
  FileReadResponse,
}

// Gallery image type for image preview window
export interface GalleryImage {
  id: string
  src: string        // Full image URL or data URL
  alt?: string       // Image description/title
  thumbnail?: string // Optional thumbnail URL
}

// Streaming response types
export interface StreamSendMessageResponse {
  success: boolean
  userMessage?: ChatMessage
  messageId?: string  // ID of the assistant message being streamed
  assistantMessageId?: string  // Alias for messageId (backward compatibility)
  sessionName?: string
  error?: string
  errorDetails?: string
}

export interface ElectronAPI {
  sendMessage: (sessionId: string, message: string, attachments?: MessageAttachment[]) => Promise<SendMessageResponse>
  sendMessageStream: (sessionId: string, message: string, attachments?: MessageAttachment[]) => Promise<StreamSendMessageResponse>
  onStreamChunk: (callback: (chunk: {
    type: 'text' | 'reasoning' | 'tool_call' | 'tool_result' | 'continuation' | 'replace' | 'tool_input_start' | 'tool_input_delta' | 'content_part'
    content: string
    messageId: string
    sessionId?: string
    reasoning?: string
    toolCall?: ToolCall
    replace?: boolean
    // For streaming tool input (AI SDK v6)
    toolCallId?: string
    toolName?: string
    argsTextDelta?: string
    // For content_part chunks (interleaved text and steps)
    contentPart?: ContentPart
  }) => void) => () => void
  onStreamReasoningDelta: (callback: (data: { messageId: string; delta: string }) => void) => () => void
  onStreamTextDelta: (callback: (data: { messageId: string; delta: string }) => void) => () => void
  onStreamComplete: (callback: (data: { messageId: string; text: string; reasoning?: string; sessionId?: string; sessionName?: string }) => void) => () => void
  onStreamError: (callback: (data: { messageId?: string; sessionId?: string; error: string; errorDetails?: string }) => void) => () => void
  onSkillActivated: (callback: (data: { sessionId: string; messageId: string; skillName: string }) => void) => () => void
  onStepAdded: (callback: (data: { sessionId: string; messageId: string; step: any }) => void) => () => void
  onStepUpdated: (callback: (data: { sessionId: string; messageId: string; stepId: string; updates: any }) => void) => () => void
  onImageGenerated: (callback: (data: { id: string; url?: string; base64?: string; prompt: string; revisedPrompt?: string; model: string; sessionId: string; messageId: string; createdAt: number }) => void) => () => void
  // UIMessage stream (AI SDK 6.x compatible)
  onUIMessageStream: (callback: (data: UIMessageStreamData) => void) => () => void
  getChatHistory: (sessionId: string) => Promise<GetChatHistoryResponse>
  generateTitle: (message: string) => Promise<GenerateTitleResponse>
  editAndResend: (sessionId: string, messageId: string, newContent: string) => Promise<EditAndResendResponse>
  editAndResendStream: (sessionId: string, messageId: string, newContent: string) => Promise<StreamSendMessageResponse>
  getSessions: () => Promise<GetSessionsResponse>
  createSession: (name: string, workspaceId?: string, agentId?: string) => Promise<CreateSessionResponse>
  switchSession: (sessionId: string) => Promise<SwitchSessionResponse>
  getSession: (sessionId: string) => Promise<SwitchSessionResponse>
  deleteSession: (sessionId: string) => Promise<DeleteSessionResponse>
  renameSession: (sessionId: string, newName: string) => Promise<RenameSessionResponse>
  createBranch: (parentSessionId: string, branchFromMessageId: string) => Promise<CreateBranchResponse>
  updateSessionPin: (sessionId: string, isPinned: boolean) => Promise<UpdateSessionPinResponse>
  updateSessionModel: (sessionId: string, provider: string, model: string) => Promise<{ success: boolean; error?: string }>
  updateSessionArchived: (sessionId: string, isArchived: boolean, archivedAt?: number | null) => Promise<{ success: boolean; error?: string }>
  updateSessionWorkingDirectory: (sessionId: string, workingDirectory: string | null) => Promise<{ success: boolean; error?: string }>
  // Optimized session loading (Phase 4: Metadata Separation)
  getSessionsList: () => Promise<GetSessionsListResponse>
  activateSession: (sessionId: string) => Promise<ActivateSessionResponse>
  getSessionMessages: (sessionId: string) => Promise<GetSessionMessagesResponse>
  onSessionMessagesChanged: (callback: (data: { sessionId: string; action: 'added' | 'updated' | 'deleted'; messageId?: string }) => void) => () => void
  // System message methods (for /files command persistence)
  addSystemMessage: (sessionId: string, message: { id: string; role: string; content: string; timestamp: number }) => Promise<{ success: boolean; error?: string }>
  removeFilesChangedMessage: (sessionId: string) => Promise<{ success: boolean; removedId?: string | null; error?: string }>
  removeGitStatusMessage: (sessionId: string) => Promise<{ success: boolean; removedId?: string | null; error?: string }>
  // Generic remove message by ID (for close button functionality)
  removeMessage: (sessionId: string, messageId: string) => Promise<{ success: boolean; error?: string }>
  updateSessionMaxTokens: (sessionId: string, maxTokens: number) => Promise<{ success: boolean; error?: string }>
  getSettings: () => Promise<GetSettingsResponse>
  saveSettings: (settings: AppSettings) => Promise<SaveSettingsResponse>
  openSettingsWindow: () => Promise<{ success: boolean }>
  onSettingsChanged: (callback: (settings: AppSettings) => void) => () => void
  getSystemTheme: () => Promise<{ success: boolean; theme?: 'light' | 'dark' }>
  onSystemThemeChanged: (callback: (theme: 'light' | 'dark') => void) => () => void
  // Theme methods
  getThemes: () => Promise<GetThemesResponse>
  getTheme: (themeId: string) => Promise<GetThemeResponse>
  applyTheme: (themeId: string, mode: 'dark' | 'light') => Promise<ApplyThemeResponse>
  refreshThemes: (projectPath?: string) => Promise<RefreshThemesResponse>
  openThemesFolder: () => Promise<{ success: boolean; error?: string }>
  fetchModels: (
    provider: AIProvider,
    apiKey: string,
    baseUrl?: string,
    forceRefresh?: boolean
  ) => Promise<FetchModelsResponse>
  getCachedModels: (provider: AIProvider) => Promise<GetCachedModelsResponse>
  getProviders: () => Promise<GetProvidersResponse>
  // New OpenRouter-based model API
  getModelsWithCapabilities: (providerId: string) => Promise<{ success: boolean; models?: OpenRouterModel[]; error?: string }>
  getAllModels: () => Promise<{ success: boolean; models?: OpenRouterModel[]; error?: string }>
  searchModels: (query: string, providerId?: string) => Promise<{ success: boolean; models?: OpenRouterModel[]; error?: string }>
  refreshModelRegistry: () => Promise<{ success: boolean; error?: string }>
  getModelNameAliases: () => Promise<{ success: boolean; aliases?: Record<string, string>; error?: string }>
  getModelDisplayName: (modelId: string) => Promise<{ success: boolean; displayName?: string; error?: string }>
  // Tools methods
  getTools: () => Promise<GetToolsResponse>
  executeTool: (toolId: string, args: Record<string, any>, messageId: string, sessionId: string) => Promise<ExecuteToolResponse>
  cancelTool: (toolCallId: string) => Promise<{ success: boolean }>
  updateToolCall: (sessionId: string, messageId: string, toolCallId: string, updates: Partial<ToolCall>) => Promise<{ success: boolean }>
  updateContentParts: (sessionId: string, messageId: string, contentParts: ContentPart[]) => Promise<{ success: boolean }>
  // Unified event-driven channels (Phase 4)
  onSessionEvent: (callback: (envelope: any) => void) => () => void
  onSessionStream: (callback: (data: { sessionId: string; chunk: any }) => void) => () => void
  emitCommand: (sessionId: string, command: any) => Promise<{ success: boolean; error?: string }>

  // Legacy streaming control
  abortStream: (sessionId?: string) => Promise<{ success: boolean }>
  getActiveStreams: () => Promise<{ success: boolean; streams?: string[] }>
  resumeAfterToolConfirm: (sessionId: string, messageId: string) => Promise<{ success: boolean; error?: string }>

  // Permission methods
  /** @deprecated Use emitCommand with command:permission-respond instead */
  respondToPermission: (request: { sessionId: string; permissionId: string; response: 'once' | 'session' | 'workspace' | 'reject' | 'always'; rejectReason?: string }) => Promise<{ success: boolean; error?: string }>
  clearSessionPermissions: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  getPendingPermissions: (sessionId: string) => Promise<{ success: boolean; pending?: PermissionInfo[]; error?: string }>

  // MCP methods
  mcpGetServers: () => Promise<MCPGetServersResponse>
  mcpAddServer: (config: MCPServerConfig) => Promise<MCPAddServerResponse>
  mcpUpdateServer: (config: MCPServerConfig) => Promise<MCPUpdateServerResponse>
  mcpRemoveServer: (serverId: string) => Promise<MCPRemoveServerResponse>
  mcpConnectServer: (serverId: string) => Promise<MCPConnectServerResponse>
  mcpDisconnectServer: (serverId: string) => Promise<MCPDisconnectServerResponse>
  mcpRefreshServer: (serverId: string) => Promise<MCPRefreshServerResponse>
  mcpGetTools: () => Promise<MCPGetToolsResponse>
  mcpCallTool: (serverId: string, toolName: string, args: Record<string, any>) => Promise<MCPCallToolResponse>
  mcpGetResources: () => Promise<MCPGetResourcesResponse>
  mcpReadResource: (serverId: string, uri: string) => Promise<MCPReadResourceResponse>
  mcpGetPrompts: () => Promise<MCPGetPromptsResponse>
  mcpGetPrompt: (serverId: string, name: string, args?: Record<string, string>) => Promise<MCPGetPromptResponse>
  mcpReadConfigFile: (filePath: string) => Promise<MCPReadConfigFileResponse>

  // Skills methods (Official Claude Code Skills)
  getSkills: () => Promise<GetSkillsResponse>
  refreshSkills: () => Promise<RefreshSkillsResponse>
  readSkillFile: (skillId: string, fileName: string) => Promise<ReadSkillFileResponse>
  openSkillDirectory: (skillId?: string) => Promise<OpenSkillDirectoryResponse>
  createSkill: (name: string, description: string, instructions: string, source: SkillSource) => Promise<CreateSkillResponse>
  deleteSkill: (skillId: string) => Promise<{ success: boolean; error?: string }>
  toggleSkillEnabled: (skillId: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>

  // Message update methods
  updateMessageThinkingTime: (sessionId: string, messageId: string, thinkingTime: number) => Promise<{ success: boolean }>

  // Dialog methods
  showOpenDialog: (options: { properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>; title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<{ canceled: boolean; filePaths: string[] }>


  // Shell methods
  openPath: (filePath: string) => Promise<string>
  getDataPath: () => Promise<string>

  // Media methods
  saveImage: (data: { url?: string; base64?: string; prompt: string; revisedPrompt?: string; model: string; sessionId: string; messageId: string }) => Promise<{ id: string; type: 'image'; filePath: string; prompt: string; revisedPrompt?: string; model: string; createdAt: number; sessionId: string; messageId: string }>
  loadAllMedia: () => Promise<{ id: string; type: 'image'; filePath: string; prompt: string; revisedPrompt?: string; model: string; createdAt: number; sessionId: string; messageId: string }[]>
  deleteMedia: (id: string) => Promise<boolean>
  clearAllMedia: () => Promise<void>
  readImageBase64: (filePath: string) => Promise<string>

  // Image preview methods
  openImagePreview: (src: string, alt?: string) => Promise<{ success: boolean }>
  openImageGallery: (mediaId: string) => Promise<{ success: boolean }>
  onImagePreviewUpdate: (callback: (data: { src: string; alt?: string }) => void) => () => void

  // OAuth methods
  oauthStart: (providerId: string) => Promise<{
    success: boolean
    error?: string
    // For device flow (GitHub Copilot)
    userCode?: string
    verificationUri?: string
    deviceCode?: string
    // For manual code entry flow (Claude Code)
    requiresCodeEntry?: boolean
    state?: string
    instructions?: string
  }>
  oauthCallback: (providerId: string, code: string, state: string) => Promise<{
    success: boolean
    error?: string
  }>
  oauthLogout: (providerId: string) => Promise<{ success: boolean; error?: string }>
  oauthGetStatus: (providerId: string) => Promise<{
    success: boolean
    isLoggedIn: boolean
    expiresAt?: number
    error?: string
  }>
  oauthDevicePoll: (providerId: string, deviceCode: string) => Promise<{
    success: boolean
    completed?: boolean
    error?: string
  }>
  oauthRefresh: (providerId: string) => Promise<{ success: boolean; error?: string }>
  oauthTestDirect: (providerId: string) => Promise<{ success: boolean; error?: string; response?: any }>
  onOAuthTokenRefreshed: (callback: (data: { providerId: string }) => void) => () => void
  onOAuthTokenExpired: (callback: (data: { providerId: string; error?: string }) => void) => () => void

  // Menu event listeners
  onMenuNewChat: (callback: () => void) => () => void
  onMenuCloseChat: (callback: () => void) => () => void

  // Files methods (for @ file search)
  listFiles: (options: { cwd: string; query?: string; limit?: number }) => Promise<{ success: boolean; files: string[]; error?: string }>

  // File rollback (for /files command)
  rollbackFile: (options: { filePath: string; originalContent: string; isNew: boolean }) => Promise<{ success: boolean; error?: string }>

  // Directories listing (for /cd path completion)
  listDirs: (options: { basePath: string; query?: string; limit?: number }) => Promise<{ success: boolean; dirs: string[]; basePath: string; error?: string }>

  // File tree methods (for right sidebar file browser)
  fileTreeList: (options: FileTreeListRequest) => Promise<FileTreeListResponse>

  // File content reading (for file preview panel)
  readFileContent: (filePath: string, maxSize?: number) => Promise<FileReadResponse>

  // Tools methods (additional)
  getAvailableBuiltinTools: () => Promise<Array<{ id: string; name: string; description: string }>>
  refreshAsyncTools: (workingDirectory?: string) => Promise<{ success: boolean; error?: string }>

  // Window methods
  setWindowButtonVisibility: (visible: boolean) => Promise<{ success: boolean }>

  // Execute skill method (note: may not be fully implemented)
  executeSkill: (skillId: string, options: { sessionId: string; input?: string }) => Promise<{ success: boolean; result?: { output?: string }; error?: string }>

  // Plugin methods
  getPlugins: () => Promise<{ success: boolean; plugins?: any[]; error?: string }>
  getPlugin: (pluginId: string) => Promise<{ success: boolean; plugin?: any; error?: string }>
  installPlugin: (request: { source: string; type?: string }) => Promise<{ success: boolean; plugin?: any; error?: string }>
  uninstallPlugin: (pluginId: string) => Promise<{ success: boolean; error?: string }>
  enablePlugin: (pluginId: string) => Promise<{ success: boolean; error?: string }>
  disablePlugin: (pluginId: string) => Promise<{ success: boolean; error?: string }>
  reloadPlugin: (pluginId: string) => Promise<{ success: boolean; error?: string }>
  updatePluginConfig: (request: { pluginId: string; config: Record<string, unknown> }) => Promise<{ success: boolean; error?: string }>
  getPluginDirectories: () => Promise<{ success: boolean; directories?: { plugins: string; npm: string; local: string }; error?: string }>
  openPluginDirectory: (dirType: 'plugins' | 'npm' | 'local') => Promise<{ success: boolean; error?: string }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
