/**
 * User prompt snippets IPC types.
 */

export interface UserPrompt {
  id: string
  title: string
  body: string
  description?: string
  tags?: string[]
  createdAt: number
  updatedAt: number
}

export interface PromptReferenceSnapshot {
  promptId: string
  title: string
  content: string
  description?: string
  bodyHash: string
}

export interface PromptListResponse {
  success: boolean
  prompts?: UserPrompt[]
  error?: string
}

export interface PromptGetRequest {
  id: string
}

export interface PromptGetResponse {
  success: boolean
  prompt?: UserPrompt
  error?: string
}

export interface PromptCreateRequest {
  title: string
  body: string
  description?: string
  tags?: string[]
}

export interface PromptCreateResponse {
  success: boolean
  prompt?: UserPrompt
  error?: string
}

export interface PromptUpdateRequest {
  id: string
  title?: string
  body?: string
  description?: string
  tags?: string[]
}

export interface PromptUpdateResponse {
  success: boolean
  prompt?: UserPrompt
  error?: string
}

export interface PromptDeleteRequest {
  id: string
}

export interface PromptDeleteResponse {
  success: boolean
  error?: string
}
