import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSearchTool } from '../web-search/index.js'
import { WebOpenTool } from '../web-search/open.js'
import { extractReadablePage } from '../web-search/page-fetch.js'
import { __resetBraveRateLimiterForTests } from '../web-search/providers/brave.js'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  settings: {
    tools: {
      webSearch: {
        braveApiKey: 'test-key',
      },
    },
  },
}))

vi.mock('../../../stores/settings.js', () => ({
  getSettings: () => mocks.settings,
}))

vi.mock('../../../providers/bound-fetch.js', () => ({
  createRequiredAppFetch: () => mocks.fetch,
}))

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'test-session',
    messageId: 'test-message',
    toolCallId: 'test-call',
    metadata: vi.fn(),
    updateResult: vi.fn(),
    ...overrides,
  }
}

describe('WebSearchTool', () => {
  beforeEach(() => {
    mocks.fetch.mockReset()
    __resetBraveRateLimiterForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
    __resetBraveRateLimiterForTests()
  })

  it('uses Brave rate-limit headers to pace subsequent search requests', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const callTimes: number[] = []
    mocks.fetch.mockImplementation(async (input: unknown) => {
      callTimes.push(Date.now())
      const url = new URL(String(input))
      const query = url.searchParams.get('q') || 'query'
      return new Response(JSON.stringify({
        web: {
          total: 1,
          results: [{
            title: `Result for ${query}`,
            url: `https://example.com/${query}`,
            description: `Snippet for ${query}.`,
          }],
        },
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'X-RateLimit-Limit': '1, 2000',
          'X-RateLimit-Policy': '1;w=1, 2000;w=2592000',
          'X-RateLimit-Remaining': '0, 1999',
          'X-RateLimit-Reset': '1, 1000',
        },
      })
    })

    const resultPromise = WebSearchTool.execute(
      { query: 'alpha', queries: ['beta'], count: 1 },
      createContext(),
    )

    await vi.advanceTimersByTimeAsync(0)
    expect(callTimes).toEqual([0])

    await vi.advanceTimersByTimeAsync(1099)
    expect(callTimes).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1)
    const result = await resultPromise

    expect(callTimes).toEqual([0, 1100])
    expect(result.metadata.resultCount).toBe(2)
  })

  it('waits and retries when Brave returns a rate-limit response', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const callTimes: number[] = []
    mocks.fetch.mockImplementation(async () => {
      callTimes.push(Date.now())
      if (callTimes.length === 1) {
        return new Response(JSON.stringify({
          type: 'ErrorResponse',
          error: {
            status: 429,
            detail: 'Request rate limit exceeded for plan',
            meta: { plan: 'Free', rate_limit: 1 },
            code: 'RATE_LIMITED',
          },
        }), {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'X-RateLimit-Limit': '1, 2000',
            'X-RateLimit-Policy': '1;w=1, 2000;w=2592000',
            'X-RateLimit-Remaining': '0, 1999',
            'X-RateLimit-Reset': '1, 1000',
          },
        })
      }

      return new Response(JSON.stringify({
        web: {
          total: 1,
          results: [{
            title: 'Recovered Result',
            url: 'https://example.com/recovered',
            description: 'Recovered after retry.',
          }],
        },
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'X-RateLimit-Limit': '1, 2000',
          'X-RateLimit-Policy': '1;w=1, 2000;w=2592000',
          'X-RateLimit-Remaining': '0, 1998',
          'X-RateLimit-Reset': '1, 999',
        },
      })
    })

    const resultPromise = WebSearchTool.execute(
      { query: 'retry me', count: 1 },
      createContext(),
    )

    await vi.advanceTimersByTimeAsync(0)
    expect(callTimes).toEqual([0])

    await vi.advanceTimersByTimeAsync(1100)
    const result = await resultPromise

    expect(callTimes).toEqual([0, 1100])
    expect(result.output).toContain('Recovered Result')
  })

  it('normalizes language aliases before sending Brave search_lang', async () => {
    mocks.fetch.mockImplementation(async () => new Response(
      JSON.stringify({
        web: {
          total: 1,
          results: [{
            title: 'Localized Result',
            url: 'https://example.com/localized',
            description: 'Localized snippet.',
          }],
        },
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    ))

    await WebSearchTool.execute(
      { query: '中文搜索', count: 1, language: 'zh' },
      createContext(),
    )
    await WebSearchTool.execute(
      { query: '日本語検索', count: 1, language: 'ja' },
      createContext(),
    )
    await WebSearchTool.execute(
      { query: 'unknown language', count: 1, language: 'xx' },
      createContext(),
    )

    const firstUrl = new URL(String(mocks.fetch.mock.calls[0]?.[0]))
    const secondUrl = new URL(String(mocks.fetch.mock.calls[1]?.[0]))
    const thirdUrl = new URL(String(mocks.fetch.mock.calls[2]?.[0]))

    expect(firstUrl.searchParams.get('search_lang')).toBe('zh-hans')
    expect(secondUrl.searchParams.get('search_lang')).toBe('jp')
    expect(thirdUrl.searchParams.has('search_lang')).toBe(false)
  })

  it('defaults to search-only so the model can choose which sources to open', async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
      web: {
        total: 1,
        results: [{
          title: 'Candidate Result',
          url: 'https://example.com/candidate',
          description: 'Candidate snippet.',
        }],
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    const result = await WebSearchTool.execute(
      { query: 'candidate', count: 1 },
      createContext(),
    )

    expect(result.output).toContain('Candidate Result')
    expect(result.metadata).toMatchObject({
      resultCount: 1,
      pageCount: 0,
      fetchedPageCount: 0,
    })
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('searches Brave and fetches readable page text for top results', async () => {
    mocks.fetch.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.startsWith('https://api.search.brave.com/res/v1/web/search')) {
        return new Response(JSON.stringify({
          web: {
            total: 1,
            results: [{
              title: 'Example Article',
              url: 'https://example.com/article',
              description: 'A short search snippet.',
              age: 'Jun 9, 2026',
            }],
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url === 'https://example.com/article') {
        return new Response(`
          <!doctype html>
          <html>
            <head>
              <title>Readable Example</title>
              <meta name="description" content="Page description">
              <script>window.nope = true</script>
            </head>
            <body>
              <nav>Navigation noise</nav>
              <main>
                <h1>Readable Example</h1>
                <p>Important body text from the fetched page.</p>
                <p>More details for verification.</p>
              </main>
            </body>
          </html>
        `, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })

    const updateResult = vi.fn()
    const result = await WebSearchTool.execute(
      { query: 'example article', count: 1, fetchPages: true, maxPages: 1 },
      createContext({ updateResult }),
    )

    expect(result.output).toContain('Example Article')
    expect(result.output).toContain('Important body text from the fetched page.')
    expect(result.metadata).toMatchObject({
      query: 'example article',
      resultCount: 1,
      pageCount: 1,
      fetchedPageCount: 1,
    })
    expect(result.metadata.pages?.[0]).toMatchObject({
      status: 'ready',
      title: 'Readable Example',
      url: 'https://example.com/article',
    })
    expect(result.metadata.pages?.[0].text).toContain('More details for verification.')
    expect(updateResult).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ phase: 'fetching_pages' }),
    }))
    expect(updateResult).toHaveBeenLastCalledWith(expect.objectContaining({
      details: expect.objectContaining({ phase: 'ready', fetchedPageCount: 1 }),
    }))
  })

  it('extracts readable text and removes noisy HTML regions', () => {
    const extracted = extractReadablePage(`
      <html>
        <head>
          <title>Alpha &amp; Beta</title>
          <meta property="og:description" content="Useful &quot;summary&quot;">
        </head>
        <body>
          <header>Header noise</header>
          <article>
            <h1>Alpha</h1>
            <p>First paragraph.</p>
            <script>bad()</script>
            <p>Second paragraph.</p>
          </article>
        </body>
      </html>
    `)

    expect(extracted.title).toBe('Alpha & Beta')
    expect(extracted.description).toBe('Useful "summary"')
    expect(extracted.text).toContain('First paragraph.')
    expect(extracted.text).toContain('Second paragraph.')
    expect(extracted.text).not.toContain('Header noise')
    expect(extracted.text).not.toContain('bad()')
  })
})

describe('WebOpenTool', () => {
  beforeEach(() => {
    mocks.fetch.mockReset()
    __resetBraveRateLimiterForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
    __resetBraveRateLimiterForTests()
  })

  it('opens a URL and returns web-search-compatible page metadata', async () => {
    mocks.fetch.mockResolvedValue(new Response(`
      <html>
        <head><title>Opened Page</title></head>
        <body><main><p>Readable content from a direct page open.</p></main></body>
      </html>
    `, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }))

    const result = await WebOpenTool.execute(
      { url: 'https://example.com/opened', query: 'direct open' },
      createContext(),
    )

    expect(result.output).toContain('Readable content from a direct page open.')
    expect(result.metadata).toMatchObject({
      mode: 'open',
      resultCount: 1,
      pageCount: 1,
      fetchedPageCount: 1,
    })
    expect(result.metadata.searches?.[0].results[0]).toMatchObject({
      url: 'https://example.com/opened',
      pageId: 'p1',
    })
  })
})
