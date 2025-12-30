/**
 * User Profile Module
 * User profile type definitions for IPC communication
 */

// Fact category for user profile
export type UserFactCategory = 'personal' | 'preference' | 'goal' | 'trait'

// A single fact about the user
export interface UserFact {
  id: string
  content: string                // The fact content
  category: UserFactCategory     // Category of the fact
  confidence: number             // 0-100, how confident we are about this fact
  sources: string[]              // Which agents contributed this fact
  createdAt: number
  updatedAt: number
  embedding?: number[]           // Cached embedding vector (optional)
}

// User profile - shared across all agents
export interface UserProfile {
  id: string
  facts: UserFact[]
  createdAt: number
  updatedAt: number
}

// User Profile IPC Request/Response types
export interface GetUserProfileResponse {
  success: boolean
  profile?: UserProfile
  error?: string
}

export interface AddUserFactRequest {
  content: string
  category: UserFactCategory
  confidence?: number
  sourceAgentId?: string
}

export interface AddUserFactResponse {
  success: boolean
  fact?: UserFact
  error?: string
}

export interface UpdateUserFactRequest {
  factId: string
  content?: string
  category?: UserFactCategory
  confidence?: number
}

export interface UpdateUserFactResponse {
  success: boolean
  fact?: UserFact
  error?: string
}

export interface DeleteUserFactRequest {
  factId: string
}

export interface DeleteUserFactResponse {
  success: boolean
  error?: string
}
