export interface InboundMessage {
  channelId: string
  userId: string
  text: string
  raw: unknown
}

export interface OutboundMessage {
  userId: string
  text: string
  raw: unknown
}

export interface TypingMessage {
  userId: string
  raw: unknown
}

export interface Channel {
  readonly id: string
  start(): Promise<void>
  stop(): Promise<void>
  send(msg: OutboundMessage): Promise<void>
  typing?(msg: TypingMessage): Promise<void>
  onMessage(handler: (msg: InboundMessage) => Promise<void>): void
}
