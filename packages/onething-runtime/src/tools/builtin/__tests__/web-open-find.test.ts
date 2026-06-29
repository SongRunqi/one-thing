import { describe, expect, it, vi } from 'vitest'
import { createWebFindTool } from '../web-search/find.js'
import { createWebOpenTool } from '../web-search/open.js'
import { extractReadablePage } from '../web-search/page-fetch.js'

function createContext() {
  return {
    sessionId: 'session-1',
    messageId: 'message-1',
    metadata: vi.fn(),
    updateResult: vi.fn(),
  } as any
}

function createFetch(html = readableHtml()) {
  return vi.fn(async () => new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  }))
}

function readableHtml(): string {
  return `<!doctype html>
    <html>
      <head>
        <title>Runtime Web Page</title>
        <meta name="description" content="Runtime page description">
        <script>window.ignore = true</script>
      </head>
      <body>
        <nav>Navigation noise</nav>
        <main>
          <h1>Runtime Web Page</h1>
          <p>Alpha beta gamma. Alpha appears twice.</p>
        </main>
      </body>
    </html>`
}

describe('runtime web open/find tools', () => {
  it('opens readable page text through injected fetch', async () => {
    const fetch = createFetch()
    const tool = createWebOpenTool({ getFetch: () => fetch as any })

    const result = await tool.execute({
      url: 'https://example.com/runtime',
      maxChars: 2000,
    }, createContext())

    expect(fetch).toHaveBeenCalledWith('https://example.com/runtime', expect.objectContaining({
      redirect: 'follow',
    }))
    expect(result.title).toBe('Opened: Runtime Web Page')
    expect(result.output).toContain('Alpha beta gamma')
    expect(result.metadata.pages[0]?.status).toBe('ready')
  })

  it('finds literal text through injected fetch', async () => {
    const fetch = createFetch()
    const tool = createWebFindTool({ getFetch: () => fetch as any })

    const result = await tool.execute({
      url: 'https://example.com/runtime',
      pattern: 'Alpha',
    }, createContext())

    expect(result.title).toBe('Found 2 matches for: Alpha')
    expect(result.output).toContain('[m1]')
    expect(result.metadata.matches).toHaveLength(2)
  })

  it('extracts readable content without navigation or script noise', () => {
    const extracted = extractReadablePage(readableHtml(), 'https://example.com/runtime')

    expect(extracted.title).toBe('Runtime Web Page')
    expect(extracted.description).toBe('Runtime page description')
    expect(extracted.text).toContain('Alpha beta gamma')
    expect(extracted.text).not.toContain('Navigation noise')
    expect(extracted.text).not.toContain('window.ignore')
  })
})
