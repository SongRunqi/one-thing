import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetBraveRateLimiterForTests,
  createBraveSearchProvider,
} from '../web-search/providers/brave.js'
import { createWebSearchTool } from '../web-search/index.js'

function createContext() {
  return {
    sessionId: 'session-1',
    messageId: 'message-1',
    metadata: vi.fn(),
    updateResult: vi.fn(),
  } as any
}

describe('runtime web_search tool', () => {
  beforeEach(() => {
    __resetBraveRateLimiterForTests()
  })

  afterEach(() => {
    __resetBraveRateLimiterForTests()
  })

  it('searches Brave and fetches pages through injected runtime adapters', async () => {
    const fetch = vi.fn(async (input: unknown) => {
      const url = String(input)
      if (url.startsWith('https://api.search.brave.com/res/v1/web/search')) {
        return new Response(JSON.stringify({
          web: {
            total: 1,
            results: [{
              title: 'Runtime Search Result',
              url: 'https://example.com/runtime-result',
              description: 'Runtime snippet.',
              age: 'Jun 26, 2026',
              profile: { name: 'Example' },
            }],
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      return new Response(`<!doctype html>
        <html>
          <head><title>Runtime Result Page</title></head>
          <body><main><p>Readable runtime result page text.</p></main></body>
        </html>`, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    })
    const provider = createBraveSearchProvider({
      getApiKey: () => 'runtime-key',
      getFetch: () => fetch as any,
    })
    const tool = createWebSearchTool({
      providers: { brave: provider },
      getFetch: () => fetch as any,
    })

    const result = await tool.execute({
      query: 'runtime search',
      count: 1,
      language: 'zh',
      fetchPages: true,
      maxPages: 1,
    }, createContext())

    const braveUrl = new URL(String(fetch.mock.calls[0]?.[0]))
    expect(braveUrl.searchParams.get('q')).toBe('runtime search')
    expect(braveUrl.searchParams.get('search_lang')).toBe('zh-hans')
    expect(fetch).toHaveBeenCalledWith('https://example.com/runtime-result', expect.objectContaining({
      redirect: 'follow',
    }))
    expect(result.output).toContain('Runtime Search Result')
    expect(result.output).toContain('Readable runtime result page text')
    expect(result.metadata).toMatchObject({
      provider: 'brave',
      resultCount: 1,
      pageCount: 1,
      fetchedPageCount: 1,
    })
  })
})
