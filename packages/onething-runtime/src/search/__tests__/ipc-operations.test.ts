import { describe, expect, it } from 'vitest'
import {
  closeOnethingSearchWindowForIpc,
  executeOnethingSearchForIpc,
  normalizeOnethingSearchCategory,
} from '../ipc-operations.js'

describe('search IPC operations', () => {
  it('normalizes unknown categories to all', () => {
    expect(normalizeOnethingSearchCategory('prompts')).toBe('prompts')
    expect(normalizeOnethingSearchCategory('wat')).toBe('all')
  })

  it('executes search through an adapter and formats IPC response', async () => {
    const calls: unknown[] = []

    await expect(executeOnethingSearchForIpc({
      request: { query: 'deploy', category: 'unknown', limit: 5 },
      executeSearch: (query, category, limit) => {
        calls.push({ query, category, limit })
        return [{ id: 'result-1' }]
      },
    })).resolves.toEqual({
      success: true,
      results: [{ id: 'result-1' }],
    })

    expect(calls).toEqual([{ query: 'deploy', category: 'all', limit: 5 }])
  })

  it('formats close-window acknowledgement through an adapter', () => {
    const calls: string[] = []

    expect(closeOnethingSearchWindowForIpc({
      closeSearchWindow: () => calls.push('close'),
    })).toEqual({ success: true })
    expect(calls).toEqual(['close'])
  })
})
