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
  SendMessageResponse,
  EditAndResendResponse,
  GetChatHistoryResponse,
  GetSessionsResponse,
  CreateSessionResponse,
  SwitchSessionResponse,
  DeleteSessionResponse,
  RenameSessionResponse,
  CreateBranchResponse,
  GetSettingsResponse,
  SaveSettingsResponse,
  GenerateTitleResponse,
  FetchModelsResponse,
  GetCachedModelsResponse,
  GetProvidersResponse,
  ToolDefinition,
  ToolCall,
  ToolSettings,
  GetToolsResponse,
  ExecuteToolResponse,
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
  ToolDefinition,
  ToolCall,
  ToolSettings,
  // MCP types
  MCPServerConfig,
  MCPServerState,
  MCPToolInfo,
  MCPResourceInfo,
  MCPPromptInfo,
  MCPSettings,
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
  onStreamChunk: (callback: (chunk: { type: 'text' | 'reasoning' | 'tool_call' | 'tool_result'; content: string; messageId: string; reasoning?: string; toolCall?: ToolCall }) => void) => () => void
  onStreamReasoningDelta: (callback: (data: { messageId: string; delta: string }) => void) => () => void
  onStreamTextDelta: (callback: (data: { messageId: string; delta: string }) => void) => () => void
  onStreamComplete: (callback: (data: { messageId: string; text: string; reasoning?: string }) => void) => () => void
  onStreamError: (callback: (data: { messageId?: string; error: string; errorDetails?: string }) => void) => () => void
  getChatHistory: (sessionId: string) => Promise<GetChatHistoryResponse>
  generateTitle: (message: string) => Promise<GenerateTitleResponse>
  editAndResend: (sessionId: string, messageId: string, newContent: string) => Promise<EditAndResendResponse>
  getSessions: () => Promise<GetSessionsResponse>
  createSession: (name: string) => Promise<CreateSessionResponse>
  switchSession: (sessionId: string) => Promise<SwitchSessionResponse>
  deleteSession: (sessionId: string) => Promise<DeleteSessionResponse>
  renameSession: (sessionId: string, newName: string) => Promise<RenameSessionResponse>
  createBranch: (parentSessionId: string, branchFromMessageId: string) => Promise<CreateBranchResponse>
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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
