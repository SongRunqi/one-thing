interface PendingSave {
  timer: ReturnType<typeof setTimeout> | null
  writePromise: Promise<void>
}

export interface AsyncSaveQueueOptions<TValue> {
  throttleMs: number
  getLatest(id: string): TValue | undefined
  write(id: string, value: TValue): Promise<void>
  onError?: (id: string, error: unknown) => void
}

export class AsyncSaveQueue<TValue> {
  private pendingSaves = new Map<string, PendingSave>()

  constructor(private readonly options: AsyncSaveQueueOptions<TValue>) {}

  schedule(id: string): void {
    const pending = this.getPendingSave(id)
    if (pending.timer) return

    pending.timer = setTimeout(() => {
      pending.timer = null
      this.enqueueWrite(id, pending)
    }, this.options.throttleMs)
  }

  async flush(id: string): Promise<void> {
    const pending = this.pendingSaves.get(id)
    if (!pending) return

    if (pending.timer) {
      clearTimeout(pending.timer)
      pending.timer = null
      this.enqueueWrite(id, pending)
    }

    try {
      await pending.writePromise
    } finally {
      if (!pending.timer) {
        this.pendingSaves.delete(id)
      }
    }
  }

  async flushAll(): Promise<void> {
    const ids = [...this.pendingSaves.keys()]
    await Promise.all(ids.map(id => this.flush(id).catch(() => {})))
  }

  cancel(id: string): void {
    const pending = this.pendingSaves.get(id)
    if (pending?.timer) {
      clearTimeout(pending.timer)
      pending.timer = null
    }
    this.pendingSaves.delete(id)
  }

  getPendingIds(): string[] {
    return [...this.pendingSaves.keys()]
  }

  private getPendingSave(id: string): PendingSave {
    let pending = this.pendingSaves.get(id)
    if (!pending) {
      pending = { timer: null, writePromise: Promise.resolve() }
      this.pendingSaves.set(id, pending)
    }
    return pending
  }

  private enqueueWrite(id: string, pending: PendingSave): void {
    pending.writePromise = pending.writePromise.then(async () => {
      const latest = this.options.getLatest(id)
      if (!latest) return
      try {
        await this.options.write(id, latest)
      } catch (error) {
        this.options.onError?.(id, error)
      }
    })
  }
}
