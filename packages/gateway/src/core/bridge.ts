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
import type { GatewayPermissionConfig } from '../config.js'
import type { Channel, InboundMessage, OutboundMessage, TypingMessage } from './channel.js'
import {
  GATEWAY_STREAM_FLUSH_INTERVAL_MS,
  GATEWAY_STREAM_IDLE_MS,
  MarkdownSafeOutboundBuffer,
} from './markdown-safe-outbound-buffer.js'
import type { Allowlist } from './middleware/allowlist.js'
import type { RateLimiter } from './middleware/rate-limiter.js'
import { GatewayPermissionCoordinator } from './permission-coordinator.js'
import type { GatewaySessionRegistry } from './session-registry.js'

export interface GatewayBridgeOptions {
  allowlist: Allowlist
  rateLimiter: RateLimiter
  registry: GatewaySessionRegistry
  runtime: CoreConversationRuntime
  commandProvider?: GatewayCommandProvider
  permissionConfig?: GatewayPermissionConfig
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
  private readonly permissionCoordinator?: GatewayPermissionCoordinator
  private readonly conversationQueues = new Map<string, Promise<void>>()

  constructor(private readonly options: GatewayBridgeOptions) {
    if (options.permissionConfig?.mode === 'remote-approval') {
      if (options.runtime.permissions) {
        this.permissionCoordinator = new GatewayPermissionCoordinator({
          permissions: options.runtime.permissions,
          timeoutMs: options.permissionConfig.timeoutMs,
        })
      } else {
        console.warn('[GatewayBridge] Remote permission approval configured, but runtime does not expose permissions.')
      }
    }
  }

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

    if (!this.options.allowlist.check(msg.userId) && !this.options.allowlist.check(msg.conversationId)) {
      await this.send(channel, {
        conversationId: msg.conversationId,
        userId: msg.userId,
        text: '你没有权限使用此服务。',
        raw: msg.raw,
      })
      return
    }

    if (this.permissionCoordinator
      && await this.permissionCoordinator.tryHandleReply(msg.channelId, msg.userId, msg.text)) {
      return
    }

    return this.enqueueConversationMessage(channel, msg)
  }

  private enqueueConversationMessage(channel: Channel, msg: InboundMessage): Promise<void> {
    const key = conversationQueueKey(msg.channelId, sessionPeerId(msg))
    const previous = this.conversationQueues.get(key) ?? Promise.resolve()
    const task = previous
      .catch(() => {})
      .then(() => this.handleQueuedMessage(channel, msg))

    this.conversationQueues.set(key, task)
    task.finally(() => {
      if (this.conversationQueues.get(key) === task) {
        this.conversationQueues.delete(key)
      }
    }).catch(() => {})

    return task
  }

  private async handleQueuedMessage(channel: Channel, msg: InboundMessage): Promise<void> {
    if (!this.options.rateLimiter.check(msg.userId)) {
      await this.send(channel, {
        conversationId: msg.conversationId,
        userId: msg.userId,
        text: '请求太频繁，请稍后再试。',
        raw: msg.raw,
      })
      return
    }

    const commandResult = await this.handleGatewayCommand(msg)
    if (commandResult) {
      await this.send(channel, {
        conversationId: msg.conversationId,
        userId: msg.userId,
        text: commandResult.text,
        raw: msg.raw,
      })
      return
    }

    const session = this.options.registry.getOrCreate(msg.channelId, sessionPeerId(msg))
    const permissionMode = this.options.permissionConfig?.mode
    if (isGatewayAutoPermissionMode(permissionMode)) {
      this.options.runtime.permissions?.setSessionPermissionMode(session.coreSessionId, permissionMode)
    }

    await this.typing(channel, {
      conversationId: msg.conversationId,
      userId: msg.userId,
      raw: msg.raw,
    }).catch(error => {
      console.warn('[GatewayBridge] Failed to send typing signal:', error)
    })

    const buffer = new MarkdownSafeOutboundBuffer()
    let lastFlushAt = Date.now()
    let sendChain = Promise.resolve()
    let aborted = false
    let abortError: unknown
    let droppedSegmentCount = 0
    let droppedCharCount = 0

    const enqueueSegments = (segments: string[]): void => {
      if (!segments.length) return
      if (aborted) {
        recordDroppedSegments(segments)
        return
      }
      lastFlushAt = Date.now()

      for (const text of segments) {
        sendChain = sendChain
          .then(async () => {
            if (aborted) {
              recordDroppedSegments([text])
              return
            }
            try {
              await this.send(channel, {
                conversationId: msg.conversationId,
                userId: msg.userId,
                text,
                raw: msg.raw,
              })
            } catch (error) {
              aborted = true
              abortError = error
            }
          })
      }
    }

    const recordDroppedSegments = (segments: string[]): void => {
      droppedSegmentCount += segments.length
      droppedCharCount += segments.reduce((total, text) => total + text.length, 0)
    }

    const logAbortSummary = (): void => {
      if (!aborted) return
      console.error(
        `[GatewayBridge] Aborted outbound text flush after send failure; `
        + `dropped ${droppedSegmentCount} segment(s), ${droppedCharCount} char(s).`,
        abortError,
      )
    }

    const timer = setInterval(() => {
      if (buffer.hasPending() && Date.now() - lastFlushAt >= GATEWAY_STREAM_IDLE_MS) {
        enqueueSegments(buffer.takeReadySegments({ idle: true }))
      }
    }, GATEWAY_STREAM_FLUSH_INTERVAL_MS)

    const unsubscribe = this.options.runtime.streamChannel.subscribe(session.coreSessionId, (chunk) => {
      if (!isCoreTextStreamChunk(chunk)) return
      buffer.append(chunk.text)
      enqueueSegments(buffer.takeReadySegments())
    })
    const unwatchPermission = this.permissionCoordinator?.watch({
      sessionId: session.coreSessionId,
      channelId: msg.channelId,
      userId: msg.userId,
      sendText: text => this.send(channel, {
        conversationId: msg.conversationId,
        userId: msg.userId,
        text,
        raw: msg.raw,
      }),
    }) ?? (() => {})

    try {
      await this.options.runtime.sendMessage({
        sessionId: session.coreSessionId,
        content: msg.text,
        channel: msg.channelId,
        source: 'gateway',
        origin: buildGatewayMessageOrigin(msg),
      })
      enqueueSegments(buffer.flushFinal())
      await sendChain
      logAbortSummary()
    } catch (error) {
      console.error('[GatewayBridge] Message handling failed:', error)
      await sendChain
      logAbortSummary()
      await this.send(channel, {
        conversationId: msg.conversationId,
        userId: msg.userId,
        text: '处理时遇到错误，请稍后重试。',
        raw: msg.raw,
      })
    } finally {
      clearInterval(timer)
      unsubscribe()
      unwatchPermission()
      await this.typing(channel, {
        conversationId: msg.conversationId,
        userId: msg.userId,
        raw: msg.raw,
        status: 'cancel',
      }).catch(error => {
        console.warn('[GatewayBridge] Failed to cancel typing signal:', error)
      })
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
        const session = this.options.registry.startNewSession(msg.channelId, sessionPeerId(msg))
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

    const session = this.options.registry.getOrCreate(msg.channelId, sessionPeerId(msg))
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

function conversationQueueKey(channelId: string, peerId: string): string {
  return `${channelId}:${peerId}`
}

/**
 * Session/queue identity for a message. In DMs (conversationId === userId) this
 * stays the plain userId so existing session ids keep working; in group chats it
 * scopes the person to the conversation so members no longer share one session.
 */
function sessionPeerId(msg: InboundMessage): string {
  return msg.conversationId === msg.userId ? msg.userId : `${msg.conversationId}:${msg.userId}`
}

function buildGatewayMessageOrigin(msg: InboundMessage): unknown {
  const channel = parseGatewayChannelId(msg.channelId)
  return {
    transport: 'im',
    source: 'gateway',
    actor: buildGatewayActor(msg),
    conversation: {
      connector: channel.connector,
      ...(channel.workspaceId ? { workspaceId: channel.workspaceId } : {}),
      externalConversationId: msg.conversationId,
      type: msg.conversationId === msg.userId ? 'dm' : 'group',
    },
    replyTarget: {
      connector: channel.connector,
      ...(channel.workspaceId ? { workspaceId: channel.workspaceId } : {}),
      externalConversationId: msg.conversationId,
      externalMessageId: externalMessageIdFromRaw(msg.raw),
    },
    externalMessageId: externalMessageIdFromRaw(msg.raw),
    receivedAt: Date.now(),
  }
}

function parseGatewayChannelId(channelId: string): { connector: string; workspaceId?: string } {
  const [connector, ...workspaceParts] = channelId.split(':')
  const workspaceId = workspaceParts.join(':')
  return {
    connector: connector || channelId,
    ...(workspaceId ? { workspaceId } : {}),
  }
}

function buildGatewayActor(msg: InboundMessage): Record<string, string> {
  const actor: Record<string, string> = {
    externalUserId: msg.userId,
  }
  addActorValue(actor, 'displayName', msg.actor?.displayName)
  addActorValue(actor, 'handle', msg.actor?.handle)
  addActorValue(actor, 'avatarUrl', msg.actor?.avatarUrl)
  addActorValue(actor, 'locale', msg.actor?.locale)
  addActorValue(actor, 'timezone', msg.actor?.timezone)
  return actor
}

function addActorValue(target: Record<string, string>, key: string, value: string | undefined): void {
  const trimmed = value?.trim()
  if (trimmed) target[key] = trimmed
}

function externalMessageIdFromRaw(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const record = raw as Record<string, unknown>
  const value = record.message_id ?? record.messageId ?? record.id
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
}

function isGatewayAutoPermissionMode(
  mode: GatewayPermissionConfig['mode'] | undefined,
): mode is 'auto-accept-edits' | 'dangerously-allow-all' {
  return mode === 'auto-accept-edits' || mode === 'dangerously-allow-all'
}
