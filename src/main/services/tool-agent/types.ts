/**
 * Tool Agent Types
 *
 * Type definitions for the Tool Agent delegation architecture.
 */

import type { ProviderConfig, ToolSettings, SkillDefinition, ToolAgentSettings } from '../../../shared/ipc.js'

// Re-export for convenience
export type { ToolAgentSettings }

/**
 * Request to delegate a task to the Tool Agent
 */
export interface DelegationRequest {
  task: string
  context: string
  expectedOutcome: string
  sessionId: string
  messageId: string
}

/**
 * Result returned by the Tool Agent after execution
 */
export interface ToolAgentResult {
  success: boolean
  summary: string
  details: string
  filesModified: string[]
  errors: string[]
  toolCallCount: number
  executionTimeMs: number
}

/**
 * Context for Tool Agent execution
 */
export interface ToolAgentContext {
  sessionId: string
  messageId: string
  providerId: string
  providerConfig: ProviderConfig
  toolSettings?: ToolSettings
  abortSignal?: AbortSignal
  skills?: SkillDefinition[]  // Skills available for the Tool Agent
}

/**
 * A single step executed by the Tool Agent
 */
export interface ToolAgentStep {
  toolName: string
  arguments: Record<string, unknown>
  result: unknown
  status: 'success' | 'failed'
  timestamp: number
  error?: string
  thinking?: string  // AI's reasoning before this tool call
  summary?: string   // AI's analysis after getting the result
}
