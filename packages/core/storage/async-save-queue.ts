interface PendingSave {
  timer: ReturnType<typeof setTimeout> | null
  fireAt: number
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

  // 已有更早的挂起写入时,晚到的调度不会推迟它;更急的调度会把它提前。
  schedule(id: string, delayMs: number = this.options.throttleMs): void {
    const pending = this.getPendingSave(id)
    const fireAt = Date.now() + delayMs
    if (pending.timer) {
      if (fireAt >= pending.fireAt) return
      clearTimeout(pending.timer)
    }

    pending.fireAt = fireAt
    pending.timer = setTimeout(() => {
      pending.timer = null
      this.enqueueWrite(id, pending)
    }, delayMs)
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
    if (!pending) return
    if (pending.timer) {
      clearTimeout(pending.timer)
      pending.timer = null
    }
    // 保留条目(而非删除):在途写入的 promise 链是后续 schedule/runExclusive
    // 与它串行化的唯一凭据;getLatest 返回 undefined 时写入本身会跳过。
    pending.fireAt = 0
  }

  /**
   * 取消排队中的写入,并把 task 排在该 id 在途写入之后执行(与写入互斥)。
   * 用于删除等必须与在途写串行化的文件操作。
   */
  runExclusive(id: string, task: () => void | Promise<void>): Promise<void> {
    const pending = this.pendingSaves.get(id)
    if (!pending) {
      return Promise.resolve().then(task)
    }
    if (pending.timer) {
      clearTimeout(pending.timer)
      pending.timer = null
    }
    this.pendingSaves.delete(id)
    return pending.writePromise.then(task, task)
  }

  getPendingIds(): string[] {
    return [...this.pendingSaves.keys()]
  }

  private getPendingSave(id: string): PendingSave {
    let pending = this.pendingSaves.get(id)
    if (!pending) {
      pending = { timer: null, fireAt: 0, writePromise: Promise.resolve() }
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
