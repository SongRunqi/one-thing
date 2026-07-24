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

import type { VoiceTranscriptMetadata } from '../ipc/voice.js'
import type { MessageOrigin } from '../ipc/channel-identity.js'
import type { JsonObject } from '../json.js'

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
  reason?: string
}

export interface ConfirmToolCommand {
  type: 'command:confirm-tool'
  toolCallId: string
  approved: boolean
}

export interface ResumeAfterConfirmCommand {
  type: 'command:resume-after-confirm'
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
  messageId: string
}

export interface CompactContextCommand {
  type: 'command:compact-context'
  requestId?: string
  manual?: boolean
}

/** Inject a steering message mid-stream (after current turn ends) */
export interface InjectSteeringCommand {
  type: 'command:inject-steering'
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
  messageId: string
}

/** Inject a follow-up message (only after agent would stop) */
export interface InjectFollowUpCommand {
  type: 'command:inject-followup'
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
