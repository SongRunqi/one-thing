export type TodoPlanScope = 'user-note' | 'workspace-ai-todo'

export interface TodoPlanDocument {
  id: string
  scope: TodoPlanScope
  title: string
  role: 'user' | 'assistant' | 'plan'
  filePath: string
  content: string
  updatedAt: number
  totalTasks: number
}

export interface TodoPlanContext {
  sessionId?: string
  workingDirectory?: string
}

export interface TodoPlanSnapshot {
  directory: string
  userNotes: TodoPlanDocument[]
  workspaceAiTodo: TodoPlanDocument
}

export interface TodoPlanSettings {
  enabled?: boolean
  directory?: string
  cardHeight?: number
  pinned?: boolean
  docked?: boolean
}

export interface TodoPlanGetRequest extends TodoPlanContext {}

export interface TodoPlanGetResponse {
  success: boolean
  snapshot?: TodoPlanSnapshot
  error?: string
}

export interface TodoPlanCreateRequest {
  title: string
  content?: string
}

export interface TodoPlanCreateResponse {
  success: boolean
  document?: TodoPlanDocument
  error?: string
}

export interface TodoPlanUpdateRequest extends TodoPlanContext {
  scope: TodoPlanScope
  id?: string
  content: string
}

export interface TodoPlanUpdateResponse {
  success: boolean
  document?: TodoPlanDocument
  error?: string
}

export interface TodoPlanRenameRequest {
  id: string
  title: string
}

export interface TodoPlanRenameResponse {
  success: boolean
  document?: TodoPlanDocument
  error?: string
}

export interface TodoPlanDeleteRequest {
  id: string
}

export interface TodoPlanDeleteResponse {
  success: boolean
  error?: string
}

export interface TodoPlanChangedPayload extends TodoPlanContext {
  scope: TodoPlanScope | 'global-user' | 'all'
  document?: TodoPlanDocument
}
