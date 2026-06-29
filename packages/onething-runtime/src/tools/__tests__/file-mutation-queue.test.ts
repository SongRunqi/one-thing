import { afterEach, describe, expect, it } from 'vitest'
import {
  clearFileMutationQueuesForTests,
  getFileMutationQueueSize,
  withFileMutationQueue,
} from '../file-mutation-queue.js'

afterEach(() => {
  clearFileMutationQueuesForTests()
})

describe('runtime file-mutation-queue', () => {
  it('serializes operations for the same file', async () => {
    const events: string[] = []
    let releaseFirst!: () => void
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = withFileMutationQueue('/tmp/a.txt', async () => {
      events.push('first:start')
      await firstCanFinish
      events.push('first:end')
      return 'first'
    })

    const second = withFileMutationQueue('/tmp/a.txt', async () => {
      events.push('second:start')
      return 'second'
    })

    await Promise.resolve()
    expect(events).toEqual(['first:start'])

    releaseFirst()
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second'])
    expect(events).toEqual(['first:start', 'first:end', 'second:start'])
    expect(getFileMutationQueueSize()).toBe(0)
  })

  it('allows different files to run concurrently', async () => {
    const events: string[] = []
    let releaseFirst!: () => void
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = withFileMutationQueue('/tmp/a.txt', async () => {
      events.push('a:start')
      await firstCanFinish
      events.push('a:end')
    })

    const second = withFileMutationQueue('/tmp/b.txt', async () => {
      events.push('b:start')
    })

    await second
    expect(events).toEqual(['a:start', 'b:start'])

    releaseFirst()
    await first
    expect(events).toEqual(['a:start', 'b:start', 'a:end'])
    expect(getFileMutationQueueSize()).toBe(0)
  })

  it('continues after an operation fails', async () => {
    const events: string[] = []

    const first = withFileMutationQueue('/tmp/a.txt', async () => {
      events.push('first:start')
      throw new Error('boom')
    })

    const second = withFileMutationQueue('/tmp/a.txt', async () => {
      events.push('second:start')
      return 'ok'
    })

    await expect(first).rejects.toThrow('boom')
    await expect(second).resolves.toBe('ok')
    expect(events).toEqual(['first:start', 'second:start'])
    expect(getFileMutationQueueSize()).toBe(0)
  })
})
