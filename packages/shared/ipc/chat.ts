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
import type { SessionGoal } from './goal.js'

/**
 * @deprecated Kept as a type alias for one version so old persisted
 * session data with a `level` field still parses. New code does not
 * read or write this field.
 */
export type VariableLevel = 'system' | 'session'

export type VariableScope = 'global' | 'session' | 'agent' | 'project'

/** Value type of a custom variable; `value` holds the canonical string form. */
export type VariableType = 'string' | 'number' | 'bool' | 'list' | 'map' | 'set'

export interface ContextVariable {
  name: string
  value: string
  values?: string[]
  type?: VariableType
  scope?: VariableScope
  description?: string
  readonly?: boolean
  // 'static' (default): rendered in the system prompt; 'turn': delivered in
  // per-turn <context-update> blocks; 'on-demand': tool output only.
  volatility?: 'static' | 'turn' | 'on-demand'
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
    cacheReadTokens?: number
    cacheWriteTokens?: number
    reasoningTokens?: number
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
  // Web-element attachments (picked from the embedded browser): the screenshot
  // rides in base64Data/image; these carry its provenance + text so a non-vision
  // model still receives the excerpt. See docs/design/browser-v2.md §P2.
  sourceUrl?: string         // Source page URL the element was picked from
  sourceTitle?: string       // Source page title
  excerpt?: string           // Text excerpt of the picked element (≤2k chars)
}

// ============================================================================
// Collab (multi-agent room) Types — docs/design/multi-agent-collab.md
// ============================================================================

/**
 * Session kind. Absent = 'chat' (ordinary session, zero-regression path).
 * 'room' = multi-agent group chat (streams only started by the RoomCoordinator);
 * 'work' = an agent's task-execution session, child of a room.
 */
/**
 * 'agent' = an agent's own execution session (W18, multi-agent-collab-im §4.6):
 * one durable hidden session per agent where its room turns run — drives,
 * thinking and tool calls live there, and only `say` reaches a room.
 */
export type SessionKind = 'chat' | 'room' | 'work' | 'agent'

/** Room configuration, present only on kind='room' sessions. */
export interface RoomConfig {
  memberAgentIds: string[]
  /** 负责人: review/disposition activation target, and a "你是本群的负责人"
   *  fact in the willingness judgement. Optional — NOT a default responder
   *  (that mechanism was removed in the IM rework, W1). */
  pmAgentId?: string
  budgets?: {
    maxChain?: number
    maxConcurrentWork?: number
    dailyCostUSD?: number
    /** 回合断路器上限 (W22); 0 = 关闭该闸。 */
    maxTurnToolCalls?: number
    maxTurnSayCalls?: number
  }
  /** Room-wide pause switch: freezes all activations. */
  frozen?: boolean
  /**
   * 私聊标记(docs/design/agent-im-dm.md D1/D3)。人数即形态,标记只说"这间房是
   * 私聊而不是群":
   *  - **单成员** = 用户 ↔ agent 的托管式私聊(id 约定 `userDmRoomId(agentId)`)。
   *    用户说话免意愿判定直接激活唯一那位成员(D6),常驻会话工具面走 union(D7)。
   *  - **双成员** = agent ↔ agent 私聊(D3,IM P3 才实现;本期只落单成员语义)。
   *
   * 可选且只写 `true`:旧房没有这个字段,读作"普通群聊",零迁移。
   */
  dm?: true
}

/**
 * Link from a collab session back to the room it serves.
 *
 * kind='work': room + the task being executed (both always present).
 * kind='agent' (W18): only the room, and it is the room whose drive the
 * execution session is currently answering — a `say` with no explicit `room`
 * lands there. `taskId` is therefore optional: an execution session serves the
 * room's chat, not one card.
 */
export interface CollabWorkRef {
  roomSessionId: string
  taskId?: string
}

/**
 * Quote-reply snapshot (docs/design/multi-agent-collab-im.md §3.5 A).
 *
 * Deliberately a SNAPSHOT, not a pointer: `authorLabel` is the signature at
 * quote time and `excerpt` is the quoted text at quote time, so the block stays
 * whole after the original is edited or dropped from a paged window.
 * `messageId` is only ever used to scroll back — if it is gone, nothing jumps.
 */
export interface ChatMessageReplyTo {
  messageId: string
  authorLabel: string
  /** ≤120 chars, whitespace collapsed to one line. */
  excerpt: string
}

/**
 * One resolved @mention (docs/design/multi-agent-collab-im.md §4.5 身份 id 化).
 *
 * `agentId` is the identity — generated when the agent is created and stable
 * across renames, so activation is exact even when two members share a name.
 * `label` is the display name AT MENTION TIME: a snapshot kept only so the
 * words still read sensibly after the agent is deleted; while the agent lives,
 * every surface repaints `@label` from the current roster.
 */
export interface ChatMessageMention {
  agentId: string
  label: string
}

/**
 * Who put an emoji on a message (docs/design/multi-agent-collab-im.md §3.5 B).
 * The human is a single identity (`{type:'user'}`); an agent is identified by
 * its roster id, so the display name can be re-read after a rename.
 */
export interface ChatMessageReactionActor {
  type: 'user' | 'agent'
  agentId?: string
}

/**
 * One emoji and everyone who put it there — reactions are stored aggregated,
 * so the projection's `(👍×2)` and the chip's count read the same array.
 * Metadata only: a reaction never triggers a willingness round.
 */
export interface ChatMessageReaction {
  emoji: string
  by: ChatMessageReactionActor[]
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
  /**
   * Assistant persona attribution in collab (room/work) sessions: the agent that
   * spoke this message. Stamped at the app-layer store choke point from the
   * session's agentId at creation time; absent on ordinary chat sessions.
   */
  agentId?: string
  /** True for steering messages injected mid-stream (persisted marker for UI) */
  steered?: boolean
  /** IM quote reply: what this message is answering (snapshot, see the type). */
  replyTo?: ChatMessageReplyTo
  /**
   * Identity-resolved @mentions (W14a, rooms only). Absent on every message
   * written before W14a — consumers fall back to name-text parsing, which is
   * exactly what makes old transcripts keep working.
   */
  mentions?: ChatMessageMention[]
  /**
   * W23 restart idempotence: on a coordinator DRIVE (source 'collab'), the room
   * message that caused the activation. The execution-session transcript is
   * durable and uncapped, so a persisted drive IS the idempotence ledger — boot
   * reconciliation can tell "already consumed" from "never driven" without the
   * state file. Absent on every pre-W23 drive (those replay once and self-heal)
   * and on every non-drive message; the renderer never reads it.
   */
  collabSourceMessageId?: string
  /** IM emoji reactions on this message (rooms only, see the type). */
  reactions?: ChatMessageReaction[]
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
    cacheReadTokens?: number
    cacheWriteTokens?: number
    reasoningTokens?: number
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
  kind?: SessionKind
  room?: RoomConfig
  collab?: CollabWorkRef
  parentSessionId?: string
  branchFromMessageId?: string
  lastModel?: string
  lastProvider?: string
  /**
   * The user picked lastProvider/lastModel by hand. Without this flag those two
   * are indistinguishable from the auto-stamp every assistant message performs,
   * so an agent's model binding could not tell "the user chose otherwise" from
   * "the last turn happened to run on that model".
   */
  modelPinned?: boolean
  permissionMode?: PermissionMode
  isPinned?: boolean
  isArchived?: boolean
  archivedAt?: number
  originIdentityKey?: string
  memoryProfileId?: string
  lastConnector?: string
  lastSentAt?: number
  // Additional metadata for display (computed on save)
  messageCount?: number      // Number of messages in session
  previewText?: string       // First user message preview (truncated)
  // Active project directory, surfaced into the list so the sidebar can group
  // by project. Persisted per-session (meta.json); the fast index backfills it.
  workingDirectory?: string
}

/**
 * Session details without messages array
 * Used for session activation (before loading messages)
 */
export interface SessionDetails extends SessionMeta {
  workingDirectory?: string
  workingDirectoryRoots?: string[]
  variables?: ContextVariable[]
  goal?: SessionGoal
  goals?: SessionGoal[]
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
  kind?: SessionKind
  room?: RoomConfig
  collab?: CollabWorkRef
  parentSessionId?: string
  branchFromMessageId?: string
  lastModel?: string
  lastProvider?: string
  /**
   * The user picked lastProvider/lastModel by hand. Without this flag those two
   * are indistinguishable from the auto-stamp every assistant message performs,
   * so an agent's model binding could not tell "the user chose otherwise" from
   * "the last turn happened to run on that model".
   */
  modelPinned?: boolean
  permissionMode?: PermissionMode
  isPinned?: boolean
  isArchived?: boolean  // Archived (soft-deleted) session
  archivedAt?: number   // Timestamp when session was archived
  // Sandbox boundary - tools restrict file access to this directory
  workingDirectory?: string  // Active project directory for this session
  workingDirectoryRoots?: string[] // Additional sandbox roots for this session
  variables?: ContextVariable[] // Session-scoped context variables
  goal?: SessionGoal // Current goal; mirrors goals' newest unfinished record
  goals?: SessionGoal[] // Goal history, oldest first (docs/design/goal-system-v3.md)
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
  /** Session kind; absent = ordinary chat. 'room' requires `room` config. */
  kind?: SessionKind
  /** Room configuration when kind='room'. */
  room?: RoomConfig
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
