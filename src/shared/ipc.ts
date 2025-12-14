// IPC Channel Names
export const IPC_CHANNELS = {
  // Chat related
  SEND_MESSAGE: 'chat:send-message',
  GET_CHAT_HISTORY: 'chat:get-history',
  CLEAR_CHAT: 'chat:clear',
  GENERATE_TITLE: 'chat:generate-title',
  EDIT_AND_RESEND: 'chat:edit-and-resend',

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
} as const

// Type definitions for IPC messages
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error' // 'error' is display-only, not sent to AI
  content: string
  timestamp: number
  isStreaming?: boolean
  errorDetails?: string // Original API error for 'error' role
}

export interface ChatSession {
  id: string
  name: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  // Branch support
  parentId?: string // Parent session ID if this is a branch
  branchFromMessageId?: string // The message ID from which this branch was created
}

export enum AIProvider {
  OpenAI = 'openai',
  Claude = 'claude',
  Custom = 'custom',
}

export interface AISettings {
  provider: AIProvider
  apiKey: string
  model: string
  temperature: number
  customApiUrl?: string
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

// Edit and resend message
export interface EditAndResendRequest {
  sessionId: string
  messageId: string // The user message to edit
  newContent: string // New content for the message
}

export interface EditAndResendResponse {
  success: boolean
  userMessage?: ChatMessage
  assistantMessage?: ChatMessage
  error?: string
  errorDetails?: string
}

// Create branch from AI response
export interface CreateBranchRequest {
  parentSessionId: string
  branchFromMessageId: string // The assistant message to branch from
}

export interface CreateBranchResponse {
  success: boolean
  session?: ChatSession
  error?: string
}
