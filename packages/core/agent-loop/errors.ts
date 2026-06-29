import type { AgentToolCall, AgentToolResult } from './types.js'

export class AgentLoopPauseForConfirmationError extends Error {
  readonly toolCall: AgentToolCall
  readonly result: AgentToolResult

  constructor(toolCall: AgentToolCall, result: AgentToolResult) {
    super(`Agent loop paused for tool confirmation: ${toolCall.name}`)
    this.name = 'AgentLoopPauseForConfirmationError'
    this.toolCall = toolCall
    this.result = result
  }
}

export function isAgentLoopPauseForConfirmationError(
  error: Error | { name?: string } | null | undefined,
): error is AgentLoopPauseForConfirmationError {
  return error instanceof AgentLoopPauseForConfirmationError
    || error?.name === 'AgentLoopPauseForConfirmationError'
}
