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
  EmbeddingModelInfo,
  OpenRouterModel,
  ColorTheme,
  BaseTheme,
  MessageListDensity,
  KeyboardShortcut,
  ShortcutSettings,
  ChatSettings,
  EmbeddingSettings,
  EmbeddingProviderType,
  EmbeddingProviderMeta,
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
  // Memory types
  MemoryFileInfo,
  TagInfo,
  MemoryStats,
  BatchDeleteResult,
  ImportResult,
  ExportOptions,
  ParsedMemoryFile,
  // UIMessage types (AI SDK 5.x compatible)
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
  // Workspace types
  Workspace,
  WorkspaceAvatar,
  GetWorkspacesResponse,
  CreateWorkspaceResponse,
  UpdateWorkspaceResponse,
  DeleteWorkspaceResponse,
  SwitchWorkspaceResponse,
  UploadWorkspaceAvatarResponse,
  // Shared Agent types (Avatar, Voice, Builtin Mode)
  AgentAvatar,
  AgentVoice,
  Agent, // @deprecated - use CustomAgent instead
  BuiltinAgentMode,
  BuiltinAgent,
  BuiltinAgentToolPermissions,
  // User Profile types
  UserProfile,
  UserFact,
  UserFactCategory,
  GetUserProfileResponse,
  AddUserFactResponse,
  UpdateUserFactResponse,
  DeleteUserFactResponse,
  // Agent Memory types
  AgentMemory,
  AgentMemoryCategory,
  AgentUserRelationship,
  AgentMood,
  MemoryVividness,
  GetAgentRelationshipResponse,
  AddAgentMemoryResponse,
  DeleteAgentMemoryResponse,
  RecallAgentMemoryResponse,
  GetActiveMemoriesResponse,
  UpdateAgentRelationshipResponse,
  RecordInteractionResponse,
  // Permission types
  PermissionInfo,
  PermissionResponse,
  // Plan types (Planning workflow)
  PlanItemStatus,
  PlanItem,
  SessionPlan,
  // Theme types
  ThemeMeta,
  Theme,
  GetThemesResponse,
  GetThemeResponse,
  ApplyThemeResponse,
  RefreshThemesResponse,
  // CustomAgent types
  CustomAgent,
  CustomAgentConfig,
  CustomAgentSource,
  CustomToolDefinition,
  CustomToolParameter,
  CustomToolParameterType,
  CustomToolExecution,
  BashExecution,
  HttpExecution,
  BuiltinExecution,
  CustomToolResult,
  CustomAgentStep,
  CustomAgentResult,
  GetCustomAgentsResponse,
  CreateCustomAgentResponse,
  UpdateCustomAgentResponse,
  DeleteCustomAgentResponse,
  PinCustomAgentResponse,
  UnpinCustomAgentResponse,
  // File Tree types (for right sidebar)
  FileTreeNode,
  FileTreeListRequest,
  FileTreeListResponse,
  ExtractedDocument,
  // File Preview types
  FilePreview,
  FileReadRequest,
  FileReadResponse,
  // Memory types for manager
  MemoryFileMetadata,
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
  EmbeddingModelInfo,
  OpenRouterModel,
  ColorTheme,
  BaseTheme,
  MessageListDensity,
  KeyboardShortcut,
  ShortcutSettings,
  ChatSettings,
  EmbeddingSettings,
  EmbeddingProviderType,
  EmbeddingProviderMeta,
  MessageAttachment,
  AttachmentMediaType,
  ToolDefinition,
  ToolCall,
  ToolSettings,
  BashToolSettings,
  ContentPart,
  Step,
  StepType,
  // UIMessage types (AI SDK 5.x compatible)
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
  // Workspace types
  Workspace,
  WorkspaceAvatar,
  // Shared Agent types (Avatar, Voice, Builtin Mode)
  AgentAvatar,
  AgentVoice,
  Agent, // @deprecated - use CustomAgent instead
  BuiltinAgentMode,
  BuiltinAgent,
  BuiltinAgentToolPermissions,
  // User Profile types
  UserProfile,
  UserFact,
  UserFactCategory,
  // Agent Memory types
  AgentMemory,
  AgentMemoryCategory,
  AgentUserRelationship,
  AgentMood,
  MemoryVividness,
  // Permission types
  PermissionInfo,
  PermissionResponse,
  // Plan types (Planning workflow)
  PlanItemStatus,
  PlanItem,
  SessionPlan,
  // Theme types
  ThemeMeta,
  Theme,
  // CustomAgent types
  CustomAgent,
  CustomAgentConfig,
  CustomAgentSource,
  CustomToolDefinition,
  CustomToolParameter,
  CustomToolParameterType,
  CustomToolExecution,
  BashExecution,
  HttpExecution,
  BuiltinExecution,
  CustomToolResult,
  CustomAgentStep,
  CustomAgentResult,
  // File Tree types (for right sidebar)
  FileTreeNode,
  FileTreeListRequest,
  FileTreeListResponse,
  ExtractedDocument,
  // File Preview types
  FilePreview,
  FileReadRequest,
  FileReadResponse,
  // Memory types
  MemoryFileInfo,
  TagInfo,
  MemoryStats,
  BatchDeleteResult,
  ImportResult,
  ExportOptions,
  ParsedMemoryFile,
  MemoryFileMetadata,
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
  // UIMessage stream (AI SDK 5.x compatible)
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
  updateSessionAgent: (sessionId: string, agentId: string | null) => Promise<{ success: boolean; error?: string }>
  updateSessionWorkingDirectory: (sessionId: string, workingDirectory: string | null) => Promise<{ success: boolean; error?: string }>
  getSessionTokenUsage: (sessionId: string) => Promise<{ success: boolean; usage?: { totalInputTokens: number; totalOutputTokens: number; totalTokens: number; maxTokens: number; lastInputTokens: number; contextSize: number }; error?: string }>
  // Builtin mode (Ask/Build) methods
  setSessionBuiltinMode: (sessionId: string, mode: BuiltinAgentMode) => Promise<{ success: boolean; mode?: BuiltinAgentMode; error?: string }>
  getSessionBuiltinMode: (sessionId: string) => Promise<{ success: boolean; mode?: BuiltinAgentMode; error?: string }>
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
  // Plan update listener (for Planning workflow)
  onPlanUpdated: (callback: (data: { sessionId: string; plan: SessionPlan }) => void) => () => void
  onContextSizeUpdated: (callback: (data: { sessionId: string; contextSize: number }) => void) => () => void
  onContextCompactStarted: (callback: (data: { sessionId: string }) => void) => () => void
  onContextCompactCompleted: (callback: (data: { sessionId: string; success: boolean; error?: string }) => void) => () => void
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
  // Embedding models (from Models.dev registry)
  getEmbeddingModels: (providerId: string) => Promise<{ success: boolean; models?: EmbeddingModelInfo[]; error?: string }>
  getAllEmbeddingModels: () => Promise<{ success: boolean; models?: EmbeddingModelInfo[]; error?: string }>
  getEmbeddingDimension: (modelId: string) => Promise<{ success: boolean; dimension?: number | null; error?: string }>
  // Tools methods
  getTools: () => Promise<GetToolsResponse>
  executeTool: (toolId: string, args: Record<string, any>, messageId: string, sessionId: string) => Promise<ExecuteToolResponse>
  cancelTool: (toolCallId: string) => Promise<{ success: boolean }>
  updateToolCall: (sessionId: string, messageId: string, toolCallId: string, updates: Partial<ToolCall>) => Promise<{ success: boolean }>
  updateContentParts: (sessionId: string, messageId: string, contentParts: ContentPart[]) => Promise<{ success: boolean }>
  abortStream: (sessionId?: string) => Promise<{ success: boolean }>
  getActiveStreams: () => Promise<{ success: boolean; streams?: string[] }>
  resumeAfterToolConfirm: (sessionId: string, messageId: string) => Promise<{ success: boolean; error?: string }>

  // Permission methods
  respondToPermission: (request: { sessionId: string; permissionId: string; response: 'once' | 'session' | 'workspace' | 'reject' | 'always'; rejectReason?: string }) => Promise<{ success: boolean; error?: string }>
  clearSessionPermissions: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  getPendingPermissions: (sessionId: string) => Promise<{ success: boolean; pending?: PermissionInfo[]; error?: string }>
  onPermissionRequest: (callback: (info: PermissionInfo) => void) => () => void

  // CustomAgent permission methods
  respondToCustomAgentPermission: (requestId: string, decision: 'allow' | 'always' | 'reject') => Promise<{ success: boolean }>
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
  }) => void) => () => void

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

  // Workspace methods
  getWorkspaces: () => Promise<GetWorkspacesResponse>
  createWorkspace: (name: string, avatar: WorkspaceAvatar, workingDirectory: string | undefined, systemPrompt: string) => Promise<CreateWorkspaceResponse>
  updateWorkspace: (id: string, updates: { name?: string; avatar?: WorkspaceAvatar; systemPrompt?: string }) => Promise<UpdateWorkspaceResponse>
  deleteWorkspace: (workspaceId: string) => Promise<DeleteWorkspaceResponse>
  switchWorkspace: (workspaceId: string | null) => Promise<SwitchWorkspaceResponse>
  uploadWorkspaceAvatar: (workspaceId: string, imageData: string, mimeType: string) => Promise<UploadWorkspaceAvatarResponse>

  // User Profile methods
  getUserProfile: () => Promise<GetUserProfileResponse>
  addUserFact: (content: string, category: UserFactCategory, confidence?: number, sourceAgentId?: string) => Promise<AddUserFactResponse>
  updateUserFact: (factId: string, updates: { content?: string; category?: UserFactCategory; confidence?: number }) => Promise<UpdateUserFactResponse>
  deleteUserFact: (factId: string) => Promise<DeleteUserFactResponse>

  // Agent Memory methods
  getAgentRelationship: (agentId: string) => Promise<GetAgentRelationshipResponse>
  addAgentMemory: (agentId: string, content: string, category: AgentMemoryCategory, emotionalWeight?: number) => Promise<AddAgentMemoryResponse>
  deleteAgentMemory: (memoryId: string) => Promise<DeleteAgentMemoryResponse>
  recallAgentMemory: (agentId: string, memoryId: string) => Promise<RecallAgentMemoryResponse>
  getActiveAgentMemories: (agentId: string, limit?: number) => Promise<GetActiveMemoriesResponse>
  updateAgentRelationship: (agentId: string, updates: { trustLevel?: number; familiarity?: number; mood?: AgentMood; moodNotes?: string }) => Promise<UpdateAgentRelationshipResponse>
  recordAgentInteraction: (agentId: string) => Promise<RecordInteractionResponse>

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

  // CustomAgent methods
  getCustomAgents: (workingDirectory?: string) => Promise<GetCustomAgentsResponse>
  refreshCustomAgents: (workingDirectory?: string) => Promise<GetCustomAgentsResponse>
  openCustomAgentsDirectory: () => Promise<{ success: boolean; error?: string }>
  getCustomAgent: (agentId: string, workingDirectory?: string) => Promise<{ success: boolean; agent?: CustomAgent; error?: string }>
  createCustomAgent: (config: Omit<CustomAgentConfig, 'id' | 'createdAt' | 'updatedAt'>, source?: 'user' | 'project', workingDirectory?: string) => Promise<CreateCustomAgentResponse>
  updateCustomAgent: (agentId: string, updates: Partial<Omit<CustomAgentConfig, 'id' | 'createdAt' | 'updatedAt'>>, workingDirectory?: string) => Promise<UpdateCustomAgentResponse>
  deleteCustomAgent: (agentId: string, workingDirectory?: string) => Promise<DeleteCustomAgentResponse>
  // CustomAgent pin methods
  pinCustomAgent: (agentId: string) => Promise<PinCustomAgentResponse>
  unpinCustomAgent: (agentId: string) => Promise<UnpinCustomAgentResponse>

  // Tools methods (additional)
  getAvailableBuiltinTools: () => Promise<Array<{ id: string; name: string; description: string }>>
  refreshAsyncTools: (workingDirectory?: string) => Promise<{ success: boolean; error?: string }>

  // Window methods
  setWindowButtonVisibility: (visible: boolean) => Promise<{ success: boolean }>

  // Memory Feedback methods
  recordMemoryFeedback: (filePath: string, feedbackType: 'positive' | 'negative') => Promise<{ success: boolean; error?: string }>
  getMemoryFeedbackStats: (filePath: string) => Promise<{ success: boolean; stats?: { positive: number; negative: number }; error?: string }>

  // Memory Management methods
  memoryListFiles: () => Promise<{ success: boolean; files?: MemoryFileInfo[]; error?: string }>
  memoryGetFile: (path: string) => Promise<{ success: boolean; file?: ParsedMemoryFile; error?: string }>
  memoryUpdateFile: (path: string, content: string, metadata?: Partial<MemoryFileMetadata>) => Promise<{ success: boolean; error?: string }>
  memoryDeleteFile: (path: string) => Promise<{ success: boolean; error?: string }>
  memoryDeleteFiles: (paths: string[]) => Promise<{ success: boolean; result?: BatchDeleteResult; error?: string }>
  memoryExport: (options: ExportOptions) => Promise<{ success: boolean; filePath?: string; error?: string }>
  memoryExportWithDialog: (options: ExportOptions) => Promise<{ success: boolean; filePath?: string | null; error?: string }>
  memoryImport: (filePath: string) => Promise<{ success: boolean; result?: ImportResult; error?: string }>
  memoryImportWithDialog: () => Promise<{ success: boolean; result?: ImportResult | null; error?: string }>
  memoryGetTags: () => Promise<{ success: boolean; tags?: TagInfo[]; error?: string }>
  memoryRenameTag: (oldTag: string, newTag: string) => Promise<{ success: boolean; affected?: number; error?: string }>
  memoryDeleteTag: (tag: string) => Promise<{ success: boolean; affected?: number; error?: string }>
  memoryGetStats: () => Promise<{ success: boolean; stats?: MemoryStats; error?: string }>
  memoryRebuildIndex: () => Promise<{ success: boolean; error?: string }>

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

  // Update methods (auto-update functionality)
  checkForUpdate: () => Promise<{ success: boolean; available: boolean; updateInfo?: { version: string; releaseDate: string; releaseNotes?: string | null; releaseName?: string | null }; error?: string }>
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>
  installUpdate: () => Promise<{ success: boolean; error?: string }>
  getUpdateStatus: () => Promise<{ success: boolean; available: boolean; downloaded: boolean; updateInfo?: { version: string; releaseDate: string; releaseNotes?: string | null; releaseName?: string | null } }>
  onUpdateAvailable: (callback: (info: { version: string; releaseDate: string; releaseNotes?: string | null; releaseName?: string | null }) => void) => () => void
  onUpdateNotAvailable: (callback: () => void) => () => void
  onUpdateProgress: (callback: (progress: { bytesPerSecond: number; percent: number; transferred: number; total: number }) => void) => () => void
  onUpdateDownloaded: (callback: (info: { version: string; releaseDate: string; releaseNotes?: string | null; releaseName?: string | null }) => void) => () => void
  onUpdateError: (callback: (data: { error: string }) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
