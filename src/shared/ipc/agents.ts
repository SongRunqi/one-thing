export const DEFAULT_AGENT_ID = 'default'

export interface AgentDefinition {
  id: string
  name: string
  systemPrompt: string
  isDefault?: boolean
  createdAt: number
  updatedAt: number
}

export interface AgentsListResponse {
  success: boolean
  agents?: AgentDefinition[]
  error?: string
}

export interface AgentCreateRequest {
  name: string
  systemPrompt?: string
}

export interface AgentCreateResponse {
  success: boolean
  agent?: AgentDefinition
  error?: string
}

export interface AgentUpdateRequest {
  agentId: string
  name?: string
  systemPrompt?: string
}

export interface AgentUpdateResponse {
  success: boolean
  agent?: AgentDefinition
  error?: string
}

export interface AgentDeleteRequest {
  agentId: string
}

export interface AgentDeleteResponse {
  success: boolean
  error?: string
}
