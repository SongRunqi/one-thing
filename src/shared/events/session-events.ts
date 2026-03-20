/**
 * Session Event Types
 *
 * All events scoped to a single session. These flow through EventBus
 * and are stored in the ring buffer for replay.
 *
 * Design: each event is a self-contained fact about what happened.
 * The Session state machine reduces these events into SessionState.
 */

import type { Step, ToolCall, ContentPart } from '../ipc.js'
import type { StreamCompleteData, StreamErrorData } from '../../main/chat/ipc-emitter.js'
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

export interface CompactStartedEvent {
  type: 'compact:started'
}

export interface CompactCompletedEvent {
  type: 'compact:completed'
  data: { success: boolean; error?: string; summary?: string }
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
  messageId: string
  content: string
}

export interface MessageAssistantCreatedEvent {
  type: 'message:assistant-created'
  messageId: string
}

export interface MessageUpdatedEvent {
  type: 'message:updated'
  messageId: string
  updates: Record<string, unknown>
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
  | CompactStartedEvent
  | CompactCompletedEvent
  | StreamParamsResolvingEvent
  | SkillActivatedEvent
  | PermissionRequestEvent
  | PermissionTimeoutEvent
  | ToolExecutingEvent
  | ToolMetadataEvent
  | SessionRenamedEvent
  | MessageUserCreatedEvent
  | MessageAssistantCreatedEvent
  | MessageUpdatedEvent
  | SessionCommand
