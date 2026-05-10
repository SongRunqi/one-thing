/**
 * PendingMessageQueue — lightweight message queue for steering/follow-up injection.
 *
 * Steering messages are injected after each turn ends (inner loop).
 * Follow-up messages are injected only after the agent would naturally stop (outer loop).
 *
 * Modes:
 * - "one-at-a-time": drain() returns a single message per call (default for steering)
 * - "all": drain() returns all queued messages at once (default for followUp)
 *
 * Inspired by pi-mono's PendingMessageQueue design.
 */

export type QueueMode = 'all' | 'one-at-a-time'

export interface PendingMessage {
  /** The message content injected into the conversation */
  content: string
  /** Identifier of the source (plugin name, extension id, 'user', etc.) */
  source: string
  /** When this message was enqueued */
  timestamp: number
}

export class PendingMessageQueue {
  private messages: PendingMessage[] = []
  private _mode: QueueMode

  constructor(mode: QueueMode) {
    this._mode = mode
  }

  get mode(): QueueMode {
    return this._mode
  }

  set mode(mode: QueueMode) {
    this._mode = mode
  }

  /** Add a message to the queue */
  enqueue(message: PendingMessage): void {
    this.messages.push(message)
  }

  /** True if the queue has at least one pending message */
  hasItems(): boolean {
    return this.messages.length > 0
  }

  /**
   * Drain messages from the queue according to the configured mode.
   * - "all": returns all messages and clears the queue
   * - "one-at-a-time": returns only the first message
   */
  drain(): PendingMessage[] {
    if (this.messages.length === 0) return []

    if (this._mode === 'all') {
      const drained = this.messages.slice()
      this.messages = []
      return drained
    }

    // "one-at-a-time": pop first only
    const first = this.messages.shift()!
    return [first]
  }

  /** Remove all queued messages */
  clear(): void {
    this.messages = []
  }

  /** Number of pending messages */
  get size(): number {
    return this.messages.length
  }
}
