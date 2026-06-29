import * as path from 'path'

interface QueueEntry {
  tail: Promise<void>
}

const queues = new Map<string, QueueEntry>()

function normalizeQueueKey(filePath: string): string {
  return path.resolve(filePath)
}

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
