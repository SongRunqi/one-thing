import type { CoreConversationRuntime, CoreTextStreamChunk } from '@onething/core/gateway-runtime'
import { describe, expect, it, vi } from 'vitest'
import type { Channel, InboundMessage, OutboundMessage, TypingMessage } from '../channel.js'
import { GatewayBridge, type GatewayCommandProvider } from '../bridge.js'
import { Allowlist } from '../middleware/allowlist.js'
import { RateLimiter } from '../middleware/rate-limiter.js'
import { GatewaySessionRegistry } from '../session-registry.js'

class MockChannel implements Channel {
  readonly id = 'mock'
  readonly sent: OutboundMessage[] = []
  readonly typingSignals: TypingMessage[] = []
  private handler: ((msg: InboundMessage) => Promise<void>) | null = null

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  async send(msg: OutboundMessage): Promise<void> {
    this.sent.push(msg)
  }

  async typing(msg: TypingMessage): Promise<void> {
    this.typingSignals.push(msg)
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void {
    this.handler = handler
  }

  async emit(msg: InboundMessage): Promise<void> {
    await this.handler?.(msg)
  }
}

class MockStreamChannel {
  private readonly handlers = new Map<string, Set<(chunk: CoreTextStreamChunk) => void>>()

  subscribe(sessionId: string, handler: (chunk: CoreTextStreamChunk) => void): () => void {
    let handlers = this.handlers.get(sessionId)
    if (!handlers) {
      handlers = new Set()
      this.handlers.set(sessionId, handlers)
    }
    handlers.add(handler)
    return () => {
      handlers?.delete(handler)
    }
  }

  push(sessionId: string, chunk: CoreTextStreamChunk): void {
    for (const handler of this.handlers.get(sessionId) ?? []) {
      handler(chunk)
    }
  }
}

class MockRuntime implements CoreConversationRuntime<CoreTextStreamChunk> {
  readonly streamChannel = new MockStreamChannel()
  readonly ensureSession = vi.fn()
  readonly destroySession = vi.fn()
  readonly messages: Array<{ sessionId: string; content: string; channel?: string; source?: string }> = []

  async sendMessage(options: { sessionId: string; content: string; channel?: string; source?: string }): Promise<void> {
    this.messages.push(options)
    this.streamChannel.push(options.sessionId, {
      type: 'text-delta',
      text: `Echo: ${options.content}`,
    })
  }
}

describe('GatewayBridge', () => {
  it('sends typing as an explicit channel signal, not an empty text message', async () => {
    const runtime = new MockRuntime()
    const channel = new MockChannel()
    const raw = { from_user_id: 'user-1', context_token: 'token-1' }
    const bridge = new GatewayBridge({
      allowlist: new Allowlist({ mode: 'open' }),
      rateLimiter: new RateLimiter({ maxPerMinute: 10 }),
      registry: new GatewaySessionRegistry(runtime),
      runtime,
    })
    bridge.register(channel)

    await bridge.handle({
      channelId: 'mock',
      userId: 'user-1',
      text: 'hello',
      raw,
    })

    expect(channel.typingSignals).toEqual([{ userId: 'user-1', raw }])
    expect(channel.sent).toEqual([{ userId: 'user-1', text: 'Echo: hello', raw }])
    expect(channel.sent.every(msg => msg.text.trim().length > 0)).toBe(true)
  })

  it('handles /new as a channel command and routes following messages to the new session', async () => {
    const runtime = new MockRuntime()
    const channel = new MockChannel()
    const raw = { from_user_id: 'user-1', context_token: 'token-1' }
    const bridge = new GatewayBridge({
      allowlist: new Allowlist({ mode: 'open' }),
      rateLimiter: new RateLimiter({ maxPerMinute: 10 }),
      registry: new GatewaySessionRegistry(runtime),
      runtime,
    })
    bridge.register(channel)

    await bridge.handle({
      channelId: 'mock',
      userId: 'user-1',
      text: 'first',
      raw,
    })
    await bridge.handle({
      channelId: 'mock',
      userId: 'user-1',
      text: '/new',
      raw,
    })
    await bridge.handle({
      channelId: 'mock',
      userId: 'user-1',
      text: 'second',
      raw,
    })

    expect(runtime.messages.map(message => message.sessionId)).toEqual([
      'gateway:mock:user-1',
      'gateway:mock:user-1:session-2',
    ])
    expect(runtime.messages.map(message => message.content)).toEqual(['first', 'second'])
    expect(channel.sent[1]?.text).toContain('已创建新的会话')
    expect(channel.sent[1]?.text).toContain('gateway:mock:user-1:session-2')
  })

  it('does not reuse the default gateway session when /new is the first message after startup', async () => {
    const runtime = new MockRuntime()
    const channel = new MockChannel()
    const raw = { from_user_id: 'user-1', context_token: 'token-1' }
    const bridge = new GatewayBridge({
      allowlist: new Allowlist({ mode: 'open' }),
      rateLimiter: new RateLimiter({ maxPerMinute: 10 }),
      registry: new GatewaySessionRegistry(runtime),
      runtime,
    })
    bridge.register(channel)

    await bridge.handle({
      channelId: 'mock',
      userId: 'user-1',
      text: '/new',
      raw,
    })
    await bridge.handle({
      channelId: 'mock',
      userId: 'user-1',
      text: 'after new',
      raw,
    })

    expect(runtime.messages.map(message => message.sessionId)).toEqual([
      'gateway:mock:user-1:session-2',
    ])
    expect(runtime.messages.map(message => message.content)).toEqual(['after new'])
    expect(channel.sent[0]?.text).toContain('gateway:mock:user-1:session-2')
  })

  it('returns usage feedback for invalid /new command arguments', async () => {
    const runtime = new MockRuntime()
    const channel = new MockChannel()
    const raw = { from_user_id: 'user-1', context_token: 'token-1' }
    const bridge = new GatewayBridge({
      allowlist: new Allowlist({ mode: 'open' }),
      rateLimiter: new RateLimiter({ maxPerMinute: 10 }),
      registry: new GatewaySessionRegistry(runtime),
      runtime,
    })
    bridge.register(channel)

    await bridge.handle({
      channelId: 'mock',
      userId: 'user-1',
      text: '/new session',
      raw,
    })

    expect(runtime.messages).toEqual([])
    expect(channel.sent).toEqual([{ userId: 'user-1', text: '用法：/new', raw }])
  })

  it('recognizes shared renderer commands that do not have channel-side behavior', async () => {
    const runtime = new MockRuntime()
    const channel = new MockChannel()
    const raw = { from_user_id: 'user-1', context_token: 'token-1' }
    const bridge = new GatewayBridge({
      allowlist: new Allowlist({ mode: 'open' }),
      rateLimiter: new RateLimiter({ maxPerMinute: 10 }),
      registry: new GatewaySessionRegistry(runtime),
      runtime,
    })
    bridge.register(channel)

    await bridge.handle({
      channelId: 'mock',
      userId: 'user-1',
      text: '/cd /tmp/project',
      raw,
    })
    await bridge.handle({
      channelId: 'mock',
      userId: 'user-1',
      text: '/compact',
      raw,
    })

    expect(runtime.messages).toEqual([])
    expect(channel.sent.map(message => message.text)).toEqual([
      '已识别 /cd <path>，但当前 channel 暂不支持切换工作目录。请在桌面端使用该命令。',
      '已识别 /compact，但当前 channel 暂不支持手动压缩上下文。请在桌面端使用该命令。',
    ])
  })

  it('executes registered external slash commands without sending them to the model', async () => {
    const runtime = new MockRuntime()
    const channel = new MockChannel()
    const raw = { from_user_id: 'user-1', context_token: 'token-1' }
    const commandProvider: GatewayCommandProvider = {
      listCommands: vi.fn(async () => [{
        id: 'memory',
        name: '/memory',
        description: 'Memory command',
        usage: '/memory status',
      }]),
      executeCommand: vi.fn(async () => ({
        success: true,
        message: 'Memory is ready',
      })),
    }
    const bridge = new GatewayBridge({
      allowlist: new Allowlist({ mode: 'open' }),
      rateLimiter: new RateLimiter({ maxPerMinute: 10 }),
      registry: new GatewaySessionRegistry(runtime),
      runtime,
      commandProvider,
    })
    bridge.register(channel)

    await bridge.handle({
      channelId: 'mock',
      userId: 'user-1',
      text: '/memory status',
      raw,
    })

    expect(runtime.messages).toEqual([])
    expect(commandProvider.executeCommand).toHaveBeenCalledWith({
      command: {
        id: 'memory',
        name: '/memory',
        description: 'Memory command',
        usage: '/memory status',
      },
      args: 'status',
      sessionId: 'gateway:mock:user-1',
      channelId: 'mock',
      userId: 'user-1',
      raw,
    })
    expect(channel.sent).toEqual([{ userId: 'user-1', text: 'Memory is ready', raw }])
  })

  it('lets unknown slash input continue as chat content', async () => {
    const runtime = new MockRuntime()
    const channel = new MockChannel()
    const raw = { from_user_id: 'user-1', context_token: 'token-1' }
    const bridge = new GatewayBridge({
      allowlist: new Allowlist({ mode: 'open' }),
      rateLimiter: new RateLimiter({ maxPerMinute: 10 }),
      registry: new GatewaySessionRegistry(runtime),
      runtime,
      commandProvider: {
        listCommands: vi.fn(async () => []),
        executeCommand: vi.fn(),
      },
    })
    bridge.register(channel)

    await bridge.handle({
      channelId: 'mock',
      userId: 'user-1',
      text: '/skill explain this',
      raw,
    })

    expect(runtime.messages).toEqual([{
      sessionId: 'gateway:mock:user-1',
      content: '/skill explain this',
      channel: 'mock',
      source: 'gateway',
    }])
    expect(channel.sent).toEqual([{ userId: 'user-1', text: 'Echo: /skill explain this', raw }])
  })
})
