/**
 * PendingMessageQueue — lightweight message queue for steering/follow-up injection.
 *
 * Steering messages are injected after each turn ends (inner loop).
 * Follow-up messages are injected only after the agent would naturally stop (outer loop).
 */

export type QueueMode = 'all' | 'one-at-a-time'

export interface PendingMessage {
  /** The message content injected into the conversation */
  content: string
  /** Identifier of the source (plugin name, extension id, 'user', etc.) */
  source: string
  /** When this message was enqueued */
  timestamp: number
  /** Existing chat message id when the message was already persisted */
  id?: string
  /** Resolved content to pass to the model when already available */
  modelContent?: string
  /** Resolved rich content parts when already available */
  contentParts?: unknown
  /** True when the message has already been written to chat history */
  persisted?: boolean
  /** Trusted transport/identity metadata supplied by the host. */
  origin?: unknown
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

  enqueue(message: PendingMessage): void {
    this.messages.push(message)
  }

  hasItems(): boolean {
    return this.messages.length > 0
  }

  drain(): PendingMessage[] {
    if (this.messages.length === 0) return []

    if (this._mode === 'all') {
      const drained = this.messages.slice()
      this.messages = []
      return drained
    }

    const first = this.messages.shift()!
    return [first]
  }

  clear(): void {
    this.messages = []
  }

  get size(): number {
    return this.messages.length
  }
}
