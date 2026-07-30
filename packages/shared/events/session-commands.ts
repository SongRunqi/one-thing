/**
 * Session Command Types
 *
 * Commands are intents to mutate state, as opposed to events which
 * are facts about what already happened. Commands flow through
 * EventBus interceptors before being committed.
 *
 * Phase 3a: StreamEngine owns active stream lifecycle.
 * Phase 3b+: IPC handlers will emit commands, StreamEngine will subscribe.
 */

import type { ChatMessageMention, ChatMessageReplyTo } from '../ipc/chat.js'
import type { VoiceTranscriptMetadata } from '../ipc/voice.js'
import type { MessageOrigin } from '../ipc/channel-identity.js'
import type { JsonObject } from '../json.js'

/**
 * The forced opening tool choice a drive may carry. Structurally the subset of
 * the agent loop's `AgentToolChoice` that a COMMAND is allowed to express —
 * 'auto'/'none' are the loop's own defaults and have no business travelling on
 * a send-message command. Declared here rather than imported so the shared
 * contract keeps depending on nothing.
 */
export type SessionInitialToolChoice =
  | 'required'
  | { type: 'function'; function: { name: string } }

export interface SendMessageCommand {
  type: 'command:send-message'
  /** Originating channel ('ipc' | 'telegram' | 'cli' | 'api' | ...) */
  channel?: string
  content: string
  attachments?: JsonObject[]
  source?: 'text' | 'voice' | 'api' | string
  voice?: VoiceTranscriptMetadata
  origin?: MessageOrigin
  /**
   * IM quote reply (docs/design/multi-agent-collab-im.md §3.5 A). A snapshot
   * built by the sender at quote time; the engine only persists it onto the
   * user message it creates.
   */
  replyTo?: ChatMessageReplyTo
  /**
   * Identity-resolved @mentions the composer materialized from its member
   * tokens (W14a). The room ingress gate re-validates them against the roster
   * and unions the name-text fallback — the sender's ids are a hint about WHO
   * was picked, never authority over labels or membership.
   */
  mentions?: ChatMessageMention[]
  /**
   * W23: the room message this coordinator drive answers. A named passthrough
   * persisted verbatim onto the drive's user message, where it becomes a free
   * idempotence ledger — see ChatMessage.collabSourceMessageId. Only the collab
   * coordinator sets it; ordinary chat leaves it absent.
   */
  collabSourceMessageId?: string
  /**
   * Billing attribution for this turn's usage records (default 'chat').
   * Set by internal drives that spend on the user's behalf outside a plain
   * chat turn — the collab coordinator's room drives ('collab-room') and the
   * worker's task sessions ('collab-work'). Attribution ONLY: the room budget
   * gate still sums by sessionId, unchanged.
   */
  usageSource?: string
  /**
   * Force the FIRST model call of this turn into a tool call — either "some
   * tool" or a NAMED one (W18b).
   *
   * NOBODY sets it today. The collab room drive was its only producer (W22
   * pinned the opening call to `say`) and 2026-07-30 removed that: an agent with
   * nothing to add had no way to stay quiet and answered with 「不说了」 instead
   * (see app/collab/turn.ts). The field stays in the contract because forcing
   * the opening call is a legitimate mechanism a future caller may want — the
   * transport, the engine and the agent loop all still honour it.
   *
   * Paths that leave it unset behave exactly as before. Dropped by the agent
   * loop when the model does not advertise forced tool use.
   */
  initialToolChoice?: SessionInitialToolChoice
  /**
   * Provider/model the caller resolved and displayed at the moment of
   * sending (e.g. the renderer's model picker). When set, the engine uses
   * it directly instead of re-deriving from session/global settings —
   * optional so non-UI callers (gateway channels, headless clients) keep
   * today's fallback behavior unchanged.
   */
  providerId?: string
  model?: string
  /**
   * Pin the think mode for this turn, independent of the global per-model
   * toggle. Only honored alongside providerId — meant for system-internal
   * drives whose model comes from their own settings panel (e.g.
   * settings.music.radioDj), where no ThinkToggle is watching the session.
   */
  thinking?: boolean
  thinkingEffort?: string
  /**
   * System-internal drives (radio DJ wakes, …) set this so the drive prompt
   * does not become the session title — those sessions already carry a real,
   * deliberately chosen name.
   */
  suppressTitleGeneration?: boolean
}

export interface EditAndResendCommand {
  type: 'command:edit-and-resend'
  /** Originating channel ('ipc' | 'telegram' | 'cli' | 'api' | ...) */
  channel?: string
  messageId: string
  newContent: string
  origin?: MessageOrigin
  /** See SendMessageCommand.providerId/model. */
  providerId?: string
  model?: string
}

export interface AbortCommand {
  type: 'command:abort'
  /** Originating channel ('ipc' | 'telegram' | 'cli' | 'api' | ...) */
  channel?: string
  reason?: string
}

export interface ConfirmToolCommand {
  type: 'command:confirm-tool'
  /** Originating channel ('ipc' | 'telegram' | 'cli' | 'api' | ...) */
  channel?: string
  toolCallId: string
  approved: boolean
}

export interface ResumeAfterConfirmCommand {
  type: 'command:resume-after-confirm'
  /** Originating channel ('ipc' | 'telegram' | 'cli' | 'api' | ...) */
  channel?: string
  messageId: string
}

export interface PermissionRespondCommand {
  type: 'command:permission-respond'
  /** Originating channel ('ipc' | 'telegram' | 'cli' | 'api' | ...) */
  channel?: string
  /** Live request id, when the responder caught the permission:request event. */
  requestId?: string
  /**
   * Durable correlation key: the tool call this response targets. The
   * permission manager resolves it to the pending prompt, so responders
   * don't depend on having seen the ephemeral requestId.
   */
  toolCallId?: string
  decision: 'once' | 'session' | 'workdir' | 'reject'
  /** Optional reason for rejection */
  rejectReason?: string
}

export interface RetryMessageCommand {
  type: 'command:retry-message'
  /** Originating channel ('ipc' | 'telegram' | 'cli' | 'api' | ...) */
  channel?: string
  messageId: string
}

export interface CompactContextCommand {
  type: 'command:compact-context'
  /** Originating channel ('ipc' | 'telegram' | 'cli' | 'api' | ...) */
  channel?: string
  requestId?: string
  manual?: boolean
}

/** Inject a steering message mid-stream (after current turn ends) */
export interface InjectSteeringCommand {
  type: 'command:inject-steering'
  /** Originating channel ('ipc' | 'telegram' | 'cli' | 'api' | ...) */
  channel?: string
  content: string
  source?: string
  origin?: MessageOrigin
}

/**
 * Retract a queued steering message before the next loop turn consumes it.
 * Only works while the message is still pending in the steering queue; once
 * drained into a model request it can no longer be withdrawn.
 */
export interface RetractSteeringCommand {
  type: 'command:retract-steering'
  /** Originating channel ('ipc' | 'telegram' | 'cli' | 'api' | ...) */
  channel?: string
  messageId: string
}

/** Inject a follow-up message (only after agent would stop) */
export interface InjectFollowUpCommand {
  type: 'command:inject-followup'
  /** Originating channel ('ipc' | 'telegram' | 'cli' | 'api' | ...) */
  channel?: string
  content: string
  source?: string
  origin?: MessageOrigin
}

export type SessionCommand =
  | SendMessageCommand
  | EditAndResendCommand
  | AbortCommand
  | ConfirmToolCommand
  | ResumeAfterConfirmCommand
  | PermissionRespondCommand
  | RetryMessageCommand
  | CompactContextCommand
  | InjectSteeringCommand
  | RetractSteeringCommand
  | InjectFollowUpCommand
