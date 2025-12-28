// IPC Channel Names
export const IPC_CHANNELS = {
  // Chat related
  SEND_MESSAGE: 'chat:send-message',
  SEND_MESSAGE_STREAM: 'chat:send-message-stream',
  GET_CHAT_HISTORY: 'chat:get-history',
  CLEAR_CHAT: 'chat:clear',
  GENERATE_TITLE: 'chat:generate-title',
  EDIT_AND_RESEND: 'chat:edit-and-resend',
  EDIT_AND_RESEND_STREAM: 'chat:edit-and-resend-stream',

  // Streaming related
  STREAM_CHUNK: 'chat:stream-chunk',
  STREAM_REASONING_DELTA: 'chat:stream-reasoning-delta',
  STREAM_TEXT_DELTA: 'chat:stream-text-delta',
  STREAM_COMPLETE: 'chat:stream-complete',
  STREAM_ERROR: 'chat:stream-error',
  ABORT_STREAM: 'chat:abort-stream',
  GET_ACTIVE_STREAMS: 'chat:get-active-streams',

  // UIMessage streaming (AI SDK 5.x compatible)
  UI_MESSAGE_STREAM: 'chat:ui-message-stream',

  // Skill usage notification
  SKILL_ACTIVATED: 'chat:skill-activated',

  // Image generation notification
  IMAGE_GENERATED: 'chat:image-generated',

  // Step tracking for showing AI reasoning process
  STEP_ADDED: 'chat:step-added',
  STEP_UPDATED: 'chat:step-updated',

  // Session related
  GET_SESSIONS: 'sessions:get-all',
  CREATE_SESSION: 'sessions:create',
  SWITCH_SESSION: 'sessions:switch',
  DELETE_SESSION: 'sessions:delete',
  RENAME_SESSION: 'sessions:rename',
  CREATE_BRANCH: 'sessions:create-branch',
  UPDATE_SESSION_PIN: 'sessions:update-pin',
  UPDATE_SESSION_MODEL: 'sessions:update-model',
  UPDATE_SESSION_ARCHIVED: 'sessions:update-archived',
  UPDATE_SESSION_AGENT: 'sessions:update-agent',
  UPDATE_SESSION_WORKING_DIRECTORY: 'sessions:update-working-directory',
  GET_SESSION: 'sessions:get',
  GET_SESSION_TOKEN_USAGE: 'sessions:get-token-usage',
  UPDATE_SESSION_MAX_TOKENS: 'sessions:update-max-tokens',

  // Settings related
  GET_SETTINGS: 'settings:get',
  SAVE_SETTINGS: 'settings:save',
  OPEN_SETTINGS_WINDOW: 'settings:open-window',
  SETTINGS_CHANGED: 'settings:changed',
  GET_SYSTEM_THEME: 'settings:get-system-theme',
  SYSTEM_THEME_CHANGED: 'settings:system-theme-changed',

  // Models related
  FETCH_MODELS: 'models:fetch',
  GET_CACHED_MODELS: 'models:get-cached',
  // Model registry (OpenRouter-based with capabilities)
  GET_MODELS_WITH_CAPABILITIES: 'models:get-with-capabilities',
  GET_ALL_MODELS: 'models:get-all',
  SEARCH_MODELS: 'models:search',
  REFRESH_MODEL_REGISTRY: 'models:refresh-registry',
  GET_MODEL_NAME_ALIASES: 'models:get-name-aliases',
  GET_MODEL_DISPLAY_NAME: 'models:get-display-name',

  // Embedding models (from Models.dev registry)
  GET_EMBEDDING_MODELS: 'models:get-embedding',
  GET_ALL_EMBEDDING_MODELS: 'models:get-all-embedding',
  GET_EMBEDDING_DIMENSION: 'models:get-embedding-dimension',

  // Providers related
  GET_PROVIDERS: 'providers:get-all',

  // Tools related
  GET_TOOLS: 'tools:get-all',
  EXECUTE_TOOL: 'tools:execute',
  CANCEL_TOOL: 'tools:cancel',
  UPDATE_TOOL_CALL: 'tools:update-tool-call',
  STREAM_TOOL_CALL: 'chat:stream-tool-call',
  STREAM_TOOL_RESULT: 'chat:stream-tool-result',
  UPDATE_CONTENT_PARTS: 'chat:update-content-parts',
  UPDATE_MESSAGE_THINKING_TIME: 'chat:update-thinking-time',
  RESUME_AFTER_TOOL_CONFIRM: 'chat:resume-after-tool-confirm',

  // Permission related
  PERMISSION_REQUEST: 'permission:request',
  PERMISSION_RESPOND: 'permission:respond',
  PERMISSION_GET_PENDING: 'permission:get-pending',
  PERMISSION_CLEAR_SESSION: 'permission:clear-session',

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
  MCP_READ_CONFIG_FILE: 'mcp:read-config-file',

  // Dialog related
  SHOW_OPEN_DIALOG: 'dialog:show-open',

  // Image Preview related
  OPEN_IMAGE_PREVIEW: 'media:open-image-preview',
  OPEN_IMAGE_GALLERY: 'media:open-image-gallery',
  IMAGE_PREVIEW_UPDATE: 'image-preview:update',
  IMAGE_GALLERY_UPDATE: 'image-gallery:update',

  // Skills related (Official Claude Code Skills)
  SKILLS_GET_ALL: 'skills:get-all',
  SKILLS_REFRESH: 'skills:refresh',
  SKILLS_READ_FILE: 'skills:read-file',
  SKILLS_OPEN_DIRECTORY: 'skills:open-directory',
  SKILLS_CREATE: 'skills:create',
  SKILLS_DELETE: 'skills:delete',
  SKILLS_TOGGLE_ENABLED: 'skills:toggle-enabled',

  // Workspace related
  WORKSPACE_GET_ALL: 'workspaces:get-all',
  WORKSPACE_CREATE: 'workspaces:create',
  WORKSPACE_UPDATE: 'workspaces:update',
  WORKSPACE_DELETE: 'workspaces:delete',
  WORKSPACE_SWITCH: 'workspaces:switch',
  WORKSPACE_UPLOAD_AVATAR: 'workspaces:upload-avatar',

  // Agent related
  AGENT_GET_ALL: 'agents:get-all',
  AGENT_CREATE: 'agents:create',
  AGENT_UPDATE: 'agents:update',
  AGENT_DELETE: 'agents:delete',
  AGENT_UPLOAD_AVATAR: 'agents:upload-avatar',
  AGENT_PIN: 'agents:pin',
  AGENT_UNPIN: 'agents:unpin',

  // User Profile related
  USER_PROFILE_GET: 'user-profile:get',
  USER_PROFILE_ADD_FACT: 'user-profile:add-fact',
  USER_PROFILE_UPDATE_FACT: 'user-profile:update-fact',
  USER_PROFILE_DELETE_FACT: 'user-profile:delete-fact',

  // Agent Memory related
  AGENT_MEMORY_GET_RELATIONSHIP: 'agent-memory:get-relationship',
  AGENT_MEMORY_ADD_MEMORY: 'agent-memory:add-memory',
  AGENT_MEMORY_DELETE: 'agent-memory:delete',
  AGENT_MEMORY_RECALL: 'agent-memory:recall',
  AGENT_MEMORY_GET_ACTIVE: 'agent-memory:get-active',
  AGENT_MEMORY_UPDATE_RELATIONSHIP: 'agent-memory:update-relationship',
  AGENT_MEMORY_RECORD_INTERACTION: 'agent-memory:record-interaction',

  // OAuth related
  OAUTH_START: 'oauth:start',
  OAUTH_CALLBACK: 'oauth:callback',
  OAUTH_REFRESH: 'oauth:refresh',
  OAUTH_LOGOUT: 'oauth:logout',
  OAUTH_STATUS: 'oauth:status',
  OAUTH_DEVICE_POLL: 'oauth:device-poll',
  OAUTH_TOKEN_REFRESHED: 'oauth:token-refreshed',
  OAUTH_TOKEN_EXPIRED: 'oauth:token-expired',
} as const

// Content part types for sequential display
export type ContentPart =
  | { type: 'text'; content: string }
  | { type: 'tool-call'; toolCalls: ToolCall[] }
  | { type: 'waiting' }  // Waiting for AI continuation after tool call
  | { type: 'data-steps'; turnIndex: number }    // Placeholder for steps panel (rendered inline)

// Step types for showing AI reasoning process
export type StepType = 'skill-read' | 'tool-call' | 'thinking' | 'file-read' | 'file-write' | 'command' | 'tool-agent'

export interface Step {
  id: string
  type: StepType
  title: string                    // Short title (e.g., "查看agent-plan技能文档")
  description?: string             // Longer description shown when expanded
  status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting-confirmation'
  timestamp: number
  turnIndex?: number               // Which turn this step belongs to (for interleaving with text)
  toolCallId?: string              // Link to associated tool call if any
  // Tool call details for inline display
  toolCall?: ToolCall              // Full tool call object for displaying details
  thinking?: string                // AI's reasoning before this step (why it's doing this)
  result?: string                  // Tool execution result
  summary?: string                 // AI's analysis after getting the result
  error?: string                   // Error message if failed
  // Tool Agent specific fields
  toolAgentResult?: {              // Result from Tool Agent execution
    success: boolean
    summary: string
    toolCallCount: number
    filesModified?: string[]
    errors?: string[]
  }
}

// Message attachment types for file/image uploads
export type AttachmentMediaType = 'image' | 'document' | 'audio' | 'video' | 'file'

export interface MessageAttachment {
  id: string
  fileName: string
  mimeType: string           // e.g., 'image/jpeg', 'application/pdf'
  size: number               // File size in bytes
  mediaType: AttachmentMediaType
  base64Data?: string        // Base64 encoded file data (for sending to AI)
  url?: string               // Local file URL (for display, optional)
  width?: number             // Image width (for images)
  height?: number            // Image height (for images)
}

// Type definitions for IPC messages
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error'  // 'error' is display-only, not saved to backend
  content: string
  timestamp: number
  isStreaming?: boolean
  isThinking?: boolean
  errorDetails?: string  // Additional error details for error messages
  reasoning?: string  // Thinking/reasoning process for reasoning models (e.g., deepseek-reasoner)
  toolCalls?: ToolCall[]  // Tool calls made by the assistant (legacy, for backward compat)
  contentParts?: ContentPart[]  // Sequential content parts for inline tool call display
  model?: string  // AI model used for assistant messages
  thinkingTime?: number  // Final thinking time in seconds (persisted for display after session switch)
  thinkingStartTime?: number  // Timestamp when thinking started (for calculating elapsed time on session switch)
  skillUsed?: string  // Name of the skill used by the assistant (e.g., "agent-plan")
  steps?: Step[]  // Steps showing AI reasoning process
  attachments?: MessageAttachment[]  // File/image attachments
  // Token usage for this message (for assistant messages)
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

export interface ChatSession {
  id: string
  name: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  parentSessionId?: string
  branchFromMessageId?: string
  lastModel?: string
  lastProvider?: string
  isPinned?: boolean
  isArchived?: boolean  // Archived (soft-deleted) session
  archivedAt?: number   // Timestamp when session was archived
  workspaceId?: string  // Associated workspace ID, null/undefined = default mode
  agentId?: string      // Associated agent ID for system prompt injection
  // Sandbox boundary - tools restrict file access to this directory
  workingDirectory?: string  // Project directory for this session (sandbox boundary)
  // Context compacting fields
  summary?: string              // Conversation summary for context window management
  summaryUpToMessageId?: string // ID of the last message included in the summary
  summaryCreatedAt?: number     // Timestamp when summary was created
  // Token usage tracking
  totalInputTokens?: number     // Accumulated input tokens for this session
  totalOutputTokens?: number    // Accumulated output tokens for this session
  totalTokens?: number          // Accumulated total tokens for this session
}

// Provider IDs - can be extended by adding new providers
export type AIProviderId = 'openai' | 'claude' | 'deepseek' | 'kimi' | 'zhipu' | 'gemini' | 'custom' | string

// Legacy enum for backwards compatibility
export enum AIProvider {
  OpenAI = 'openai',
  Claude = 'claude',
  DeepSeek = 'deepseek',
  Kimi = 'kimi',
  Zhipu = 'zhipu',
  OpenRouter = 'openrouter',
  Gemini = 'gemini',
  ClaudeCode = 'claude-code',
  GitHubCopilot = 'github-copilot',
  Custom = 'custom',
}

// OAuth flow types
export type OAuthFlowType = 'authorization-code' | 'device'

// OAuth token structure
export interface OAuthToken {
  accessToken: string
  refreshToken?: string
  expiresAt: number        // Timestamp in milliseconds
  tokenType: string        // e.g., 'Bearer'
  scope?: string           // OAuth scopes
}

/**
 * OpenRouter Model Definition (直接使用 OpenRouter API 字段)
 */
export interface OpenRouterModel {
  id: string
  name: string
  description?: string
  context_length: number
  architecture: {
    modality: string
    input_modalities: string[]  // 'text', 'image', 'file', 'audio', 'video'
    output_modalities: string[] // 'text', 'image', 'embeddings'
    tokenizer: string
  }
  pricing: {
    prompt: string
    completion: string
    request: string
    image: string
  }
  top_provider: {
    context_length: number
    max_completion_tokens: number
    is_moderated: boolean
  }
  supported_parameters: string[]  // 'temperature', 'tools', 'reasoning', 'response_format', etc.
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
  // OAuth-specific fields
  requiresOAuth?: boolean            // Whether this provider uses OAuth instead of API key
  oauthFlow?: OAuthFlowType          // Type of OAuth flow (PKCE or Device)
  // Model definitions (from OpenRouter API)
  models?: OpenRouterModel[]
}

// Per-provider configuration
export interface ProviderConfig {
  apiKey?: string           // Optional for OAuth providers
  baseUrl?: string
  model: string             // Currently active model
  selectedModels: string[]  // List of models user has selected/enabled for quick switching
  enabled?: boolean         // Whether this provider is shown in the chat model selector
  // OAuth-specific fields (used when provider.requiresOAuth = true)
  authType?: 'apiKey' | 'oauth'  // Authentication method
  oauthToken?: OAuthToken        // Stored OAuth token (encrypted in storage)
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

export type ColorTheme = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan' | 'red'

// Base theme controls the overall look (backgrounds, text colors, etc.)
export type BaseTheme =
  | 'obsidian' | 'ocean' | 'forest' | 'rose' | 'ember'  // Original themes
  | 'nord' | 'dracula' | 'tokyo' | 'catppuccin' | 'gruvbox' | 'onedark' | 'github' | 'rosepine'  // New themes

// Keyboard shortcut configuration
export interface KeyboardShortcut {
  key: string           // Main key (e.g., 'Enter', 'n', '/')
  ctrlKey?: boolean
  metaKey?: boolean     // Cmd on Mac
  shiftKey?: boolean
  altKey?: boolean
}

export interface ShortcutSettings {
  sendMessage: KeyboardShortcut      // Send message
  newChat: KeyboardShortcut          // New chat
  closeChat: KeyboardShortcut        // Close current chat
  toggleSidebar: KeyboardShortcut    // Toggle sidebar
  focusInput: KeyboardShortcut       // Focus input (default /)
}

export interface GeneralSettings {
  animationSpeed: number  // 0.1 - 0.5 seconds, default 0.25
  sendShortcut: 'enter' | 'ctrl-enter' | 'cmd-enter'  // Legacy, kept for compatibility
  colorTheme: ColorTheme  // Accent color theme
  baseTheme: BaseTheme    // Base theme (overall colors)
  shortcuts?: ShortcutSettings  // Custom keyboard shortcuts
}

// Chat settings for model parameters
export interface ChatSettings {
  temperature: number           // 0-2, default 0.7
  maxTokens: number            // Maximum output tokens, default 4096
  topP?: number                // Nucleus sampling, 0-1, default 1
  presencePenalty?: number     // -2 to 2, default 0
  frequencyPenalty?: number    // -2 to 2, default 0
  branchOpenInSplitScreen?: boolean  // Whether branches open in split screen, default true
}

// Supported embedding provider types
export type EmbeddingProviderType = 'openai' | 'zhipu' | 'gemini' | 'local'

// Embedding provider metadata for UI
export interface EmbeddingProviderMeta {
  id: EmbeddingProviderType
  name: string
  defaultModel: string
  models: { id: string; name: string; dimensions?: number }[]
  supportsCustomDimensions?: boolean
}

// Embedding settings for memory system
export interface EmbeddingSettings {
  provider: EmbeddingProviderType  // Which embedding provider to use
  memoryEnabled?: boolean          // Master switch for memory extraction (default: true)

  // Common model settings (applies to API providers)
  model?: string                   // Selected model ID
  dimensions?: number              // Vector dimensions (if supported by model)

  // Optional overrides (if not set, use AI Provider config)
  apiKeyOverride?: string
  baseUrlOverride?: string

  // Legacy fields (for backward compatibility)
  openai?: {
    apiKey?: string
    baseUrl?: string
    model: string
    dimensions?: number
  }
  local?: {
    model: string
  }
}

export interface AppSettings {
  ai: AISettings
  theme: 'light' | 'dark' | 'system'
  general: GeneralSettings
  chat?: ChatSettings
  tools: ToolSettings
  mcp?: MCPSettings
  skills?: SkillSettings
  embedding?: EmbeddingSettings
}

// IPC Request/Response types
export interface SendMessageRequest {
  sessionId: string
  message: string
  attachments?: MessageAttachment[]  // File/image attachments
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
  parentSessionId?: string  // Parent session ID if deleted session was a branch
  deletedCount?: number     // Total count of deleted sessions (including cascaded children)
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

export interface UpdateSessionPinRequest {
  sessionId: string
  isPinned: boolean
}

export interface UpdateSessionPinResponse {
  success: boolean
  error?: string
}

export interface GetSettingsResponse {
  success: boolean
  settings?: AppSettings
  error?: string
}

export interface SaveSettingsRequest extends AppSettings { }

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
export type ModelType = 'chat' | 'image' | 'embedding' | 'audio' | 'tts' | 'other'

export interface ModelInfo {
  id: string
  name: string
  description?: string
  createdAt?: string
  type?: ModelType
}

// Embedding model with dimension info (from Models.dev registry)
export interface EmbeddingModelInfo {
  id: string
  name: string
  dimension: number
  isConfigurable: boolean  // true if dimension can be customized
  providerId: string       // Our provider ID (openai, gemini, zhipu, etc.)
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
  // Tool source for UI display
  source?: 'builtin' | 'mcp'  // Where the tool comes from
  serverId?: string           // MCP server ID (only for MCP tools)
  serverName?: string         // MCP server name (only for MCP tools)
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
  startTime?: number         // Execution start timestamp
  endTime?: number           // Execution end timestamp
  // For dangerous commands that need user confirmation
  requiresConfirmation?: boolean
  commandType?: 'read-only' | 'dangerous' | 'forbidden'
}

// Bash tool specific settings
export interface BashToolSettings {
  enableSandbox: boolean              // Whether to enable directory sandbox
  defaultWorkingDirectory?: string    // Default working directory for commands
  allowedDirectories: string[]        // List of allowed directories
  confirmDangerousCommands: boolean   // Whether to confirm dangerous commands
  dangerousCommandWhitelist: string[] // Commands to skip confirmation (e.g., "npm install")
}

// Tool Agent delegation settings
export interface ToolAgentSettings {
  autoConfirmDangerous?: boolean  // Auto-confirm dangerous commands (default: true)
  maxToolCalls?: number           // Max tool calls per delegation (default: 50)
  timeoutMs?: number              // Timeout for Tool Agent (default: 300000 = 5 min)
  providerId?: string             // Optional: use different provider for Tool Agent
  model?: string                  // Optional: use different model for Tool Agent
}

export interface ToolSettings {
  // Global tool settings
  enableToolCalls: boolean   // Master switch for tool calls
  // Per-tool settings (toolId -> settings)
  tools: Record<string, {
    enabled: boolean
    autoExecute: boolean
  }>
  // Bash tool specific settings
  bash?: BashToolSettings
  // Tool Agent settings (provider/model for tool execution)
  toolAgentSettings?: ToolAgentSettings
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

export interface MCPReadConfigFileRequest {
  filePath: string
}

export interface MCPReadConfigFileResponse {
  success: boolean
  content?: any
  error?: string
}

// ============================================
// OAuth related types
// ============================================

// OAuth start request
export interface OAuthStartRequest {
  providerId: string
}

// OAuth start response (for authorization-code flow with PKCE)
export interface OAuthStartResponse {
  success: boolean
  // For PKCE flow - returns auth URL to open in browser
  authUrl?: string
  state?: string
  // For device flow - returns user code to display
  userCode?: string
  verificationUri?: string
  expiresIn?: number
  interval?: number
  // For manual code entry flow (Claude Code)
  requiresCodeEntry?: boolean
  instructions?: string
  error?: string
}

// OAuth callback request (after user completes auth in browser)
export interface OAuthCallbackRequest {
  providerId: string
  code: string
  state: string
}

// OAuth callback response
export interface OAuthCallbackResponse {
  success: boolean
  error?: string
}

// OAuth status request
export interface OAuthStatusRequest {
  providerId: string
}

// OAuth status response
export interface OAuthStatusResponse {
  success: boolean
  isLoggedIn: boolean
  expiresAt?: number
  error?: string
}

// OAuth logout request
export interface OAuthLogoutRequest {
  providerId: string
}

// OAuth logout response
export interface OAuthLogoutResponse {
  success: boolean
  error?: string
}

// OAuth device poll request (for device flow)
export interface OAuthDevicePollRequest {
  providerId: string
  deviceCode: string
}

// OAuth device poll response
export interface OAuthDevicePollResponse {
  success: boolean
  completed: boolean
  error?: string
  // 'authorization_pending' | 'slow_down' | 'expired_token' | 'access_denied'
  pollStatus?: string
}

// ============================================
// Skills related types (Official Claude Code Skills format)
// ============================================

// Skill source location
export type SkillSource = 'user' | 'project' | 'plugin'

// Skill definition based on official Claude Code Skills
export interface SkillDefinition {
  // Parsed from SKILL.md YAML frontmatter
  name: string                    // max 64 chars, lowercase letters/numbers/hyphens
  description: string             // max 1024 chars, what it does AND when to use
  allowedTools?: string[]         // Optional tool restrictions

  // Metadata added by loader
  id: string                      // Unique identifier (path-based)
  source: SkillSource             // 'user' (~/.claude/skills) or 'project' (.claude/skills)
  path: string                    // Full path to SKILL.md
  directoryPath: string           // Path to skill directory
  enabled: boolean                // Whether skill is enabled

  // Content
  instructions: string            // Main body of SKILL.md (after frontmatter)

  // Optional: additional files in the skill directory
  files?: SkillFile[]
}

// Additional file in a skill directory
export interface SkillFile {
  name: string
  path: string
  type: 'markdown' | 'script' | 'template' | 'other'
}

// Skill settings
export interface SkillSettings {
  enableSkills: boolean
  // Per-skill enabled state (keyed by skill id)
  skills: Record<string, { enabled: boolean }>
}

// Skills IPC Request/Response types
export interface GetSkillsResponse {
  success: boolean
  skills?: SkillDefinition[]
  error?: string
}

// Refresh skills from filesystem
export interface RefreshSkillsResponse {
  success: boolean
  skills?: SkillDefinition[]
  error?: string
}

// Read a skill file
export interface ReadSkillFileRequest {
  skillId: string
  fileName: string
}

export interface ReadSkillFileResponse {
  success: boolean
  content?: string
  error?: string
}

// Open skill directory in file manager
export interface OpenSkillDirectoryRequest {
  skillId: string
}

export interface OpenSkillDirectoryResponse {
  success: boolean
  error?: string
}

// Create new skill
export interface CreateSkillRequest {
  name: string
  description: string
  instructions: string
  source: SkillSource
}

export interface CreateSkillResponse {
  success: boolean
  skill?: SkillDefinition
  error?: string
}

// ============================================
// Workspace related types
// ============================================

// Workspace avatar type
export interface WorkspaceAvatar {
  type: 'emoji' | 'image'
  value: string  // Emoji character or image file path
}

// Workspace definition
export interface Workspace {
  id: string
  name: string
  avatar: WorkspaceAvatar
  workingDirectory?: string  // Default working directory for new sessions
  systemPrompt?: string  // Deprecated: migrated to Agent, kept for backward compatibility
  createdAt: number
  updatedAt: number
}

// Workspace IPC Request/Response types
export interface GetWorkspacesResponse {
  success: boolean
  workspaces?: Workspace[]
  currentWorkspaceId?: string | null
  error?: string
}

export interface CreateWorkspaceRequest {
  name: string
  avatar: WorkspaceAvatar
  workingDirectory?: string
  systemPrompt: string
}

export interface CreateWorkspaceResponse {
  success: boolean
  workspace?: Workspace
  error?: string
}

export interface UpdateWorkspaceRequest {
  id: string
  name?: string
  avatar?: WorkspaceAvatar
  workingDirectory?: string
  systemPrompt?: string
}

export interface UpdateWorkspaceResponse {
  success: boolean
  workspace?: Workspace
  error?: string
}

export interface DeleteWorkspaceRequest {
  workspaceId: string
}

export interface DeleteWorkspaceResponse {
  success: boolean
  deletedSessionCount?: number
  error?: string
}

export interface SwitchWorkspaceRequest {
  workspaceId: string | null  // null = switch to default mode
}

export interface SwitchWorkspaceResponse {
  success: boolean
  error?: string
}

export interface UploadWorkspaceAvatarRequest {
  workspaceId: string
  imageData: string  // Base64 encoded image data
  mimeType: string
}

export interface UploadWorkspaceAvatarResponse {
  success: boolean
  avatarPath?: string
  error?: string
}

// ============================================
// Agent related types
// ============================================

// Agent avatar type (same as WorkspaceAvatar)
export interface AgentAvatar {
  type: 'emoji' | 'image'
  value: string  // Emoji character or image file path
}

// Agent voice configuration (Browser TTS)
export interface AgentVoice {
  enabled: boolean
  voiceURI?: string    // Browser SpeechSynthesis voiceURI
  rate?: number        // 0.1 - 10, default 1
  pitch?: number       // 0 - 2, default 1
  volume?: number      // 0 - 1, default 1
}

// Skill permission type
export type SkillPermission = 'allow' | 'ask' | 'deny'

// Agent permissions configuration
export interface AgentPermissions {
  // Skill permissions: pattern -> permission
  // Supports wildcards: "*" matches all, "prefix-*" matches prefix
  // Later patterns override earlier ones
  skill?: Record<string, SkillPermission>
}

// Agent definition
export interface Agent {
  id: string
  name: string
  avatar: AgentAvatar
  systemPrompt: string
  // Extended persona fields
  tagline?: string           // 一句话介绍
  personality?: string[]     // 性格标签 ['耐心', '幽默', '专业']
  primaryColor?: string      // 主题色 (hex color)
  // Voice configuration
  voice?: AgentVoice
  // Permissions configuration
  permissions?: AgentPermissions
  createdAt: number
  updatedAt: number
}

// Agent IPC Request/Response types
export interface GetAgentsResponse {
  success: boolean
  agents?: Agent[]
  pinnedAgentIds?: string[]
  error?: string
}

export interface CreateAgentRequest {
  name: string
  avatar: AgentAvatar
  systemPrompt: string
  tagline?: string
  personality?: string[]
  primaryColor?: string
  voice?: AgentVoice
  permissions?: AgentPermissions
}

export interface CreateAgentResponse {
  success: boolean
  agent?: Agent
  error?: string
}

export interface UpdateAgentRequest {
  id: string
  name?: string
  avatar?: AgentAvatar
  systemPrompt?: string
  tagline?: string
  personality?: string[]
  primaryColor?: string
  voice?: AgentVoice
  permissions?: AgentPermissions
}

export interface UpdateAgentResponse {
  success: boolean
  agent?: Agent
  error?: string
}

export interface DeleteAgentRequest {
  agentId: string
}

export interface DeleteAgentResponse {
  success: boolean
  error?: string
}

export interface UploadAgentAvatarRequest {
  agentId: string
  imageData: string  // Base64 encoded image data
  mimeType: string
}

export interface UploadAgentAvatarResponse {
  success: boolean
  avatarPath?: string
  error?: string
}

export interface PinAgentRequest {
  agentId: string
}

export interface PinAgentResponse {
  success: boolean
  pinnedAgentIds?: string[]
  error?: string
}

export interface UnpinAgentRequest {
  agentId: string
}

export interface UnpinAgentResponse {
  success: boolean
  pinnedAgentIds?: string[]
  error?: string
}

// ============================================
// User Profile related types
// ============================================

// Fact category for user profile
export type UserFactCategory = 'personal' | 'preference' | 'goal' | 'trait'

// A single fact about the user
export interface UserFact {
  id: string
  content: string                // The fact content
  category: UserFactCategory     // Category of the fact
  confidence: number             // 0-100, how confident we are about this fact
  sources: string[]              // Which agents contributed this fact
  createdAt: number
  updatedAt: number
  embedding?: number[]           // Cached embedding vector (optional)
}

// User profile - shared across all agents
export interface UserProfile {
  id: string
  facts: UserFact[]
  createdAt: number
  updatedAt: number
}

// User Profile IPC Request/Response types
export interface GetUserProfileResponse {
  success: boolean
  profile?: UserProfile
  error?: string
}

export interface AddUserFactRequest {
  content: string
  category: UserFactCategory
  confidence?: number
  sourceAgentId?: string
}

export interface AddUserFactResponse {
  success: boolean
  fact?: UserFact
  error?: string
}

export interface UpdateUserFactRequest {
  factId: string
  content?: string
  category?: UserFactCategory
  confidence?: number
}

export interface UpdateUserFactResponse {
  success: boolean
  fact?: UserFact
  error?: string
}

export interface DeleteUserFactRequest {
  factId: string
}

export interface DeleteUserFactResponse {
  success: boolean
  error?: string
}

// ============================================
// Agent Memory related types
// ============================================

// Memory category
export type AgentMemoryCategory = 'observation' | 'event' | 'feeling' | 'learning'

// Memory vividness level
export type MemoryVividness = 'vivid' | 'clear' | 'hazy' | 'fragment'

// Agent mood
export type AgentMood = 'happy' | 'neutral' | 'concerned' | 'excited'

// A single memory entry
export interface AgentMemory {
  id: string
  content: string
  category: AgentMemoryCategory

  // Memory strength system
  strength: number           // 0-100
  emotionalWeight: number    // Higher = decays slower

  // Reinforcement factors
  createdAt: number
  lastRecalledAt: number
  recallCount: number
  linkedMemories: string[]

  // Memory state
  vividness: MemoryVividness

  // Cached embedding vector (optional, for similarity search)
  embedding?: number[]
}

// Agent's relationship with user
export interface AgentUserRelationship {
  agentId: string

  // Relationship status
  relationship: {
    trustLevel: number        // 0-100
    familiarity: number       // 0-100
    lastInteraction: number
    totalInteractions: number
  }

  // Agent's subjective feelings
  agentFeelings: {
    currentMood: AgentMood
    notes: string
  }

  // Observations from agent's perspective
  observations: AgentMemory[]

  // Domain-specific memory
  domainMemory: Record<string, unknown>
}

// Agent Memory IPC Request/Response types
export interface GetAgentRelationshipRequest {
  agentId: string
}

export interface GetAgentRelationshipResponse {
  success: boolean
  relationship?: AgentUserRelationship
  error?: string
}

export interface AddAgentMemoryRequest {
  agentId: string
  content: string
  category: AgentMemoryCategory
  emotionalWeight?: number
}

export interface AddAgentMemoryResponse {
  success: boolean
  memory?: AgentMemory
  error?: string
}

export interface DeleteAgentMemoryRequest {
  memoryId: string
}

export interface DeleteAgentMemoryResponse {
  success: boolean
  error?: string
}

export interface RecallAgentMemoryRequest {
  agentId: string
  memoryId: string
}

export interface RecallAgentMemoryResponse {
  success: boolean
  memory?: AgentMemory
  error?: string
}

export interface GetActiveMemoriesRequest {
  agentId: string
  limit?: number
}

export interface GetActiveMemoriesResponse {
  success: boolean
  memories?: AgentMemory[]
  error?: string
}

export interface UpdateAgentRelationshipRequest {
  agentId: string
  updates: {
    trustLevel?: number
    familiarity?: number
    mood?: AgentMood
    moodNotes?: string
  }
}

export interface UpdateAgentRelationshipResponse {
  success: boolean
  relationship?: AgentUserRelationship
  error?: string
}

export interface RecordInteractionRequest {
  agentId: string
}

export interface RecordInteractionResponse {
  success: boolean
  relationship?: AgentUserRelationship
  error?: string
}

// Permission related types
export interface PermissionInfo {
  id: string
  type: string
  pattern?: string | string[]
  sessionId: string
  messageId: string
  callId?: string
  title: string
  metadata: Record<string, unknown>
  createdAt: number
}

export type PermissionResponse = 'once' | 'always' | 'reject'

export interface PermissionRespondRequest {
  sessionId: string
  permissionId: string
  response: PermissionResponse
}

// Agent permission configuration
export interface AgentPermissionConfig {
  // Bash command permissions: allow, ask, deny
  bash?: 'allow' | 'ask' | 'deny' | BashPermissionRules
  // External directory access
  externalDirectory?: 'allow' | 'ask' | 'deny'
  // File write permissions
  fileWrite?: 'allow' | 'ask' | 'deny'
  // File read permissions
  fileRead?: 'allow' | 'ask' | 'deny'
}

export interface BashPermissionRules {
  // Default action for unlisted commands
  default: 'allow' | 'ask' | 'deny'
  // Specific command rules (pattern -> action)
  rules: Record<string, 'allow' | 'ask' | 'deny'>
}

// ============================================
// UIMessage types (AI SDK 5.x compatible)
//
// These types follow the AI SDK 5.x UIMessage structure but are defined
// locally to allow custom extensions (Steps, Error parts) that aren't
// part of the standard SDK types.
//
// The types are designed to be compatible with AI SDK's convertToModelMessages()
// when converting to model messages for API calls.
// ============================================

/**
 * Tool Part state machine (matches AI SDK 5.x)
 */
export type ToolUIState =
  | 'input-streaming'    // Input is being streamed
  | 'input-available'    // Input complete, waiting for execution
  | 'output-available'   // Execution complete with output
  | 'output-error'       // Execution failed with error

/**
 * Text Part (matches AI SDK 5.x TextUIPart)
 */
export interface TextUIPart {
  type: 'text'
  /** Text content */
  text: string
  /** Streaming state */
  state?: 'streaming' | 'done'
}

/**
 * Reasoning Part (matches AI SDK 5.x ReasoningUIPart)
 */
export interface ReasoningUIPart {
  type: 'reasoning'
  /** Reasoning text */
  text: string
  /** Streaming state */
  state?: 'streaming' | 'done'
  /** Provider metadata */
  providerMetadata?: Record<string, unknown>
}

/**
 * File Part (matches AI SDK 5.x FileUIPart)
 */
export interface FileUIPart {
  type: 'file'
  /** IANA media type */
  mediaType: string
  /** Optional filename */
  filename?: string
  /** File URL (can be data URL or hosted URL) */
  url: string
}

/**
 * Tool Part (extends AI SDK 5.x ToolUIPart with custom fields)
 */
export interface ToolUIPart {
  /** Type format: 'tool-{toolName}' */
  type: `tool-${string}`
  /** Tool call ID */
  toolCallId: string
  /** Tool name (convenience field) */
  toolName?: string
  /** State machine state */
  state: ToolUIState
  /** Tool input parameters */
  input?: Record<string, unknown>
  /** Tool output result */
  output?: unknown
  /** Error text */
  errorText?: string
  /** Provider executed flag */
  providerExecuted?: boolean
  /** Whether requires user confirmation (for Permission system) */
  requiresConfirmation?: boolean
  /** Command type (for bash tool) */
  commandType?: 'read-only' | 'dangerous' | 'forbidden'
  /** Execution start time */
  startTime?: number
  /** Execution end time */
  endTime?: number
}

/**
 * Step Start Part (matches AI SDK 5.x StepStartUIPart)
 * Used to mark boundaries between multi-step tool calls
 */
export interface StepStartUIPart {
  type: 'step-start'
}

/**
 * Steps Data Part - custom extension using DataUIPart pattern (data-${NAME})
 * For displaying AI reasoning steps with rich details
 */
export interface StepsDataUIPart {
  type: 'data-steps'
  /** Turn index */
  turnIndex: number
  /** Steps list */
  steps: Step[]
}

/**
 * Error Data Part - custom extension using DataUIPart pattern
 * For displaying error messages
 */
export interface ErrorDataUIPart {
  type: 'data-error'
  /** Error message */
  text: string
  /** Error details */
  details?: string
}

/**
 * All Part types union (compatible with AI SDK 5.x)
 */
export type UIMessagePart =
  | TextUIPart
  | ReasoningUIPart
  | ToolUIPart
  | FileUIPart
  | StepStartUIPart
  | StepsDataUIPart
  | ErrorDataUIPart

// Type aliases for backward compatibility
/** @deprecated Use StepsDataUIPart */
export type StepUIPart = StepsDataUIPart
/** @deprecated Use ErrorDataUIPart */
export type ErrorUIPart = ErrorDataUIPart

/**
 * Message metadata - custom fields for our app
 */
export interface MessageMetadata {
  /** Message timestamp */
  timestamp: number
  /** Model used */
  model?: string
  /** Thinking time (seconds) */
  thinkingTime?: number
  /** Thinking start timestamp */
  thinkingStartTime?: number
  /** Skill used */
  skillUsed?: string
  /** Attachments */
  attachments?: MessageAttachment[]
  /** Is error message (compat for old role: 'error') */
  isError?: boolean
  /** Error details */
  errorDetails?: string
}

/**
 * UIMessage - unified message format (AI SDK 5.x compatible structure)
 */
export interface UIMessage<METADATA = MessageMetadata> {
  /** Unique message ID */
  id: string
  /** Message role */
  role: 'system' | 'user' | 'assistant'
  /** Message content parts */
  parts: UIMessagePart[]
  /** Message metadata */
  metadata?: METADATA
}

// ============================================
// UIMessage stream types (for IPC transport)
// ============================================

/**
 * UIMessage stream chunk types
 */
export type UIMessageChunk =
  | UIMessagePartChunk
  | UIMessageFinishChunk

/**
 * Part update chunk
 */
export interface UIMessagePartChunk {
  type: 'part'
  /** Message ID */
  messageId: string
  /** Updated part */
  part: UIMessagePart
  /** Part index in parts array */
  partIndex?: number
}

/**
 * Token usage data from Vercel AI SDK
 */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

/**
 * Session token usage statistics
 */
export interface SessionTokenUsage {
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  maxTokens: number
}

/**
 * Message finish chunk
 */
export interface UIMessageFinishChunk {
  type: 'finish'
  /** Message ID */
  messageId: string
  /** Finish reason */
  finishReason: 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error' | 'other'
  /** Token usage data */
  usage?: TokenUsage
}

/**
 * UIMessage stream IPC data
 */
export interface UIMessageStreamData {
  sessionId: string
  messageId: string
  chunk: UIMessageChunk
}

// ============================================
// Type guards
// ============================================

export function isTextUIPart(part: UIMessagePart): part is TextUIPart {
  return part.type === 'text'
}

export function isReasoningUIPart(part: UIMessagePart): part is ReasoningUIPart {
  return part.type === 'reasoning'
}

export function isToolUIPart(part: UIMessagePart): part is ToolUIPart {
  return part.type.startsWith('tool-')
}

export function isFileUIPart(part: UIMessagePart): part is FileUIPart {
  return part.type === 'file'
}

export function isStepUIPart(part: UIMessagePart): part is StepUIPart {
  return part.type === 'data-steps'
}

export function isErrorUIPart(part: UIMessagePart): part is ErrorDataUIPart {
  return part.type === 'data-error'
}

/**
 * Get tool name from ToolUIPart
 */
export function getToolName(part: ToolUIPart): string {
  return part.toolName || part.type.replace('tool-', '')
}

// Re-export tool state mapping utilities
export type { LegacyToolStatus } from './tool-state-mapping.js'

export {
  LEGACY_TO_UI_STATE,
  UI_TO_LEGACY_STATE,
  legacyStatusToUIState,
  uiStateToLegacyStatus,
  isToolInProgress,
  isToolFinished,
  isToolSuccess,
  isToolError,
  isToolWaitingInput,
  isToolWaitingExecution,
} from './tool-state-mapping.js'
