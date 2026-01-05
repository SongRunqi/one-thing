/**
 * Command Registry
 * Manages available commands for the "/" command system
 */

import type { CommandDefinition } from '@/types/commands'
import { cdCommand } from './cd'
import { filesCommand } from './files'
import { gitCommand } from './git'

/**
 * All registered commands
 */
const commands: CommandDefinition[] = [cdCommand, filesCommand, gitCommand]

/**
 * Get all available commands
 */
export function getCommands(): CommandDefinition[] {
  return commands
}

/**
 * Find a command by its ID (exact match)
 */
export function findCommand(id: string): CommandDefinition | undefined {
  const normalized = id.toLowerCase()
  return commands.find((cmd) => cmd.id === normalized)
}

/**
 * Filter commands by query (fuzzy match on id, name, or description)
 */
export function filterCommands(query: string): CommandDefinition[] {
  const normalized = query.toLowerCase().replace(/^\//, '')

  if (!normalized) {
    return commands
  }

  return commands.filter(
    (cmd) =>
      cmd.id.includes(normalized) ||
      cmd.name.toLowerCase().includes(normalized) ||
      cmd.description.toLowerCase().includes(normalized)
  )
}

/**
 * Execute a command by its ID
 */
export async function executeCommand(
  id: string,
  context: { sessionId: string; args?: string }
): Promise<{ success: boolean; message?: string; error?: string }> {
  const command = findCommand(id)
  if (!command) {
    return { success: false, error: `Unknown command: ${id}` }
  }

  // Convert args string to array
  const argsArray = context.args ? context.args.trim().split(/\s+/) : []

  return command.execute({
    sessionId: context.sessionId,
    args: argsArray,
    rawArgs: context.args || '',
  })
}
