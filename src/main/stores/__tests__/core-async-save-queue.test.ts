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

  it('honors a per-schedule lazy delay', async () => {
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

    queue.schedule('s1', 5000)
    await vi.advanceTimersByTimeAsync(4900)
    expect(writes).toEqual([])
    await vi.advanceTimersByTimeAsync(100)
    expect(writes).toEqual([{ id: 's1', value: { count: 1 } }])
    vi.useRealTimers()
  })

  it('upgrades a pending lazy save when an urgent schedule arrives', async () => {
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

    queue.schedule('s1', 5000)
    queue.schedule('s1')
    await vi.advanceTimersByTimeAsync(300)
    expect(writes).toEqual([{ id: 's1', value: { count: 1 } }])
    vi.useRealTimers()
  })

  it('does not postpone a pending urgent save when a lazy schedule arrives', async () => {
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
    queue.schedule('s1', 5000)
    await vi.advanceTimersByTimeAsync(300)
    expect(writes).toEqual([{ id: 's1', value: { count: 1 } }])
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
