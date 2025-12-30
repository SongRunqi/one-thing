/**
 * Stream Processor Module
 * Handles stream context, processor, and active stream management
 */

import * as store from '../../store.js'
import { IPC_CHANNELS } from '../../../shared/ipc.js'
import type { AppSettings, ProviderConfig, ToolSettings } from '../../../shared/ipc.js'
import type { ToolCall } from '../../../shared/ipc.js'
import { createToolCall } from '../../tools/index.js'
import { isMCPTool, parseMCPToolId, findMCPToolIdByShortName, MCPManager } from '../../mcp/index.js'

/**
 * Store active AbortControllers per session for stream cancellation
 * Key: sessionId, Value: AbortController
 */
export const activeStreams = new Map<string, AbortController>()

/**
 * Context for streaming operations
 */
export interface StreamContext {
  sender: Electron.WebContents
  sessionId: string
  assistantMessageId: string
  abortSignal: AbortSignal
  settings: AppSettings
  providerConfig: ProviderConfig
  providerId: string
  toolSettings: ToolSettings | undefined
  // Note: skills are passed separately to runToolLoop/executeToolAndUpdate, not stored here
  // Accumulated token usage across all turns
  accumulatedUsage?: { inputTokens: number; outputTokens: number; totalTokens: number }
}

/**
 * Stream processor that handles chunk accumulation and event sending
 */
export interface StreamProcessor {
  accumulatedContent: string
  accumulatedReasoning: string
  toolCalls: ToolCall[]
  handleTextChunk(text: string, turnContent?: { value: string }): void
  handleReasoningChunk(reasoning: string, turnReasoning?: { value: string }): void
  handleToolCallChunk(toolCallData: {
    toolCallId: string
    toolName: string
    args: Record<string, any>
  }): ToolCall
  finalize(): void
}

/**
 * Create a stream processor for handling chunks
 */
export function createStreamProcessor(ctx: StreamContext, initialContent?: { content?: string; reasoning?: string }): StreamProcessor {
  let accumulatedContent = initialContent?.content || ''
  let accumulatedReasoning = initialContent?.reasoning || ''
  const toolCalls: ToolCall[] = []

  return {
    get accumulatedContent() { return accumulatedContent },
    get accumulatedReasoning() { return accumulatedReasoning },
    get toolCalls() { return toolCalls },

    handleTextChunk(text: string, turnContent?: { value: string }) {
      accumulatedContent += text
      if (turnContent) turnContent.value += text
      store.updateMessageContent(ctx.sessionId, ctx.assistantMessageId, accumulatedContent)
      ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'text',
        content: text,
        messageId: ctx.assistantMessageId,
        sessionId: ctx.sessionId,
      })
    },

    handleReasoningChunk(reasoning: string, turnReasoning?: { value: string }) {
      accumulatedReasoning += reasoning
      if (turnReasoning) turnReasoning.value += reasoning
      store.updateMessageReasoning(ctx.sessionId, ctx.assistantMessageId, accumulatedReasoning)
      ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'reasoning',
        content: '',
        messageId: ctx.assistantMessageId,
        sessionId: ctx.sessionId,
        reasoning,
      })
    },

    handleToolCallChunk(toolCallData: {
      toolCallId: string
      toolName: string
      args: Record<string, any>
    }): ToolCall {
      // Resolve tool ID - AI models may return short names like "get-library-docs"
      // instead of full IDs like "mcp_serverId_get-library-docs"
      let toolId = toolCallData.toolName
      let displayName = toolCallData.toolName
      let isMcp = false

      if (isMCPTool(toolCallData.toolName)) {
        // Already a full MCP tool ID
        toolId = toolCallData.toolName
        isMcp = true
      } else {
        // Try to find full MCP tool ID from short name or server name
        const fullId = findMCPToolIdByShortName(toolCallData.toolName, toolCallData.args)
        if (fullId) {
          console.log(`[Backend] Resolved short tool name "${toolCallData.toolName}" to full ID "${fullId}"`)
          toolId = fullId
          isMcp = true
        }
      }

      // For MCP tools, show the MCP server's display name
      // For regular tools, show the tool name
      if (isMcp) {
        const parsed = parseMCPToolId(toolId)
        if (parsed) {
          // Get the server's display name from MCPManager
          const serverState = MCPManager.getServerState(parsed.serverId)
          displayName = serverState?.config.name || parsed.serverId
        }
      }

      const toolCall = createToolCall(
        toolId,        // toolId: use full ID for execution
        displayName,   // toolName: use readable name for display
        toolCallData.args
      )
      toolCall.id = toolCallData.toolCallId
      toolCalls.push(toolCall)

      store.updateMessageToolCalls(ctx.sessionId, ctx.assistantMessageId, toolCalls)
      ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'tool_call',
        content: '',
        messageId: ctx.assistantMessageId,
        sessionId: ctx.sessionId,
        toolCall,
      })

      return toolCall
    },

    finalize() {
      store.updateMessageStreaming(ctx.sessionId, ctx.assistantMessageId, false)
    },
  }
}
