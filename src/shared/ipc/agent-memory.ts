/**
 * Agent Memory Module
 * Agent memory type definitions for IPC communication
 */

// Memory category
export type AgentMemoryCategory = 'observation' | 'event' | 'feeling' | 'learning'

// Memory vividness level
export type MemoryVividness = 'vivid' | 'clear' | 'hazy' | 'fragment'

// Agent mood
export type AgentMood = 'happy' | 'neutral' | 'concerned' | 'excited'

// A single memory entry
export interface AgentMemory {
  id: string
  content: string
  category: AgentMemoryCategory

  // Memory strength system
  strength: number           // 0-100
  emotionalWeight: number    // Higher = decays slower

  // Reinforcement factors
  createdAt: number
  lastRecalledAt: number
  recallCount: number
  linkedMemories: string[]

  // Memory state
  vividness: MemoryVividness

  // Cached embedding vector (optional, for similarity search)
  embedding?: number[]
}

// Agent's relationship with user
export interface AgentUserRelationship {
  agentId: string

  // Relationship status
  relationship: {
    trustLevel: number        // 0-100
    familiarity: number       // 0-100
    lastInteraction: number
    totalInteractions: number
  }

  // Agent's subjective feelings
  agentFeelings: {
    currentMood: AgentMood
    notes: string
  }

  // Observations from agent's perspective
  observations: AgentMemory[]

  // Domain-specific memory
  domainMemory: Record<string, unknown>
}

// Agent Memory IPC Request/Response types
export interface GetAgentRelationshipRequest {
  agentId: string
}

export interface GetAgentRelationshipResponse {
  success: boolean
  relationship?: AgentUserRelationship
  error?: string
}

export interface AddAgentMemoryRequest {
  agentId: string
  content: string
  category: AgentMemoryCategory
  emotionalWeight?: number
}

export interface AddAgentMemoryResponse {
  success: boolean
  memory?: AgentMemory
  error?: string
}

export interface DeleteAgentMemoryRequest {
  memoryId: string
}

export interface DeleteAgentMemoryResponse {
  success: boolean
  error?: string
}

export interface RecallAgentMemoryRequest {
  agentId: string
  memoryId: string
}

export interface RecallAgentMemoryResponse {
  success: boolean
  memory?: AgentMemory
  error?: string
}

export interface GetActiveMemoriesRequest {
  agentId: string
  limit?: number
}

export interface GetActiveMemoriesResponse {
  success: boolean
  memories?: AgentMemory[]
  error?: string
}

export interface UpdateAgentRelationshipRequest {
  agentId: string
  updates: {
    trustLevel?: number
    familiarity?: number
    mood?: AgentMood
    moodNotes?: string
  }
}

export interface UpdateAgentRelationshipResponse {
  success: boolean
  relationship?: AgentUserRelationship
  error?: string
}

export interface RecordInteractionRequest {
  agentId: string
}

export interface RecordInteractionResponse {
  success: boolean
  relationship?: AgentUserRelationship
  error?: string
}
