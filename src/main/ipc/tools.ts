/**
 * Tools IPC Handlers
 *
 * Handles IPC communication for tool-related operations:
 * - Get all available builtin tools
 * - Execute a tool
 * - Cancel a tool execution
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS, type ToolDefinition, type ToolCall } from '../../shared/ipc.js'
import {
  getAllToolsV2,
  getAllToolsV2Async,
  getAllToolsAsync,
  executeTool,
  initializeToolRegistry,
  isInitialized,
  zodToJsonSchema,
} from '../tools/index.js'
import type { ToolExecutionContext, ToolInfo, ToolInfoAsync, ToolInitResult } from '../tools/index.js'
import * as store from '../store.js'

/**
 * Convert V2 tool to ToolDefinition for frontend
 */
function toolInfoToDefinition(tool: ToolInfo): ToolDefinition {
  const jsonSchema = zodToJsonSchema(tool.parameters)
  const parameters: ToolDefinition['parameters'] = []

  for (const [name, prop] of Object.entries(jsonSchema.properties)) {
    const propObj = prop as Record<string, unknown>
    const rawType = (propObj.type as string) || 'string'
    // Map JSON Schema types to our supported types
    const type = (['string', 'number', 'boolean', 'object', 'array'].includes(rawType)
      ? rawType
      : 'string') as 'string' | 'number' | 'boolean' | 'object' | 'array'
    parameters.push({
      name,
      type,
      description: (propObj.description as string) || '',
      required: jsonSchema.required.includes(name),
      enum: propObj.enum as string[] | undefined,
    })
  }

  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    parameters,
    enabled: tool.enabled ?? true,
    autoExecute: tool.autoExecute ?? false,
    category: tool.category === 'mcp' ? 'custom' : tool.category,
  }
}

/**
 * Register all tool-related IPC handlers
 */
export function registerToolHandlers() {
  // Initialize the tool registry
  if (!isInitialized()) {
    initializeToolRegistry()
  }

  // Get builtin tools only (MCP tools are managed in MCP settings page)
  // Uses async version to include tools with dynamic descriptions
  ipcMain.handle(IPC_CHANNELS.GET_TOOLS, async () => {
    try {
      // Get all tools (legacy + V2 static + V2 async) and filter out MCP tools
      const allTools = await getAllToolsAsync()
      const builtinTools: ToolDefinition[] = allTools
        .filter(t => !t.id.startsWith('mcp:'))
        .map(t => ({
          ...t,
          source: 'builtin' as const,
        }))

      return {
        success: true,
        tools: builtinTools,
      }
    } catch (error: any) {
      console.error('[Tools IPC] Error getting tools:', error)
      return {
        success: false,
        error: error.message || 'Failed to get tools',
      }
    }
  })

  // Execute a tool
  ipcMain.handle(IPC_CHANNELS.EXECUTE_TOOL, async (_event, request) => {
    try {
      const { toolId, arguments: args, messageId, sessionId } = request

      const context: ToolExecutionContext = {
        sessionId,
        messageId,
      }

      const result = await executeTool(toolId, args, context)

      return {
        success: result.success,
        result: result.data,
        error: result.error,
      }
    } catch (error: any) {
      console.error('[Tools IPC] Error executing tool:', error)
      return {
        success: false,
        error: error.message || 'Failed to execute tool',
      }
    }
  })

  // Cancel a tool execution (placeholder for future implementation)
  ipcMain.handle(IPC_CHANNELS.CANCEL_TOOL, async (_event, { toolCallId }) => {
    // TODO: Implement tool cancellation if needed
    console.log('[Tools IPC] Cancel tool requested:', toolCallId)
    return {
      success: true,
    }
  })

  // Update a tool call (status, timing, result)
  ipcMain.handle(IPC_CHANNELS.UPDATE_TOOL_CALL, async (_event, request) => {
    try {
      const { sessionId, messageId, toolCallId, updates } = request

      // Get current session and find message
      const session = store.getSession(sessionId)
      if (!session) {
        return { success: false, error: 'Session not found' }
      }

      const message = session.messages.find(m => m.id === messageId)
      if (!message || !message.toolCalls) {
        return { success: false, error: 'Message or tool calls not found' }
      }

      // Find and update the tool call
      const toolCalls = message.toolCalls.map(tc => {
        if (tc.id === toolCallId) {
          return { ...tc, ...updates }
        }
        return tc
      })

      // Save tool calls to store
      store.updateMessageToolCalls(sessionId, messageId, toolCalls)

      // Also update the corresponding step if it exists
      if (message.steps) {
        const step = message.steps.find(s => s.toolCallId === toolCallId)
        if (step) {
          // Map toolCall status to step status
          let stepStatus: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting-confirmation' = step.status
          if (updates.status === 'executing') {
            stepStatus = 'running'
          } else if (updates.status === 'completed') {
            stepStatus = 'completed'
          } else if (updates.status === 'failed' || updates.status === 'cancelled') {
            stepStatus = 'failed'
          } else if (updates.status === 'pending' && updates.requiresConfirmation) {
            stepStatus = 'awaiting-confirmation'
          }

          // Update step
          store.updateMessageStep(sessionId, messageId, step.id, {
            status: stepStatus,
            result: typeof updates.result === 'string' ? updates.result : (updates.result ? JSON.stringify(updates.result) : undefined),
            error: updates.error,
            toolCall: { ...step.toolCall, ...updates } as any,
          })
        }
      }

      return { success: true }
    } catch (error: any) {
      console.error('[Tools IPC] Error updating tool call:', error)
      return {
        success: false,
        error: error.message || 'Failed to update tool call',
      }
    }
  })

  console.log('[Tools IPC] Handlers registered')
}
