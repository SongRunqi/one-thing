/**
 * Stream Processor Module
 * Handles stream context, processor, and active stream management
 */

import * as store from '../../store.js'
import type { AppSettings, ProviderConfig, ToolSettings, Step } from '../../../shared/ipc.js'
import type { ToolCall } from '../../../shared/ipc.js'
import type { ReasoningPlacement } from '../../../shared/events/index.js'
import { isMCPTool, parseMCPToolId, findMCPToolIdByShortName, MCPManager } from '../../mcp/index.js'
import { resolveAIToolName } from '../../providers/tool-name-alias.js'
import { createEventOnlyEmitter } from '../../events/event-only-emitter.js'
import type { PendingMessageQueue } from './message-queue.js'
import type { AgentJsonObject, AgentOutputModality } from '@onething/core/agent-loop'
import type { AgentRuntimeProviderConfig } from '../../providers/agent-runtime.js'
import {
  resolveToolIdentity as resolveCoreToolIdentity,
} from '@onething/core/engine'
import {
  createOnethingStreamProcessor,
} from '@onething/runtime/stream-processor'

export type StreamProviderConfig = ProviderConfig & AgentRuntimeProviderConfig

export type StreamSenderPayload =
  | string
  | number
  | boolean
  | null
  | undefined
  | object

export interface StreamSender {
  isDestroyed(): boolean
  send(channel: string, ...args: StreamSenderPayload[]): void
}

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
  toolId: string      // Full tool ID for execution (e.g., "mcp_search")
  displayName: string // Human-readable display name
  isMcp: boolean      // Whether this is an MCP tool
}

/**
 * Resolve tool identity from a tool name
 *
 * AI models usually call the single MCP router tool (`mcp_search`), but
 * persisted/legacy calls may still contain old MCP ids. This function resolves
 * the full ID and provides a display name.
 *
 * @param toolName The tool name from the AI model
 * @param args Optional tool arguments for context-aware resolution
 * @returns Resolved tool identity with full ID and display name
 */
export function resolveToolIdentity(toolName: string, args: AgentJsonObject = {}): ResolvedTool {
  return resolveCoreToolIdentity(toolName, args, {
    normalizeToolName: resolveAIToolName,
    isMCPTool,
    findMCPToolIdByShortName,
    parseMCPToolId,
    getMCPServerName(serverId) {
      return MCPManager.getServerState(serverId)?.config.name
    },
  })
}

/**
 * Context for streaming operations
 */
export interface StreamContext {
  sender: StreamSender
  sessionId: string
  assistantMessageId: string
  abortSignal: AbortSignal
  settings: AppSettings
  providerConfig: StreamProviderConfig
  providerId: string
  requestedOutputModalities?: AgentOutputModality[]
  toolSettings: ToolSettings | undefined
  // Note: skills are resolved by the active stream runtime, not stored here.
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
    args: AgentJsonObject
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
  const emitter = createEventOnlyEmitter(ctx)

  return createOnethingStreamProcessor<ToolCall, Step, ReasoningPlacement>({
    sessionId: ctx.sessionId,
    assistantMessageId: ctx.assistantMessageId,
    initialContent,
    resolveToolIdentity: (toolName, args) => resolveToolIdentity(toolName, args as AgentJsonObject),
    store: {
      updateMessageContent: store.updateMessageContent,
      updateMessageReasoning: store.updateMessageReasoning,
      updateMessageToolCalls: store.updateMessageToolCalls,
      updateMessageStreaming: store.updateMessageStreaming,
      flushSessionSave: store.flushSessionSave,
    },
    emitter,
  })
}
