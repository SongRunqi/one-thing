/**
 * Tool System Types
 *
 * Defines the core types for the tool system, including:
 * - Tool definition and registration
 * - Tool execution context and results
 * - Tool handlers
 */

import type { ToolDefinition, ToolCall, ToolParameter, ProviderConfig, ToolSettings, Step, SkillDefinition, ToolPartialResult, ToolResultContentPart } from '../../shared/ipc.js'
import type { JsonObject, JsonSchemaObject, JsonValue } from '../../shared/json.js'
import type { ToolEffect, ToolPreview } from './core/tool-effect.js'

// Re-export shared types
export type { ToolDefinition, ToolCall, ToolParameter }

/**
 * Metadata update payload from tools
 */
export interface ToolMetadataUpdate {
  title?: string
  metadata?: JsonObject
}

export type { ToolResultContentPart }
export type ToolPartialResultUpdate = ToolPartialResult

/**
 * Context provided to tool handlers during execution
 */
export interface ToolExecutionContext {
  sessionId: string
  messageId: string
  toolCallId?: string  // ID of the tool call for metadata updates
  // Sandbox boundary for file access restrictions
  workingDirectory?: string  // Session's active working directory
  workingDirectoryRoots?: string[] // Additional sandbox roots
  // Extended context for Tool Agent delegation
  providerId?: string
  providerConfig?: ProviderConfig
  toolSettings?: ToolSettings
  abortSignal?: AbortSignal
  skills?: SkillDefinition[]  // Skills available for delegation
  // Step event callbacks for delegate tool (Tool Agent forwards its steps)
  onStepStart?: (step: Step) => void
  onStepComplete?: (step: Step) => void
  // Tool metadata streaming callback
  onMetadata?: (update: ToolMetadataUpdate) => void
  // Pi-style partial result streaming callback. Partial and final tool output share the same shape.
  onPartialResult?: (update: ToolPartialResultUpdate) => void
  // Wait point for tools that are about to perform filesystem/process/remote side effects.
  beforeSideEffect?: () => Promise<void>
  // Analysis approved by central PermissionPolicy before execute.
  approvedAnalysis?: { effects: ToolEffect[]; preview?: ToolPreview }
}

/**
 * Result of a tool execution
 */
export interface ToolExecutionResult {
  success: boolean
  data?: object | JsonValue
  error?: string
  // For dangerous commands that need user confirmation
  requiresConfirmation?: boolean
  commandType?: 'read-only' | 'dangerous' | 'forbidden'
  // For abort/cancel - set when user cancels the operation
  aborted?: boolean
  // For permission rejection - set when the user rejects a permission request
  rejected?: boolean
  rejectionReason?: string
}

/**
 * Tool handler function type
 */
export type ToolHandler = (
  args: JsonObject,
  context: ToolExecutionContext
) => Promise<ToolExecutionResult>

/**
 * Internal tool registration with handler
 */
export interface RegisteredTool {
  definition: ToolDefinition
  handler: ToolHandler
}

/**
 * Tool schema for provider runtime compatibility.
 * Converts our ToolDefinition to the shared provider tool format.
 */
export interface AIToolSchema {
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, JsonSchemaObject & {
      type: string
      description: string
      enum?: string[]
    }>
    required: string[]
  }
}

/**
 * Convert ToolDefinition to provider tool schema.
 */
export function toAIToolSchema(tool: ToolDefinition): AIToolSchema {
  const properties: AIToolSchema['parameters']['properties'] = {}
  const required: string[] = []

  for (const param of tool.parameters) {
    properties[param.name] = {
      type: param.type === 'array' ? 'array' : param.type === 'object' ? 'object' : param.type,
      description: param.description,
    }
    if (param.enum) {
      properties[param.name].enum = param.enum
    }
    if (param.required) {
      required.push(param.name)
    }
  }

  return {
    description: tool.description,
    parameters: {
      type: 'object',
      properties,
      required,
    },
  }
}
