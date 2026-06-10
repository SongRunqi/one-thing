/**
 * Built-in Tool: Web Open
 *
 * Open a web result or arbitrary URL and extract readable page text.
 */

import { z } from 'zod'
import { Tool } from '../../core/tool.js'
import { fetchSearchPage, type FetchedSearchPage } from './page-fetch.js'

const WebOpenParameters = z.object({
  url: z.string().url().describe('The HTTP or HTTPS URL to open and read'),
  title: z.string().optional().describe('Optional known page title from search results'),
  query: z.string().optional().describe('Optional search query or reason for opening this page'),
  snippet: z.string().optional().describe('Optional search-result snippet for this page'),
  maxChars: z.number().int().min(1000).max(30000).optional().describe('Maximum readable characters to return from the page (default: 12000)'),
})

interface WebOpenMetadata {
  [key: string]: unknown
  mode: 'open'
  phase: 'opening' | 'ready'
  query: string
  provider: 'direct'
  resultCount: number
  pageCount: number
  fetchedPageCount: number
  searches: Array<{
    id: string
    query: string
    resultCount: number
    results: Array<{
      id: string
      searchId: string
      query: string
      rank: number
      title: string
      url: string
      snippet: string
      pageId: string
    }>
  }>
  results: Array<{
    id: string
    searchId: string
    query: string
    rank: number
    title: string
    url: string
    snippet: string
    pageId: string
  }>
  pages: FetchedSearchPage[]
}

const OPEN_SEARCH_ID = 'open'
const OPEN_RESULT_ID = 'open-r1'
const OPEN_PAGE_ID = 'p1'

export const WebOpenTool = Tool.define<typeof WebOpenParameters, WebOpenMetadata>('web_open', {
  name: 'Web Open',
  description: `Open a web page and extract readable text from it.

Use this after web_search identifies a promising source, or when the user gives
a direct URL that should be read. This is the "open result" step in a
ChatGPT-style web search workflow.`,

  category: 'builtin',
  enabled: true,
  autoExecute: true,
  permissionGuard: 'safe',
  executionMode: 'parallel',
  renderKind: 'search',

  parameters: WebOpenParameters,

  async execute(args, ctx) {
    const query = args.query?.trim() || args.url
    const title = args.title?.trim() || args.url
    const snippet = args.snippet?.trim() || ''

    const openingMetadata = buildOpenMetadata({
      phase: 'opening',
      query,
      page: null,
      title,
      url: args.url,
      snippet,
    })

    ctx.updateResult?.({
      content: [{ type: 'text', text: `Opening ${args.url}...` }],
      details: openingMetadata,
    })
    ctx.metadata({
      title: `Opening: ${title}`,
      metadata: openingMetadata,
    })

    const page = await fetchSearchPage({
      id: OPEN_PAGE_ID,
      resultId: OPEN_RESULT_ID,
      searchId: OPEN_SEARCH_ID,
      query,
      title,
      url: args.url,
      snippet,
    }, {
      signal: ctx.abortSignal,
      maxTextChars: args.maxChars,
    })

    const metadata = buildOpenMetadata({
      phase: 'ready',
      query,
      page,
      title: page.title || title,
      url: page.finalUrl || page.url,
      snippet: page.excerpt || page.description || snippet,
    })
    const output = formatOpenOutput(page)

    ctx.updateResult?.({
      content: [{ type: 'text', text: output }],
      details: metadata,
    })
    ctx.metadata({
      title: page.status === 'ready' ? `Opened: ${page.title}` : `Could not open: ${title}`,
      metadata,
    })

    return {
      title: page.status === 'ready' ? `Opened: ${page.title}` : `Could not open: ${title}`,
      output,
      metadata,
    }
  },
})

function buildOpenMetadata(input: {
  phase: WebOpenMetadata['phase']
  query: string
  page: FetchedSearchPage | null
  title: string
  url: string
  snippet: string
}): WebOpenMetadata {
  const page = input.page
  const result = {
    id: OPEN_RESULT_ID,
    searchId: OPEN_SEARCH_ID,
    query: input.query,
    rank: 1,
    title: page?.title || input.title,
    url: page?.finalUrl || input.url,
    snippet: page?.excerpt || input.snippet,
    pageId: OPEN_PAGE_ID,
  }

  return {
    mode: 'open',
    phase: input.phase,
    query: input.query,
    provider: 'direct',
    resultCount: 1,
    pageCount: page ? 1 : 0,
    fetchedPageCount: page?.status === 'ready' ? 1 : 0,
    searches: [{
      id: OPEN_SEARCH_ID,
      query: input.query,
      resultCount: 1,
      results: [result],
    }],
    results: [result],
    pages: page ? [page] : [],
  }
}

function formatOpenOutput(page: FetchedSearchPage): string {
  if (page.status !== 'ready' || !page.text) {
    return [
      `Could not read page: ${page.title || page.url}`,
      `URL: ${page.finalUrl || page.url}`,
      page.error ? `Error: ${page.error}` : '',
    ].filter(Boolean).join('\n')
  }

  return [
    `Opened page: ${page.title}`,
    `URL: ${page.finalUrl || page.url}`,
    page.description ? `Description: ${page.description}` : '',
    '',
    page.text,
  ].filter(line => line !== '').join('\n')
}
