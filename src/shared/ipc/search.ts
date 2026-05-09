/**
 * Search Everywhere — shared types
 */

export type SearchCategory = 'all' | 'chats' | 'messages' | 'actions' | 'files'

export interface SearchRequest {
  query: string
  category: SearchCategory
  limit?: number
}

export interface SearchResult {
  id: string
  type: 'chat' | 'message' | 'action' | 'file'
  title: string
  subtitle?: string
  sessionId?: string
  messageId?: string
  actionId?: string
  filePath?: string
  timestamp?: number
  shortcut?: string
}

export interface SearchResponse {
  success: boolean
  results: SearchResult[]
}
