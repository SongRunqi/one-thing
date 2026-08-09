/**
 * Tool System Types
 *
 * Defines the core types for the tool system, including:
 * - Tool definition and registration
 * - Tool execution context and results
 * - Tool handlers
 */

import type { ToolDefinition, ToolCall, ToolParameter, ProviderConfig, ToolSettings, Step, SkillDefinition, ToolPartialResult, ToolResultContentPart } from '@shared/ipc.js'
import type { JsonObject, JsonValue } from '@shared/json.js'
import type { CoreProviderToolSchema } from '@onething/core/tools'
import type { ToolEffect, ToolPreview } from '@onething/core/tools'
import type { Principal } from '@onething/core/permission'

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
  /**
   * Who is running this tool. Minted once at the engine boundary and carried
   * here — the reason this field exists is that everything downstream used to
   * re-derive an actor from `session.agentId`, a field stamped on every
   * session (core/session/store-helpers.ts), so its presence proved nothing.
   */
  principal?: Principal
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
  // N6: end the agent loop after this turn's tools all settle (graceful wrap-up).
  terminate?: boolean
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

export type AIToolSchema = CoreProviderToolSchema
export { coreProviderToolSchemaFromParameters as toAIToolSchema } from '@onething/core/tools'
