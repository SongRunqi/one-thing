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
  content: string
  attachments?: unknown[]
  /** Pre-resolved by IPC handler (sync phase) */
  assistantMessageId: string
  sessionName?: string
}

export interface EditAndResendCommand {
  type: 'command:edit-and-resend'
  messageId: string
  newContent: string
  /** Pre-resolved by IPC handler (sync phase) */
  assistantMessageId: string
  sessionName?: string
}

export interface AbortStreamCommand {
  type: 'command:abort-stream'
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
  requestId: string
  decision: 'once' | 'session' | 'always' | 'reject'
}

export interface RetryMessageCommand {
  type: 'command:retry-message'
  messageId: string
}

export type SessionCommand =
  | SendMessageCommand
  | EditAndResendCommand
  | AbortStreamCommand
  | ConfirmToolCommand
  | ResumeAfterConfirmCommand
  | PermissionRespondCommand
  | RetryMessageCommand
