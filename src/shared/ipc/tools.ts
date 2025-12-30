/**
 * Tools Module
 * Tool-related type definitions for IPC communication
 */

// Tool related types
export interface GetToolsResponse {
  success: boolean
  tools?: ToolDefinition[]
  error?: string
}

export interface ExecuteToolRequest {
  toolId: string
  arguments: Record<string, any>
  messageId: string  // Associated message ID
  sessionId: string
}

export interface ExecuteToolResponse {
  success: boolean
  result?: any
  error?: string
}

export interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  required?: boolean
  enum?: string[]
  default?: any
}

export interface ToolDefinition {
  id: string
  name: string
  description: string
  parameters: ToolParameter[]
  // Permission settings
  enabled: boolean           // Whether this tool is enabled
  autoExecute: boolean       // Whether to auto-execute when called
  // Tool category for grouping in UI
  category: 'builtin' | 'custom'
  // Icon for UI display
  icon?: string
  // Tool source for UI display
  source?: 'builtin' | 'mcp'  // Where the tool comes from
  serverId?: string           // MCP server ID (only for MCP tools)
  serverName?: string         // MCP server name (only for MCP tools)
}

export interface ToolCall {
  id: string                 // Unique ID for this tool call
  toolId: string             // ID of the tool being called
  toolName: string           // Name of the tool
  arguments: Record<string, any>  // Arguments passed to the tool
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled'
  result?: any               // Result of the tool execution
  error?: string             // Error message if failed
  timestamp: number
  startTime?: number         // Execution start timestamp
  endTime?: number           // Execution end timestamp
  // For dangerous commands that need user confirmation
  requiresConfirmation?: boolean
  commandType?: 'read-only' | 'dangerous' | 'forbidden'
}

// Bash tool specific settings
export interface BashToolSettings {
  enableSandbox: boolean              // Whether to enable directory sandbox
  defaultWorkingDirectory?: string    // Default working directory for commands
  allowedDirectories: string[]        // List of allowed directories
  confirmDangerousCommands: boolean   // Whether to confirm dangerous commands
  dangerousCommandWhitelist: string[] // Commands to skip confirmation (e.g., "npm install")
}

// Tool Agent delegation settings
export interface ToolAgentSettings {
  autoConfirmDangerous?: boolean  // Auto-confirm dangerous commands (default: true)
  maxToolCalls?: number           // Max tool calls per delegation (default: 50)
  timeoutMs?: number              // Timeout for Tool Agent (default: 300000 = 5 min)
  providerId?: string             // Optional: use different provider for Tool Agent
  model?: string                  // Optional: use different model for Tool Agent
}

export interface ToolSettings {
  // Global tool settings
  enableToolCalls: boolean   // Master switch for tool calls
  // Per-tool settings (toolId -> settings)
  tools: Record<string, {
    enabled: boolean
    autoExecute: boolean
  }>
  // Bash tool specific settings
  bash?: BashToolSettings
  // Tool Agent settings (provider/model for tool execution)
  toolAgentSettings?: ToolAgentSettings
}

// Stream message types
export interface StreamMessageChunk {
  type: 'text' | 'reasoning' | 'error' | 'complete' | 'tool_call' | 'tool_result'
  content: string
  messageId?: string
  reasoning?: string
  toolCall?: ToolCall
}

export interface SendMessageStreamResponse {
  success: boolean
  chunk?: StreamMessageChunk
  error?: string
  errorDetails?: string
}
