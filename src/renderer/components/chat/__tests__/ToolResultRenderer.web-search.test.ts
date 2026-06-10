// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ToolResultRenderer from '../ToolResultRenderer.vue'

describe('ToolResultRenderer web search', () => {
  it('renders structured search details and switches fetched page previews', async () => {
    const wrapper = mount(ToolResultRenderer, {
      props: {
        toolName: 'web_search',
        renderKind: 'search',
        result: {
          content: [{ type: 'text', text: 'Search results text fallback' }],
          details: {
            phase: 'ready',
            query: 'test query',
            provider: 'brave',
            resultCount: 2,
            pageCount: 2,
            fetchedPageCount: 2,
            searches: [{
              id: 's1',
              query: 'test query',
              resultCount: 2,
              results: [
                {
                  id: 's1-r1',
                  searchId: 's1',
                  query: 'test query',
                  rank: 1,
                  title: 'First Result',
                  url: 'https://example.com/first',
                  snippet: 'First snippet',
                  pageId: 'p1',
                },
                {
                  id: 's1-r2',
                  searchId: 's1',
                  query: 'test query',
                  rank: 2,
                  title: 'Second Result',
                  url: 'https://example.org/second',
                  snippet: 'Second snippet',
                  pageId: 'p2',
                },
              ],
            }],
            pages: [
              {
                id: 'p1',
                resultId: 's1-r1',
                searchId: 's1',
                query: 'test query',
                title: 'First Page',
                url: 'https://example.com/first',
                snippet: 'First snippet',
                status: 'ready',
                text: 'First fetched page body.',
                wordCount: 4,
                fetchMs: 12,
              },
              {
                id: 'p2',
                resultId: 's1-r2',
                searchId: 's1',
                query: 'test query',
                title: 'Second Page',
                url: 'https://example.org/second',
                snippet: 'Second snippet',
                status: 'ready',
                text: 'Second fetched page body.',
                wordCount: 4,
                fetchMs: 14,
              },
            ],
          },
        },
      },
    })

    expect(wrapper.find('.web-search-result').exists()).toBe(true)
    expect(wrapper.text()).toContain('First Result')
    expect(wrapper.find('.page-text').text()).toContain('First fetched page body.')

    await wrapper.findAll('.result-row')[1].trigger('click')

    expect(wrapper.find('.page-text').text()).toContain('Second fetched page body.')
  })

  it('renders web_find matches in the shared web search panel', () => {
    const wrapper = mount(ToolResultRenderer, {
      props: {
        toolName: 'web_find',
        renderKind: 'search',
        result: {
          content: [{ type: 'text', text: 'Found match text fallback' }],
          details: {
            mode: 'find',
            phase: 'ready',
            query: 'Find "Alpha"',
            provider: 'direct',
            resultCount: 1,
            pageCount: 1,
            fetchedPageCount: 1,
            searches: [{
              id: 'find',
              query: 'Find "Alpha"',
              resultCount: 1,
              results: [{
                id: 'find-r1',
                searchId: 'find',
                query: 'Find "Alpha"',
                rank: 1,
                title: 'Find Page',
                url: 'https://example.com/find',
                snippet: 'Find snippet',
                pageId: 'p1',
              }],
            }],
            pages: [{
              id: 'p1',
              resultId: 'find-r1',
              searchId: 'find',
              query: 'Find "Alpha"',
              title: 'Find Page',
              url: 'https://example.com/find',
              snippet: 'Find snippet',
              status: 'ready',
              text: 'Alpha appears in the fetched page body.',
            }],
            matches: [{
              id: 'm1',
              pageId: 'p1',
              resultId: 'find-r1',
              pattern: 'Alpha',
              index: 0,
              match: 'Alpha',
              before: '',
              after: 'appears in the fetched page body.',
              excerpt: 'Alpha appears in the fetched page body.',
            }],
          },
        },
      },
    })

    expect(wrapper.find('.web-search-result').exists()).toBe(true)
    expect(wrapper.text()).toContain('Find complete')
    expect(wrapper.find('.matches-panel').text()).toContain('Alpha appears')
  })
})
