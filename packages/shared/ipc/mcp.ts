/**
 * MCP Module
 * MCP (Model Context Protocol) server-related type definitions for IPC communication
 *
 * Base types (`MCPTransportType`, `MCPServerConfig`, …) are re-exported from
 * `@onething/core/mcp` — the engine is the single source of truth. Only the
 * IPC request/response envelopes are defined locally here. Extend transports
 * in `packages/core/mcp/types.ts` and every layer follows.
 */

import type { JsonArray, JsonObject, JsonValue } from '../json.js'
import type { CoreMCPProbeResult, MCPToolCallResult } from '@onething/core/mcp'

export type {
  MCPConnectionStatus,
  MCPPromptInfo,
  MCPResourceInfo,
  MCPServerConfig,
  MCPServerState,
  MCPSettings,
  MCPToolCallRequest,
  MCPToolCallResult,
  MCPToolInfo,
  MCPTransportType,
} from '@onething/core/mcp'

import type {
  MCPServerConfig,
  MCPServerState,
  MCPToolInfo,
  MCPResourceInfo,
  MCPPromptInfo,
} from '@onething/core/mcp'

// MCP IPC Request/Response types
export interface MCPGetServersResponse {
  success: boolean
  servers?: MCPServerState[]
  error?: string
}

export interface MCPAddServerRequest {
  config: MCPServerConfig
}

export interface MCPAddServerResponse {
  success: boolean
  server?: MCPServerState
  error?: string
}

export interface MCPUpdateServerRequest {
  config: MCPServerConfig
}

export interface MCPUpdateServerResponse {
  success: boolean
  server?: MCPServerState
  error?: string
}

export interface MCPRemoveServerRequest {
  serverId: string
}

export interface MCPRemoveServerResponse {
  success: boolean
  error?: string
}

export interface MCPConnectServerRequest {
  serverId: string
}

export interface MCPConnectServerResponse {
  success: boolean
  server?: MCPServerState
  error?: string
}

export interface MCPDisconnectServerRequest {
  serverId: string
}

export interface MCPDisconnectServerResponse {
  success: boolean
  error?: string
}

export interface MCPLogoutServerRequest {
  serverId: string
}

export interface MCPLogoutServerResponse {
  success: boolean
  error?: string
}

/**
 * P2-2 preflight probe: dry-run a candidate config before adding it.
 */
export interface MCPProbeServerRequest {
  config: MCPServerConfig
}

export type MCPProbeServerResponse = CoreMCPProbeResult

export interface MCPRefreshServerRequest {
  serverId: string
}

export interface MCPRefreshServerResponse {
  success: boolean
  server?: MCPServerState
  error?: string
}

export interface MCPGetToolsResponse {
  success: boolean
  tools?: MCPToolInfo[]
  error?: string
}

export interface MCPCallToolRequest {
  serverId: string
  toolName: string
  arguments: JsonObject
}

export interface MCPCallToolResponse {
  success: boolean
  content?: MCPToolCallResult['content']
  error?: string
  isError?: boolean
}

export interface MCPGetResourcesResponse {
  success: boolean
  resources?: MCPResourceInfo[]
  error?: string
}

export interface MCPReadResourceRequest {
  serverId: string
  uri: string
}

export interface MCPReadResourceResponse {
  success: boolean
  content?: JsonValue
  error?: string
}

export interface MCPGetPromptsResponse {
  success: boolean
  prompts?: MCPPromptInfo[]
  error?: string
}

export interface MCPGetPromptRequest {
  serverId: string
  name: string
  arguments?: Record<string, string>
}

export interface MCPGetPromptResponse {
  success: boolean
  messages?: JsonArray
  error?: string
}

export interface MCPReadConfigFileRequest {
  filePath: string
}

export interface MCPReadConfigFileResponse {
  success: boolean
  content?: JsonValue
  error?: string
}
