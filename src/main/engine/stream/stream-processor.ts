/**
 * Stream Processor Module
 * Handles stream context, processor, and active stream management
 */

import { v4 as uuidv4 } from 'uuid'
import * as store from '../../store.js'
import type { AppSettings, ProviderConfig, ToolSettings, Step, StepType } from '../../../shared/ipc.js'
import type { ToolCall } from '../../../shared/ipc.js'
import type { ReasoningPlacement } from '../../../shared/events/index.js'
import { createToolCall } from '../../tools/index.js'
import { isMCPTool, parseMCPToolId, findMCPToolIdByShortName, MCPManager } from '../../mcp/index.js'
import { resolveAIToolName } from '../../providers/tool-name-alias.js'
import { type IPCEmitter } from './ipc-emitter.js'
import { createEventOnlyEmitter } from '../../events/event-only-emitter.js'
import type { PendingMessageQueue } from './message-queue.js'

// ============================================================
// Active Streams Registry
// ============================================================

/** Tracks active streaming sessions for abort support */
export const activeStreams = new Map<string, AbortController>()

/** Clean up all active streams on shutdown */
export function cleanupActiveStreams(): void {
  for (const [, controller] of activeStreams) {
    controller.abort()
  }
  activeStreams.clear()
}

// ============================================================
// MCP Tool Identity Resolution
// ============================================================

/**
 * Resolved tool identity with display name and ID information
 */
export interface ResolvedTool {
  toolId: string      // Full tool ID for execution (e.g., "mcp_context7_get-library-docs")
  displayName: string // Human-readable display name
  isMcp: boolean      // Whether this is an MCP tool
}

/**
 * Resolve tool identity from a tool name
 *
 * AI models may return short names like "get-library-docs" instead of
 * full IDs like "mcp_serverId_get-library-docs". This function resolves
 * the full ID and provides a display name.
 *
 * @param toolName The tool name from the AI model
 * @param args Optional tool arguments for context-aware resolution
 * @returns Resolved tool identity with full ID and display name
 */
export function resolveToolIdentity(toolName: string, args: Record<string, any> = {}): ResolvedTool {
  const originalToolName = resolveAIToolName(toolName)
  let toolId = originalToolName
  let displayName = originalToolName
  let isMcp = false

  // Check if it's already a full MCP tool ID
  if (isMCPTool(originalToolName)) {
    toolId = originalToolName
    isMcp = true
  } else {
    // Try to find full MCP tool ID from short name
    const fullId = findMCPToolIdByShortName(originalToolName, args)
    if (fullId) {
      toolId = fullId
      isMcp = true
    }
  }

  // For MCP tools, use the server's display name
  if (isMcp) {
    const parsed = parseMCPToolId(toolId)
    if (parsed) {
      const serverState = MCPManager.getServerState(parsed.serverId)
      displayName = serverState?.config.name || parsed.serverId
    }
  }

  return { toolId, displayName, isMcp }
}

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
  /** Steering message queue — messages injected mid-stream (after each turn) */
  steeringQueue?: PendingMessageQueue
  /** Follow-up message queue — messages injected only after agent would stop */
  followUpQueue?: PendingMessageQueue
  /** The current generation is answering a spoken user turn. */
  voiceConversation?: boolean
  /** The current assistant text should be treated as TTS-ready visible text. */
  speakMode?: boolean
}

/**
 * Stream processor that handles chunk accumulation and event sending
 */
export interface StreamProcessor {
  accumulatedContent: string
  accumulatedReasoning: string
  toolCalls: ToolCall[]
  handleTextChunk(text: string, turnContent?: { value: string }, turnIndex?: number): string
  handleReasoningChunk(reasoning: string, turnReasoning?: { value: string }, turnIndex?: number, placement?: ReasoningPlacement): void
  handleToolCallChunk(toolCallData: {
    toolCallId: string
    toolName: string
    args: Record<string, any>
  }, options?: { publish?: boolean }): ToolCall
  /** Handle streaming tool input start - creates a pending tool call */
  handleToolInputStart(toolCallId: string, toolName: string, turnIndex?: number, options?: { publish?: boolean }): void
  /** Handle streaming tool input delta - accumulates args JSON text */
  handleToolInputDelta(toolCallId: string, argsTextDelta: string): void
  /** Handle streaming tool input end - parses accumulated JSON and returns ToolCall */
  handleToolInputEnd(toolCallId: string): ToolCall | null
  /** Get step ID for a tool call (if placeholder was created during streaming) */
  getStepIdForToolCall(toolCallId: string): string | undefined
  /** Mark message as no longer streaming and force-flush pending async writes */
  finalize(): Promise<void>
}

/**
 * Create a stream processor for handling chunks
 */
export function createStreamProcessor(ctx: StreamContext, initialContent?: { content?: string; reasoning?: string }): StreamProcessor {
  let accumulatedContent = initialContent?.content || ''
  let accumulatedReasoning = initialContent?.reasoning || ''
  const toolCalls: ToolCall[] = []
  const emitter = createEventOnlyEmitter(ctx)

  // Buffer for streaming tool input (AI SDK v6 tool-call-streaming-start/delta)
  // Maps toolCallId -> { toolName, argsText (accumulated JSON string), stepId }
  const toolInputBuffers = new Map<string, { toolName: string; argsText: string; stepId?: string; visible: boolean }>()

  return {
    get accumulatedContent() { return accumulatedContent },
    get accumulatedReasoning() { return accumulatedReasoning },
    get toolCalls() { return toolCalls },

    handleTextChunk(text: string, turnContent?: { value: string }, turnIndex?: number) {
      if (!text) return ''

      accumulatedContent += text
      if (turnContent) turnContent.value += text
      store.updateMessageContent(ctx.sessionId, ctx.assistantMessageId, accumulatedContent)
      emitter.sendTextChunk(text, turnIndex)
      return text
    },

    handleReasoningChunk(reasoning: string, turnReasoning?: { value: string }, turnIndex?: number, placement: ReasoningPlacement = 'top') {
      accumulatedReasoning += reasoning
      if (turnReasoning) turnReasoning.value += reasoning
      if (placement === 'top') {
        store.updateMessageReasoning(ctx.sessionId, ctx.assistantMessageId, accumulatedReasoning)
      }
      emitter.sendReasoningChunk(reasoning, turnIndex, placement)
    },

    handleToolCallChunk(toolCallData: {
      toolCallId: string
      toolName: string
      args: Record<string, any>
    }, options: { publish?: boolean } = {}): ToolCall {
      const publish = options.publish !== false
      // Check if a placeholder already exists (from handleToolInputStart)
      const existingIndex = toolCalls.findIndex(tc => tc.id === toolCallData.toolCallId)

      // Resolve tool ID using centralized function
      const resolved = resolveToolIdentity(toolCallData.toolName, toolCallData.args)

      let toolCall: ToolCall
      if (existingIndex >= 0) {
        // Update existing placeholder with complete args
        toolCall = toolCalls[existingIndex]
        toolCall.toolId = resolved.toolId
        toolCall.toolName = resolved.displayName
        toolCall.arguments = toolCallData.args
        toolCall.status = 'pending'  // Transition from input-streaming to pending
        // Keep streamingArgs for reference but clear it
        delete toolCall.streamingArgs
      } else {
        // Create new toolCall (fallback for non-streaming providers)
        toolCall = createToolCall(
          resolved.toolId,      // toolId: use full ID for execution
          resolved.displayName, // toolName: use readable name for display
          toolCallData.args
        )
        toolCall.id = toolCallData.toolCallId
        if (publish) {
          toolCalls.push(toolCall)
        }
      }

      if (publish) {
        store.updateMessageToolCalls(ctx.sessionId, ctx.assistantMessageId, toolCalls)
        emitter.sendToolCall(toolCall)
      }

      return toolCall
    },

    /**
     * Handle streaming tool input start
     * Creates placeholder ToolCall and Step for real-time streaming display
     */
    handleToolInputStart(toolCallId: string, toolName: string, turnIndex?: number, options: { publish?: boolean } = {}) {
      const visible = options.publish !== false
      // Resolve tool ID using centralized function
      const resolved = resolveToolIdentity(toolName)

      // Create placeholder ToolCall with streaming status
      const placeholderToolCall: ToolCall = {
        id: toolCallId,
        toolId: resolved.toolId,
        toolName: resolved.displayName,
        arguments: {},
        status: 'input-streaming',
        streamingArgs: '',
        timestamp: Date.now(),
      }
      if (visible) {
        toolCalls.push(placeholderToolCall)
      }

      // Determine step type based on tool name
      const stepType: StepType = toolName.toLowerCase() === 'bash' ? 'command' : 'tool-call'

      // Create placeholder Step
      const stepId = uuidv4()
      const placeholderStep: Step = {
        id: stepId,
        type: stepType,
        title: `调用工具: ${resolved.displayName}`,
        status: 'running',
        timestamp: Date.now(),
        toolCallId: toolCallId,
        toolCall: { ...placeholderToolCall },
        turnIndex: turnIndex,  // Include turnIndex for proper contentParts ordering
      }

      // Store stepId for later updates
      toolInputBuffers.set(toolCallId, { toolName, argsText: '', stepId: visible ? stepId : undefined, visible })

      if (visible) {
        // Add step to store and notify frontend (emitter handles both)
        store.updateMessageToolCalls(ctx.sessionId, ctx.assistantMessageId, toolCalls)
        emitter.sendStepAdded(placeholderStep)

        // Send tool_input_start with placeholder toolCall
        emitter.sendToolInputStart(toolCallId, resolved.displayName, placeholderToolCall)
      }
    },

    /**
     * Handle streaming tool input delta
     * Accumulates args JSON text incrementally and updates step
     */
    handleToolInputDelta(toolCallId: string, argsTextDelta: string) {
      const buffer = toolInputBuffers.get(toolCallId)
      if (buffer) {
        buffer.argsText += argsTextDelta

        // Keep the complete argument string in the local buffer only. Writing
        // it back to the session store / EventBus on every delta creates a
        // growing-string copy on the main thread and can freeze the app during
        // large write/edit tool inputs. The renderer already has the placeholder
        // from tool-input-start and applies these deltas locally for live UI.
        if (buffer.visible) {
          emitter.sendToolInputDelta(toolCallId, argsTextDelta)
        }
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
        // Skip this malformed tool call — the full 'tool-call' chunk will handle it with complete args
        toolInputBuffers.delete(toolCallId)
        return null
      }

      // Clean up buffer
      toolInputBuffers.delete(toolCallId)

      // Create the ToolCall using existing logic
      return this.handleToolCallChunk({
        toolCallId,
        toolName: buffer.toolName,
        args,
      }, { publish: buffer.visible })
    },

    /**
     * Get step ID for a tool call (if placeholder was created during streaming)
     */
    getStepIdForToolCall(toolCallId: string): string | undefined {
      return toolInputBuffers.get(toolCallId)?.stepId
    },

    async finalize() {
      store.updateMessageStreaming(ctx.sessionId, ctx.assistantMessageId, false)
      // Force-flush pending throttled writes so disk state matches memory before stream:complete
      await store.flushSessionSave(ctx.sessionId)
    },
  }
}
