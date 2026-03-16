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
import type { StreamCompleteData, StreamErrorData } from '../../main/ipc/chat/ipc-emitter.js'

// ── Stream lifecycle ────────────────────────────

export interface StreamStartEvent {
  type: 'stream:start'
  assistantMessageId: string
}

export interface StreamCompleteEvent {
  type: 'stream:complete'
  data: StreamCompleteData
}

export interface StreamErrorEvent {
  type: 'stream:error'
  data: StreamErrorData
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

// ── Skill events ────────────────────────────────

export interface SkillActivatedEvent {
  type: 'skill:activated'
  skillName: string
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

// ── Union ───────────────────────────────────────

export type SessionEvent =
  | StreamStartEvent
  | StreamCompleteEvent
  | StreamErrorEvent
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
  | SkillActivatedEvent
  | MessageUserCreatedEvent
  | MessageAssistantCreatedEvent
