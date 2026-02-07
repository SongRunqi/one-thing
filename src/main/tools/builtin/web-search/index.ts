/**
 * Built-in Tool: Web Search
 *
 * Search the web for real-time information.
 * Supports multiple search providers (Brave, etc.)
 */

import { z } from 'zod'
import { Tool } from '../../core/tool.js'
import { braveProvider } from './providers/brave.js'
import type { SearchProvider, SearchResponse } from './providers/types.js'

// Available providers
const providers: Record<string, SearchProvider> = {
  brave: braveProvider,
}

// Get the first configured provider
function getConfiguredProvider(): SearchProvider | null {
  for (const provider of Object.values(providers)) {
    if (provider.isConfigured()) {
      return provider
    }
  }
  return null
}

// Parameter schema
const WebSearchParameters = z.object({
  query: z.string().describe('The search query'),
  count: z.number().optional().describe('Number of results to return (1-10, default: 5)'),
  freshness: z.enum(['day', 'week', 'month', 'year']).optional().describe('Filter results by time'),
})

// Metadata for UI display
interface WebSearchMetadata {
  [key: string]: unknown  // Index signature for ToolMetadata compatibility
  query: string
  provider: string
  resultCount: number
  results?: Array<{
    title: string
    url: string
    snippet: string
  }>
}

export const WebSearchTool = Tool.define<typeof WebSearchParameters, WebSearchMetadata>('web_search', {
  name: 'Web Search',
  description: `Search the web for real-time information using search engines.

Use this tool when you need:
- Current events or news
- Up-to-date information that may not be in your training data
- Facts that change over time (prices, weather, scores, etc.)
- Information about recent releases, updates, or announcements

Returns a list of search results with titles, URLs, and snippets.`,

  category: 'builtin',
  enabled: true,
  autoExecute: true,  // Safe to auto-execute (read-only)

  parameters: WebSearchParameters,

  async execute(args, ctx) {
    const { query, count = 5, freshness } = args

    // Get configured provider
    const provider = getConfiguredProvider()
    
    if (!provider) {
      throw new Error('No web search provider configured. Please add a Brave Search API key in Settings → Tools → Web Search.')
    }

    // Update metadata with initial state
    ctx.metadata({
      title: `Searching: ${query}`,
      metadata: {
        query,
        provider: provider.id,
        resultCount: 0,
      },
    })

    // Perform search
    const response: SearchResponse = await provider.search(query, {
      count: Math.min(count, 10),
      freshness,
    })

    // Format results for AI
    const formattedResults = response.results.map((r, i) => 
      `[${i + 1}] ${r.title}\n    URL: ${r.url}\n    ${r.snippet}`
    ).join('\n\n')

    const resultMetadata: WebSearchMetadata = {
      query,
      provider: provider.id,
      resultCount: response.results.length,
      results: response.results.slice(0, 5).map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
      })),
    }

    // Update metadata with results
    ctx.metadata({
      title: `Found ${response.results.length} results for: ${query}`,
      metadata: resultMetadata,
    })

    return {
      title: `Found ${response.results.length} results for: ${query}`,
      output: `Search results for "${query}" (via ${provider.name}):\n\n${formattedResults}`,
      metadata: resultMetadata,
    }
  },
})
