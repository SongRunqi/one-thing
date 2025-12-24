import type {
  ChatMessage,
  ChatSession,
  AISettings,
  AppSettings,
  AIProvider,
  ProviderConfig,
  CustomProviderConfig,
  ProviderInfo,
  ModelInfo,
  ColorTheme,
  BaseTheme,
  KeyboardShortcut,
  ShortcutSettings,
  EmbeddingSettings,
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
  // Agent types
  Agent,
  AgentAvatar,
  AgentVoice,
  GetAgentsResponse,
  CreateAgentResponse,
  UpdateAgentResponse,
  DeleteAgentResponse,
  UploadAgentAvatarResponse,
  PinAgentResponse,
  UnpinAgentResponse,
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
  RecallAgentMemoryResponse,
  GetActiveMemoriesResponse,
  UpdateAgentRelationshipResponse,
  RecordInteractionResponse,
} from '../../shared/ipc'

export type {
  ChatMessage,
  ChatSession,
  AISettings,
  AppSettings,
  AIProvider,
  ProviderConfig,
  CustomProviderConfig,
  ProviderInfo,
  ModelInfo,
  ColorTheme,
  BaseTheme,
  KeyboardShortcut,
  ShortcutSettings,
  EmbeddingSettings,
  ToolDefinition,
  ToolCall,
  ToolSettings,
  BashToolSettings,
  ContentPart,
  Step,
  StepType,
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
  // Agent types
  Agent,
  AgentAvatar,
  AgentVoice,
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
  sendMessage: (sessionId: string, message: string) => Promise<SendMessageResponse>
  sendMessageStream: (sessionId: string, message: string) => Promise<StreamSendMessageResponse>
  onStreamChunk: (callback: (chunk: { type: 'text' | 'reasoning' | 'tool_call' | 'tool_result' | 'continuation' | 'replace'; content: string; messageId: string; reasoning?: string; toolCall?: ToolCall }) => void) => () => void
  onStreamReasoningDelta: (callback: (data: { messageId: string; delta: string }) => void) => () => void
  onStreamTextDelta: (callback: (data: { messageId: string; delta: string }) => void) => () => void
  onStreamComplete: (callback: (data: { messageId: string; text: string; reasoning?: string; sessionName?: string }) => void) => () => void
  onStreamError: (callback: (data: { messageId?: string; error: string; errorDetails?: string }) => void) => () => void
  onSkillActivated: (callback: (data: { sessionId: string; messageId: string; skillName: string }) => void) => () => void
  onStepAdded: (callback: (data: { sessionId: string; messageId: string; step: any }) => void) => () => void
  onStepUpdated: (callback: (data: { sessionId: string; messageId: string; stepId: string; updates: any }) => void) => () => void
  getChatHistory: (sessionId: string) => Promise<GetChatHistoryResponse>
  generateTitle: (message: string) => Promise<GenerateTitleResponse>
  editAndResend: (sessionId: string, messageId: string, newContent: string) => Promise<EditAndResendResponse>
  editAndResendStream: (sessionId: string, messageId: string, newContent: string) => Promise<StreamSendMessageResponse>
  getSessions: () => Promise<GetSessionsResponse>
  createSession: (name: string, workspaceId?: string, agentId?: string) => Promise<CreateSessionResponse>
  switchSession: (sessionId: string) => Promise<SwitchSessionResponse>
  deleteSession: (sessionId: string) => Promise<DeleteSessionResponse>
  renameSession: (sessionId: string, newName: string) => Promise<RenameSessionResponse>
  createBranch: (parentSessionId: string, branchFromMessageId: string) => Promise<CreateBranchResponse>
  updateSessionPin: (sessionId: string, isPinned: boolean) => Promise<UpdateSessionPinResponse>
  getSettings: () => Promise<GetSettingsResponse>
  saveSettings: (settings: AppSettings) => Promise<SaveSettingsResponse>
  fetchModels: (
    provider: AIProvider,
    apiKey: string,
    baseUrl?: string,
    forceRefresh?: boolean
  ) => Promise<FetchModelsResponse>
  getCachedModels: (provider: AIProvider) => Promise<GetCachedModelsResponse>
  getProviders: () => Promise<GetProvidersResponse>
  // Tools methods
  getTools: () => Promise<GetToolsResponse>
  executeTool: (toolId: string, args: Record<string, any>, messageId: string, sessionId: string) => Promise<ExecuteToolResponse>
  cancelTool: (toolCallId: string) => Promise<{ success: boolean }>
  updateToolCall: (sessionId: string, messageId: string, toolCallId: string, updates: Partial<ToolCall>) => Promise<{ success: boolean }>
  updateContentParts: (sessionId: string, messageId: string, contentParts: ContentPart[]) => Promise<{ success: boolean }>
  abortStream: () => Promise<{ success: boolean }>

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
  showOpenDialog: (options: { properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>; title?: string; defaultPath?: string }) => Promise<{ canceled: boolean; filePaths: string[] }>

  // Workspace methods
  getWorkspaces: () => Promise<GetWorkspacesResponse>
  createWorkspace: (name: string, avatar: WorkspaceAvatar, systemPrompt: string) => Promise<CreateWorkspaceResponse>
  updateWorkspace: (id: string, updates: { name?: string; avatar?: WorkspaceAvatar; systemPrompt?: string }) => Promise<UpdateWorkspaceResponse>
  deleteWorkspace: (workspaceId: string) => Promise<DeleteWorkspaceResponse>
  switchWorkspace: (workspaceId: string | null) => Promise<SwitchWorkspaceResponse>
  uploadWorkspaceAvatar: (workspaceId: string, imageData: string, mimeType: string) => Promise<UploadWorkspaceAvatarResponse>

  // Agent methods
  getAgents: () => Promise<GetAgentsResponse>
  createAgent: (name: string, avatar: AgentAvatar, systemPrompt: string, options?: { tagline?: string; personality?: string[]; primaryColor?: string; voice?: AgentVoice }) => Promise<CreateAgentResponse>
  updateAgent: (id: string, updates: { name?: string; avatar?: AgentAvatar; systemPrompt?: string; tagline?: string; personality?: string[]; primaryColor?: string; voice?: AgentVoice }) => Promise<UpdateAgentResponse>
  deleteAgent: (agentId: string) => Promise<DeleteAgentResponse>
  uploadAgentAvatar: (agentId: string, imageData: string, mimeType: string) => Promise<UploadAgentAvatarResponse>
  pinAgent: (agentId: string) => Promise<PinAgentResponse>
  unpinAgent: (agentId: string) => Promise<UnpinAgentResponse>

  // User Profile methods
  getUserProfile: () => Promise<GetUserProfileResponse>
  addUserFact: (content: string, category: UserFactCategory, confidence?: number, sourceAgentId?: string) => Promise<AddUserFactResponse>
  updateUserFact: (factId: string, updates: { content?: string; category?: UserFactCategory; confidence?: number }) => Promise<UpdateUserFactResponse>
  deleteUserFact: (factId: string) => Promise<DeleteUserFactResponse>

  // Agent Memory methods
  getAgentRelationship: (agentId: string) => Promise<GetAgentRelationshipResponse>
  addAgentMemory: (agentId: string, content: string, category: AgentMemoryCategory, emotionalWeight?: number) => Promise<AddAgentMemoryResponse>
  recallAgentMemory: (agentId: string, memoryId: string) => Promise<RecallAgentMemoryResponse>
  getActiveAgentMemories: (agentId: string, limit?: number) => Promise<GetActiveMemoriesResponse>
  updateAgentRelationship: (agentId: string, updates: { trustLevel?: number; familiarity?: number; mood?: AgentMood; moodNotes?: string }) => Promise<UpdateAgentRelationshipResponse>
  recordAgentInteraction: (agentId: string) => Promise<RecordInteractionResponse>

  // Shell methods
  openPath: (filePath: string) => Promise<string>
  getDataPath: () => Promise<string>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
