/**
 * Search Everywhere — shared types
 */

export type SearchCategory = 'all' | 'chats' | 'messages' | 'actions' | 'files' | 'daily' | 'prompts'

export interface SearchRequest {
  query: string
  category: SearchCategory
  limit?: number
}

export interface SearchResult {
  id: string
  type: 'chat' | 'message' | 'action' | 'file' | 'daily' | 'prompt'
  title: string
  subtitle?: string
  detail?: string
  sessionId?: string
  messageId?: string
  actionId?: string
  filePath?: string
  timestamp?: number
  shortcut?: string
  matchRanges?: Array<{ start: number; end: number }>
}

export interface SearchResponse {
  success: boolean
  results: SearchResult[]
}
