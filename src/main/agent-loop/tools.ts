import {
  executeTool,
  getEnabledToolsAsync,
  initializeToolRegistry,
  setInitContext,
} from '../tools/registry.js'
import type { InitContext } from '../tools/core/tool.js'
import type { ToolExecutionContext } from '../tools/types.js'
import type { ToolSettings } from '../../shared/ipc.js'
import type { JsonObject, JsonValue } from '../../shared/json.js'
import { toJsonObject, toJsonValue } from '../../shared/json.js'
import { createAIToolName, resolveAIToolName } from './tool-names.js'
import type { AgentTool, AgentToolExecutionContext } from './types.js'

export interface AgentRegistryToolOptions {
  initContext?: InitContext
  executionContext: Omit<ToolExecutionContext, 'toolCallId'>
  toolSettings?: ToolSettings
  selectedToolNames?: string[]
}

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

export async function agentToolsFromRegistry(options: AgentRegistryToolOptions): Promise<AgentTool[]> {
  await initializeToolRegistry()
  setInitContext(options.initContext)

  if (options.toolSettings?.enableToolCalls === false) {
    return []
  }

  const selected = options.selectedToolNames?.length
    ? new Set(options.selectedToolNames)
    : undefined
  const sourceTools = await getEnabledToolsAsync(options.toolSettings?.tools)
  const sourceDefinitions = agentToolDefinitionsFromSourceTools(sourceTools)
  const definitions = selected
    ? Object.fromEntries(
        Object.entries(sourceDefinitions)
          .filter(([name]) => selected.has(name) || selected.has(resolveAIToolName(name))),
      )
    : sourceDefinitions

  return agentToolsFromToolDefinitions(definitions, async (name, args, ctx) => {
    const result = await executeTool(resolveAIToolName(name), args, {
      ...options.executionContext,
      sessionId: ctx.sessionId,
      messageId: ctx.messageId,
      toolCallId: ctx.toolCallId,
      workingDirectory: ctx.workingDirectory ?? options.executionContext.workingDirectory,
      abortSignal: ctx.abortSignal ?? options.executionContext.abortSignal,
      onMetadata: ctx.onMetadata
        ? update => ctx.onMetadata?.({
            title: update.title,
            metadata: toJsonObject(update.metadata),
          })
        : options.executionContext.onMetadata,
      onPartialResult: ctx.onPartialResult
        ? update => ctx.onPartialResult?.(update)
        : options.executionContext.onPartialResult,
    })
    return {
      ...result,
      data: toJsonValue(result.data),
    }
  })
}
