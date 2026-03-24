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

export interface SendMessageCommand {
  type: 'command:send-message'
  /** Originating channel ('ipc' | 'telegram' | 'cli' | 'api' | ...) */
  channel?: string
  content: string
  attachments?: unknown[]
}

export interface EditAndResendCommand {
  type: 'command:edit-and-resend'
  /** Originating channel ('ipc' | 'telegram' | 'cli' | 'api' | ...) */
  channel?: string
  messageId: string
  newContent: string
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
  requestId: string
  decision: 'once' | 'session' | 'workspace' | 'always' | 'reject'
  /** Optional reason for rejection */
  rejectReason?: string
}

export interface RetryMessageCommand {
  type: 'command:retry-message'
  messageId: string
}

export type SessionCommand =
  | SendMessageCommand
  | EditAndResendCommand
  | AbortCommand
  | ConfirmToolCommand
  | ResumeAfterConfirmCommand
  | PermissionRespondCommand
  | RetryMessageCommand
