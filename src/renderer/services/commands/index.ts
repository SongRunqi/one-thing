/**
 * Command Registry
 * Manages available commands for the "/" command system
 */

import type { CommandDefinition } from '@/types/commands'
/**
 * All registered commands
 */
const commands: CommandDefinition[] = [
  {
    id: 'cd',
    name: 'Change Directory',
    description: 'Change the working directory for this session',
    usage: '/cd <path>',
    async execute(context) {
      let nextDirectory = context.rawArgs.trim()

      if (!nextDirectory) {
        const result = await window.electronAPI.showOpenDialog({
          properties: ['openDirectory'],
          title: 'Select Working Directory',
        })

        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, error: 'No directory selected' }
        }

        nextDirectory = result.filePaths[0]
      }

      const result = await window.electronAPI.updateSessionWorkingDirectory(
        context.sessionId,
        nextDirectory
      )

      if (!result.success) {
        return { success: false, error: result.error || 'Failed to change directory' }
      }

      return { success: true, message: `Working directory set to ${nextDirectory}` }
    },
  },
  {
    id: 'compact',
    name: 'Compact Context',
    description: 'Summarize older conversation history to reduce context usage',
    usage: '/compact',
    async execute(context) {
      const requestId = globalThis.crypto?.randomUUID?.() || `compact-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const completion = waitForCompactCompletion(context.sessionId, requestId)

      const emitted = await window.electronAPI.emitCommand(context.sessionId, {
        type: 'command:compact-context',
        requestId,
        manual: true,
      })

      if (!emitted?.success) {
        completion.cancel()
        return { success: false, error: emitted?.error || 'Failed to start compact' }
      }

      const result = await completion.promise
      if (!result.success) {
        return { success: false, error: result.error || 'Compact failed' }
      }
      if (result.skipped) {
        return { success: true, message: result.error || 'Nothing to compact yet' }
      }
      return { success: true, message: 'Context compacted' }
    },
  },
]

let pluginCommands: CommandDefinition[] = []
let pluginCommandsPromise: Promise<CommandDefinition[]> | null = null

export async function refreshPluginCommands(): Promise<CommandDefinition[]> {
  if (pluginCommandsPromise) return pluginCommandsPromise

  pluginCommandsPromise = (async () => {
    try {
      const result = await window.electronAPI.getPluginCommands()
      if (!result.success) {
        pluginCommands = []
        return pluginCommands
      }
      pluginCommands = (result.commands || []).map(command => ({
        id: command.id,
        name: command.name.replace(/^\//, '') || command.id,
        description: command.description,
        usage: command.usage,
        async execute(context) {
          const response = await window.electronAPI.executePluginCommand(
            command.name,
            context.rawArgs,
            context.sessionId,
          )
          if (!response.success) {
            return { success: false, error: response.error || `${command.name} failed` }
          }
          return { success: true, message: response.message || `${command.name} completed` }
        },
      }))
      return pluginCommands
    } catch {
      pluginCommands = []
      return pluginCommands
    } finally {
      pluginCommandsPromise = null
    }
  })()

  return pluginCommandsPromise
}

function waitForCompactCompletion(sessionId: string, requestId: string): {
  promise: Promise<{ success: boolean; skipped?: boolean; error?: string }>
  cancel: () => void
} {
  let cleanup: (() => void) | undefined
  let timeout: number | undefined

  const promise = new Promise<{ success: boolean; skipped?: boolean; error?: string }>((resolve) => {
    const finish = (result: { success: boolean; skipped?: boolean; error?: string }) => {
      if (timeout !== undefined) window.clearTimeout(timeout)
      cleanup?.()
      resolve(result)
    }

    timeout = window.setTimeout(() => {
      finish({ success: false, error: 'Timed out waiting for compact to finish' })
    }, 120000)

    cleanup = window.electronAPI.onSessionEvent((envelope: any) => {
      if (envelope.sessionId !== sessionId) return
      const event = envelope.event
      if (event?.type !== 'context:compact-completed') return
      if (event.requestId !== requestId) return

      finish({
        success: event.success,
        skipped: event.skipped,
        error: event.error,
      })
    })
  })

  return {
    promise,
    cancel: () => {
      if (timeout !== undefined) window.clearTimeout(timeout)
      cleanup?.()
    },
  }
}

/**
 * Get all available commands
 */
export function getCommands(): CommandDefinition[] {
  const merged = new Map<string, CommandDefinition>()
  for (const command of commands) merged.set(command.id, command)
  for (const command of pluginCommands) {
    if (!merged.has(command.id)) merged.set(command.id, command)
  }
  return Array.from(merged.values())
}

/**
 * Find a command by its ID (exact match)
 */
export function findCommand(id: string): CommandDefinition | undefined {
  const normalized = id.toLowerCase()
  return getCommands().find((cmd) => cmd.id === normalized)
}

/**
 * Filter commands by query (fuzzy match on id, name, or description)
 */
export function filterCommands(query: string): CommandDefinition[] {
  const normalized = query.toLowerCase().replace(/^\//, '')

  if (!normalized) {
    return getCommands()
  }

  return getCommands().filter(
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
  let command = findCommand(id)
  if (!command) {
    await refreshPluginCommands()
    command = findCommand(id)
  }
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
