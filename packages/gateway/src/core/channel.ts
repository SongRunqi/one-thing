export interface InboundActor {
  displayName?: string
  handle?: string
  avatarUrl?: string
  locale?: string
  timezone?: string
}

export interface InboundMessage {
  channelId: string
  userId: string
  text: string
  raw: unknown
  actor?: InboundActor
}

export interface OutboundMessage {
  userId: string
  text: string
  raw: unknown
}

export interface TypingMessage {
  userId: string
  raw: unknown
  status?: 'typing' | 'cancel'
}

export interface Channel {
  readonly id: string
  start(): Promise<void>
  stop(): Promise<void>
  send(msg: OutboundMessage): Promise<void>
  typing?(msg: TypingMessage): Promise<void>
  onMessage(handler: (msg: InboundMessage) => Promise<void>): void
}
