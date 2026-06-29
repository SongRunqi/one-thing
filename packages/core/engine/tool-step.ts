import type { JsonObject } from '../json.js'

export type CoreStepType = 'skill-read' | 'tool-call' | 'thinking' | 'file-read' | 'file-write' | 'command'

export interface CoreToolCallForStep {
  id: string
  toolName: string
  arguments: JsonObject
}

export interface CoreStepForToolCall<TToolCall extends CoreToolCallForStep = CoreToolCallForStep> {
  id: string
  type: CoreStepType
  title: string
  status: 'running'
  timestamp: number
  turnIndex?: number
  toolCallId: string
  toolCall: TToolCall
}

export interface CreateToolStepOptions {
  id: string
  timestamp: number
  skillName?: string | null
  turnIndex?: number
}

export interface CreateToolStepWithFactoryOptions {
  createId: () => string
  now: () => number
  skillName?: string | null
  turnIndex?: number
}

/**
 * Detect if a bash command is reading a skill file and extract skill name.
 */
export function detectSkillUsage(toolName: string, args: JsonObject): string | null {
  if (toolName !== 'bash') return null

  const command = typeof args.command === 'string' ? args.command : ''
  if (!command) return null

  const skillPathMatch = command.match(/(?:cat|less|head|tail|more)\s+.*(?:^|\/)([^/\s'"]+)\/SKILL\.md/)
  if (skillPathMatch) {
    return skillPathMatch[1]
  }

  return null
}

/**
 * Determine step type from tool name and arguments.
 */
export function getStepType(toolName: string, args: JsonObject): CoreStepType {
  if (toolName === 'bash') {
    const command = typeof args.command === 'string' ? args.command : ''
    if (command.match(/(?:cat|less|head|tail|more)\s+.*SKILL\.md/)) {
      return 'skill-read'
    }
    if (command.match(/^(cat|less|head|tail|more)\s+/)) {
      return 'file-read'
    }
    if (command.match(/^(echo|printf|tee)\s+.*>/) || command.match(/^(mv|cp|mkdir|touch|rm)\s+/)) {
      return 'file-write'
    }
    return 'command'
  }

  return 'tool-call'
}

/**
 * Generate a human-readable step title from tool name and arguments.
 */
export function generateStepTitle(toolName: string, args: JsonObject, skillName?: string | null): string {
  if (skillName) {
    return `Reading ${skillName} skill documentation`
  }

  if (toolName === 'bash') {
    const command = typeof args.command === 'string' ? args.command : ''
    return `Run: ${command}`
  }

  const lowerName = toolName.toLowerCase()
  const isFile = [
    'read', 'view_file', 'read_file', 'view-file', 'read-file',
    'write', 'write_to_file', 'write_file', 'write-file',
    'edit', 'replace_file_content', 'multi_replace_file_content',
  ].includes(lowerName)

  if (isFile) {
    const rawPath = args.path || args.AbsolutePath || args.TargetFile || args.filePath || ''
    if (rawPath) {
      const normalized = String(rawPath).replace(/\\/g, '/').replace(/\/+$/, '')
      const filename = normalized.split('/').filter(Boolean).pop() || normalized
      if (filename) {
        return `Tool: ${toolName}: ${filename}`
      }
    }
  }

  if (toolName.includes(':')) {
    const parts = toolName.split(':')
    const shortName = parts[parts.length - 1]
    return `Tool: ${shortName}`
  }

  return `Tool: ${toolName}`
}

export function createToolExecutionStep<TToolCall extends CoreToolCallForStep>(
  toolCall: TToolCall,
  options: CreateToolStepOptions,
): CoreStepForToolCall<TToolCall> {
  return {
    id: options.id,
    type: getStepType(toolCall.toolName, toolCall.arguments),
    title: generateStepTitle(toolCall.toolName, toolCall.arguments, options.skillName),
    status: 'running',
    timestamp: options.timestamp,
    turnIndex: options.turnIndex,
    toolCallId: toolCall.id,
    toolCall: { ...toolCall },
  }
}

export function createToolExecutionStepWithFactory<TToolCall extends CoreToolCallForStep>(
  toolCall: TToolCall,
  options: CreateToolStepWithFactoryOptions,
): CoreStepForToolCall<TToolCall> {
  return createToolExecutionStep(toolCall, {
    id: options.createId(),
    timestamp: options.now(),
    skillName: options.skillName,
    turnIndex: options.turnIndex,
  })
}
