import type {
  ChatMessage,
  ChatSession,
  ContextVariable,
  AgentDefinition,
  AgentsListResponse,
  AgentCreateResponse,
  AgentUpdateResponse,
  AgentDeleteResponse,
  UserPrompt,
  PromptReferenceSnapshot,
  PromptListResponse,
  PromptGetResponse,
  PromptCreateRequest,
  PromptCreateResponse,
  PromptUpdateRequest,
  PromptUpdateResponse,
  PromptDeleteRequest,
  PromptDeleteResponse,
  SessionMeta,
  SessionDetails,
  GetSessionsListResponse,
  ActivateSessionResponse,
  GetSessionMessagesResponse,
  GetSessionMessagesPageRequest,
  GetSessionMessagesPageResponse,
  UserMessageMarker,
  GetSessionUserMarkersResponse,
  AISettings,
  AppSettings,
  AIProvider,
  ProviderConfig,
  ModelCapabilityOverride,
  CustomProviderConfig,
  ProviderInfo,
  CodexProviderUsage,
  CodexUsageLimit,
  CodexUsageWindow,
  ProviderEnvStatus,
  GetProviderEnvStatusResponse,
  ProviderUsageResponse,
  ModelInfo,
  OpenRouterModel,
  ColorTheme,
  BaseTheme,
  MessageListDensity,
  TypographyDensity,
  KeyboardShortcut,
  ShortcutSettings,
  EditorSettings,
  ChatSettings,
  ProxySettings,
  NetworkSettings,
  VoiceEndpointingMode,
  VoiceEvent,
  VoiceLatencyMilestone,
  VoiceLatencyMilestoneName,
  VoiceRuntimeCommand,
  VoiceRuntimeState,
  VoiceSettings,
  VoiceStartRequest,
  VoiceStopRequest,
  VoiceSubmitUtteranceRequest,
  VoiceSubmitTranscriptRequest,
  VoiceSynthesizeRequest,
  VoiceTestASRRequest,
  VoiceTestTTSRequest,
  VoiceGetStateResponse,
  VoiceSubmitUtteranceResponse,
  VoiceSynthesizeResponse,
  VoiceTTSModel,
  VoiceTTSModelsResponse,
  MessageAttachment,
  AttachmentMediaType,
  MediaKind,
  MediaSource,
  MediaAsset,
  MediaAssetLink,
  MediaAssetMetadata,
  MediaQuery,
  MediaGalleryResponse,
  MediaRebuildResponse,
  MarkdownResolveAssetRequest,
  MarkdownResolveAssetResponse,
  MarkdownSaveAttachmentsRequest,
  MarkdownSaveAttachmentsResponse,
  GetChatHistoryResponse,
  GetSystemPromptSnapshotResponse,
  SystemPromptSnapshot,
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
  GetProvidersResponse,
  ToolDefinition,
  ToolCall,
  ToolResult,
  ToolPartialResult,
  ToolRenderKind,
  PermissionMode,
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
  PluginCommandInfo,
  GetPluginCommandsResponse,
  ExecutePluginCommandResponse,
  MemoryAppendRequest,
  MemoryAppendResponse,
  MemoryCaptureDecisionRequest,
  MemoryCaptureDecisionResponse,
  MemoryIndexResponse,
  MemoryOverviewResponse,
  MemoryProfileAuditRequest,
  MemoryProfileAuditResponse,
  MemoryProfileDeleteRequest,
  MemoryProfileDeleteResponse,
  MemoryProfileExportResponse,
  MemoryProfileListRequest,
  MemoryProfileListResponse,
  MemoryProfileUpsertRequest,
  MemoryProfileUpsertResponse,
  MemoryGraphAuditRequest,
  MemoryGraphAuditResponse,
  MemoryGraphDeleteRequest,
  MemoryGraphDuplicateDecisionRequest,
  MemoryGraphDuplicatesResponse,
  MemoryGraphEntitiesResponse,
  MemoryGraphEntityResponse,
  MemoryGraphEntityUpsertRequest,
  MemoryGraphObservationResponse,
  MemoryGraphObservationUpsertRequest,
  MemoryGraphObservationsResponse,
  MemoryGraphOverviewResponse,
  MemoryGraphRelationResponse,
  MemoryGraphRelationUpsertRequest,
  MemoryGraphRelationsResponse,
  MemoryGraphListRequest,
  MemoryLogsCleanupResponse,
  MemoryLogsListRequest,
  MemoryLogsListResponse,
  MemoryLogsStatsResponse,
  MemoryRunDreamingResponse,
  MemoryReadRequest,
  MemoryReadResponse,
  MemorySaveFileRequest,
  MemorySaveFileResponse,
  MemorySearchRequest,
  MemorySearchResponse,
  SchedulerSchedule,
  SchedulerRunDetailDTO,
  SchedulerTaskSnapshotDTO,
  SchedulerGetRequest,
  SchedulerGetResponse,
  SchedulerCreateTaskRequest,
  SchedulerUpdateTaskRequest,
  SchedulerDeleteTaskRequest,
  SchedulerWriteTaskResponse,
  SchedulerDeleteTaskResponse,
  SchedulerListRunsRequest,
  SchedulerListRunsResponse,
  SchedulerGetRunRequest,
  SchedulerGetRunResponse,
  SchedulerListResponse,
  SchedulerRunNowRequest,
  SchedulerRunNowResponse,
  SchedulerSetEnabledRequest,
  SchedulerSetEnabledResponse,
  SearchRequest,
  SearchResponse,
  SearchWindowGuideState,
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
  // Variables types
  VariablesListResponse,
  VariablesSetResponse,
  VariablesDeleteResponse,
  // Project directories types (independent module)
  ProjectDirsListResponse,
  ProjectDirsGetResponse,
  ProjectDirsAddResponse,
  ProjectDirsUpdateResponse,
  ProjectDirsRemoveResponse,
  TodoPlanChangedPayload,
  TodoPlanCreateRequest,
  TodoPlanCreateResponse,
  TodoPlanDocument,
  TodoPlanGetRequest,
  TodoPlanGetResponse,
  TodoPlanRenameRequest,
  TodoPlanRenameResponse,
  TodoPlanDeleteRequest,
  TodoPlanDeleteResponse,
  TodoPlanSnapshot,
  TodoPlanUpdateResponse,
  TodoPlanUpdateRequest,
  TodoPlanWindowActionRequest,
} from '../../shared/ipc'

export type {
  ChatMessage,
  ChatSession,
  ContextVariable,
  AgentDefinition,
  AgentsListResponse,
  AgentCreateResponse,
  AgentUpdateResponse,
  AgentDeleteResponse,
  UserPrompt,
  PromptReferenceSnapshot,
  PromptListResponse,
  PromptGetResponse,
  PromptCreateRequest,
  PromptCreateResponse,
  PromptUpdateRequest,
  PromptUpdateResponse,
  PromptDeleteRequest,
  PromptDeleteResponse,
  SessionMeta,
  SessionDetails,
  GetSessionsListResponse,
  ActivateSessionResponse,
  GetSessionMessagesResponse,
  GetSessionMessagesPageRequest,
  GetSessionMessagesPageResponse,
  UserMessageMarker,
  GetSessionUserMarkersResponse,
  GetSystemPromptSnapshotResponse,
  SystemPromptSnapshot,
  AISettings,
  AppSettings,
  AIProvider,
  ProviderConfig,
  ModelCapabilityOverride,
  CustomProviderConfig,
  ProviderInfo,
  CodexProviderUsage,
  CodexUsageLimit,
  CodexUsageWindow,
  ProviderEnvStatus,
  GetProviderEnvStatusResponse,
  ProviderUsageResponse,
  ModelInfo,
  OpenRouterModel,
  ColorTheme,
  BaseTheme,
  MessageListDensity,
  TypographyDensity,
  KeyboardShortcut,
  ShortcutSettings,
  EditorSettings,
  ChatSettings,
  ProxySettings,
  NetworkSettings,
  VoiceEndpointingMode,
  VoiceEvent,
  VoiceLatencyMilestone,
  VoiceLatencyMilestoneName,
  VoiceRuntimeCommand,
  VoiceRuntimeState,
  VoiceSettings,
  VoiceStartRequest,
  VoiceStopRequest,
  VoiceSubmitUtteranceRequest,
  VoiceSynthesizeRequest,
  VoiceTestASRRequest,
  VoiceTestTTSRequest,
  VoiceGetStateResponse,
  VoiceSubmitUtteranceResponse,
  VoiceSynthesizeResponse,
  VoiceTTSModel,
  VoiceTTSModelsResponse,
  MessageAttachment,
  AttachmentMediaType,
  MediaKind,
  MediaSource,
  MediaAsset,
  MediaAssetLink,
  MediaAssetMetadata,
  MediaQuery,
  MediaGalleryResponse,
  MediaRebuildResponse,
  MarkdownResolveAssetRequest,
  MarkdownResolveAssetResponse,
  MarkdownSaveAttachmentsRequest,
  MarkdownSaveAttachmentsResponse,
  ToolDefinition,
  ToolCall,
  ToolResult,
  ToolPartialResult,
  ToolRenderKind,
  PermissionMode,
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
  PluginCommandInfo,
  GetPluginCommandsResponse,
  ExecutePluginCommandResponse,
  MemoryAppendRequest,
  MemoryAppendResponse,
  MemoryCaptureDecisionRequest,
  MemoryCaptureDecisionResponse,
  MemoryIndexResponse,
  MemoryOverviewResponse,
  MemoryLogsCleanupResponse,
  MemoryLogsListRequest,
  MemoryLogsListResponse,
  MemoryLogsStatsResponse,
  MemoryRunDreamingResponse,
  MemoryReadRequest,
  MemoryReadResponse,
  MemorySaveFileRequest,
  MemorySaveFileResponse,
  MemorySearchRequest,
  MemorySearchResponse,
  SchedulerSchedule,
  SchedulerRunDetailDTO,
  SchedulerTaskSnapshotDTO,
  SchedulerGetRequest,
  SchedulerGetResponse,
  SchedulerCreateTaskRequest,
  SchedulerUpdateTaskRequest,
  SchedulerDeleteTaskRequest,
  SchedulerWriteTaskResponse,
  SchedulerDeleteTaskResponse,
  SchedulerListRunsRequest,
  SchedulerListRunsResponse,
  SchedulerGetRunRequest,
  SchedulerGetRunResponse,
  SchedulerListResponse,
  SchedulerRunNowRequest,
  SchedulerRunNowResponse,
  SchedulerSetEnabledRequest,
  SchedulerSetEnabledResponse,
  // Permission types
  PermissionInfo,
  PermissionResponse,
  // Theme types
  ThemeMeta,
  Theme,
  TodoPlanChangedPayload,
  TodoPlanCreateRequest,
  TodoPlanCreateResponse,
  TodoPlanDocument,
  TodoPlanGetRequest,
  TodoPlanGetResponse,
  TodoPlanRenameRequest,
  TodoPlanRenameResponse,
  TodoPlanDeleteRequest,
  TodoPlanDeleteResponse,
  TodoPlanSnapshot,
  TodoPlanUpdateResponse,
  TodoPlanUpdateRequest,
}

// Gallery image type for image preview window
export interface GalleryImage {
  id: string
  src: string        // Full image URL or data URL
  alt?: string       // Image description/title
  thumbnail?: string // Optional thumbnail URL
}

export interface ElectronAPI {
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
    turnIndex?: number
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
  getSystemPromptSnapshot: (sessionId: string) => Promise<GetSystemPromptSnapshotResponse>
  getSessions: () => Promise<GetSessionsResponse>
  createSession: (name: string) => Promise<CreateSessionResponse>
  switchSession: (sessionId: string) => Promise<SwitchSessionResponse>
  getSession: (sessionId: string) => Promise<SwitchSessionResponse>
  deleteSession: (sessionId: string) => Promise<DeleteSessionResponse>
  renameSession: (sessionId: string, newName: string) => Promise<RenameSessionResponse>
  createBranch: (parentSessionId: string, branchFromMessageId: string) => Promise<CreateBranchResponse>
  updateSessionPin: (sessionId: string, isPinned: boolean) => Promise<UpdateSessionPinResponse>
  updateSessionModel: (sessionId: string, provider: string, model: string) => Promise<{ success: boolean; error?: string }>
  updateSessionAgent: (sessionId: string, agentId: string) => Promise<{ success: boolean; error?: string }>
  updateSessionPermissionMode: (sessionId: string, permissionMode: PermissionMode) => Promise<{ success: boolean; error?: string }>
  updateSessionArchived: (sessionId: string, isArchived: boolean, archivedAt?: number | null) => Promise<{ success: boolean; error?: string }>
  updateSessionWorkingDirectory: (sessionId: string, workingDirectory: string | null) => Promise<{ success: boolean; error?: string }>
  listPermissionGrants: (options: { sessionId?: string; workspaceRoot?: string }) => Promise<{ success: boolean; error?: string; sessionGrants?: any[]; workspaceGrants?: any[] }>
  revokePermissionGrant: (id: string) => Promise<{ success: boolean; error?: string }>
  clearSessionPermissionGrants: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  clearWorkspacePermissionGrants: (workspaceRoot: string) => Promise<{ success: boolean; error?: string }>
  // Variables subsystem (scalar variables)
  listVariables: (sessionId: string) => Promise<VariablesListResponse>
  setVariable: (sessionId: string, name: string, value: string, description?: string, scope?: 'global' | 'session') => Promise<VariablesSetResponse>
  deleteVariable: (sessionId: string, name: string) => Promise<VariablesDeleteResponse>
  // Project directories — independent module
  projectDirsList: () => Promise<ProjectDirsListResponse>
  projectDirsGet: (path: string) => Promise<ProjectDirsGetResponse>
  projectDirsAdd: (path: string, description?: string) => Promise<ProjectDirsAddResponse>
  projectDirsUpdate: (path: string, description: string) => Promise<ProjectDirsUpdateResponse>
  projectDirsRemove: (path: string) => Promise<ProjectDirsRemoveResponse>
  getSessionTokenUsage: (sessionId: string) => Promise<{ success: boolean; usage?: { totalInputTokens: number; totalOutputTokens: number; totalTokens: number; maxTokens: number; lastInputTokens: number; contextSize: number }; error?: string }>
  // Optimized session loading (Phase 4: Metadata Separation)
  getSessionsList: () => Promise<GetSessionsListResponse>
  activateSession: (sessionId: string) => Promise<ActivateSessionResponse>
  getSessionMessages: (sessionId: string) => Promise<GetSessionMessagesResponse>
  getSessionMessagesPage: (request: GetSessionMessagesPageRequest) => Promise<GetSessionMessagesPageResponse>
  getSessionUserMarkers: (sessionId: string) => Promise<GetSessionUserMarkersResponse>
  onSessionMessagesChanged: (callback: (data: { sessionId: string; action: 'added' | 'updated' | 'deleted'; messageId?: string }) => void) => () => void
  // System message methods (for /files command persistence)
  addSystemMessage: (sessionId: string, message: { id: string; role: string; content: string; timestamp: number }) => Promise<{ success: boolean; error?: string }>
  removeFilesChangedMessage: (sessionId: string) => Promise<{ success: boolean; removedId?: string | null; error?: string }>
  removeGitStatusMessage: (sessionId: string) => Promise<{ success: boolean; removedId?: string | null; error?: string }>
  // Generic remove message by ID (for close button functionality)
  removeMessage: (sessionId: string, messageId: string) => Promise<{ success: boolean; error?: string }>
  onContextSizeUpdated: (callback: (data: { sessionId: string; contextSize: number }) => void) => () => void
  onContextCompactStarted: (callback: (data: { sessionId: string }) => void) => () => void
  onContextCompactCompleted: (callback: (data: { sessionId: string; success: boolean; error?: string }) => void) => () => void
  updateSessionMaxTokens: (sessionId: string, maxTokens: number) => Promise<{ success: boolean; error?: string }>
  getSettings: () => Promise<GetSettingsResponse>
  saveSettings: (settings: AppSettings) => Promise<SaveSettingsResponse>
  openSettingsWindow: () => Promise<{ success: boolean }>
  onSettingsChanged: (callback: (settings: AppSettings) => void) => () => void
  voiceGetState: () => Promise<VoiceGetStateResponse>
  voiceStart: (request?: VoiceStartRequest) => Promise<{ success: boolean; error?: string }>
  voiceStop: (request?: VoiceStopRequest) => Promise<{ success: boolean; error?: string }>
  voiceSubmitUtterance: (request: VoiceSubmitUtteranceRequest) => Promise<VoiceSubmitUtteranceResponse>
  voiceSubmitTranscript: (request: VoiceSubmitTranscriptRequest) => Promise<VoiceSubmitUtteranceResponse>
  voiceSynthesize: (request: VoiceSynthesizeRequest) => Promise<VoiceSynthesizeResponse>
  voiceTestASR: (request: VoiceTestASRRequest) => Promise<VoiceSubmitUtteranceResponse>
  voiceTestTTS: (request: VoiceTestTTSRequest) => Promise<{ success: boolean; error?: string; mimeType?: string }>
  voiceGetTTSModels: (request?: { force?: boolean }) => Promise<VoiceTTSModelsResponse>
  onVoiceEvent: (callback: (event: VoiceEvent) => void) => () => void
  voiceRuntimeReady: () => Promise<{ success: boolean }>
  voiceRuntimeEvent: (event: VoiceEvent) => Promise<{ success: boolean }>
  onVoiceRuntimeCommand: (callback: (command: VoiceRuntimeCommand) => void) => () => void
  getSystemTheme: () => Promise<{ success: boolean; theme?: 'light' | 'dark' }>
  testProxy: (proxy: ProxySettings) => Promise<{ success: boolean; error?: string; status?: number }>
  onSystemThemeChanged: (callback: (theme: 'light' | 'dark') => void) => () => void
  // Agent methods
  listAgents: () => Promise<AgentsListResponse>
  createAgent: (name: string, systemPrompt?: string) => Promise<AgentCreateResponse>
  updateAgent: (agentId: string, updates: { name?: string; systemPrompt?: string }) => Promise<AgentUpdateResponse>
  deleteAgent: (agentId: string) => Promise<AgentDeleteResponse>
  // User prompt methods
  listPrompts: () => Promise<PromptListResponse>
  getPrompt: (request: { id: string }) => Promise<PromptGetResponse>
  createPrompt: (request: PromptCreateRequest) => Promise<PromptCreateResponse>
  updatePrompt: (request: PromptUpdateRequest) => Promise<PromptUpdateResponse>
  deletePrompt: (request: PromptDeleteRequest) => Promise<PromptDeleteResponse>
  // Theme methods
  getThemes: () => Promise<GetThemesResponse>
  getTheme: (themeId: string) => Promise<GetThemeResponse>
  applyTheme: (themeId: string, mode: 'dark' | 'light') => Promise<ApplyThemeResponse>
  refreshThemes: (projectPath?: string) => Promise<RefreshThemesResponse>
  openThemesFolder: () => Promise<{ success: boolean; error?: string }>
  getProviders: () => Promise<GetProvidersResponse>
  getProviderUsage: (providerId: string) => Promise<ProviderUsageResponse>
  getProviderEnvStatus: (providerId: string) => Promise<GetProviderEnvStatusResponse>
  // New OpenRouter-based model API
  getModelsWithCapabilities: (providerId: string, options?: { forceRefresh?: boolean }) => Promise<{ success: boolean; models?: OpenRouterModel[]; error?: string }>
  getAllModels: () => Promise<{ success: boolean; models?: OpenRouterModel[]; error?: string }>
  searchModels: (query: string, providerId?: string) => Promise<{ success: boolean; models?: OpenRouterModel[]; error?: string }>
  refreshModelRegistry: () => Promise<{ success: boolean; error?: string }>
  getModelNameAliases: () => Promise<{ success: boolean; aliases?: Record<string, string>; error?: string }>
  getModelDisplayName: (modelId: string) => Promise<{ success: boolean; displayName?: string; error?: string }>
  // Tools methods
  getTools: () => Promise<GetToolsResponse>
  executeTool: (toolId: string, args: Record<string, any>, messageId: string, sessionId: string) => Promise<ExecuteToolResponse>
  cancelTool: (toolCallId: string) => Promise<{ success: boolean }>
  listBackgroundJobs: (options?: { includeInactive?: boolean }) => Promise<{ success: boolean; jobs?: Array<Record<string, any>>; error?: string }>
  stopBackgroundJob: (jobId: string) => Promise<{ success: boolean; error?: string }>
  updateToolCall: (sessionId: string, messageId: string, toolCallId: string, updates: Partial<ToolCall>) => Promise<{ success: boolean }>
  abortStream: (sessionId?: string) => Promise<{ success: boolean }>
  getActiveStreams: () => Promise<{ success: boolean; streams?: string[] }>
  resumeAfterToolConfirm: (sessionId: string, messageId: string) => Promise<{ success: boolean; error?: string }>

  // Permission methods
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
  getSkills: (workingDirectory?: string) => Promise<GetSkillsResponse>
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
  openExternal: (url: string) => Promise<{ success: boolean }>
  getDataPath: () => Promise<string>

  // Clipboard methods
  writeClipboardText: (text: string) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string }

  // Media methods
  saveImage: (data: { url?: string; base64?: string; prompt: string; revisedPrompt?: string; model: string; sessionId: string; messageId: string }) => Promise<{ id: string; type: 'image'; filePath: string; prompt: string; revisedPrompt?: string; model: string; createdAt: number; sessionId: string; messageId: string }>
  loadAllMedia: () => Promise<{ id: string; type: 'image'; filePath: string; prompt: string; revisedPrompt?: string; model: string; createdAt: number; sessionId: string; messageId: string }[]>
  deleteMedia: (id: string) => Promise<boolean>
  clearAllMedia: () => Promise<void>
  readImageBase64: (filePath: string) => Promise<string>
  listMediaAssets: (query?: MediaQuery) => Promise<MediaAsset[]>
  hideMediaAsset: (id: string) => Promise<{ success: boolean }>
  rebuildMediaLibrary: () => Promise<MediaRebuildResponse>
  getMediaGallery: (assetId: string, query?: MediaQuery) => Promise<MediaGalleryResponse>

  // Image preview methods
  openImagePreview: (src: string, alt?: string) => Promise<{ success: boolean }>
  getImagePreview: (previewId: string) => Promise<{ success: boolean; src?: string; alt?: string; error?: string }>
  openImageGallery: (mediaId: string) => Promise<{ success: boolean }>
  onImagePreviewUpdate: (callback: (data: { mode?: 'single'; previewId?: string; src?: string; alt?: string }) => void) => () => void

  // OAuth methods
  oauthStart: (providerId: string) => Promise<{
    success: boolean
    error?: string
    flowId?: string
    flowKind?: 'pkce-callback' | 'manual-pkce' | 'device-code'
    pollIntervalMs?: number
    expiresAt?: number
    statusMessage?: string
    // For device flow (GitHub Copilot)
    userCode?: string
    verificationUri?: string
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
    providerId?: string
    isLoggedIn: boolean
    isExpired?: boolean
    canRefresh?: boolean
    expiresAt?: number
    account?: {
      id?: string
      email?: string
      planType?: string
      isFedramp?: boolean
    }
    lastError?: string
    error?: string
  }>
  oauthDevicePoll: (providerId: string, flowId?: string) => Promise<{
    success: boolean
    completed?: boolean
    error?: string
    pollStatus?: string
  }>
  oauthRefresh: (providerId: string) => Promise<{ success: boolean; error?: string }>
  onOAuthTokenRefreshed: (callback: (data: { providerId: string }) => void) => () => void
  onOAuthTokenExpired: (callback: (data: { providerId: string; error?: string }) => void) => () => void

  // Menu event listeners
  onMenuNewChat: (callback: () => void) => () => void
  onMenuCloseChat: (callback: () => void) => () => void

  // Files methods (for @ file search)
  listFiles: (options: { cwd: string; query?: string; limit?: number }) => Promise<{ success: boolean; files: string[]; error?: string }>

  // File rollback (for /files command)
  rollbackFile: (options: { auditPath?: string; filePath?: string; originalContent?: string; isNew?: boolean }) => Promise<{ success: boolean; error?: string; auditId?: string; filePath?: string; restoredExists?: boolean }>

  // Directories listing (for /cd path completion)
  listDirs: (options: { basePath: string; query?: string; limit?: number }) => Promise<{ success: boolean; dirs: string[]; basePath: string; error?: string }>

  // File content reading/writing (for file preview panel)
  readFileContent: (filePath: string, maxSize?: number) => Promise<{
    success: boolean
    content?: string
    encoding?: string
    size?: number
    mtimeMs?: number
    isBinary?: boolean
    error?: string
  }>
  saveFileContent: (filePath: string, content: string, expectedMtimeMs?: number) => Promise<{
    success: boolean
    mtimeMs?: number
    conflict?: boolean
    error?: string
  }>
  listDirectory: (dirPath: string) => Promise<{
    success: boolean
    entries?: Array<{ name: string; path: string; type: 'file' | 'directory'; size?: number; mtimeMs?: number }>
    error?: string
  }>
  createFile: (filePath: string, content?: string) => Promise<{ success: boolean; error?: string }>
  createDirectory: (dirPath: string) => Promise<{ success: boolean; error?: string }>
  renamePath: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>
  deletePath: (targetPath: string) => Promise<{ success: boolean; error?: string }>
  statPath: (targetPath: string) => Promise<{ success: boolean; type?: 'file' | 'directory'; size?: number; mtimeMs?: number; error?: string }>
  revealPath: (targetPath: string) => Promise<{ success: boolean; error?: string }>
  watchWorkspace: (root: string) => Promise<{ success: boolean; error?: string }>
  unwatchWorkspace: (root: string) => Promise<{ success: boolean }>
  onWorkspaceFileChanged: (callback: (data: { root: string; path: string; eventType: string }) => void) => () => void
  resolveMarkdownAsset: (request: MarkdownResolveAssetRequest) => Promise<MarkdownResolveAssetResponse>
  saveMarkdownAttachments: (request: MarkdownSaveAttachmentsRequest) => Promise<MarkdownSaveAttachmentsResponse>

  // Window methods
  setWindowButtonVisibility: (visible: boolean) => Promise<{ success: boolean }>

  // Unified event-driven channels (Phase 4)
  onSessionEvent: (callback: (envelope: any) => void) => () => void
  onSessionStream: (callback: (data: { sessionId: string; chunk: any }) => void) => () => void
  emitCommand: (sessionId: string, command: any) => Promise<{ success: boolean; error?: string; result?: any }>

  // Skill execution
  executeSkill: (skillId: string, options: { sessionId: string; input: string }) => Promise<{ success: boolean; result?: { output: string }; error?: string }>

  // Plugin management
  getPlugins: () => Promise<{ success: boolean; plugins?: Array<{
    id: string; name: string; version: string; description: string;
    author: string; loaded: boolean; enabled: boolean;
    commands: string[]; error: string; dirPath: string;
    needsInstall: boolean;
  }>; error?: string }>
  enablePlugin: (pluginId: string) => Promise<{ success: boolean; error?: string }>
  disablePlugin: (pluginId: string) => Promise<{ success: boolean; error?: string }>
  refreshPlugins: () => Promise<{ success: boolean; error?: string }>
  getPluginCommands: () => Promise<GetPluginCommandsResponse>
  executePluginCommand: (
    commandName: string,
    args: string,
    sessionId: string
  ) => Promise<ExecutePluginCommandResponse>

  // Soul / Memory panel
  getMemoryOverview: (agentId?: string) => Promise<MemoryOverviewResponse>
  readMemoryFile: (request: MemoryReadRequest) => Promise<MemoryReadResponse>
  searchMemory: (request: MemorySearchRequest) => Promise<MemorySearchResponse>
  appendMemory: (request: MemoryAppendRequest) => Promise<MemoryAppendResponse>
  saveMemoryFile: (request: MemorySaveFileRequest) => Promise<MemorySaveFileResponse>
  rebuildMemoryIndex: (agentId?: string) => Promise<MemoryIndexResponse>
  runMemoryDreaming: (agentId?: string) => Promise<MemoryRunDreamingResponse>
  listMemoryProfile: (request?: MemoryProfileListRequest) => Promise<MemoryProfileListResponse>
  searchMemoryProfile: (request: MemoryProfileListRequest) => Promise<MemoryProfileListResponse>
  upsertMemoryProfile: (request: MemoryProfileUpsertRequest) => Promise<MemoryProfileUpsertResponse>
  deleteMemoryProfile: (request: MemoryProfileDeleteRequest) => Promise<MemoryProfileDeleteResponse>
  getMemoryProfileAudit: (request: MemoryProfileAuditRequest) => Promise<MemoryProfileAuditResponse>
  exportMemoryProfile: (agentId?: string) => Promise<MemoryProfileExportResponse>
  getMemoryGraphOverview: (agentId?: string) => Promise<MemoryGraphOverviewResponse>
  listMemoryGraphEntities: (request?: MemoryGraphListRequest) => Promise<MemoryGraphEntitiesResponse>
  upsertMemoryGraphEntity: (request: MemoryGraphEntityUpsertRequest) => Promise<MemoryGraphEntityResponse>
  deleteMemoryGraphEntity: (request: MemoryGraphDeleteRequest) => Promise<{ success: boolean; error?: string }>
  listMemoryGraphObservations: (request?: MemoryGraphListRequest & { entityId?: string }) => Promise<MemoryGraphObservationsResponse>
  upsertMemoryGraphObservation: (request: MemoryGraphObservationUpsertRequest) => Promise<MemoryGraphObservationResponse>
  deleteMemoryGraphObservation: (request: MemoryGraphDeleteRequest) => Promise<{ success: boolean; error?: string }>
  listMemoryGraphRelations: (request?: MemoryGraphListRequest & { entityId?: string }) => Promise<MemoryGraphRelationsResponse>
  upsertMemoryGraphRelation: (request: MemoryGraphRelationUpsertRequest) => Promise<MemoryGraphRelationResponse>
  deleteMemoryGraphRelation: (request: MemoryGraphDeleteRequest) => Promise<{ success: boolean; error?: string }>
  listMemoryGraphDuplicates: (request?: MemoryGraphListRequest) => Promise<MemoryGraphDuplicatesResponse>
  mergeMemoryGraphDuplicate: (request: MemoryGraphDuplicateDecisionRequest) => Promise<{ success: boolean; error?: string }>
  ignoreMemoryGraphDuplicate: (request: MemoryGraphDuplicateDecisionRequest) => Promise<{ success: boolean; error?: string }>
  getMemoryGraphAudit: (request: MemoryGraphAuditRequest) => Promise<MemoryGraphAuditResponse>
  listMemoryLogs: (request?: MemoryLogsListRequest) => Promise<MemoryLogsListResponse>
  getMemoryLogStats: () => Promise<MemoryLogsStatsResponse>
  openMemoryLogFolder: () => Promise<{ success: boolean; error?: string }>
  cleanupMemoryLogs: () => Promise<MemoryLogsCleanupResponse>
  saveMemoryCapture: (request?: MemoryCaptureDecisionRequest) => Promise<MemoryCaptureDecisionResponse>
  discardMemoryCapture: (request?: MemoryCaptureDecisionRequest) => Promise<MemoryCaptureDecisionResponse>
  listSchedulerTasks: () => Promise<SchedulerListResponse>
  getSchedulerTask: (request: SchedulerGetRequest) => Promise<SchedulerGetResponse>
  runSchedulerTaskNow: (request: SchedulerRunNowRequest) => Promise<SchedulerRunNowResponse>
  setSchedulerTaskEnabled: (request: SchedulerSetEnabledRequest) => Promise<SchedulerSetEnabledResponse>
  createSchedulerTask: (request: SchedulerCreateTaskRequest) => Promise<SchedulerWriteTaskResponse>
  updateSchedulerTask: (request: SchedulerUpdateTaskRequest) => Promise<SchedulerWriteTaskResponse>
  deleteSchedulerTask: (request: SchedulerDeleteTaskRequest) => Promise<SchedulerDeleteTaskResponse>
  listSchedulerRuns: (request: SchedulerListRunsRequest) => Promise<SchedulerListRunsResponse>
  getSchedulerRun: (request: SchedulerGetRunRequest) => Promise<SchedulerGetRunResponse>

  // App State
  getAppState: () => Promise<{
    currentSessionId: string
    currentWorkspaceId: string | null
    openTabs?: Array<{ type: string; sessionId?: string; filePath?: string; initialFilePath?: string; activeFilePath?: string; workspaceRoot?: string; title?: string }>
    activeTabIndex?: number
    sidebarCollapsed?: boolean
  }>
  saveUIState: (uiState: {
    openTabs?: Array<{ type: string; sessionId?: string; filePath?: string; initialFilePath?: string; activeFilePath?: string; workspaceRoot?: string; title?: string }>
    activeTabIndex?: number
    sidebarCollapsed?: boolean
  }) => Promise<{ success: boolean }>

  // Search Everywhere
  toggleSearchWindow: () => Promise<{ success: boolean }>
  closeSearchWindow: () => Promise<{ success: boolean }>
  onSearchWindowShown: (callback: () => void) => () => void
  onSearchWindowGuides: (callback: (state: SearchWindowGuideState) => void) => () => void
  searchQuery: (req: SearchRequest) => Promise<SearchResponse>
  searchExecuteAction: (actionId: string) => Promise<{ success: boolean }>
  onSearchAction: (callback: (actionId: string) => void) => () => void

  // Todo / Plan
  getTodoPlan: (request?: TodoPlanGetRequest) => Promise<TodoPlanGetResponse>
  createTodoPlanNote: (request: TodoPlanCreateRequest) => Promise<TodoPlanCreateResponse>
  updateTodoPlan: (request: TodoPlanUpdateRequest) => Promise<TodoPlanUpdateResponse>
  renameTodoPlanNote: (request: TodoPlanRenameRequest) => Promise<TodoPlanRenameResponse>
  deleteTodoPlanNote: (request: TodoPlanDeleteRequest) => Promise<TodoPlanDeleteResponse>
  revealTodoPlanDirectory: () => Promise<{ success: boolean; error?: string }>
  openTodoPlanWindow: (request?: TodoPlanWindowActionRequest) => Promise<{ success: boolean }>
  hideTodoPlanWindow: (request?: TodoPlanWindowActionRequest) => Promise<{ success: boolean }>
  toggleTodoPlanWindow: (request?: TodoPlanWindowActionRequest) => Promise<{ success: boolean }>
  setTodoPlanWindowPinned: (pinned: boolean) => Promise<{ success: boolean; pinned: boolean }>
  onTodoPlanChanged: (callback: (data: TodoPlanChangedPayload) => void) => () => void

}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
