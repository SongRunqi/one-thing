/**
 * Search Everywhere — shared types
 */

export const SEARCH_CATEGORIES = ['all', 'chats', 'messages', 'actions', 'files', 'daily', 'prompts'] as const

export type SearchCategory = typeof SEARCH_CATEGORIES[number]

export function isSearchCategory(value: unknown): value is SearchCategory {
  return typeof value === 'string' && SEARCH_CATEGORIES.includes(value as SearchCategory)
}

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

export interface SearchWindowGuideState {
  visible: boolean
  centerX: boolean
  defaultTop: boolean
  defaultHeight: boolean
  defaultBounds: boolean
}
