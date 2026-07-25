import {
  configureOnethingSearchProviders,
  createDailyNote as createRuntimeDailyNote,
  executeSearch as executeRuntimeSearch,
  type OnethingSearchCategory,
} from '@onething/runtime/search'
import type {
  SearchResult,
} from '@shared/ipc/search.js'
import { listPrompts } from '../prompts/store.js'
import { getCurrentSessionId } from '../stores/app-state.js'
import { getSession, getSessionRaw, getSessionsList } from '../stores/sessions.js'
import { getSettings } from '../stores/settings.js'
import { listFiles } from '../utils/ripgrep.js'
import { getVariablesStore } from '../variables/store/index.js'

let searchProvidersConfigured = false

/** Explicit assembly step; also self-ensured by this module's wrappers. */
export function configureAppSearchProviders(): void {
  if (searchProvidersConfigured) return
  searchProvidersConfigured = true
  configureOnethingSearchProviders({
    getSessionsList,
    getSessionRaw,
    getSession,
    getCurrentSessionId,
    getSettings,
    getVariablesStore,
    listFiles,
    listPrompts,
  })
}

export function createDailyNote(filePath: string): Promise<string> {
  configureAppSearchProviders()
  return createRuntimeDailyNote(filePath)
}

export function executeSearch(
  query: string,
  category: OnethingSearchCategory,
  limit = 20,
): Promise<SearchResult[]> {
  configureAppSearchProviders()
  return executeRuntimeSearch(query, category, limit) as Promise<SearchResult[]>
}
