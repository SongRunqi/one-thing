import type { JsonObject, JsonSchemaObject } from '../json.js'

export type MCPTransportType = 'stdio' | 'sse'

export interface MCPServerConfig {
  id: string
  name: string
  transport: MCPTransportType
  enabled: boolean
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
}

export type MCPConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface MCPServerState {
  config: MCPServerConfig
  status: MCPConnectionStatus
  error?: string
  tools: MCPToolInfo[]
  resources: MCPResourceInfo[]
  prompts: MCPPromptInfo[]
  connectedAt?: number
}

export interface MCPToolInfo {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, JsonSchemaObject>
    required?: string[]
  }
  serverId: string
}

export interface MCPResourceInfo {
  uri: string
  name: string
  description?: string
  mimeType?: string
  serverId: string
}

export interface MCPPromptInfo {
  name: string
  description?: string
  arguments?: Array<{
    name: string
    description?: string
    required?: boolean
  }>
  serverId: string
}

export interface MCPToolCallRequest {
  serverId: string
  toolName: string
  arguments: JsonObject
}

export interface MCPToolCallResult {
  success: boolean
  content?: Array<{
    type: 'text' | 'image' | 'resource'
    text?: string
    data?: string
    mimeType?: string
  }>
  /**
   * Readable rendering of `content`, with binary parts summarised.
   *
   * The agent loop turns a tool result into message text via `toolOutputToText`,
   * which falls back to `JSON.stringify(data)` unless the payload carries an
   * `output` string. Without this field an image part's base64 was stringified
   * into the tool message *in addition to* being attached as a real image part
   * — the same payload billed twice.
   */
  output?: string
  error?: string
  isError?: boolean
}

export interface MCPSettings {
  enabled: boolean
  servers: MCPServerConfig[]
}

export const DEFAULT_MCP_SETTINGS: MCPSettings = {
  enabled: true,
  servers: [],
}
