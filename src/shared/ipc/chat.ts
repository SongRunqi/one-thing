/**
 * Chat Module
 * Chat and message-related type definitions for IPC communication
 */

import type {
  PermissionMode,
  ToolCall,
  ToolExecutionMode,
  ToolParameter,
  ToolPartialResult,
  ToolRenderKind,
} from './tools.js'
import type { PromptReferenceSnapshot } from './prompts.js'
import type { SkillConditions, SkillReferenceSnapshot, SkillSource } from './skills.js'
import type { VoiceTranscriptMetadata } from './voice.js'
import type { MessageOrigin } from './channel-identity.js'

/**
 * @deprecated Kept as a type alias for one version so old persisted
 * session data with a `level` field still parses. New code does not
 * read or write this field.
 */
export type VariableLevel = 'system' | 'session'

export interface ContextVariable {
  name: string
  value: string
  values?: string[]
  scope?: 'global' | 'session'
  description?: string
  readonly?: boolean
  updatedAt?: number
}

// Content part types for sequential display
export type ContentPart =
  | { type: 'text'; content: string; turnIndex?: number }
  | ({ type: 'prompt-ref'; turnIndex?: number } & PromptReferenceSnapshot)
  | ({ type: 'skill-ref'; turnIndex?: number } & SkillReferenceSnapshot)
  | { type: 'reasoning'; content: string; turnIndex?: number }
  | { type: 'tool-call'; toolCalls: ToolCall[] }
  | { type: 'waiting'; turnIndex?: number }      // Waiting for AI continuation after tool call
  | { type: 'loading-memory' }                   // Loading memory before generation begins
  | { type: 'image-loading'; turnIndex?: number; label?: string } // Image generation skeleton
  | { type: 'data-steps'; turnIndex: number }    // Placeholder for steps panel (rendered inline)
  | { type: 'provider-data'; provider: string; encryptedReasoning?: string; turnIndex?: number } // Hidden provider context

// Helper: parts whose presence/absence affects subsequent content layout.
// Used by the chunk reducer to pop trailing transient indicators when real
// content arrives.
export function isTransientPart(part: ContentPart): boolean {
  return part.type === 'waiting' || part.type === 'loading-memory' || part.type === 'image-loading'
}

// Step types for showing AI reasoning process
export type StepType = 'skill-read' | 'tool-call' | 'thinking' | 'file-read' | 'file-write' | 'command'

export interface Step {
  id: string
  type: StepType
  title: string                    // Short title (e.g., "查看agent-plan技能文档")
  description?: string             // Longer description shown when expanded
  status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting-confirmation' | 'cancelled'
  timestamp: number
  turnIndex?: number               // Which turn this step belongs to (for interleaving with text)
  toolCallId?: string              // Link to associated tool call if any
  // Tool call details for inline display
  toolCall?: ToolCall              // Full tool call object for displaying details
  thinking?: string                // AI's reasoning before this step (why it's doing this)
  result?: string                  // Tool execution result
  partialResult?: ToolPartialResult // Structured partial tool result while execution is running
  partialResultIsPartial?: boolean // True when partialResult is a live/incomplete result
  summary?: string                 // AI's analysis after getting the result
  error?: string                   // Error message if failed
  rejected?: boolean               // True when the user rejected permission for this step
  rejectionReason?: string         // Optional user-provided rejection reason
  // Token usage for this turn (shared by all steps in the same turn)
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

// Message attachment types for file/image uploads
export type AttachmentMediaType = 'image' | 'document' | 'audio' | 'video' | 'file'

export interface MessageAttachment {
  id: string
  fileName: string
  filePath?: string          // Absolute on-disk path (dropped/picked files; pasted files have none)
  mimeType: string           // e.g., 'image/jpeg', 'application/pdf'
  size: number               // File size in bytes
  mediaType: AttachmentMediaType
  base64Data?: string        // Base64 encoded file data (for sending to AI)
  url?: string               // Local file URL (for display, optional)
  width?: number             // Image width (for images)
  height?: number            // Image height (for images)
  mediaAssetId?: string      // Linked Media Library asset, when indexed
}

// Type definitions for IPC messages
export interface ChatMessage {
  id: string
  seq?: number  // 1-based sequence in the session timeline when loaded via paged history
  sessionId?: string  // Session ID this message belongs to (for context isolation)
  role: 'user' | 'assistant' | 'error' | 'system'  // 'error' and 'system' are display-only, not saved to backend
  content: string
  timestamp: number
  isStreaming?: boolean
  isThinking?: boolean
  errorDetails?: string  // Additional error details for error messages
  reasoning?: string  // Thinking/reasoning process for reasoning models (e.g., deepseek-reasoner)
  toolCalls?: ToolCall[]  // Tool calls made by the assistant
  contentParts?: ContentPart[]  // Sequential content parts for inline tool call display
  model?: string  // AI model used for assistant messages
  provider?: string  // AI provider used for assistant messages
  thinkingTime?: number  // Final thinking time in seconds (persisted for display after session switch)
  thinkingStartTime?: number  // Timestamp when thinking started (for calculating elapsed time on session switch)
  skillUsed?: string  // Name of the skill used by the assistant (e.g., "agent-plan")
  steps?: Step[]  // Steps showing AI reasoning process
  attachments?: MessageAttachment[]  // File/image attachments
  source?: 'text' | 'voice' | 'api' | string
  voice?: VoiceTranscriptMetadata
  origin?: MessageOrigin
  // Turn-volatile context variables captured at send time (user messages only).
  // Rendered into the model request as a <context-update> block; persisted so
  // history rebuilds replay identical bytes. Not displayed as message content.
  contextUpdate?: string
  // Token usage for this message (for assistant messages)
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

// ============================================================================
// Session Metadata Types (for optimized loading)
// ============================================================================

/**
 * Lightweight session metadata for list display
 * Does not include messages array for fast loading
 */
export interface SessionMeta {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  agentId?: string
  parentSessionId?: string
  branchFromMessageId?: string
  lastModel?: string
  lastProvider?: string
  permissionMode?: PermissionMode
  isPinned?: boolean
  isArchived?: boolean
  archivedAt?: number
  originIdentityKey?: string
  memoryScopeId?: string
  memoryProfileId?: string
  lastConnector?: string
  lastSentAt?: number
  // Additional metadata for display (computed on save)
  messageCount?: number      // Number of messages in session
  previewText?: string       // First user message preview (truncated)
}

/**
 * Session details without messages array
 * Used for session activation (before loading messages)
 */
export interface SessionDetails extends SessionMeta {
  workingDirectory?: string
  workingDirectoryRoots?: string[]
  variables?: ContextVariable[]
  summary?: string
  summaryUpToMessageId?: string
  summaryCreatedAt?: number
  promptContext?: PromptContextState | null
  totalInputTokens?: number
  totalOutputTokens?: number
  totalTokens?: number
  maxTokens?: number
  lastInputTokens?: number
  contextSize?: number
  originIdentityKey?: string
  memoryScopeId?: string
  memoryProfileId?: string
  lastConnector?: string
  lastSentAt?: number
}

// ============================================================================
// Full Session Type (with messages)
// ============================================================================

export interface ChatSession {
  id: string
  name: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  agentId?: string
  parentSessionId?: string
  branchFromMessageId?: string
  lastModel?: string
  lastProvider?: string
  permissionMode?: PermissionMode
  isPinned?: boolean
  isArchived?: boolean  // Archived (soft-deleted) session
  archivedAt?: number   // Timestamp when session was archived
  // Sandbox boundary - tools restrict file access to this directory
  workingDirectory?: string  // Active project directory for this session
  workingDirectoryRoots?: string[] // Additional sandbox roots for this session
  variables?: ContextVariable[] // Session-scoped context variables
  // Context compacting fields
  summary?: string              // Conversation summary for context window management
  summaryUpToMessageId?: string // ID of the last message included in the summary
  summaryCreatedAt?: number     // Timestamp when summary was created
  promptContext?: PromptContextState | null // Internal model-visible prompt context baseline/transcript
  // Token usage tracking
  totalInputTokens?: number     // Accumulated input tokens for this session
  totalOutputTokens?: number    // Accumulated output tokens for this session
  totalTokens?: number          // Accumulated total tokens for this session
  maxTokens?: number            // Session context/token budget limit
  lastInputTokens?: number      // Last request's input tokens
  contextSize?: number          // Current context window size (last turn's input tokens)
  originIdentityKey?: string    // Stable identity-session routing key for channel/API sessions
  memoryScopeId?: string        // Memory scope selected for this session's resolved identity
  memoryProfileId?: string      // User/profile whose memory workspace should be used
  lastConnector?: string        // Last IM/API connector that routed into this session
  lastSentAt?: number           // Last inbound user message timestamp for profile/channel auditing
}

// ============================================================================
// Prompt Context Types
// ============================================================================

export type PromptContextRole = 'developer' | 'user'

export interface BaseInstructions {
  source: string
  content: string
  hash: string
}

export interface PromptContextMarker {
  name: string
  start: string
  end: string
}

export interface PromptContextFragment {
  role: PromptContextRole
  source: string
  marker: PromptContextMarker
  content: string
  rendered: string
  hash: string
  reason?: 'initial' | 'changed' | 'removed'
}

export interface TurnContextSnapshot {
  createdAt: number
  agentId?: string
  hasTools: boolean
  osType: 'macos' | 'windows' | 'linux'
  workingDirectory?: string
  workingDirectoryRoots?: string[]
  contextVariablesHash?: string
  activeProjectHash?: string
  knownProjectsHash?: string
  skillsHash?: string
  toolNamesHash?: string
  mcpToolNamesHash?: string
  agentsMdHash?: string
  fragmentHashes: Record<string, string>
}

export interface PromptContextState {
  version: 1
  baseInstructions?: BaseInstructions
  referenceSnapshot?: TurnContextSnapshot
  items: PromptContextFragment[]
  updatedAt: number
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

export interface GenerateTitleRequest {
  message: string
}

export interface GenerateTitleResponse {
  success: boolean
  title?: string
  error?: string
}

export interface SystemPromptToolSnapshot {
  id: string
  name: string
  description?: string
  category?: string
  modelFacingName?: string
  source?: 'builtin' | 'plugin' | 'mcp' | 'codex-native'
  serverId?: string
  serverName?: string
  enabled?: boolean
  autoExecute?: boolean
  permissionGuard?: 'safe' | 'sandboxed' | 'internal-check' | 'permission-gated' | 'external'
  executionMode?: ToolExecutionMode
  renderKind?: ToolRenderKind
  parameters?: ToolParameter[]
}

export interface SystemPromptSkillFileSnapshot {
  name: string
  path?: string
  type: 'markdown' | 'script' | 'template' | 'other'
}

export interface SystemPromptSkillSnapshot {
  id: string
  name: string
  description?: string
  source?: SkillSource
  category?: string
  tags?: string[]
  enabled?: boolean
  allowedTools?: string[]
  relatedSkills?: string[]
  platforms?: string[]
  conditions?: SkillConditions
  path?: string
  directoryPath?: string
  rootPath?: string
  relativePath?: string
  runtimeContext?: string
  files?: SystemPromptSkillFileSnapshot[]
}

export interface SystemPromptSnapshot {
  sessionId: string
  generatedAt: number
  providerId: string
  model: string
  providerSupported: boolean
  credentialsReady: boolean
  workingDirectory?: string
  agentId?: string
  agentName?: string
  systemPrompt: string
  systemPromptChars: number
  tools: {
    enableToolCalls: boolean
    modelSupportsTools: boolean
    hasTools: boolean
    configuredCount: number
    modelFacingCount: number
    builtin: SystemPromptToolSnapshot[]
    mcp: SystemPromptToolSnapshot[]
    codexNative: SystemPromptToolSnapshot[]
  }
  agentLoopStream: {
    enabled: boolean
    enabledBy: 'env' | 'settings' | 'default'
    providerSupported: boolean
    active: boolean
    supportedProviderIds: string[]
  }
  skills: {
    enabled: boolean
    includedInPrompt: boolean
    count: number
    items: SystemPromptSkillSnapshot[]
  }
}

export interface GetSystemPromptSnapshotRequest {
  sessionId: string
}

export interface GetSystemPromptSnapshotResponse {
  success: boolean
  snapshot?: SystemPromptSnapshot
  error?: string
}

// ============================================================================
// Optimized Session IPC Types
// ============================================================================

/**
 * Response for GET_SESSIONS_LIST - returns metadata only (no messages)
 */
export interface GetSessionsListResponse {
  success: boolean
  sessions?: SessionMeta[]
  error?: string
}

/**
 * Response for ACTIVATE_SESSION - returns session details (no messages)
 */
export interface ActivateSessionResponse {
  success: boolean
  session?: SessionDetails
  messageCount?: number  // Number of messages in session
  error?: string
}

/**
 * Response for GET_SESSION_MESSAGES - returns messages array
 */
export interface GetSessionMessagesResponse {
  success: boolean
  messages?: ChatMessage[]
  error?: string
}

export type SessionMessagesPageDirection = 'older' | 'newer'

export interface SessionMessagesPageAnchor {
  messageId?: string
  seq?: number
  before?: number
  after?: number
}

export interface GetSessionMessagesPageRequest {
  sessionId: string
  cursor?: string | null
  limit?: number
  direction?: SessionMessagesPageDirection
  anchor?: 'tail' | SessionMessagesPageAnchor
}

export interface SessionMessagePageCursor {
  sessionId: string
  seq: number
  includeAnchor: boolean
}

export interface GetSessionMessagesPageResponse {
  success: boolean
  messages?: ChatMessage[]
  nextCursor?: string | null
  backwardsCursor?: string | null
  hasMoreBefore?: boolean
  hasMoreAfter?: boolean
  totalCount?: number
  error?: string
}

export interface UserMessageMarker {
  id: string
  seq: number
  timestamp: number
  preview: string
}

export interface GetSessionUserMarkersResponse {
  success: boolean
  markers?: UserMessageMarker[]
  error?: string
}
