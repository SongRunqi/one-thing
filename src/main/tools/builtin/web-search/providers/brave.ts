/**
 * Brave Search Provider
 * 
 * Uses Brave Search API for web search.
 * API docs: https://brave.com/search/api/
 */

import type { SearchProvider, SearchOptions, SearchResponse, SearchResult } from './types.js'
import { getSettings } from '../../../../stores/settings.js'

const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search'

export class BraveSearchProvider implements SearchProvider {
  name = 'Brave Search'
  id = 'brave'

  isConfigured(): boolean {
    const settings = getSettings()
    const apiKey = settings.tools?.webSearch?.braveApiKey
    return !!apiKey && apiKey.length > 0
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const settings = getSettings()
    const apiKey = settings.tools?.webSearch?.braveApiKey

    if (!apiKey) {
      throw new Error('Brave Search API key not configured. Please add it in Settings → Tools → Web Search.')
    }

    const { count = 5, country = 'US', freshness } = options

    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(count, 20)),  // Brave max is 20
      country,
    })

    if (freshness) {
      params.set('freshness', freshness)
    }

    const response = await fetch(`${BRAVE_API_URL}?${params}`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Brave Search API error: ${response.status} - ${error}`)
    }

    const data = await response.json()
    
    const results: SearchResult[] = (data.web?.results || []).map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
      publishedDate: r.age,
    }))

    return {
      query,
      results,
      totalResults: data.web?.total,
      provider: this.id,
    }
  }
}

export const braveProvider = new BraveSearchProvider()
