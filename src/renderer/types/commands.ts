/**
 * Command System Types
 * Defines types for the "/" command system in InputBox
 */

/**
 * Context passed to command execution
 */
export interface CommandContext {
  /** Current session ID */
  sessionId: string
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
  /** Execute the command */
  execute: (context: CommandContext) => Promise<CommandResult>
}
