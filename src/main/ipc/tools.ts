/**
 * Tools IPC Handlers
 *
 * Handles IPC communication for tool-related operations:
 * - Get all available tools (builtin + MCP)
 * - Execute a tool
 * - Cancel a tool execution
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS, type ToolDefinition } from '../../shared/ipc.js'
import {
  getAllTools,
  executeTool,
  initializeToolRegistry,
  isInitialized,
} from '../tools/index.js'
import type { ToolExecutionContext } from '../tools/index.js'
import { MCPManager } from '../mcp/manager.js'
import { mcpToolToToolDefinition } from '../mcp/bridge.js'

/**
 * Register all tool-related IPC handlers
 */
export function registerToolHandlers() {
  // Initialize the tool registry
  if (!isInitialized()) {
    initializeToolRegistry()
  }

  // Get all available tools (builtin + MCP)
  ipcMain.handle(IPC_CHANNELS.GET_TOOLS, async () => {
    try {
      // Get builtin tools and mark their source
      const builtinTools: ToolDefinition[] = getAllTools().map(t => ({
        ...t,
        source: 'builtin' as const,
      }))

      // Get MCP tools if MCP is enabled
      const mcpTools: ToolDefinition[] = []
      if (MCPManager.isEnabled) {
        const mcpToolInfos = MCPManager.getAllTools()
        const serverStates = MCPManager.getServerStates()

        for (const mcpTool of mcpToolInfos) {
          const toolDef = mcpToolToToolDefinition(mcpTool)
          // Find server name
          const serverState = serverStates.find(s => s.config.id === mcpTool.serverId)
          mcpTools.push({
            ...toolDef,
            source: 'mcp' as const,
            serverId: mcpTool.serverId,
            serverName: serverState?.config.name || mcpTool.serverId,
          })
        }
      }

      return {
        success: true,
        tools: [...builtinTools, ...mcpTools],
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

  console.log('[Tools IPC] Handlers registered')
}
