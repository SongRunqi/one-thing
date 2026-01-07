/**
 * Chat Module
 * Chat and message-related type definitions for IPC communication
 */

import type { ToolCall } from './tools.js'
import type { BuiltinAgentMode } from './agents.js'
import type { SessionPlan } from './plan.js'

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
  status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting-confirmation' | 'cancelled'
  timestamp: number
  turnIndex?: number               // Which turn this step belongs to (for interleaving with text)
  toolCallId?: string              // Link to associated tool call if any
  // Tool call details for inline display
  toolCall?: ToolCall              // Full tool call object for displaying details
  thinking?: string                // AI's reasoning before this step (why it's doing this)
  result?: string                  // Tool execution result
  summary?: string                 // AI's analysis after getting the result
  error?: string                   // Error message if failed
  // Token usage for this turn (shared by all steps in the same turn)
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  // Tool Agent specific fields
  toolAgentResult?: {              // Result from Tool Agent execution
    success: boolean
    summary: string
    toolCallCount: number
    filesModified?: string[]
    errors?: string[]
  }
  // Nested step support (for CustomAgent sub-tool calls)
  parentStepId?: string            // Parent step ID (for child steps)
  childSteps?: Step[]              // Child steps array (populated by frontend)
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
  sessionId?: string  // Session ID this message belongs to (for context isolation)
  role: 'user' | 'assistant' | 'error' | 'system'  // 'error' and 'system' are display-only, not saved to backend
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
  lastInputTokens?: number      // Last request's input tokens
  contextSize?: number          // Current context window size (last turn's input tokens)
  // Built-in agent mode (Ask Mode / Build Mode)
  builtinMode?: BuiltinAgentMode  // 'build' (default) | 'ask'
  // Planning workflow (AI creates task plan, executes step by step)
  plan?: SessionPlan
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
