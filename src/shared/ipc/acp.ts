/**
 * ACP (Agent Client Protocol) settings and IPC types.
 */

import type { JsonObject } from '../json.js'

export type ACPConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export type ACPPermissionMode = 'allow' | 'reject'

export interface ACPAgentConfig {
  id: string
  name: string
  description?: string
  enabled: boolean
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  model?: string
  permissionMode?: ACPPermissionMode
  allowFileSystemAccess?: boolean
  allowTerminalAccess?: boolean
  mcpServers?: JsonObject[]
  connectTimeoutMs?: number
  promptTimeoutMs?: number
  idleTimeoutMs?: number
  maxBufferedUpdates?: number
  maxSessionRecords?: number
  maxTerminals?: number
  maxTerminalOutputBytes?: number
}

export interface ACPAgentState {
  config: ACPAgentConfig
  status: ACPConnectionStatus
  error?: string
  connectedAt?: number
  lastUsedAt?: number
  pid?: number
  protocolVersion?: number
  agentInfo?: {
    name?: string
    version?: string
  }
  sessionCount: number
  activePromptCount: number
}

export interface ACPSettings {
  enabled: boolean
  agents: ACPAgentConfig[]
}

export interface ACPGetAgentsResponse {
  success: boolean
  agents?: ACPAgentState[]
  error?: string
}

export interface ACPAddAgentRequest {
  config: ACPAgentConfig
}

export interface ACPAddAgentResponse {
  success: boolean
  agent?: ACPAgentState
  error?: string
}

export interface ACPUpdateAgentRequest {
  config: ACPAgentConfig
}

export interface ACPUpdateAgentResponse {
  success: boolean
  agent?: ACPAgentState
  error?: string
}

export interface ACPRemoveAgentRequest {
  agentId: string
}

export interface ACPRemoveAgentResponse {
  success: boolean
  error?: string
}

export interface ACPConnectAgentRequest {
  agentId: string
}

export interface ACPConnectAgentResponse {
  success: boolean
  agent?: ACPAgentState
  error?: string
}

export interface ACPDisconnectAgentRequest {
  agentId: string
}

export interface ACPDisconnectAgentResponse {
  success: boolean
  error?: string
}

export interface ACPRefreshAgentRequest {
  agentId: string
}

export interface ACPRefreshAgentResponse {
  success: boolean
  agent?: ACPAgentState
  error?: string
}

export interface ACPCancelSessionRequest {
  sessionId: string
  agentId?: string
}

export interface ACPCancelSessionResponse {
  success: boolean
  error?: string
}
