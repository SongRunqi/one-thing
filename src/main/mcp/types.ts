/**
 * MCP (Model Context Protocol) Types
 *
 * Type definitions for MCP client integration
 */

/**
 * MCP Server transport type
 */
export type MCPTransportType = 'stdio' | 'sse'

/**
 * MCP Server configuration
 */
export interface MCPServerConfig {
  /** Unique identifier for this server */
  id: string
  /** Display name */
  name: string
  /** Transport type */
  transport: MCPTransportType
  /** Whether this server is enabled */
  enabled: boolean

  // stdio transport options
  /** Command to run (for stdio transport) */
  command?: string
  /** Arguments for the command */
  args?: string[]
  /** Environment variables */
  env?: Record<string, string>
  /** Working directory */
  cwd?: string

  // SSE transport options
  /** Server URL (for SSE transport) */
  url?: string
  /** Optional headers for SSE connection */
  headers?: Record<string, string>
}

/**
 * MCP Server connection status
 */
export type MCPConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

/**
 * MCP Server state (runtime)
 */
export interface MCPServerState {
  /** Server configuration */
  config: MCPServerConfig
  /** Connection status */
  status: MCPConnectionStatus
  /** Error message if status is 'error' */
  error?: string
  /** Available tools from this server */
  tools: MCPToolInfo[]
  /** Available resources from this server */
  resources: MCPResourceInfo[]
  /** Available prompts from this server */
  prompts: MCPPromptInfo[]
  /** Last connection time */
  connectedAt?: number
}

/**
 * MCP Tool information
 */
export interface MCPToolInfo {
  /** Tool name (unique within server) */
  name: string
  /** Tool description */
  description?: string
  /** JSON Schema for input parameters */
  inputSchema: {
    type: 'object'
    properties?: Record<string, any>
    required?: string[]
  }
  /** Server ID this tool belongs to */
  serverId: string
}

/**
 * MCP Resource information
 */
export interface MCPResourceInfo {
  /** Resource URI */
  uri: string
  /** Resource name */
  name: string
  /** Resource description */
  description?: string
  /** MIME type */
  mimeType?: string
  /** Server ID this resource belongs to */
  serverId: string
}

/**
 * MCP Prompt information
 */
export interface MCPPromptInfo {
  /** Prompt name */
  name: string
  /** Prompt description */
  description?: string
  /** Prompt arguments */
  arguments?: Array<{
    name: string
    description?: string
    required?: boolean
  }>
  /** Server ID this prompt belongs to */
  serverId: string
}

/**
 * MCP Tool call request
 */
export interface MCPToolCallRequest {
  /** Server ID */
  serverId: string
  /** Tool name */
  toolName: string
  /** Tool arguments */
  arguments: Record<string, any>
}

/**
 * MCP Tool call result
 */
export interface MCPToolCallResult {
  /** Whether the call succeeded */
  success: boolean
  /** Result content (array of content blocks) */
  content?: Array<{
    type: 'text' | 'image' | 'resource'
    text?: string
    data?: string
    mimeType?: string
  }>
  /** Error message if failed */
  error?: string
  /** Whether this is an error result from the tool itself */
  isError?: boolean
}

/**
 * MCP Settings in AppSettings
 */
export interface MCPSettings {
  /** Whether MCP is enabled globally */
  enabled: boolean
  /** Configured MCP servers */
  servers: MCPServerConfig[]
}

/**
 * Default MCP settings
 */
export const DEFAULT_MCP_SETTINGS: MCPSettings = {
  enabled: true,
  servers: [],
}
