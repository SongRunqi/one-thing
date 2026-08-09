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
  /**
   * 'plugin' 是搜索供给方(M2)贡献的结果。宿主据此按 provider label(`group`)
   * 分组渲染,点击只回到插件自己的 action(actionId 带 `plugin-search:` 前缀)——
   * 插件结果拿不到 sessionId / messageId / filePath,不能伪装成内置结果。
   */
  type: 'chat' | 'message' | 'action' | 'file' | 'daily' | 'prompt' | 'plugin'
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
  /** 分组标签(M2 插件结果 = provider label)—— 让插件结果来源可辨。 */
  group?: string
  /** 宿主枚举图标名(M2 插件结果),不是 URL/SVG。 */
  icon?: string
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
