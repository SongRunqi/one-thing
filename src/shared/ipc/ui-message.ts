/**
 * UIMessage Module
 * UIMessage types (AI SDK 5.x compatible) for IPC communication
 *
 * These types follow the AI SDK 5.x UIMessage structure but are defined
 * locally to allow custom extensions (Steps, Error parts) that aren't
 * part of the standard SDK types.
 *
 * The types are designed to be compatible with AI SDK's convertToModelMessages()
 * when converting to model messages for API calls.
 */

import type { Step, MessageAttachment } from './chat.js'

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
  durationMs?: number  // Duration in milliseconds for speed calculation
}

/**
 * Session token usage statistics
 */
export interface SessionTokenUsage {
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  maxTokens: number
  /** Last request's input tokens */
  lastInputTokens: number
  /** Current context window size (last input + output) */
  contextSize: number
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
