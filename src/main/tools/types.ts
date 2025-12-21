/**
 * Tool System Types
 *
 * Defines the core types for the tool system, including:
 * - Tool definition and registration
 * - Tool execution context and results
 * - Tool handlers
 */

import type { ToolDefinition, ToolCall, ToolParameter } from '../../shared/ipc.js'

// Re-export shared types
export type { ToolDefinition, ToolCall, ToolParameter }

/**
 * Context provided to tool handlers during execution
 */
export interface ToolExecutionContext {
  sessionId: string
  messageId: string
  // Add more context as needed (e.g., user settings, previous messages)
}

/**
 * Result of a tool execution
 */
export interface ToolExecutionResult {
  success: boolean
  data?: any
  error?: string
  // For dangerous commands that need user confirmation
  requiresConfirmation?: boolean
  commandType?: 'read-only' | 'dangerous' | 'forbidden'
}

/**
 * Tool handler function type
 */
export type ToolHandler = (
  args: Record<string, any>,
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
 * Tool schema for AI SDK compatibility
 * Converts our ToolDefinition to the format expected by Vercel AI SDK
 */
export interface AIToolSchema {
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, {
      type: string
      description: string
      enum?: string[]
    }>
    required: string[]
  }
}

/**
 * Convert ToolDefinition to AI SDK tool schema
 */
export function toAIToolSchema(tool: ToolDefinition): AIToolSchema {
  const properties: Record<string, any> = {}
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
