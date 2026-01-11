/**
 * Custom Agents Module
 *
 * Type definitions for CustomAgent system - agents with custom inline tools
 * that can be invoked as tools by the main LLM.
 */

import type { AgentAvatar } from './agents.js'

// ============================================
// Custom Tool Definitions
// ============================================

/**
 * Parameter type for custom tools
 */
export type CustomToolParameterType = 'string' | 'number' | 'boolean' | 'object' | 'array'

/**
 * Custom tool parameter definition
 */
export interface CustomToolParameter {
  name: string
  type: CustomToolParameterType
  description: string
  required: boolean
  default?: unknown
  enum?: string[]
}

/**
 * Bash execution type - execute a shell command
 */
export interface BashExecution {
  type: 'bash'
  /** Command template with {{param}} placeholders */
  command: string
  /** Additional environment variables */
  env?: Record<string, string>
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number
}

/**
 * HTTP execution type - make an HTTP request
 */
export interface HttpExecution {
  type: 'http'
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  /** URL template with {{param}} placeholders */
  url: string
  /** Request headers */
  headers?: Record<string, string>
  /** Request body template (for POST/PUT/PATCH) */
  bodyTemplate?: string
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number
}

/**
 * Builtin tool execution type - delegate to an existing builtin tool
 */
export interface BuiltinExecution {
  type: 'builtin'
  /** ID of the builtin tool to invoke */
  toolId: string
  /** Map custom tool params to builtin tool params */
  argsMapping?: Record<string, string>
}

/**
 * Custom tool execution configuration
 */
export type CustomToolExecution = BashExecution | HttpExecution | BuiltinExecution

/**
 * Custom tool definition within a CustomAgent
 */
export interface CustomToolDefinition {
  id: string
  name: string
  description: string
  parameters: CustomToolParameter[]
  execution: CustomToolExecution
}

// ============================================
// Custom Agent Definition
// ============================================

/**
 * Source of the CustomAgent definition
 */
export type CustomAgentSource = 'user' | 'project'

/**
 * Custom Agent definition
 *
 * A CustomAgent is an agent with custom inline tools that can be invoked
 * as a single tool by the main LLM. It runs in an isolated context.
 */
export interface CustomAgent {
  /** Unique identifier (generated from name + source) */
  id: string
  /** Display name (also used as tool parameter value) */
  name: string
  /** Description shown to the main LLM as tool description */
  description: string
  /** Optional avatar for UI display */
  avatar?: AgentAvatar
  /** System prompt for the agent's execution context */
  systemPrompt: string

  // Custom tools
  /** List of custom tools available to this agent */
  customTools: CustomToolDefinition[]
  /** Whether to include builtin tools (default: false) */
  allowBuiltinTools?: boolean
  /** Whitelist of builtin tool IDs if allowBuiltinTools is true */
  allowedBuiltinTools?: string[]

  // Execution settings
  /** Max tool calls per invocation (default: 20) */
  maxToolCalls?: number
  /** Timeout in milliseconds (default: 120000) */
  timeoutMs?: number

  // Memory settings
  /** Whether to enable memory for this agent (default: true) */
  enableMemory?: boolean

  // Source information
  /** Source of this agent definition */
  source: CustomAgentSource
  /** Full path to the source JSON file */
  sourcePath: string

  // Metadata
  createdAt?: number
  updatedAt?: number
}

// ============================================
// Execution Result Types
// ============================================

/**
 * Result of a custom tool execution
 */
export interface CustomToolResult {
  success: boolean
  output: string
  error?: string
  /** Execution time in milliseconds */
  executionTimeMs?: number
}

/**
 * Step in CustomAgent execution (for progress tracking)
 */
export interface CustomAgentStep {
  toolName: string
  arguments: Record<string, unknown>
  result: CustomToolResult | null
  /** Status: awaiting-confirmation is used when a tool (like bash) needs user permission */
  status: 'pending' | 'running' | 'success' | 'failed' | 'awaiting-confirmation'
  timestamp: number
  /** AI's reasoning before this tool call */
  thinking?: string
  /** Summary after tool execution */
  summary?: string
  /** Tool call ID from the AI provider (used to link to frontend toolCall) */
  toolCallId?: string
}

/**
 * Result of CustomAgent execution
 */
export interface CustomAgentResult {
  success: boolean
  /** Summary of what was accomplished */
  summary: string
  /** Detailed output for the main LLM */
  output: string
  /** List of tool calls made */
  steps: CustomAgentStep[]
  /** Number of tool calls made */
  toolCallCount: number
  /** Total execution time in milliseconds */
  executionTimeMs: number
  /** Any errors encountered */
  errors: string[]
}

// ============================================
// IPC Request/Response Types
// ============================================

/**
 * Get all available CustomAgents
 */
export interface GetCustomAgentsRequest {
  /** Working directory for project-level agents */
  workingDirectory?: string
}

export interface GetCustomAgentsResponse {
  success: boolean
  agents?: CustomAgent[]
  pinnedAgentIds?: string[]
  error?: string
}

/**
 * Invoke a CustomAgent
 */
export interface InvokeCustomAgentRequest {
  agentId: string
  task: string
  sessionId: string
  messageId: string
  workingDirectory?: string
}

export interface InvokeCustomAgentResponse {
  success: boolean
  result?: CustomAgentResult
  error?: string
}

/**
 * Refresh CustomAgents (reload from file system)
 */
export interface RefreshCustomAgentsRequest {
  workingDirectory?: string
}

export interface RefreshCustomAgentsResponse {
  success: boolean
  agents?: CustomAgent[]
  error?: string
}

// ============================================
// JSON File Format (for reference)
// ============================================

/**
 * JSON file format for CustomAgent definition
 *
 * Stored in:
 * - ~/.claude/agents/*.json (user-level)
 * - {workingDirectory}/.claude/agents/*.json (project-level)
 *
 * Example:
 * ```json
 * {
 *   "name": "git-helper",
 *   "description": "A specialized agent for git operations",
 *   "systemPrompt": "You are a Git expert...",
 *   "customTools": [
 *     {
 *       "id": "git-status",
 *       "name": "Git Status",
 *       "description": "Check git status",
 *       "parameters": [],
 *       "execution": { "type": "bash", "command": "git status" }
 *     }
 *   ],
 *   "maxToolCalls": 10
 * }
 * ```
 */
export interface CustomAgentJsonFile {
  name: string
  description: string
  avatar?: AgentAvatar
  systemPrompt: string
  customTools: CustomToolDefinition[]
  allowBuiltinTools?: boolean
  allowedBuiltinTools?: string[]
  maxToolCalls?: number
  timeoutMs?: number
  enableMemory?: boolean
}

/**
 * CustomAgent config stored in the store (includes ID and timestamps)
 */
export interface CustomAgentConfig {
  id: string
  name: string
  description: string
  avatar?: AgentAvatar
  systemPrompt: string
  customTools: CustomToolDefinition[]
  allowBuiltinTools?: boolean
  allowedBuiltinTools?: string[]
  maxToolCalls?: number
  timeoutMs?: number
  enableMemory?: boolean
  createdAt: number
  updatedAt: number
}

// ============================================
// CRUD Request/Response Types
// ============================================

/**
 * Create a new CustomAgent
 */
export interface CreateCustomAgentRequest {
  config: Omit<CustomAgentConfig, 'id' | 'createdAt' | 'updatedAt'>
  source?: 'user' | 'project'
  workingDirectory?: string
}

export interface CreateCustomAgentResponse {
  success: boolean
  agent?: CustomAgent
  error?: string
}

/**
 * Update an existing CustomAgent
 */
export interface UpdateCustomAgentRequest {
  agentId: string
  updates: Partial<Omit<CustomAgentConfig, 'id' | 'createdAt' | 'updatedAt'>>
  workingDirectory?: string
}

export interface UpdateCustomAgentResponse {
  success: boolean
  agent?: CustomAgent
  error?: string
}

/**
 * Delete a CustomAgent
 */
export interface DeleteCustomAgentRequest {
  agentId: string
  workingDirectory?: string
}

export interface DeleteCustomAgentResponse {
  success: boolean
  error?: string
}

// ============================================
// Pin Request/Response Types
// ============================================

/**
 * Pin a CustomAgent to sidebar
 */
export interface PinCustomAgentRequest {
  agentId: string
}

export interface PinCustomAgentResponse {
  success: boolean
  pinnedAgentIds?: string[]
  error?: string
}

/**
 * Unpin a CustomAgent from sidebar
 */
export interface UnpinCustomAgentRequest {
  agentId: string
}

export interface UnpinCustomAgentResponse {
  success: boolean
  pinnedAgentIds?: string[]
  error?: string
}
