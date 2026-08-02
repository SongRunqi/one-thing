/**
 * Session Event Types
 *
 * All events scoped to a single session. These flow through EventBus
 * and are stored in the ring buffer for replay.
 *
 * Design: each event is a self-contained fact about what happened.
 * The Session state machine reduces these events into SessionState.
 */

import type { Step, ToolCall, ToolPartialResult, ToolResult, ContentPart, ChatMessage, ContextVariable, SessionGoal, ThinkingEffort } from '../ipc.js'
import type { CollabBoard, CollabCoordinatorState } from '../ipc/collab.js'
import type { JsonObject } from '../json.js'
import type { SessionCommand } from './session-commands.js'

// ── Stream lifecycle ────────────────────────────

export interface StreamCompleteUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  durationMs?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}

export interface StreamCompleteData {
  sessionName?: string
  usage?: StreamCompleteUsage
  lastTurnUsage?: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
    reasoningTokens?: number
  }
  aborted?: boolean
  error?: string
}

export interface StreamErrorData {
  error: string
  errorDetails?: string
  preserved?: boolean
}

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

/**
 * The argument stream for a tool call is complete. This is the authoritative
 * receive-complete moment: the card's RECEIVING state must flip on this event,
 * never on a frontend guess about argument completeness.
 */
export interface ToolInputEndEvent {
  type: 'tool:input-end'
  toolCallId: string
  stepId?: string
  toolCall: ToolCall
  /** Authoritative main-process Date.now() captured when args finished streaming. */
  receivedAt: number
  /** 'parse' = mid-stream JSON completion; 'provider-done' = settled by the provider's done event. */
  finalizedBy: 'parse' | 'provider-done'
}

export interface ToolExecutionStartEvent {
  type: 'tool:execution-start'
  toolCallId: string
  stepId: string
  toolName: string
  args: JsonObject
  /** Authoritative main-process Date.now() captured when execution began. */
  startTime?: number
}

export interface ToolExecutionUpdateEvent {
  type: 'tool:execution-update'
  toolCallId: string
  stepId: string
  partialResult: ToolPartialResult
}

export interface ToolExecutionEndEvent {
  type: 'tool:execution-end'
  toolCallId: string
  stepId: string
  result?: ToolResult
  isError?: boolean
  error?: string
  /** Authoritative execution duration measured in the main process. */
  durationMs?: number
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
  workingDirectoryRoots?: string[]
  variables: ContextVariable[]
}

export interface SessionGoalUpdatedEvent {
  type: 'session:goal-updated'
  /** The goal that just changed; null after the goal is cleared. */
  goal: SessionGoal | null
  /**
   * The session's full goal history, oldest first. Sent with every update so
   * the renderer never has to derive "which one is current" itself — that rule
   * lives in exactly one place (packages/onething-runtime/src/goals/records.ts)
   * and a second copy on this side would be one more thing to keep in sync.
   */
  goals?: SessionGoal[]
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

export interface RequestMessageSnapshot {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool'
  /** First N chars of the text content, escaped, for quick preview. */
  contentPreview: string
  /** Full text content for expanded inspection in the renderer. */
  content: string
  contentLength: number
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
  /** Pre-flight snapshot of an outbound model request, captured by the
   *  stream runtime right before provider execution. The Inspector panel
   *  keeps a small ring buffer of these per session. */
  snapshot: {
    timestamp: number
    providerId: string
    model: string
    turn: number
    messages: RequestMessageSnapshot[]
    tools: Array<{ name: string; description?: string }>
    thinking?: 'enabled' | 'disabled'
    thinkingEffort?: ThinkingEffort
    serviceTier?: string
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
  metadata: JsonObject
  userId?: string
  workspaceId?: string
  timeoutMs?: number
}

export interface PermissionTimeoutEvent {
  type: 'permission:timeout'
  requestId: string
}

/**
 * A tool's permission ask is registered but waiting behind another prompt in
 * the session's serialized permission queue (or coalesced onto an equivalent
 * pending ask). No card should be shown yet — the UI can surface a
 * "waiting for permission" state on the tool call instead of "executing".
 */
export interface PermissionQueuedEvent {
  type: 'permission:queued'
  /** The pending request this ask is queued behind / coalesced into. */
  requestId: string
  toolCallId: string
  messageId: string
}

/**
 * A pending permission ask settled (user decision, grant auto-resolve, or
 * session cleanup). Lets every surface clear cards/waiting states for the
 * head ask and all coalesced followers — including surfaces that did not
 * originate the response (e.g. renderer when approved remotely).
 */
export interface PermissionSettledEvent {
  type: 'permission:settled'
  requestId: string
  /** Head ask's tool call plus all coalesced followers'. */
  toolCallIds: string[]
  decision: 'allowed' | 'rejected'
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
  metadata: JsonObject
}

// ── Session events ──────────────────────────────

export interface SessionRenamedEvent {
  type: 'session:renamed'
  name: string
}

// ── Steering events ─────────────────────────────

/** A steering message was persisted and queued; retractable until consumed. */
export interface SteeringQueuedEvent {
  type: 'steering:queued'
  messageId: string
}

/** Queued steering messages were drained into the next model turn. */
export interface SteeringConsumedEvent {
  type: 'steering:consumed'
  messageIds: string[]
}

/** A pending steering message was retracted before being consumed. */
export interface SteeringRetractedEvent {
  type: 'steering:retracted'
  messageId: string
}

// ── Message events ──────────────────────────────

export interface MessageUserCreatedEvent {
  type: 'message:user-created'
  message: ChatMessage
}

export interface MessageCreatedEvent {
  type: 'message:created'
  message: ChatMessage
}

export interface MessageAssistantCreatedEvent {
  type: 'message:assistant-created'
  message: ChatMessage
}

export interface MessageUpdatedEvent {
  type: 'message:updated'
  messageId: string
  updates: Partial<ChatMessage>
}

export interface MessageDeletedEvent {
  type: 'message:deleted'
  messageId: string
}

export interface MessagesReplacedEvent {
  type: 'messages:replaced'
  messages: ChatMessage[]
}

// ── Collab (multi-agent room) ───────────────────

/** The room's board changed; carries the full (small) snapshot. */
export interface CollabBoardChangedEvent {
  type: 'collab:board-changed'
  board: CollabBoard
}

/** A member is about to speak (queued/driving) or has stopped (settled).
 *  IM semantics: true may end with no message at all — "typed and deleted". */
export interface CollabTypingEvent {
  type: 'collab:typing'
  agentId: string
  typing: boolean
}

/**
 * A room turn window opened or closed (collab-team-v2 §5.1 入口①).
 *
 * The room session never emits `stream:start` — since W18 the turn runs in the
 * member's execution session — so the renderer had no way to know a room was
 * busy and the stop button was never drawn. This is that signal, and its window
 * is exactly `runtime.activeTurn`: the same window `abortRoomTurn` shoots into,
 * so a visible stop button always has a live target.
 *
 * `agentId` names who holds the floor, for the button's tooltip.
 */
export interface CollabTurnActiveEvent {
  type: 'collab:turn-active'
  agentId: string
  active: boolean
}

/**
 * 协调器的运行时状态变了(docs/design/collab-coordinator-inspector.md)。
 *
 * 带**完整快照**,与 `collab:board-changed` 同一条理由:它很小,而全量广播省掉了
 * 增量合并那一整类 bug。发送侧按秒节流 —— 「跑了多久」这种连续量由渲染层自己走秒,
 * 后端不为计时广播。
 */
export interface CollabCoordinatorChangedEvent {
  type: 'collab:coordinator-changed'
  state: CollabCoordinatorState
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
  | ToolInputEndEvent
  | ToolExecutionStartEvent
  | ToolExecutionUpdateEvent
  | ToolExecutionEndEvent
  | StepAddedEvent
  | StepUpdatedEvent
  | ContentPartEvent
  | ContentContinuationEvent
  | ContextSizeUpdatedEvent
  | ContextCompactCompletedEvent
  | SessionVariablesUpdatedEvent
  | SessionGoalUpdatedEvent
  | StreamParamsResolvingEvent
  | RequestSnapshotEvent
  | SkillActivatedEvent
  | PermissionRequestEvent
  | PermissionTimeoutEvent
  | PermissionQueuedEvent
  | PermissionSettledEvent
  | ToolExecutingEvent
  | ToolMetadataEvent
  | SessionRenamedEvent
  | SteeringQueuedEvent
  | SteeringConsumedEvent
  | SteeringRetractedEvent
  | MessageCreatedEvent
  | MessageUserCreatedEvent
  | MessageAssistantCreatedEvent
  | MessageUpdatedEvent
  | MessageDeletedEvent
  | MessagesReplacedEvent
  | CollabBoardChangedEvent
  | CollabTypingEvent
  | CollabTurnActiveEvent
  | CollabCoordinatorChangedEvent
  | SessionCommand
