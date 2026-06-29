export interface SharedSlashCommandDefinition {
  id: string
  name: string
  description: string
  usage: string
  displayLabel: string
  insertText: string
  allowArgs?: boolean
}

export interface ParsedSharedSlashCommand {
  command: SharedSlashCommandDefinition
  args: string[]
  rawArgs: string
}

export interface InvalidSharedSlashCommand {
  command: SharedSlashCommandDefinition
  args: string[]
  rawArgs: string
  usage: string
}

export type SharedSlashCommandParseResult =
  | { type: 'command'; value: ParsedSharedSlashCommand }
  | { type: 'invalid'; value: InvalidSharedSlashCommand }
  | { type: 'none' }

export const NEW_SESSION_SLASH_COMMAND: SharedSlashCommandDefinition = {
  id: 'new',
  name: 'New Session',
  description: 'Start a new chat session',
  usage: '/new',
  displayLabel: '/new',
  insertText: '/new ',
}

export const CHANGE_DIRECTORY_SLASH_COMMAND: SharedSlashCommandDefinition = {
  id: 'cd',
  name: 'Change Directory',
  description: 'Change the working directory for this session',
  usage: '/cd <path>',
  displayLabel: '/cd',
  insertText: '/cd ',
  allowArgs: true,
}

export const COMPACT_CONTEXT_SLASH_COMMAND: SharedSlashCommandDefinition = {
  id: 'compact',
  name: 'Compact Context',
  description: 'Summarize older conversation history to reduce context usage',
  usage: '/compact',
  displayLabel: '/compact',
  insertText: '/compact ',
}

export const SHARED_SLASH_COMMANDS = [
  NEW_SESSION_SLASH_COMMAND,
  CHANGE_DIRECTORY_SLASH_COMMAND,
  COMPACT_CONTEXT_SLASH_COMMAND,
] as const satisfies readonly SharedSlashCommandDefinition[]

export function findSharedSlashCommand(id: string): SharedSlashCommandDefinition | undefined {
  const normalizedId = id.trim().toLowerCase()
  return SHARED_SLASH_COMMANDS.find(command => command.id === normalizedId)
}

export function parseSharedSlashCommand(text: string): SharedSlashCommandParseResult {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/') && !trimmed.startsWith('／')) {
    return { type: 'none' }
  }

  const body = trimmed.slice(1).trim()
  if (!body) return { type: 'none' }

  const [commandToken = '', ...args] = body.split(/\s+/)
  const command = findSharedSlashCommand(commandToken)
  if (!command) return { type: 'none' }

  const commandEndIndex = body.search(/\s/)
  const rawArgs = commandEndIndex === -1 ? '' : body.slice(commandEndIndex).trim()
  if (!command.allowArgs && rawArgs) {
    return {
      type: 'invalid',
      value: {
        command,
        args,
        rawArgs,
        usage: command.usage,
      },
    }
  }

  return {
    type: 'command',
    value: {
      command,
      args,
      rawArgs,
    },
  }
}
