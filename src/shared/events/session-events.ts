/**
 * Session Event Types
 *
 * All events scoped to a single session. These flow through EventBus
 * and are stored in the ring buffer for replay.
 *
 * Design: each event is a self-contained fact about what happened.
 * The Session state machine reduces these events into SessionState.
 */

import type { Step, ToolCall, ContentPart, ChatMessage, ContextVariable } from '../ipc.js'
import type { StreamCompleteData, StreamErrorData } from '../../main/engine/stream/ipc-emitter.js'
import type { SessionCommand } from './session-commands.js'

// ── Stream lifecycle ────────────────────────────

export interface StreamStartEvent {
  type: 'stream:start'
  messageId: string
  assistantMessageId: string  // alias for messageId (backward compat)
  model?: string
}

export interface StreamCompleteEvent {
  type: 'stream:complete'
  data: StreamCompleteData
}

export interface StreamErrorEvent {
  type: 'stream:error'
  data: StreamErrorData
}

export interface StreamAbortedEvent {
  type: 'stream:aborted'
  reason?: string
}

// ── Tool lifecycle ──────────────────────────────

export interface ToolCallEvent {
  type: 'tool:call'
  toolCall: ToolCall
}

export interface ToolResultEvent {
  type: 'tool:result'
  toolCall: ToolCall
}

export interface ToolInputStartEvent {
  type: 'tool:input-start'
  toolCallId: string
  toolName: string
  toolCall: ToolCall
}

// ── Step events ─────────────────────────────────

export interface StepAddedEvent {
  type: 'step:added'
  step: Step
}

export interface StepUpdatedEvent {
  type: 'step:updated'
  stepId: string
  updates: Partial<Step>
}

// ── Content events ──────────────────────────────

export interface ContentPartEvent {
  type: 'content:part'
  part: ContentPart
}

export interface ContentContinuationEvent {
  type: 'content:continuation'
  turnIndex?: number
}

// ── Context events ──────────────────────────────

export interface ContextSizeUpdatedEvent {
  type: 'context:size-updated'
  contextSize: number
}

export interface ContextCompactCompletedEvent {
  type: 'context:compact-completed'
  requestId?: string
  success: boolean
  skipped?: boolean
  summary?: string
  error?: string
}

export interface SessionVariablesUpdatedEvent {
  type: 'session:variables-updated'
  workingDirectory?: string
  variables: ContextVariable[]
}


// ── Params events ───────────────────────────────

export interface StreamParamsResolvingEvent {
  type: 'stream:params-resolving'
  messageId: string
  params: {
    providerId: string
    model: string
    temperature: number
    maxTokens: number
    topP?: number
  }
}

// ── Request inspector ───────────────────────────

/** One slice of a system prompt, attributed to a specific .hbs template. */
export interface PromptSourceSegment {
  /** Path relative to resources/templates, no extension. */
  source: string
  content: string
  /** Absolute on-disk path of the source .hbs file, for opening in an editor. */
  absolutePath?: string
}

export interface RequestMessageSnapshot {
  role: 'system' | 'user' | 'assistant' | 'tool'
  /** First N chars of the text content, escaped, for quick preview. */
  contentPreview: string
  /** Full text content for expanded inspection in the renderer. */
  content: string
  contentLength: number
  /** System only: per-template breakdown of the rendered prompt. */
  sourceSegments?: PromptSourceSegment[]
  /** Assistant only: whether reasoning_content is attached to this turn. */
  hasReasoning: boolean
  reasoningLength?: number
  /** Assistant only: tool calls produced by this turn. */
  toolCalls?: Array<{ id: string; name: string; argsLength: number }>
  /** Tool only: which tool call this result belongs to. */
  toolCallId?: string
  toolName?: string
}

export interface RequestSnapshotEvent {
  type: 'request:snapshot'
  /** Pre-flight snapshot of an outbound LLM request, captured by the
   *  tool loop right before handing off to the AI SDK. The Inspector
   *  panel keeps a small ring buffer of these per session. */
  snapshot: {
    timestamp: number
    providerId: string
    model: string
    turn: number
    messages: RequestMessageSnapshot[]
    tools: Array<{ name: string; description?: string }>
    thinking?: 'enabled' | 'disabled'
    temperature?: number
    maxTokens?: number
  }
}

// ── Skill events ────────────────────────────────

export interface SkillActivatedEvent {
  type: 'skill:activated'
  skillName: string
}

// ── Permission events ───────────────────────────

export interface PermissionRequestEvent {
  type: 'permission:request'
  requestId: string
  /** The channel that should handle this permission request */
  targetChannel: string
  toolCallId: string
  messageId: string
  permissionType: string
  title: string
  pattern?: string | string[]
  metadata: Record<string, unknown>
  timeoutMs?: number
}

export interface PermissionTimeoutEvent {
  type: 'permission:timeout'
  requestId: string
}

// ── Tool lifecycle (fine-grained) ───────────────

export interface ToolExecutingEvent {
  type: 'tool:executing'
  toolCallId: string
  title: string
}

export interface ToolMetadataEvent {
  type: 'tool:metadata'
  toolCallId: string
  metadata: Record<string, unknown>
}

// ── Session events ──────────────────────────────

export interface SessionRenamedEvent {
  type: 'session:renamed'
  name: string
}

// ── Message events ──────────────────────────────

export interface MessageUserCreatedEvent {
  type: 'message:user-created'
  message: ChatMessage
}

export interface MessageAssistantCreatedEvent {
  type: 'message:assistant-created'
  message: ChatMessage
}

export interface MessageUpdatedEvent {
  type: 'message:updated'
  messageId: string
  updates: Record<string, unknown>
}

export interface MessageDeletedEvent {
  type: 'message:deleted'
  messageId: string
}

export interface MessagesReplacedEvent {
  type: 'messages:replaced'
  messages: ChatMessage[]
}

// ── Union ───────────────────────────────────────

export type SessionEvent =
  | StreamStartEvent
  | StreamCompleteEvent
  | StreamErrorEvent
  | StreamAbortedEvent
  | ToolCallEvent
  | ToolResultEvent
  | ToolInputStartEvent
  | StepAddedEvent
  | StepUpdatedEvent
  | ContentPartEvent
  | ContentContinuationEvent
  | ContextSizeUpdatedEvent
  | ContextCompactCompletedEvent
  | SessionVariablesUpdatedEvent
  | StreamParamsResolvingEvent
  | RequestSnapshotEvent
  | SkillActivatedEvent
  | PermissionRequestEvent
  | PermissionTimeoutEvent
  | ToolExecutingEvent
  | ToolMetadataEvent
  | SessionRenamedEvent
  | MessageUserCreatedEvent
  | MessageAssistantCreatedEvent
  | MessageUpdatedEvent
  | MessageDeletedEvent
  | MessagesReplacedEvent
  | SessionCommand
