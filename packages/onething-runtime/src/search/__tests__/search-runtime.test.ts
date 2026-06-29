import { describe, expect, it } from 'vitest'
import {
  executeOnethingSearch,
  isOnethingCommandSearchQuery,
  normalizeOnethingSearchQuery,
  type OnethingSearchRuntimeAdapters,
} from '../search-runtime.js'

describe('search runtime orchestration', () => {
  function adapters(calls: string[]): OnethingSearchRuntimeAdapters<{ id: string }> {
    return {
      searchChats: (_query, limit) => {
        calls.push(`chats:${limit}`)
        return [{ id: 'chat' }]
      },
      searchMessages: (_query, limit) => {
        calls.push(`messages:${limit}`)
        return [{ id: 'message' }]
      },
      searchActions: (_query, limit) => {
        calls.push(`actions:${limit}`)
        return [{ id: 'action' }]
      },
      searchPrompts: (_query, limit, includeCreateAction) => {
        calls.push(`prompts:${limit}:${includeCreateAction}`)
        return [{ id: 'prompt' }]
      },
      searchFiles: (_query, limit) => {
        calls.push(`files:${limit}`)
        return [{ id: 'file' }]
      },
      searchDailyNotes: (_query, limit) => {
        calls.push(`daily:${limit}`)
        return [{ id: 'daily' }]
      },
    }
  }

  it('normalizes query text for daily-note inclusion and command routing', () => {
    expect(normalizeOnethingSearchQuery(' /Deploy ')).toBe('deploy')
    expect(normalizeOnethingSearchQuery(' >Run ')).toBe('run')
    expect(isOnethingCommandSearchQuery('/run')).toBe(true)
    expect(isOnethingCommandSearchQuery('plain')).toBe(false)
  })

  it('delegates single-category searches to their adapters', async () => {
    const calls: string[] = []

    await expect(executeOnethingSearch('deploy', 'prompts', 3, adapters(calls))).resolves.toEqual([
      { id: 'prompt' },
    ])
    expect(calls).toEqual(['prompts:3:true'])
  })

  it('orders all-search results by normal query priority', async () => {
    const calls: string[] = []

    await expect(executeOnethingSearch('deploy', 'all', 10, adapters(calls))).resolves.toEqual([
      { id: 'chat' },
      { id: 'prompt' },
      { id: 'daily' },
      { id: 'file' },
      { id: 'message' },
      { id: 'action' },
    ])
    expect(calls).toEqual([
      'chats:6',
      'messages:5',
      'files:10',
      'daily:6',
      'prompts:6:true',
      'actions:4',
    ])
  })

  it('prioritizes actions for command-like all-search queries', async () => {
    const calls: string[] = []

    await expect(executeOnethingSearch('/deploy', 'all', 10, adapters(calls))).resolves.toEqual([
      { id: 'action' },
      { id: 'prompt' },
      { id: 'chat' },
      { id: 'daily' },
      { id: 'file' },
      { id: 'message' },
    ])
    expect(calls).toContain('actions:8')
  })

  it('skips daily-note search for an empty all-search query', async () => {
    const calls: string[] = []

    await executeOnethingSearch('   ', 'all', 10, adapters(calls))

    expect(calls).not.toContain('daily:6')
  })
})
