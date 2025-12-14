// IPC Channel Names
export const IPC_CHANNELS = {
  // Chat related
  SEND_MESSAGE: 'chat:send-message',
  GET_CHAT_HISTORY: 'chat:get-history',
  CLEAR_CHAT: 'chat:clear',
  GENERATE_TITLE: 'chat:generate-title',

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
} as const

// Type definitions for IPC messages
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  isStreaming?: boolean
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

export enum AIProvider {
  OpenAI = 'openai',
  Claude = 'claude',
  Custom = 'custom',
}

// Per-provider configuration
export interface ProviderConfig {
  apiKey: string
  baseUrl?: string
  model: string
}

export interface AISettings {
  provider: AIProvider
  temperature: number
  // Per-provider configurations
  providers: {
    [AIProvider.OpenAI]: ProviderConfig
    [AIProvider.Claude]: ProviderConfig
    [AIProvider.Custom]: ProviderConfig
  }
}

export interface AppSettings {
  ai: AISettings
  theme: 'light' | 'dark'
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
  error?: string
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
