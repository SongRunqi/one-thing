/**
 * Stream Processor Module
 * Handles stream context, processor, and active stream management
 */

import { v4 as uuidv4 } from 'uuid'
import * as store from '../../store.js'
import { IPC_CHANNELS } from '../../../shared/ipc.js'
import type { AppSettings, ProviderConfig, ToolSettings, Step, StepType } from '../../../shared/ipc.js'
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
  // Note: skills are passed separately to runStream/executeToolAndUpdate, not stored here
  // Accumulated token usage across all turns (for statistics)
  accumulatedUsage?: { inputTokens: number; outputTokens: number; totalTokens: number; durationMs?: number }
  // Last turn's token usage (for context size - NOT accumulated)
  lastTurnUsage?: { inputTokens: number; outputTokens: number }
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
  /** Handle streaming tool input start - creates a pending tool call */
  handleToolInputStart(toolCallId: string, toolName: string): void
  /** Handle streaming tool input delta - accumulates args JSON text */
  handleToolInputDelta(toolCallId: string, argsTextDelta: string): void
  /** Handle streaming tool input end - parses accumulated JSON and returns ToolCall */
  handleToolInputEnd(toolCallId: string): ToolCall | null
  /** Get step ID for a tool call (if placeholder was created during streaming) */
  getStepIdForToolCall(toolCallId: string): string | undefined
  finalize(): void
}

/**
 * Create a stream processor for handling chunks
 */
export function createStreamProcessor(ctx: StreamContext, initialContent?: { content?: string; reasoning?: string }): StreamProcessor {
  let accumulatedContent = initialContent?.content || ''
  let accumulatedReasoning = initialContent?.reasoning || ''
  const toolCalls: ToolCall[] = []

  // Buffer for streaming tool input (AI SDK v6 tool-call-streaming-start/delta)
  // Maps toolCallId -> { toolName, argsText (accumulated JSON string), stepId }
  const toolInputBuffers = new Map<string, { toolName: string; argsText: string; stepId: string }>()

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
      // Check if a placeholder already exists (from handleToolInputStart)
      const existingIndex = toolCalls.findIndex(tc => tc.id === toolCallData.toolCallId)

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

      let toolCall: ToolCall
      if (existingIndex >= 0) {
        // Update existing placeholder with complete args
        toolCall = toolCalls[existingIndex]
        toolCall.toolId = toolId
        toolCall.toolName = displayName
        toolCall.arguments = toolCallData.args
        toolCall.status = 'pending'  // Transition from input-streaming to pending
        // Keep streamingArgs for reference but clear it
        delete toolCall.streamingArgs
      } else {
        // Create new toolCall (fallback for non-streaming providers)
        toolCall = createToolCall(
          toolId,        // toolId: use full ID for execution
          displayName,   // toolName: use readable name for display
          toolCallData.args
        )
        toolCall.id = toolCallData.toolCallId
        toolCalls.push(toolCall)
      }

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

    /**
     * Handle streaming tool input start
     * Creates placeholder ToolCall and Step for real-time streaming display
     */
    handleToolInputStart(toolCallId: string, toolName: string) {
      // Resolve tool ID (AI models may return short names)
      let toolId = toolName
      let displayName = toolName
      let isMcp = false

      if (isMCPTool(toolName)) {
        toolId = toolName
        isMcp = true
      } else {
        const fullId = findMCPToolIdByShortName(toolName, {})
        if (fullId) {
          toolId = fullId
          isMcp = true
        }
      }

      if (isMcp) {
        const parsed = parseMCPToolId(toolId)
        if (parsed) {
          const serverState = MCPManager.getServerState(parsed.serverId)
          displayName = serverState?.config.name || parsed.serverId
        }
      }

      // Create placeholder ToolCall with streaming status
      const placeholderToolCall: ToolCall = {
        id: toolCallId,
        toolId: toolId,
        toolName: displayName,
        arguments: {},
        status: 'input-streaming',
        streamingArgs: '',
        timestamp: Date.now(),
      }
      toolCalls.push(placeholderToolCall)

      // Determine step type based on tool name
      const stepType: StepType = toolName.toLowerCase() === 'bash' ? 'command' : 'tool-call'

      // Create placeholder Step
      const stepId = uuidv4()
      const placeholderStep: Step = {
        id: stepId,
        type: stepType,
        title: `调用工具: ${displayName}`,
        status: 'running',
        timestamp: Date.now(),
        toolCallId: toolCallId,
        toolCall: { ...placeholderToolCall },
      }

      // Store stepId for later updates
      toolInputBuffers.set(toolCallId, { toolName, argsText: '', stepId })

      // Add step to store and notify frontend
      store.addMessageStep(ctx.sessionId, ctx.assistantMessageId, placeholderStep)
      store.updateMessageToolCalls(ctx.sessionId, ctx.assistantMessageId, toolCalls)

      // Send step added event
      ctx.sender.send(IPC_CHANNELS.STEP_ADDED, {
        sessionId: ctx.sessionId,
        messageId: ctx.assistantMessageId,
        step: placeholderStep,
      })

      // Send tool_input_start with placeholder toolCall
      ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'tool_input_start',
        content: '',
        messageId: ctx.assistantMessageId,
        sessionId: ctx.sessionId,
        toolCallId,
        toolName: displayName,
        toolCall: placeholderToolCall,
      })


    },

    /**
     * Handle streaming tool input delta
     * Accumulates args JSON text incrementally and updates step
     */
    handleToolInputDelta(toolCallId: string, argsTextDelta: string) {
      const buffer = toolInputBuffers.get(toolCallId)
      if (buffer) {
        buffer.argsText += argsTextDelta

        // Update the placeholder ToolCall's streamingArgs
        const toolCallIndex = toolCalls.findIndex(tc => tc.id === toolCallId)
        if (toolCallIndex >= 0) {
          toolCalls[toolCallIndex].streamingArgs = buffer.argsText
          store.updateMessageToolCalls(ctx.sessionId, ctx.assistantMessageId, toolCalls)
        }

        // Update the Step's toolCall.streamingArgs
        if (buffer.stepId) {
          const stepUpdates: Partial<Step> = {
            toolCall: {
              id: toolCallId,
              toolId: toolCalls[toolCallIndex]?.toolId || '',
              toolName: toolCalls[toolCallIndex]?.toolName || buffer.toolName,
              arguments: {},
              status: 'input-streaming' as const,
              streamingArgs: buffer.argsText,
              timestamp: toolCalls[toolCallIndex]?.timestamp || Date.now(),
            }
          }
          store.updateMessageStep(ctx.sessionId, ctx.assistantMessageId, buffer.stepId, stepUpdates)

          // Send step updated event for real-time UI update
          ctx.sender.send(IPC_CHANNELS.STEP_UPDATED, {
            sessionId: ctx.sessionId,
            messageId: ctx.assistantMessageId,
            stepId: buffer.stepId,
            updates: stepUpdates,
          })
        }

        // Send IPC delta to frontend for real-time display
        ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
          type: 'tool_input_delta',
          content: '',
          messageId: ctx.assistantMessageId,
          sessionId: ctx.sessionId,
          toolCallId,
          argsTextDelta,
        })
      }
    },

    /**
     * Handle streaming tool input end
     * Parses accumulated JSON and creates the ToolCall
     * Returns the ToolCall for execution, or null if parse fails
     */
    handleToolInputEnd(toolCallId: string): ToolCall | null {
      const buffer = toolInputBuffers.get(toolCallId)
      if (!buffer) {
        console.warn(`[StreamProcessor] No buffer found for tool input end: ${toolCallId}`)
        return null
      }

      // Parse the accumulated JSON args
      let args: Record<string, any> = {}
      try {
        if (buffer.argsText.trim()) {
          args = JSON.parse(buffer.argsText)
        }
      } catch (e) {
        console.error(`[StreamProcessor] Failed to parse tool args JSON:`, e, buffer.argsText)
        // Return null to skip this malformed tool call
        // The full 'tool-call' chunk will handle it with complete args
      }

      // Clean up buffer
      toolInputBuffers.delete(toolCallId)

      // Create the ToolCall using existing logic
      return this.handleToolCallChunk({
        toolCallId,
        toolName: buffer.toolName,
        args,
      })
    },

    /**
     * Get step ID for a tool call (if placeholder was created during streaming)
     */
    getStepIdForToolCall(toolCallId: string): string | undefined {
      return toolInputBuffers.get(toolCallId)?.stepId
    },

    finalize() {
      store.updateMessageStreaming(ctx.sessionId, ctx.assistantMessageId, false)
    },
  }
}
