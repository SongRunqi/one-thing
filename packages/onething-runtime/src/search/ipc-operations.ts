type MaybePromise<T> = T | Promise<T>

export const ONETHING_SEARCH_CATEGORIES = ['all', 'chats', 'messages', 'actions', 'files', 'daily', 'prompts'] as const

export type OnethingSearchCategory = typeof ONETHING_SEARCH_CATEGORIES[number]

export interface OnethingSearchRequest {
  query: string
  category: string
  limit?: number
}

export interface OnethingSearchResponse<TResult = unknown> {
  success: boolean
  results: TResult[]
}

export function isOnethingSearchCategory(value: string): value is OnethingSearchCategory {
  return ONETHING_SEARCH_CATEGORIES.includes(value as OnethingSearchCategory)
}

export function normalizeOnethingSearchCategory(value: string): OnethingSearchCategory {
  return isOnethingSearchCategory(value) ? value : 'all'
}

export async function executeOnethingSearchForIpc<TResult = unknown>(
  options: {
    request: OnethingSearchRequest
    executeSearch(query: string, category: OnethingSearchCategory, limit?: number): MaybePromise<TResult[]>
  },
): Promise<OnethingSearchResponse<TResult>> {
  const category = normalizeOnethingSearchCategory(options.request.category)
  const results = await options.executeSearch(options.request.query, category, options.request.limit)
  return { success: true, results }
}

export function closeOnethingSearchWindowForIpc(
  options: {
    closeSearchWindow(): unknown
  },
): { success: true } {
  options.closeSearchWindow()
  return { success: true }
}
