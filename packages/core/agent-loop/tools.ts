import type { JsonObject, JsonValue } from '../json.js'
import { toJsonValue } from '../json.js'
import { createAIToolName } from './tool-names.js'
import type { AgentTool, AgentToolExecutionContext } from './types.js'

export interface AgentSourceToolDefinition {
  id: string
  name?: string
  description?: string
  parameters?: Array<{
    name: string
    type: string
    description: string
    required?: boolean
    enum?: string[]
  }>
  parameterSchema?: JsonObject
}

export interface AgentModelToolDefinition {
  description?: string
  parameters?: Array<{
    name: string
    type: string
    description: string
    required?: boolean
    enum?: string[]
  }>
  parameterSchema?: JsonObject
}

export interface AgentToolExecutionAdapterResult {
  success: boolean
  data?: JsonValue
  error?: string
  requiresConfirmation?: boolean
  commandType?: 'read-only' | 'dangerous' | 'forbidden'
  aborted?: boolean
  rejected?: boolean
  rejectionReason?: string
}

export type AgentToolExecutionAdapter = (
  toolName: string,
  args: JsonObject,
  ctx: AgentToolExecutionContext,
) => Promise<AgentToolExecutionAdapterResult>

function parametersToJsonSchema(parameters: AgentModelToolDefinition['parameters'] = []): JsonObject {
  const properties: Record<string, JsonObject> = {}
  const required: string[] = []

  for (const parameter of parameters) {
    properties[parameter.name] = {
      type: parameter.type || 'string',
      description: parameter.description,
      ...(parameter.enum?.length ? { enum: parameter.enum } : {}),
    }
    if (parameter.required) required.push(parameter.name)
  }

  return { type: 'object', properties, required }
}

function toolOutputToText(output: JsonValue | undefined): string {
  if (output == null) return ''
  if (typeof output === 'string') return output
  if (typeof output === 'object' && 'output' in output) {
    const outputRecord = output as JsonObject
    if (typeof outputRecord.output === 'string') return outputRecord.output
  }
  try {
    return JSON.stringify(output)
  } catch {
    return String(output)
  }
}

function agentToolParametersFromDefinition(definition: AgentModelToolDefinition): JsonObject {
  return definition.parameterSchema ?? parametersToJsonSchema(definition.parameters)
}

export function agentToolDefinitionsFromSourceTools(
  toolDefinitions: AgentSourceToolDefinition[],
): Record<string, AgentModelToolDefinition> {
  const result: Record<string, AgentModelToolDefinition> = {}
  const usedNames = new Set<string>()

  for (const tool of toolDefinitions) {
    const modelToolName = createAIToolName(tool.id, usedNames)
    result[modelToolName] = {
      description: tool.description,
      parameters: tool.parameters,
      parameterSchema: tool.parameterSchema,
    }
  }

  return result
}

export function agentToolsFromToolDefinitions(
  definitions: Record<string, AgentModelToolDefinition>,
  execute: AgentToolExecutionAdapter,
): AgentTool[] {
  return Object.entries(definitions).map(([name, definition]) => ({
    name,
    description: definition.description,
    parameters: agentToolParametersFromDefinition(definition),
    async execute(args, ctx) {
      const result = await execute(name, args, ctx)

      if (!result.success) {
        return {
          content: '',
          error: result.error || `Tool failed: ${name}`,
          data: toJsonValue(result),
          requiresConfirmation: result.requiresConfirmation,
          commandType: result.commandType,
          aborted: result.aborted,
          rejected: result.rejected,
          rejectionReason: result.rejectionReason,
        }
      }

      return {
        content: toolOutputToText(result.data),
        data: result.data,
        requiresConfirmation: result.requiresConfirmation,
        commandType: result.commandType,
        aborted: result.aborted,
        rejected: result.rejected,
        rejectionReason: result.rejectionReason,
      }
    },
  }))
}

export function agentModelToolsFromDefinitions(
  definitions: Record<string, AgentModelToolDefinition>,
): AgentTool[] {
  return Object.entries(definitions).map(([name, definition]) => ({
    name,
    description: definition.description,
    parameters: agentToolParametersFromDefinition(definition),
    async execute() {
      return { content: '' }
    },
  }))
}
