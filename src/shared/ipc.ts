// IPC Channel Names
export const IPC_CHANNELS = {
  // Chat related
  SEND_MESSAGE: 'chat:send-message',
  SEND_MESSAGE_STREAM: 'chat:send-message-stream',
  GET_CHAT_HISTORY: 'chat:get-history',
  CLEAR_CHAT: 'chat:clear',
  GENERATE_TITLE: 'chat:generate-title',
  EDIT_AND_RESEND: 'chat:edit-and-resend',

  // Streaming related
  STREAM_CHUNK: 'chat:stream-chunk',
  STREAM_REASONING_DELTA: 'chat:stream-reasoning-delta',
  STREAM_TEXT_DELTA: 'chat:stream-text-delta',
  STREAM_COMPLETE: 'chat:stream-complete',
  STREAM_ERROR: 'chat:stream-error',

  // Session related
  GET_SESSIONS: 'sessions:get-all',
  CREATE_SESSION: 'sessions:create',
  SWITCH_SESSION: 'sessions:switch',
  DELETE_SESSION: 'sessions:delete',
  RENAME_SESSION: 'sessions:rename',
  CREATE_BRANCH: 'sessions:create-branch',

  // Settings related
  GET_SETTINGS: 'settings:get',
  SAVE_SETTINGS: 'settings:save',

  // Models related
  FETCH_MODELS: 'models:fetch',
  GET_CACHED_MODELS: 'models:get-cached',

  // Providers related
  GET_PROVIDERS: 'providers:get-all',

  // Tools related
  GET_TOOLS: 'tools:get-all',
  EXECUTE_TOOL: 'tools:execute',
  CANCEL_TOOL: 'tools:cancel',
  STREAM_TOOL_CALL: 'chat:stream-tool-call',
  STREAM_TOOL_RESULT: 'chat:stream-tool-result',

  // MCP related
  MCP_GET_SERVERS: 'mcp:get-servers',
  MCP_ADD_SERVER: 'mcp:add-server',
  MCP_UPDATE_SERVER: 'mcp:update-server',
  MCP_REMOVE_SERVER: 'mcp:remove-server',
  MCP_CONNECT_SERVER: 'mcp:connect-server',
  MCP_DISCONNECT_SERVER: 'mcp:disconnect-server',
  MCP_REFRESH_SERVER: 'mcp:refresh-server',
  MCP_GET_TOOLS: 'mcp:get-tools',
  MCP_CALL_TOOL: 'mcp:call-tool',
  MCP_GET_RESOURCES: 'mcp:get-resources',
  MCP_READ_RESOURCE: 'mcp:read-resource',
  MCP_GET_PROMPTS: 'mcp:get-prompts',
  MCP_GET_PROMPT: 'mcp:get-prompt',
} as const

// Type definitions for IPC messages
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error'  // 'error' is display-only, not saved to backend
  content: string
  timestamp: number
  isStreaming?: boolean
  errorDetails?: string  // Additional error details for error messages
  reasoning?: string  // Thinking/reasoning process for reasoning models (e.g., deepseek-reasoner)
  toolCalls?: ToolCall[]  // Tool calls made by the assistant
}

export interface ChatSession {
  id: string
  name: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  parentSessionId?: string
  branchFromMessageId?: string
}

// Provider IDs - can be extended by adding new providers
export type AIProviderId = 'openai' | 'claude' | 'deepseek' | 'kimi' | 'zhipu' | 'custom' | string

// Legacy enum for backwards compatibility
export enum AIProvider {
  OpenAI = 'openai',
  Claude = 'claude',
  DeepSeek = 'deepseek',
  Kimi = 'kimi',
  Zhipu = 'zhipu',
  Custom = 'custom',
}

// Provider metadata for UI display
export interface ProviderInfo {
  id: string
  name: string
  description: string
  defaultBaseUrl: string
  defaultModel: string
  icon: string
  supportsCustomBaseUrl: boolean
  requiresApiKey: boolean
}

// Per-provider configuration
export interface ProviderConfig {
  apiKey: string
  baseUrl?: string
  model: string  // Currently active model
  selectedModels: string[]  // List of models user has selected/enabled for quick switching
  enabled?: boolean  // Whether this provider is shown in the chat model selector
}

// User-defined custom provider
export interface CustomProviderConfig extends ProviderConfig {
  id: string  // Unique ID for the custom provider
  name: string  // User-defined display name
  description?: string  // Optional description
  apiType: 'openai' | 'anthropic'  // API compatibility type
}

export interface AISettings {
  provider: string  // Can be built-in provider or custom provider ID
  temperature: number
  // Per-provider configurations (built-in providers)
  providers: {
    [AIProvider.OpenAI]: ProviderConfig
    [AIProvider.Claude]: ProviderConfig
    [AIProvider.Custom]: ProviderConfig
    [key: string]: ProviderConfig  // Allow dynamic provider keys
  }
  // User-defined custom providers
  customProviders?: CustomProviderConfig[]
}

export interface GeneralSettings {
  animationSpeed: number  // 0.1 - 0.5 seconds, default 0.25
}

export interface AppSettings {
  ai: AISettings
  theme: 'light' | 'dark' | 'system'
  general: GeneralSettings
  tools: ToolSettings
  mcp?: MCPSettings
}

// IPC Request/Response types
export interface SendMessageRequest {
  sessionId: string
  message: string
}

export interface SendMessageResponse {
  success: boolean
  userMessage?: ChatMessage
  assistantMessage?: ChatMessage
  sessionName?: string  // Updated session name if auto-renamed
  error?: string
  errorDetails?: string
}

export interface EditAndResendRequest {
  sessionId: string
  messageId: string
  newContent: string
}

export interface EditAndResendResponse {
  success: boolean
  assistantMessage?: ChatMessage
  error?: string
  errorDetails?: string
}

export interface GetChatHistoryRequest {
  sessionId: string
}

export interface GetChatHistoryResponse {
  success: boolean
  messages?: ChatMessage[]
  error?: string
}

export interface GetSessionsResponse {
  success: boolean
  sessions?: ChatSession[]
  error?: string
}

export interface CreateSessionRequest {
  name: string
}

export interface CreateSessionResponse {
  success: boolean
  session?: ChatSession
  error?: string
}

export interface SwitchSessionRequest {
  sessionId: string
}

export interface SwitchSessionResponse {
  success: boolean
  session?: ChatSession
  error?: string
}

export interface DeleteSessionRequest {
  sessionId: string
}

export interface DeleteSessionResponse {
  success: boolean
  error?: string
}

export interface RenameSessionRequest {
  sessionId: string
  newName: string
}

export interface RenameSessionResponse {
  success: boolean
  error?: string
}

export interface CreateBranchRequest {
  parentSessionId: string
  branchFromMessageId: string
}

export interface CreateBranchResponse {
  success: boolean
  session?: ChatSession
  error?: string
}

export interface GetSettingsResponse {
  success: boolean
  settings?: AppSettings
  error?: string
}

export interface SaveSettingsRequest extends AppSettings {}

export interface SaveSettingsResponse {
  success: boolean
  error?: string
}

export interface GenerateTitleRequest {
  message: string
}

export interface GenerateTitleResponse {
  success: boolean
  title?: string
  error?: string
}

// Models related types
export interface ModelInfo {
  id: string
  name: string
  description?: string
  createdAt?: string
}

export interface CachedModels {
  provider: AIProvider
  models: ModelInfo[]
  cachedAt: number
}

export interface FetchModelsRequest {
  provider: AIProvider
  apiKey: string
  baseUrl?: string
  forceRefresh?: boolean
}

export interface FetchModelsResponse {
  success: boolean
  models?: ModelInfo[]
  fromCache?: boolean
  error?: string
}

export interface GetCachedModelsRequest {
  provider: AIProvider
}

export interface GetCachedModelsResponse {
  success: boolean
  models?: ModelInfo[]
  cachedAt?: number
  error?: string
}

// Providers related types
export interface GetProvidersResponse {
  success: boolean
  providers?: ProviderInfo[]
  error?: string
}

// Tool related types
export interface GetToolsResponse {
  success: boolean
  tools?: ToolDefinition[]
  error?: string
}

export interface ExecuteToolRequest {
  toolId: string
  arguments: Record<string, any>
  messageId: string  // Associated message ID
  sessionId: string
}

export interface ExecuteToolResponse {
  success: boolean
  result?: any
  error?: string
}

export interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  required?: boolean
  enum?: string[]
  default?: any
}

export interface ToolDefinition {
  id: string
  name: string
  description: string
  parameters: ToolParameter[]
  // Permission settings
  enabled: boolean           // Whether this tool is enabled
  autoExecute: boolean       // Whether to auto-execute when called
  // Tool category for grouping in UI
  category: 'builtin' | 'custom'
  // Icon for UI display
  icon?: string
}

export interface ToolCall {
  id: string                 // Unique ID for this tool call
  toolId: string             // ID of the tool being called
  toolName: string           // Name of the tool
  arguments: Record<string, any>  // Arguments passed to the tool
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled'
  result?: any               // Result of the tool execution
  error?: string             // Error message if failed
  timestamp: number
}

export interface ToolSettings {
  // Global tool settings
  enableToolCalls: boolean   // Master switch for tool calls
  // Per-tool settings (toolId -> settings)
  tools: Record<string, {
    enabled: boolean
    autoExecute: boolean
  }>
}

// Stream message types
export interface StreamMessageChunk {
  type: 'text' | 'reasoning' | 'error' | 'complete' | 'tool_call' | 'tool_result'
  content: string
  messageId?: string
  reasoning?: string
  toolCall?: ToolCall
}

export interface SendMessageStreamResponse {
  success: boolean
  chunk?: StreamMessageChunk
  error?: string
  errorDetails?: string
}

// MCP related types
export type MCPTransportType = 'stdio' | 'sse'

export interface MCPServerConfig {
  id: string
  name: string
  transport: MCPTransportType
  enabled: boolean
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
}

export type MCPConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface MCPToolInfo {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, any>
    required?: string[]
  }
  serverId: string
}

export interface MCPResourceInfo {
  uri: string
  name: string
  description?: string
  mimeType?: string
  serverId: string
}

export interface MCPPromptInfo {
  name: string
  description?: string
  arguments?: Array<{
    name: string
    description?: string
    required?: boolean
  }>
  serverId: string
}

export interface MCPServerState {
  config: MCPServerConfig
  status: MCPConnectionStatus
  error?: string
  tools: MCPToolInfo[]
  resources: MCPResourceInfo[]
  prompts: MCPPromptInfo[]
  connectedAt?: number
}

export interface MCPSettings {
  enabled: boolean
  servers: MCPServerConfig[]
}

// MCP IPC Request/Response types
export interface MCPGetServersResponse {
  success: boolean
  servers?: MCPServerState[]
  error?: string
}

export interface MCPAddServerRequest {
  config: MCPServerConfig
}

export interface MCPAddServerResponse {
  success: boolean
  server?: MCPServerState
  error?: string
}

export interface MCPUpdateServerRequest {
  config: MCPServerConfig
}

export interface MCPUpdateServerResponse {
  success: boolean
  server?: MCPServerState
  error?: string
}

export interface MCPRemoveServerRequest {
  serverId: string
}

export interface MCPRemoveServerResponse {
  success: boolean
  error?: string
}

export interface MCPConnectServerRequest {
  serverId: string
}

export interface MCPConnectServerResponse {
  success: boolean
  server?: MCPServerState
  error?: string
}

export interface MCPDisconnectServerRequest {
  serverId: string
}

export interface MCPDisconnectServerResponse {
  success: boolean
  error?: string
}

export interface MCPRefreshServerRequest {
  serverId: string
}

export interface MCPRefreshServerResponse {
  success: boolean
  server?: MCPServerState
  error?: string
}

export interface MCPGetToolsResponse {
  success: boolean
  tools?: MCPToolInfo[]
  error?: string
}

export interface MCPCallToolRequest {
  serverId: string
  toolName: string
  arguments: Record<string, any>
}

export interface MCPCallToolResponse {
  success: boolean
  content?: Array<{
    type: 'text' | 'image' | 'resource'
    text?: string
    data?: string
    mimeType?: string
  }>
  error?: string
  isError?: boolean
}

export interface MCPGetResourcesResponse {
  success: boolean
  resources?: MCPResourceInfo[]
  error?: string
}

export interface MCPReadResourceRequest {
  serverId: string
  uri: string
}

export interface MCPReadResourceResponse {
  success: boolean
  content?: any
  error?: string
}

export interface MCPGetPromptsResponse {
  success: boolean
  prompts?: MCPPromptInfo[]
  error?: string
}

export interface MCPGetPromptRequest {
  serverId: string
  name: string
  arguments?: Record<string, string>
}

export interface MCPGetPromptResponse {
  success: boolean
  messages?: any[]
  error?: string
}
