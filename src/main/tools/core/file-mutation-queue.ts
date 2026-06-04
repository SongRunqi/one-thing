import * as path from 'path'

interface QueueEntry {
  tail: Promise<void>
}

const queues = new Map<string, QueueEntry>()

function normalizeQueueKey(filePath: string): string {
  return path.resolve(filePath)
}

/**
 * Serialize mutations to the same file path while allowing different files to
 * proceed independently.
 *
 * The queue is released only after the provided async operation settles. Do not
 * race this promise against abort signals at the queue layer; callers should
 * check abort state inside the operation so in-flight filesystem writes keep the
 * lock until they have actually completed or failed.
 */
export async function withFileMutationQueue<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const key = normalizeQueueKey(filePath)
  const existing = queues.get(key)
  const waitForPrevious = existing?.tail.catch(() => undefined) ?? Promise.resolve()

  let releaseCurrent!: () => void
  const currentDone = new Promise<void>((resolve) => {
    releaseCurrent = resolve
  })

  const entry: QueueEntry = {
    tail: waitForPrevious.then(() => currentDone),
  }
  queues.set(key, entry)

  await waitForPrevious

  try {
    return await operation()
  } finally {
    releaseCurrent()
    if (queues.get(key) === entry) {
      queues.delete(key)
    }
  }
}

export function getFileMutationQueueSize(): number {
  return queues.size
}

export function clearFileMutationQueuesForTests(): void {
  queues.clear()
}
