/**
 * Command System Types
 * Defines types for the "/" command system in InputBox
 */

/**
 * Context passed to command execution
 */
export interface CommandContext {
  /**
   * Current session ID. May be a renderer-local new-chat draft id
   * (an unmaterialized session id) that the main process has never seen — never send it
   * over IPC directly; call `requireSession()` first, or buffer the change
   * through a draft-aware sessions-store method.
   */
  sessionId: string
  /** Whether `sessionId` is an unmaterialized new-chat draft */
  isDraftSession: boolean
  /**
   * Resolve to a real main-process session id, materializing the draft on
   * first call if needed. Returns null when materialization fails. The
   * pipeline adds `switchToSessionId` to a successful result automatically
   * when this created a session.
   */
  requireSession: () => Promise<string | null>
  /** Parsed command arguments (space-separated) */
  args: string[]
  /** Raw input string after command name */
  rawArgs: string
}

/**
 * Result returned from command execution
 */
export interface CommandResult {
  /** Whether the command executed successfully */
  success: boolean
  /** Optional feedback message to show user */
  message?: string
  /** Error message if failed */
  error?: string
  /** Session that the invoking UI should switch to after success */
  switchToSessionId?: string
}

/**
 * Command definition
 */
export interface CommandDefinition {
  /** Command identifier, e.g., 'cd' for /cd */
  id: string
  /** Display name */
  name: string
  /** Brief description */
  description: string
  /** Usage pattern, e.g., '/cd <path>' */
  usage: string
  /** Optional label shown in the command picker */
  displayLabel?: string
  /** Optional text inserted when selected from the command picker */
  insertText?: string
  /** Whether the composer should clear as soon as the command is submitted */
  consumesInputImmediately?: boolean
  /** Execute the command */
  execute: (context: CommandContext) => Promise<CommandResult>
}
