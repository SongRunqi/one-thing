import type { Channel } from './channel.js'
import type { GatewayBridge } from './bridge.js'

export class Gateway {
  private readonly channels: Channel[] = []
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly bridge: GatewayBridge) {}

  register(channel: Channel): this {
    this.channels.push(channel)
    this.bridge.register(channel)
    channel.onMessage((msg) => {
      void this.bridge.handle(msg).catch(error => {
        console.error('[Gateway] Message handling failed:', error)
      })
      return Promise.resolve()
    })
    return this
  }

  async start(): Promise<void> {
    await Promise.all(this.channels.map(channel => channel.start()))

    this.cleanupTimer = setInterval(() => {
      const removed = this.bridge.cleanupInactiveSessions()
      if (removed > 0) {
        console.log(`[Gateway] Cleaned up ${removed} inactive session(s)`)
      }
    }, 60 * 60 * 1000)
  }

  async stop(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }

    for (const channel of this.channels) {
      await channel.stop()
    }
  }
}
