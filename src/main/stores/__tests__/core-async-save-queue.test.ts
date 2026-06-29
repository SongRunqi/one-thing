import { describe, expect, it, vi } from 'vitest'
import { AsyncSaveQueue } from '@onething/core/storage'

describe('AsyncSaveQueue', () => {
  it('coalesces scheduled writes and flushes the latest value', async () => {
    vi.useFakeTimers()

    const values = new Map<string, { count: number }>()
    const writes: Array<{ id: string; value: { count: number } }> = []
    const queue = new AsyncSaveQueue<{ count: number }>({
      throttleMs: 300,
      getLatest: id => values.get(id),
      write: async (id, value) => {
        writes.push({ id, value })
      },
    })

    values.set('s1', { count: 1 })
    queue.schedule('s1')
    values.set('s1', { count: 2 })
    queue.schedule('s1')

    await queue.flush('s1')

    expect(writes).toEqual([{ id: 's1', value: { count: 2 } }])
    vi.useRealTimers()
  })

  it('cancels scheduled writes', async () => {
    vi.useFakeTimers()

    const values = new Map([['s1', { count: 1 }]])
    const writes: Array<{ id: string; value: { count: number } }> = []
    const queue = new AsyncSaveQueue<{ count: number }>({
      throttleMs: 300,
      getLatest: id => values.get(id),
      write: async (id, value) => {
        writes.push({ id, value })
      },
    })

    queue.schedule('s1')
    queue.cancel('s1')
    await vi.advanceTimersByTimeAsync(300)

    expect(writes).toEqual([])
    vi.useRealTimers()
  })
})
