/**
 * Search Everywhere — shared types
 */

export {
  ONETHING_SEARCH_CATEGORIES as SEARCH_CATEGORIES,
  isOnethingSearchCategory as isSearchCategory,
} from '@onething/runtime/search/protocol'
export type {
  OnethingSearchCategory as SearchCategory,
} from '@onething/runtime/search/protocol'

import type { OnethingSearchCategory } from '@onething/runtime/search/protocol'

export interface SearchRequest {
  query: string
  category: OnethingSearchCategory
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

export interface SearchWindowSplitIntent {
  type: 'split-panel'
  panelId: string
}

export type SearchWindowIntent = SearchWindowSplitIntent

export interface SearchWindowOpenOptions {
  intent?: SearchWindowIntent
}

export interface SearchWindowShownPayload {
  intent?: SearchWindowIntent | null
}

/** Anchor rect reported by the main window renderer (CSS px, viewport-relative). */
export interface SearchWindowAnchor {
  x: number
  y: number
  width: number
  height: number
}

export interface SearchWindowGuideState {
  visible: boolean
  centerX: boolean
  defaultTop: boolean
  defaultHeight: boolean
  defaultBounds: boolean
}
