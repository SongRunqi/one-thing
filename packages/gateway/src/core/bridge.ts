import {
  isCoreTextStreamChunk,
  type CoreConversationRuntime,
} from '@onething/core/gateway-runtime'
import {
  CHANGE_DIRECTORY_SLASH_COMMAND,
  COMPACT_CONTEXT_SLASH_COMMAND,
  NEW_SESSION_SLASH_COMMAND,
  parseSharedSlashCommand,
} from '@onething/core/slash-commands'
import type { Channel, InboundMessage, OutboundMessage, TypingMessage } from './channel.js'
import type { Allowlist } from './middleware/allowlist.js'
import type { RateLimiter } from './middleware/rate-limiter.js'
import type { GatewaySessionRegistry } from './session-registry.js'

export interface GatewayBridgeOptions {
  allowlist: Allowlist
  rateLimiter: RateLimiter
  registry: GatewaySessionRegistry
  runtime: CoreConversationRuntime
  commandProvider?: GatewayCommandProvider
}

export interface GatewayCommandInfo {
  id: string
  name: string
  description?: string
  usage?: string
}

export interface GatewayCommandExecutionRequest {
  command: GatewayCommandInfo
  args: string
  sessionId: string
  channelId: string
  userId: string
  raw: unknown
}

export type GatewayCommandExecutionResult =
  | { success: true; message?: string }
  | { success: false; error?: string }

export interface GatewayCommandProvider {
  listCommands(): Promise<GatewayCommandInfo[]>
  executeCommand(request: GatewayCommandExecutionRequest): Promise<GatewayCommandExecutionResult>
}

export class GatewayBridge {
  private readonly channels = new Map<string, Channel>()

  constructor(private readonly options: GatewayBridgeOptions) {}

  register(channel: Channel): void {
    this.channels.set(channel.id, channel)
  }

  cleanupInactiveSessions(): number {
    return this.options.registry.cleanup()
  }

  async handle(msg: InboundMessage): Promise<void> {
    const channel = this.channels.get(msg.channelId)
    if (!channel) {
      console.error(`[GatewayBridge] No channel registered for ${msg.channelId}`)
      return
    }

    if (!this.options.allowlist.check(msg.userId)) {
      await this.send(channel, {
        userId: msg.userId,
        text: '你没有权限使用此服务。',
        raw: msg.raw,
      })
      return
    }

    if (!this.options.rateLimiter.check(msg.userId)) {
      await this.send(channel, {
        userId: msg.userId,
        text: '请求太频繁，请稍后再试。',
        raw: msg.raw,
      })
      return
    }

    const commandResult = await this.handleGatewayCommand(msg)
    if (commandResult) {
      await this.send(channel, {
        userId: msg.userId,
        text: commandResult.text,
        raw: msg.raw,
      })
      return
    }

    const session = this.options.registry.getOrCreate(msg.channelId, msg.userId)

    await this.typing(channel, {
      userId: msg.userId,
      raw: msg.raw,
    }).catch(error => {
      console.warn('[GatewayBridge] Failed to send typing signal:', error)
    })

    let buffer = ''
    let lastFlushAt = Date.now()
    let sendChain = Promise.resolve()

    const enqueueFlush = (): void => {
      const text = buffer.trim()
      buffer = ''
      lastFlushAt = Date.now()

      if (!text) return

      sendChain = sendChain
        .then(() => this.send(channel, {
          userId: msg.userId,
          text,
          raw: msg.raw,
        }))
        .catch(error => {
          console.error('[GatewayBridge] Failed to flush outbound text:', error)
        })
    }

    const timer = setInterval(() => {
      if (buffer.trim() && Date.now() - lastFlushAt >= 3000) {
        enqueueFlush()
      }
    }, 250)

    const unsubscribe = this.options.runtime.streamChannel.subscribe(session.coreSessionId, (chunk) => {
      if (!isCoreTextStreamChunk(chunk)) return
      buffer += chunk.text

      if (shouldFlush(buffer, lastFlushAt)) {
        enqueueFlush()
      }
    })

    try {
      await this.options.runtime.sendMessage({
        sessionId: session.coreSessionId,
        content: msg.text,
        channel: msg.channelId,
        source: 'gateway',
      })
      enqueueFlush()
      await sendChain
    } catch (error) {
      console.error('[GatewayBridge] Message handling failed:', error)
      await sendChain
      await this.send(channel, {
        userId: msg.userId,
        text: '处理时遇到错误，请稍后重试。',
        raw: msg.raw,
      })
    } finally {
      clearInterval(timer)
      unsubscribe()
    }
  }

  private async send(channel: Channel, msg: OutboundMessage): Promise<void> {
    await channel.send(msg)
  }

  private async typing(channel: Channel, msg: TypingMessage): Promise<void> {
    await channel.typing?.(msg)
  }

  private async handleGatewayCommand(msg: InboundMessage): Promise<{ text: string } | null> {
    const parsed = parseSharedSlashCommand(msg.text)

    if (parsed.type === 'command') {
      return this.executeGatewayCommand(msg, parsed.value.command.id)
    }

    if (parsed.type === 'invalid') {
      return {
        text: `用法：${parsed.value.usage}`,
      }
    }

    return this.handleExternalGatewayCommand(msg)
  }

  private executeGatewayCommand(msg: InboundMessage, commandId: string): { text: string } | null {
    switch (commandId) {
      case NEW_SESSION_SLASH_COMMAND.id: {
        const session = this.options.registry.startNewSession(msg.channelId, msg.userId)
        return { text: `已创建新的会话：${session.coreSessionId}。接下来的消息会在这个新会话中继续。` }
      }
      case CHANGE_DIRECTORY_SLASH_COMMAND.id:
        return {
          text: `已识别 ${CHANGE_DIRECTORY_SLASH_COMMAND.usage}，但当前 channel 暂不支持切换工作目录。请在桌面端使用该命令。`,
        }
      case COMPACT_CONTEXT_SLASH_COMMAND.id:
        return {
          text: `已识别 ${COMPACT_CONTEXT_SLASH_COMMAND.usage}，但当前 channel 暂不支持手动压缩上下文。请在桌面端使用该命令。`,
        }
      default:
        return null
    }
  }

  private async handleExternalGatewayCommand(msg: InboundMessage): Promise<{ text: string } | null> {
    const invocation = parseExternalSlashInvocation(msg.text)
    const provider = this.options.commandProvider
    if (!invocation || !provider) return null

    let commands: GatewayCommandInfo[]
    try {
      commands = await provider.listCommands()
    } catch (error) {
      console.warn('[GatewayBridge] Failed to list external commands:', error)
      return null
    }

    const command = commands.find(candidate => commandMatches(candidate, invocation.id))
    if (!command) return null

    const session = this.options.registry.getOrCreate(msg.channelId, msg.userId)
    try {
      const result = await provider.executeCommand({
        command,
        args: invocation.args,
        sessionId: session.coreSessionId,
        channelId: msg.channelId,
        userId: msg.userId,
        raw: msg.raw,
      })
      if (result.success) {
        return { text: result.message || `${command.name} completed` }
      }
      return { text: result.error || `${command.name} failed` }
    } catch (error) {
      console.error('[GatewayBridge] External command execution failed:', error)
      return { text: error instanceof Error && error.message ? error.message : `${command.name} failed` }
    }
  }
}

function shouldFlush(buffer: string, lastFlushAt: number): boolean {
  if (buffer.length > 500) return true
  if (buffer.length > 100 && /[。.!！?？\n]/.test(buffer)) return true
  return Date.now() - lastFlushAt > 3000
}

function parseExternalSlashInvocation(text: string): { id: string; args: string } | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/') && !trimmed.startsWith('／')) return null

  const withoutSlash = trimmed.slice(1).trimStart()
  if (!withoutSlash) return null

  const match = withoutSlash.match(/^(\S+)(?:\s+([\s\S]*))?$/)
  if (!match?.[1]) return null

  return {
    id: match[1].toLowerCase(),
    args: match[2] ?? '',
  }
}

function commandMatches(command: GatewayCommandInfo, id: string): boolean {
  const candidates = [
    command.id,
    command.name,
    command.name.replace(/^\//, ''),
  ]
  return candidates.some(candidate => candidate.toLowerCase() === id)
}
