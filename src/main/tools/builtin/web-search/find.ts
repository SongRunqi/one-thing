/**
 * Built-in Tool: Web Find
 *
 * Find text inside a web page after extracting readable page content.
 */

import { z } from 'zod'
import { Tool } from '../../core/tool.js'
import { fetchSearchPage, type FetchedSearchPage } from './page-fetch.js'

const WebFindParameters = z.object({
  url: z.string().url().describe('The HTTP or HTTPS URL to read and search within'),
  pattern: z.string().min(1).describe('Literal text to find in the readable page content'),
  title: z.string().optional().describe('Optional known page title from search results'),
  query: z.string().optional().describe('Optional search query or reason for searching this page'),
  snippet: z.string().optional().describe('Optional search-result snippet for this page'),
  caseSensitive: z.boolean().optional().describe('Whether the match is case-sensitive (default: false)'),
  contextChars: z.number().int().min(40).max(800).optional().describe('Characters of context to include around each match (default: 220)'),
  maxMatches: z.number().int().min(1).max(50).optional().describe('Maximum matches to return (default: 10)'),
})

interface WebFindMatch {
  id: string
  pageId: string
  resultId: string
  pattern: string
  index: number
  match: string
  before: string
  after: string
  excerpt: string
}

interface WebFindMetadata {
  [key: string]: unknown
  mode: 'find'
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
  matches: WebFindMatch[]
}

const FIND_SEARCH_ID = 'find'
const FIND_RESULT_ID = 'find-r1'
const FIND_PAGE_ID = 'p1'
const DEFAULT_CONTEXT_CHARS = 220
const DEFAULT_MAX_MATCHES = 10

export const WebFindTool = Tool.define<typeof WebFindParameters, WebFindMetadata>('web_find', {
  name: 'Web Find',
  description: `Find literal text inside a web page's readable content.

Use this after web_search or web_open when you need to locate a specific term,
name, quote, date, or section inside a source page. This is the "find on page"
step in a ChatGPT-style web search workflow.`,

  category: 'builtin',
  enabled: true,
  autoExecute: true,
  permissionGuard: 'safe',
  executionMode: 'parallel',
  renderKind: 'search',

  parameters: WebFindParameters,

  async execute(args, ctx) {
    const query = args.query?.trim() || args.pattern
    const title = args.title?.trim() || args.url
    const snippet = args.snippet?.trim() || ''
    const openingMetadata = buildFindMetadata({
      phase: 'opening',
      query,
      pattern: args.pattern,
      page: null,
      matches: [],
      title,
      url: args.url,
      snippet,
    })

    ctx.updateResult?.({
      content: [{ type: 'text', text: `Searching within ${args.url} for "${args.pattern}"...` }],
      details: openingMetadata,
    })
    ctx.metadata({
      title: `Finding "${args.pattern}" in: ${title}`,
      metadata: openingMetadata,
    })

    const page = await fetchSearchPage({
      id: FIND_PAGE_ID,
      resultId: FIND_RESULT_ID,
      searchId: FIND_SEARCH_ID,
      query,
      title,
      url: args.url,
      snippet,
    }, {
      signal: ctx.abortSignal,
    })
    const matches = page.text
      ? findLiteralMatches(page.text, {
        pattern: args.pattern,
        caseSensitive: args.caseSensitive ?? false,
        contextChars: args.contextChars ?? DEFAULT_CONTEXT_CHARS,
        maxMatches: args.maxMatches ?? DEFAULT_MAX_MATCHES,
      })
      : []
    const metadata = buildFindMetadata({
      phase: 'ready',
      query,
      pattern: args.pattern,
      page,
      matches,
      title: page.title || title,
      url: page.finalUrl || page.url,
      snippet: page.excerpt || page.description || snippet,
    })
    const output = formatFindOutput(page, args.pattern, matches)

    ctx.updateResult?.({
      content: [{ type: 'text', text: output }],
      details: metadata,
    })
    ctx.metadata({
      title: `Found ${matches.length} ${matches.length === 1 ? 'match' : 'matches'} for: ${args.pattern}`,
      metadata,
    })

    return {
      title: `Found ${matches.length} ${matches.length === 1 ? 'match' : 'matches'} for: ${args.pattern}`,
      output,
      metadata,
    }
  },
})

function buildFindMetadata(input: {
  phase: WebFindMetadata['phase']
  query: string
  pattern: string
  page: FetchedSearchPage | null
  matches: WebFindMatch[]
  title: string
  url: string
  snippet: string
}): WebFindMetadata {
  const page = input.page
  const result = {
    id: FIND_RESULT_ID,
    searchId: FIND_SEARCH_ID,
    query: input.query,
    rank: 1,
    title: page?.title || input.title,
    url: page?.finalUrl || input.url,
    snippet: page?.excerpt || input.snippet,
    pageId: FIND_PAGE_ID,
  }

  return {
    mode: 'find',
    phase: input.phase,
    query: input.query,
    provider: 'direct',
    resultCount: 1,
    pageCount: page ? 1 : 0,
    fetchedPageCount: page?.status === 'ready' ? 1 : 0,
    searches: [{
      id: FIND_SEARCH_ID,
      query: `Find "${input.pattern}"`,
      resultCount: 1,
      results: [result],
    }],
    results: [result],
    pages: page ? [page] : [],
    matches: input.matches,
  }
}

function findLiteralMatches(text: string, options: {
  pattern: string
  caseSensitive: boolean
  contextChars: number
  maxMatches: number
}): WebFindMatch[] {
  const source = options.caseSensitive ? text : text.toLowerCase()
  const needle = options.caseSensitive ? options.pattern : options.pattern.toLowerCase()
  const matches: WebFindMatch[] = []
  let fromIndex = 0

  while (matches.length < options.maxMatches) {
    const index = source.indexOf(needle, fromIndex)
    if (index < 0) break
    const match = text.slice(index, index + options.pattern.length)
    const beforeStart = Math.max(0, index - options.contextChars)
    const afterEnd = Math.min(text.length, index + options.pattern.length + options.contextChars)
    const before = text.slice(beforeStart, index).trim()
    const after = text.slice(index + options.pattern.length, afterEnd).trim()
    matches.push({
      id: `m${matches.length + 1}`,
      pageId: FIND_PAGE_ID,
      resultId: FIND_RESULT_ID,
      pattern: options.pattern,
      index,
      match,
      before,
      after,
      excerpt: [before, match, after].filter(Boolean).join(' '),
    })
    fromIndex = index + Math.max(needle.length, 1)
  }

  return matches
}

function formatFindOutput(page: FetchedSearchPage, pattern: string, matches: WebFindMatch[]): string {
  if (page.status !== 'ready' || !page.text) {
    return [
      `Could not search page: ${page.title || page.url}`,
      `URL: ${page.finalUrl || page.url}`,
      page.error ? `Error: ${page.error}` : '',
    ].filter(Boolean).join('\n')
  }

  if (matches.length === 0) {
    return [
      `No matches for "${pattern}" in ${page.title}`,
      `URL: ${page.finalUrl || page.url}`,
    ].join('\n')
  }

  return [
    `Found ${matches.length} ${matches.length === 1 ? 'match' : 'matches'} for "${pattern}" in ${page.title}`,
    `URL: ${page.finalUrl || page.url}`,
    '',
    ...matches.map(match => `[${match.id}] ${match.excerpt}`),
  ].join('\n')
}
