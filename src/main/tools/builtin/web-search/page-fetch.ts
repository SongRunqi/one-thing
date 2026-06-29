import {
  extractReadablePage,
  fetchSearchPage as fetchRuntimeSearchPage,
  fetchSearchPages as fetchRuntimeSearchPages,
  type FetchedSearchPage,
  type FetchSearchPagesOptions,
  type SearchPageRequest,
} from '@onething/runtime/tools'
import { createRequiredAppFetch } from '../../../providers/bound-fetch.js'

export {
  extractReadablePage,
  type FetchedSearchPage,
  type FetchSearchPagesOptions,
  type SearchPageRequest,
}

export function fetchSearchPages(
  requests: SearchPageRequest[],
  options: FetchSearchPagesOptions = {},
): Promise<FetchedSearchPage[]> {
  return fetchRuntimeSearchPages(requests, withBoundFetch(options))
}

export function fetchSearchPage(
  request: SearchPageRequest,
  options: FetchSearchPagesOptions = {},
): Promise<FetchedSearchPage> {
  return fetchRuntimeSearchPage(request, withBoundFetch(options))
}

function withBoundFetch(options: FetchSearchPagesOptions): FetchSearchPagesOptions {
  if (options.fetchFn) return options
  return {
    ...options,
    fetchFn: createRequiredAppFetch({ policy: 'webSearch' }),
  }
}
