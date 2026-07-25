import {
  HeadlessStreamEngine,
  type CoreEventBusLike,
} from './headless-stream-engine.js'
import type { PendingMessage } from './message-queue.js'
import { isCoreExternalAgentProvider } from './external-agent-providers.js'
import { expandFileMentions, isFileMentionTrustedChannel } from './file-mentions.js'
import type {
  StreamEngineCompactionAdapter,
  StreamEngineClockAdapter,
  StreamEngineHistoryAdapter,
  StreamEngineIdAdapter,
  StreamEngineMediaAdapter,
  StreamEngineModelRegistryAdapter,
  StreamEnginePermissionAdapter,
  StreamEnginePromptAdapter,
  StreamEngineProviderAdapter,
  StreamEngineSkillsAdapter,
  StreamEngineStoreAdapter,
  StreamEngineStreamsAdapter,
  StreamEngineVariablesAdapter,
} from './stream-runtime.js'
import {
  canApplyGeneratedSessionTitle,
  generateTitleFromMessage,
  normalizeSessionTitle,
  resolveToolCallModel,
  type StreamEngineSettingsWithProviders,
} from './title.js'
import {
  extractErrorDetails,
  type CoreErrorDetails,
} from './error-details.js'
import {
  buildContextUsageSnapshot,
} from './context-usage.js'
import { resolveTurnContextUpdateText, visibleMessagesAfterSummary } from './turn-context.js'

export interface CoreEventBusEmitterLike extends CoreEventBusLike {
  emit(sessionId: string, event: any): Promise<unknown>
}

export interface CoreStreamMessage {
  id: string
  role: string
  content?: string
  timestamp: number
  attachments?: unknown[]
  contentParts?: unknown[]
  source?: string
  voice?: unknown
  model?: string
  provider?: string
  isStreaming?: boolean
  thinkingStartTime?: number
  toolCalls?: unknown[]
  reasoning?: string
  errorDetails?: string
  [key: string]: unknown
}

export interface CoreStreamSession<TMessage extends CoreStreamMessage = CoreStreamMessage> {
  messages: TMessage[]
  name?: string
  workingDirectory?: string
  agentId?: string
  parentSessionId?: string
  createdAt: number
  contextSize?: number
  lastInputTokens?: number
  permissionMode?: string
  [key: string]: unknown
}

export interface CoreStreamSettings {
  tools?: {
    permissionMode?: string
    toolCallModel?: {
      thinking?: boolean
      thinkingEffort?: unknown
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  skills?: {
    enableSkills?: boolean
    [key: string]: unknown
  }
  chat?: {
    contextCompactKeepRecentTurns?: number
    contextCompactEnabled?: boolean
    maxTokens?: number
    contextCompactThreshold?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface CoreStreamPermissionModeSession {
  permissionMode?: string
}

export interface CoreStreamPermissionModeSettings {
  tools?: {
    permissionMode?: string
  }
}

export function resolveStreamPermissionMode(
  session: CoreStreamPermissionModeSession | null | undefined,
  settings: CoreStreamPermissionModeSettings | null | undefined,
  fallback = 'normal',
): string {
  return session?.permissionMode ?? settings?.tools?.permissionMode ?? fallback
}

export interface CoreProviderConfigWithKeyLike {
  model: string
  selectedModels?: string[]
  apiKey: string
  authContext?: unknown
  oauthToken?: unknown
  baseUrl?: unknown
  maxOutputByModel?: Record<string, number | undefined>
  [key: string]: unknown
}

export interface CoreStreamResultLike {
  pausedForConfirmation?: boolean
  [key: string]: unknown
}

export interface CoreContextCompactResultLike {
  success: boolean
  skipped?: boolean
  summary?: string
  error?: string
  retainedContextSize?: number
  [key: string]: unknown
}

export interface CoreStreamEngineRuntime<
  TSettings extends CoreStreamSettings = CoreStreamSettings,
  TMessage extends CoreStreamMessage = CoreStreamMessage,
  TSession extends CoreStreamSession<TMessage> = CoreStreamSession<TMessage>,
  TProviderConfig = unknown,
  TProviderConfigWithKey extends CoreProviderConfigWithKeyLike = CoreProviderConfigWithKeyLike,
  TAuthContext = unknown,
  TSkill = unknown,
  TContentPart = unknown,
  TAttachment = unknown,
  THistoryMessage = unknown,
  TStreamResult extends CoreStreamResultLike = CoreStreamResultLike,
  TCompactResult extends CoreContextCompactResultLike = CoreContextCompactResultLike,
> {
  store: StreamEngineStoreAdapter<TSettings, TSession, TMessage>
  ids: StreamEngineIdAdapter
  clock: StreamEngineClockAdapter
  permission: StreamEnginePermissionAdapter
  skills: StreamEngineSkillsAdapter<TSkill>
  prompts: StreamEnginePromptAdapter<TSkill, TContentPart>
  media: StreamEngineMediaAdapter<TAttachment>
  provider: StreamEngineProviderAdapter<TSettings, TProviderConfig, TAuthContext>
  models: StreamEngineModelRegistryAdapter
  history: StreamEngineHistoryAdapter<TSession, TMessage, THistoryMessage>
  streams: StreamEngineStreamsAdapter<THistoryMessage, TStreamResult>
  compaction: StreamEngineCompactionAdapter<unknown, TCompactResult>
  variables?: StreamEngineVariablesAdapter
}

export interface CoreStreamErrorInfo {
  error: Error
  message: string
  details?: string
  isAbortError: boolean
}

export interface CoreStreamEngineOptions {
  normalizeStreamError?: (error: Error) => CoreStreamErrorInfo
}

interface SendMessageCommandLike {
  type?: string
  content: string
  attachments?: unknown[]
  channel?: string
  source?: string
  voice?: unknown
  origin?: unknown
  providerId?: string
  model?: string
  /**
   * Pin the think mode for this turn (system-internal drives with their own
   * configured model, e.g. the radio DJ). Only honored alongside providerId.
   */
  thinking?: boolean
  thinkingEffort?: string
  /** System-internal drives set this: their prompt text is not a title. */
  suppressTitleGeneration?: boolean
}

interface EditAndResendCommandLike {
  type?: string
  messageId: string
  newContent: string
  channel?: string
  origin?: unknown
  providerId?: string
  model?: string
}

interface RetryMessageCommandLike {
  type?: string
  messageId: string
  providerId?: string
  model?: string
}

interface ResumeAfterConfirmCommandLike {
  type?: string
  messageId: string
}

interface CompactContextCommandLike {
  type?: string
  requestId?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function authKind(authContext: unknown): string | undefined {
  const record = asRecord(authContext)
  return typeof record.kind === 'string' ? record.kind : undefined
}

function authApiKey(authContext: unknown): string {
  const record = asRecord(authContext)
  return typeof record.apiKey === 'string' ? record.apiKey : ''
}

function authToken(authContext: unknown): unknown {
  return asRecord(authContext).token
}

export function normalizeCoreStreamError(
  // Error.cause is typed `unknown` by lib.es2022, so it must be excluded from
  // the intersection for plain Error values to remain assignable.
  error: Error & Partial<Omit<CoreErrorDetails, 'cause'>>,
): CoreStreamErrorInfo {
  return {
    error,
    message: error.message || 'Streaming error',
    details: extractErrorDetails({
      message: error.message,
      stack: error.stack,
      // Read via a cast: web tsconfig's lib predates ES2022's Error.cause.
      cause: (error as { cause?: unknown }).cause as CoreErrorDetails | undefined,
      responseBody: error.responseBody,
      data: error.data,
    }),
    isAbortError: error.name === 'AbortError',
  }
}

function normalizeErrorDefault(error: Error): CoreStreamErrorInfo {
  return normalizeCoreStreamError(error)
}

export class CoreStreamEngine<
  TEventBus extends CoreEventBusEmitterLike = CoreEventBusEmitterLike,
  TCommandTarget = unknown,
  TSettings extends CoreStreamSettings = CoreStreamSettings,
  TMessage extends CoreStreamMessage = CoreStreamMessage,
  TSession extends CoreStreamSession<TMessage> = CoreStreamSession<TMessage>,
  TProviderConfig = unknown,
  TProviderConfigWithKey extends CoreProviderConfigWithKeyLike = CoreProviderConfigWithKeyLike,
  TAuthContext = unknown,
  TSkill = unknown,
  TContentPart = unknown,
  TAttachment = unknown,
  THistoryMessage = unknown,
  TStreamResult extends CoreStreamResultLike = CoreStreamResultLike,
  TCompactResult extends CoreContextCompactResultLike = CoreContextCompactResultLike,
> extends HeadlessStreamEngine<TEventBus, TCommandTarget> {
  private activeCompactions = new Set<string>()
  private sessionTitleGenerations = new Map<string, number>()
  private titleGenerationSeq = 0

  constructor(
    protected readonly runtime: CoreStreamEngineRuntime<
      TSettings,
      TMessage,
      TSession,
      TProviderConfig,
      TProviderConfigWithKey,
      TAuthContext,
      TSkill,
      TContentPart,
      TAttachment,
      THistoryMessage,
      TStreamResult,
      TCompactResult
    >,
    private readonly options: CoreStreamEngineOptions = {},
  ) {
    super()
  }

  protected get store(): StreamEngineStoreAdapter<TSettings, TSession, TMessage> {
    return this.runtime.store
  }

  protected createMessageId(): string {
    return this.runtime.ids.createId()
  }

  protected now(): number {
    return this.runtime.clock.now()
  }

  override steerMessage(sessionId: string, content: string, source = 'api', origin?: unknown): void {
    const queue = this.getSteeringQueue(sessionId)
    const timestamp = this.now()

    try {
      const pendingMessage = this.createPersistedSteeringMessage(sessionId, content, source, timestamp, origin)
      queue.enqueue(pendingMessage)
      if (pendingMessage.id) {
        this.eventBus?.emit(sessionId, {
          type: 'steering:queued',
          messageId: pendingMessage.id,
        }).catch(err => this.logError('steering:queued emit error:', err))
      }
    } catch (error) {
      this.logError('Failed to persist steering message immediately:', error)
      queue.enqueue({
        content,
        source,
        timestamp,
        ...(origin !== undefined ? { origin } : {}),
      })
    }

    this.log(`Steering queued for ${sessionId.slice(0, 8)}: "${content.slice(0, 60)}..."`)
  }

  /**
   * Retract a still-pending steering message: remove it from the queue and
   * delete the eagerly-persisted chat message. A message already drained
   * into a model turn stays — retraction only wins while it is pending.
   */
  override retractSteerMessage(sessionId: string, messageId: string): boolean {
    const removed = super.retractSteerMessage(sessionId, messageId)
    if (!removed) return false

    if (!this.store.deleteMessage(sessionId, messageId)) {
      this.logError('Retracted steering message missing from session store:', messageId)
    }
    this.eventBus?.emit(sessionId, {
      type: 'message:deleted',
      messageId,
    }).catch(err => this.logError('message:deleted emit error:', err))
    this.eventBus?.emit(sessionId, {
      type: 'steering:retracted',
      messageId,
    }).catch(err => this.logError('steering:retracted emit error:', err))
    return true
  }

  protected override onSessionCleared(sessionId: string): void {
    this.sessionTitleGenerations.delete(sessionId)
    this.runtime.permission.clearSession(sessionId)
  }

  protected override onShutdown(): void {
    this.sessionTitleGenerations.clear()
  }

  protected override async handleSendMessageCommand(
    sessionId: string,
    command: unknown,
    target: TCommandTarget,
  ): Promise<void> {
    await this.handleSendMessage(sessionId, command as SendMessageCommandLike, target)
  }

  protected override async handleEditAndResendCommand(
    sessionId: string,
    command: unknown,
    target: TCommandTarget,
  ): Promise<void> {
    await this.handleEditAndResend(sessionId, command as EditAndResendCommandLike, target)
  }

  protected override async handleRetryMessageCommand(
    sessionId: string,
    command: unknown,
    target: TCommandTarget,
  ): Promise<void> {
    await this.handleRetryMessage(sessionId, command as RetryMessageCommandLike, target)
  }

  protected override async handleResumeAfterConfirmCommand(
    sessionId: string,
    command: unknown,
    target: TCommandTarget,
  ): Promise<void> {
    await this.handleResumeAfterConfirm(sessionId, command as ResumeAfterConfirmCommandLike, target)
  }

  protected override async handleCompactContextCommand(
    sessionId: string,
    command: unknown,
  ): Promise<void> {
    await this.handleCompactContext(sessionId, command as CompactContextCommandLike)
  }

  /**
   * Turn-volatile context (datetime, git branch, ...) for this send.
   * Attached to the user message and persisted there so history rebuilds
   * replay identical bytes. Deduplicated: when the text equals the most
   * recently injected block in this session, nothing is attached — history
   * stays append-only and the prompt-cache prefix is never rewritten.
   */
  /**
   * Resolve every reference a user message can carry: prompt/skill tokens via
   * the runtime resolver, then `@path` file mentions inlined as <file> blocks.
   *
   * The inlining lands on the model-facing copy only. contentParts is what the
   * UI renders and what edit-and-resend reconstructs the draft from, so it must
   * keep the literal `@path` — otherwise the user's own bubble fills with the
   * file body and editing the message hands back the dump instead of what they
   * typed. When the resolver returns no parts (the common case: no prompt or
   * skill tokens) the renderer falls back to `content`, which now holds the
   * inlined bodies — so a text part has to be synthesized to pin the display.
   */
  private resolveUserReferences(
    rawContent: string,
    skills: TSkill[],
    channel: string | undefined,
  ): ReturnType<StreamEnginePromptAdapter<TSkill, TContentPart>['resolveReferences']> {
    const resolved = this.runtime.prompts.resolveReferences(rawContent, { skills })
    if (!isFileMentionTrustedChannel(channel)) return resolved

    const { content, inlinedPaths } = expandFileMentions(resolved.modelContent)
    if (inlinedPaths.length === 0) return resolved

    return {
      ...resolved,
      modelContent: content,
      contentParts: resolved.contentParts
        ?? ([{ type: 'text', content: resolved.displayContent }] as unknown as TContentPart[]),
    }
  }

  private async resolveTurnContextUpdate(
    sessionId: string,
    session:
      | { messages: TMessage[]; summaryUpToMessageId?: string }
      | undefined
      | null,
  ): Promise<string | undefined> {
    const adapter = this.runtime.variables
    if (!adapter) return undefined
    try {
      // Dedupe only against messages the model still sees after compaction;
      // a block that was summarized away must not suppress re-injection.
      const visible = visibleMessagesAfterSummary(
        (session?.messages ?? []) as ReadonlyArray<{ id?: string; contextUpdate?: unknown }>,
        session?.summaryUpToMessageId,
      )
      return resolveTurnContextUpdateText(
        await adapter.buildTurnContext(sessionId),
        visible,
      )
    } catch (error) {
      this.logError('turn context update failed:', error)
      return undefined
    }
  }

  async handleSendMessage(
    sessionId: string,
    cmd: SendMessageCommandLike,
    sender: TCommandTarget,
  ): Promise<void> {
    this.sessionChannels.set(sessionId, cmd.channel || 'ipc')
    const { content: messageContent, attachments } = cmd

    try {
      const sessionForRefs = this.store.getSession(sessionId)
      const settingsForRefs = this.store.getSettings()
      const skillsForRefs = settingsForRefs.skills?.enableSkills === false
        ? []
        : this.runtime.skills.getForSession(sessionForRefs?.workingDirectory, sessionForRefs?.agentId)
      const resolvedPromptRefs = this.resolveUserReferences(messageContent, skillsForRefs, cmd.channel)
      const session = sessionForRefs
      const isFirstUserMessage = session && session.messages.filter(m => m.role === 'user').length === 0
      const isBranchFirstMessage = session?.parentSessionId && session.messages.length > 0 &&
        !session.messages.some(m => m.role === 'user' && m.timestamp > session.createdAt)

      const contextUpdate = await this.resolveTurnContextUpdate(sessionId, session)
      const userMessage = {
        id: this.createMessageId(),
        role: 'user',
        content: resolvedPromptRefs.modelContent,
        timestamp: this.now(),
        attachments,
        contentParts: resolvedPromptRefs.contentParts,
        source: cmd.source || (cmd.channel === 'voice' ? 'voice' : 'text'),
        voice: cmd.voice,
        ...(cmd.origin !== undefined ? { origin: cmd.origin } : {}),
        ...(contextUpdate !== undefined ? { contextUpdate } : {}),
      } as unknown as TMessage
      this.runtime.media.ingestMessageAttachments(
        sessionId,
        userMessage.id,
        userMessage.role,
        userMessage.attachments as TAttachment[] | undefined,
      )
      this.store.addMessage(sessionId, userMessage)

      await this.eventBus?.emit(sessionId, {
        type: 'message:user-created',
        message: userMessage,
      })

      if ((isFirstUserMessage || isBranchFirstMessage) && !cmd.suppressTitleGeneration) {
        this.generateAndApplySessionTitle(
          sessionId,
          resolvedPromptRefs.displayContent,
          session?.name || '',
        ).catch(err => this.logError('chat title generation failed:', err))
      }

      const resolved = await this.resolveProvider(
        sessionId,
        cmd.providerId
          ? {
              providerId: cmd.providerId,
              model: cmd.model,
              ...(typeof cmd.thinking === 'boolean'
                ? { thinking: cmd.thinking, thinkingEffort: cmd.thinkingEffort }
                : {}),
            }
          : undefined,
      )
      if (!resolved) return
      const { configWithApiKey, providerId, settings } = resolved

      if (!await this.maybeCompactBeforeSend(sessionId, providerId, configWithApiKey, settings)) return

      const assistantMessageId = this.createMessageId()
      const assistantMessage = {
        id: assistantMessageId,
        role: 'assistant',
        model: configWithApiKey.model,
        provider: providerId,
        content: '',
        timestamp: this.now(),
        isStreaming: true,
        thinkingStartTime: this.now(),
        toolCalls: [],
        ...(cmd.origin !== undefined ? { origin: cmd.origin } : {}),
      } as unknown as TMessage
      this.store.addMessage(sessionId, assistantMessage)

      await this.eventBus?.emit(sessionId, {
        type: 'message:assistant-created',
        message: assistantMessage,
      })

      this.log(`Starting stream: session=${sessionId}, provider=${providerId}, model=${configWithApiKey.model}`)

      const sessionForHistory = this.store.getSession(sessionId)
      const historyMessages = this.runtime.history.buildMessages(sessionForHistory?.messages || [], sessionForHistory)
      const sessionName = sessionForHistory?.name

      await this.runtime.streams.executeMessageStream({
        sender, sessionId, assistantMessageId, messageContent: resolvedPromptRefs.modelContent,
        historyMessages, configWithApiKey, providerId, settings,
        toolSettings: settings.tools, sessionName,
        voiceConversation: userMessage.source === 'voice',
        speakMode: userMessage.source === 'voice',
      })
    } catch (error) {
      const streamError = this.normalizeStreamError(error)
      this.logError('handleSendMessage error:', streamError.error)
      this.emitStreamError(sessionId, streamError.message)
    }
  }

  async handleCompactContext(
    sessionId: string,
    cmd: CompactContextCommandLike,
  ): Promise<void> {
    if (this.activeStreams.has(sessionId)) {
      await this.eventBus?.emit(sessionId, {
        type: 'context:compact-completed',
        requestId: cmd.requestId,
        success: false,
        error: 'Cannot compact while a response is streaming.',
      })
      return
    }
    if (this.activeCompactions.has(sessionId)) {
      await this.eventBus?.emit(sessionId, {
        type: 'context:compact-completed',
        requestId: cmd.requestId,
        success: false,
        error: 'Context compact is already running.',
      })
      return
    }

    const resolved = await this.resolveProvider(sessionId)
    if (!resolved) {
      await this.eventBus?.emit(sessionId, {
        type: 'context:compact-completed',
        requestId: cmd.requestId,
        success: false,
        error: 'Provider is not configured.',
      })
      return
    }

    const result = await this.runContextCompact({
      sessionId,
      providerId: resolved.providerId,
      configWithApiKey: resolved.configWithApiKey,
      settings: resolved.settings,
      keepRecentTurns: resolved.settings.chat?.contextCompactKeepRecentTurns ?? 6,
      onMessageCreated: (message: TMessage) => this.emitMessageCreated(sessionId, message),
      onMessageUpdated: (messageId: string, updates: Partial<TMessage>) => this.emitMessageUpdated(sessionId, messageId, updates),
    })

    await this.eventBus?.emit(sessionId, {
      type: 'context:compact-completed',
      requestId: cmd.requestId,
      success: result.success,
      skipped: result.skipped,
      summary: result.summary,
      error: result.error,
    })

    if (result.success && !result.skipped) {
      this.emitContextSizeUpdated(sessionId, result.retainedContextSize ?? 0)
    }
  }

  async handleEditAndResend(
    sessionId: string,
    cmd: EditAndResendCommandLike,
    sender: TCommandTarget,
  ): Promise<void> {
    this.sessionChannels.set(sessionId, cmd.channel || 'ipc')
    const { messageId, newContent } = cmd

    try {
      const sessionForRefs = this.store.getSession(sessionId)
      const settingsForRefs = this.store.getSettings()
      const skillsForRefs = settingsForRefs.skills?.enableSkills === false
        ? []
        : this.runtime.skills.getForSession(sessionForRefs?.workingDirectory, sessionForRefs?.agentId)
      const resolvedPromptRefs = this.resolveUserReferences(newContent, skillsForRefs, cmd.channel)

      const updated = this.store.updateMessageAndTruncate(sessionId, messageId, resolvedPromptRefs.modelContent, {
        contentParts: resolvedPromptRefs.contentParts ?? null,
      })
      if (!updated) {
        this.emitStreamError(sessionId, 'Message not found')
        return
      }

      const sessionAfterTruncate = this.store.getSession(sessionId)
      await this.eventBus?.emit(sessionId, {
        type: 'messages:replaced',
        messages: sessionAfterTruncate?.messages || [],
      })

      const resolved = await this.resolveProvider(
        sessionId,
        cmd.providerId ? { providerId: cmd.providerId, model: cmd.model } : undefined,
      )
      if (!resolved) return
      const { configWithApiKey, providerId, settings } = resolved

      if (!await this.maybeCompactBeforeSend(sessionId, providerId, configWithApiKey, settings)) return

      const assistantOrigin = cmd.origin ?? sessionAfterTruncate?.messages.find(m => m.id === messageId)?.origin
      const assistantMessageId = this.createMessageId()
      const assistantMessage = {
        id: assistantMessageId,
        role: 'assistant',
        model: configWithApiKey.model,
        provider: providerId,
        content: '',
        timestamp: this.now(),
        isStreaming: true,
        thinkingStartTime: this.now(),
        toolCalls: [],
        ...(assistantOrigin !== undefined ? { origin: assistantOrigin } : {}),
      } as unknown as TMessage
      this.store.addMessage(sessionId, assistantMessage)

      await this.eventBus?.emit(sessionId, {
        type: 'message:assistant-created',
        message: assistantMessage,
      })

      this.log(`Starting edit/resend stream: session=${sessionId}, provider=${providerId}`)

      const session = this.store.getSession(sessionId)
      const historyMessages = this.runtime.history.buildMessages(session?.messages || [], session)

      await this.runtime.streams.executeMessageStream({
        sender, sessionId, assistantMessageId,
        messageContent: resolvedPromptRefs.modelContent,
        historyMessages, configWithApiKey, providerId, settings,
        toolSettings: settings.tools, sessionName: session?.name,
      })
    } catch (error) {
      const streamError = this.normalizeStreamError(error)
      this.logError('handleEditAndResend error:', streamError.error)
      this.emitStreamError(sessionId, streamError.message)
    }
  }

  async handleRetryMessage(
    sessionId: string,
    cmd: RetryMessageCommandLike,
    sender: TCommandTarget,
  ): Promise<void> {
    const { messageId } = cmd

    try {
      const sessionBeforeTruncate = this.store.getSession(sessionId)
      const targetMessage = sessionBeforeTruncate?.messages.find(m => m.id === messageId)
      if (!targetMessage) {
        this.emitStreamError(sessionId, 'Message not found')
        return
      }
      if (targetMessage.role !== 'assistant') {
        this.emitStreamError(sessionId, 'Only assistant messages can be retried')
        return
      }

      const truncated = this.store.deleteMessageAndTruncate(sessionId, messageId)
      if (!truncated) {
        this.emitStreamError(sessionId, 'Message not found')
        return
      }

      const sessionAfterTruncate = this.store.getSession(sessionId)
      await this.eventBus?.emit(sessionId, {
        type: 'messages:replaced',
        messages: sessionAfterTruncate?.messages || [],
      })

      const resolved = await this.resolveProvider(
        sessionId,
        cmd.providerId ? { providerId: cmd.providerId, model: cmd.model } : undefined,
      )
      if (!resolved) return
      const { configWithApiKey, providerId, settings } = resolved

      if (!await this.maybeCompactBeforeSend(sessionId, providerId, configWithApiKey, settings)) return

      const assistantOrigin = targetMessage.origin
      const assistantMessageId = this.createMessageId()
      const assistantMessage = {
        id: assistantMessageId,
        role: 'assistant',
        model: configWithApiKey.model,
        provider: providerId,
        content: '',
        timestamp: this.now(),
        isStreaming: true,
        thinkingStartTime: this.now(),
        toolCalls: [],
        ...(assistantOrigin !== undefined ? { origin: assistantOrigin } : {}),
      } as unknown as TMessage
      this.store.addMessage(sessionId, assistantMessage)

      await this.eventBus?.emit(sessionId, {
        type: 'message:assistant-created',
        message: assistantMessage,
      })

      this.log(`Starting retry stream: session=${sessionId}, provider=${providerId}`)

      const session = this.store.getSession(sessionId)
      const historyMessages = this.runtime.history.buildMessages(session?.messages || [], session)
      const lastUserMessage = session?.messages.filter(m => m.role === 'user').pop()
      const messageContent = lastUserMessage?.content || ''

      await this.runtime.streams.executeMessageStream({
        sender, sessionId, assistantMessageId, messageContent,
        historyMessages, configWithApiKey, providerId, settings,
        toolSettings: settings.tools, sessionName: session?.name,
      })
    } catch (error) {
      const streamError = this.normalizeStreamError(error)
      this.logError('handleRetryMessage error:', streamError.error)
      this.emitStreamError(sessionId, streamError.message)
    }
  }

  private createPersistedSteeringMessage(
    sessionId: string,
    content: string,
    source: string,
    timestamp: number,
    origin?: unknown,
  ): PendingMessage {
    const session = this.store.getSession(sessionId)
    const settings = this.store.getSettings()
    const skills = settings.skills?.enableSkills === false
      ? []
      : this.runtime.skills.getForSession(session?.workingDirectory, session?.agentId)
    // Steering text arrives without its own channel field; the session's last
    // known channel is the sender it came from.
    const resolvedPromptRefs = this.resolveUserReferences(content, skills, this.getChannel(sessionId))
    const userMessage = {
      id: this.createMessageId(),
      role: 'user',
      content: resolvedPromptRefs.modelContent,
      timestamp,
      contentParts: resolvedPromptRefs.contentParts,
      source,
      // Persisted identity marker: the UI renders steering messages
      // distinctly (they interject into a running response).
      steered: true,
      ...(origin !== undefined ? { origin } : {}),
    } as unknown as TMessage

    this.store.addMessage(sessionId, userMessage)
    this.eventBus?.emit(sessionId, {
      type: 'message:user-created',
      message: userMessage,
    }).catch(err => this.logError('message:user-created emit error:', err))

    return {
      content,
      source,
      timestamp,
      id: userMessage.id,
      modelContent: resolvedPromptRefs.modelContent,
      contentParts: resolvedPromptRefs.contentParts,
      ...(origin !== undefined ? { origin } : {}),
      persisted: true,
    }
  }

  async handleResumeAfterConfirm(
    sessionId: string,
    cmd: ResumeAfterConfirmCommandLike,
    sender: TCommandTarget,
  ): Promise<void> {
    const { messageId } = cmd

    try {
      const session = this.store.getSession(sessionId)
      if (!session) {
        this.emitStreamError(sessionId, 'Session not found')
        return
      }
      const assistantMessage = session.messages.find(m => m.id === messageId)
      if (!assistantMessage) {
        this.emitStreamError(sessionId, 'Assistant message not found')
        return
      }

      // Resume with the provider/model that the paused message was already
      // created under, not whatever session/global resolves to right now —
      // the global default may have changed while the tool-permission
      // confirm dialog was pending.
      const resolved = await this.resolveProvider(
        sessionId,
        assistantMessage.provider ? { providerId: assistantMessage.provider, model: assistantMessage.model } : undefined,
      )
      if (!resolved) return
      const { configWithApiKey, providerId, settings } = resolved

      const historyMessages = this.runtime.history.buildMessages(session.messages, session)
      const historyWithoutCurrent = historyMessages.filter((_, idx) => {
        const msgCount = historyMessages.length
        const message = historyMessages[idx] as { role?: string }
        return idx !== msgCount - 1 || message.role !== 'assistant'
      })

      const voiceConversation = [...session.messages]
        .reverse()
        .find(message => message.role === 'user')?.source === 'voice'

      this.eventBus?.emit(sessionId, { type: 'content:continuation', turnIndex: 1 })
        .catch(err => this.logError('continuation emit error:', err))

      const abortController = new AbortController()
      this.registerController(sessionId, abortController)

      const ctx = {
        sender, sessionId,
        assistantMessageId: messageId,
        abortSignal: abortController.signal,
        settings, providerConfig: configWithApiKey,
        providerId, toolSettings: settings.tools,
        steeringQueue: this.getSteeringQueue(sessionId),
        followUpQueue: this.getFollowUpQueue(sessionId),
        speakMode: voiceConversation,
      }

      try {
        this.log('Resuming agent loop after confirmation')
        const requestStartTime = this.now()
        const resumeHistoryMessages = this.runtime.history.buildResumeAfterToolConfirmation(historyWithoutCurrent, assistantMessage)

        const result = await this.runtime.streams.executeAgentLoopStreamGeneration(
          ctx,
          resumeHistoryMessages,
          session.name,
          {
            initialContent: {
              content: assistantMessage.content || '',
              reasoning: assistantMessage.reasoning || '',
            },
          },
        )

        const requestDuration = (this.now() - requestStartTime) / 1000
        this.log(`Agent loop resume completed in ${requestDuration.toFixed(2)}s`)

        if (!result.pausedForConfirmation) {
          this.removeController(sessionId)
        }
      } catch (error) {
        const streamError = this.normalizeStreamError(error)
        const isAborted = streamError.isAbortError || abortController.signal.aborted
        if (isAborted) {
          this.eventBus?.emit(sessionId, { type: 'stream:aborted', reason: 'User cancelled' })
            .catch(err => this.logError('stream:aborted emit error:', err))
        } else {
          this.logError('Resume streaming error:', streamError.error)
          this.store.deleteMessage(sessionId, messageId)
          const errorMessage = {
            id: `error-${this.now()}`,
            role: 'error',
            content: streamError.message,
            timestamp: this.now(),
            errorDetails: streamError.details,
          } as unknown as TMessage
          this.store.addMessage(sessionId, errorMessage)
          this.eventBus?.emit(sessionId, {
            type: 'stream:error',
            data: { error: streamError.message, errorDetails: streamError.details },
          }).catch(err => this.logError('stream:error emit error:', err))
        }
        this.removeController(sessionId)
      }
    } catch (error) {
      const streamError = this.normalizeStreamError(error)
      this.logError('handleResumeAfterConfirm error:', streamError.error)
      this.emitStreamError(sessionId, streamError.message || 'Resume error')
    }
  }

  private async generateAndApplySessionTitle(
    sessionId: string,
    displayContent: string,
    expectedSessionName: string,
  ): Promise<void> {
    const requestId = ++this.titleGenerationSeq
    this.sessionTitleGenerations.set(sessionId, requestId)

    try {
      const generatedTitle = await this.generateSessionTitle(sessionId, displayContent)
      const title = normalizeSessionTitle(generatedTitle) || generateTitleFromMessage(displayContent)
      if (!title) return

      if (this.sessionTitleGenerations.get(sessionId) !== requestId) return

      const session = this.store.getSession(sessionId)
      if (!session) return
      if (!canApplyGeneratedSessionTitle(session.name, expectedSessionName)) {
        return
      }
      if (session.name === title) return

      this.store.renameSession(sessionId, title)
      await this.eventBus?.emit(sessionId, {
        type: 'session:renamed',
        name: title,
      })
    } catch (error) {
      const fallbackTitle = generateTitleFromMessage(displayContent)
      const session = this.store.getSession(sessionId)
      if (
        session &&
        fallbackTitle &&
        this.sessionTitleGenerations.get(sessionId) === requestId &&
        canApplyGeneratedSessionTitle(session.name, expectedSessionName)
      ) {
        this.store.renameSession(sessionId, fallbackTitle)
        await this.eventBus?.emit(sessionId, {
          type: 'session:renamed',
          name: fallbackTitle,
        })
      }
      this.logError('Falling back to local chat title:', error)
    } finally {
      if (this.sessionTitleGenerations.get(sessionId) === requestId) {
        this.sessionTitleGenerations.delete(sessionId)
      }
    }
  }

  private async generateSessionTitle(sessionId: string, displayContent: string): Promise<string> {
    const settings = this.store.getSettings()
    const { providerId, providerConfig, model } = resolveToolCallModel(
      settings as unknown as StreamEngineSettingsWithProviders<{ model?: string; selectedModels?: string[] }>,
    )
    if (!providerId || !providerConfig || !model) {
      return generateTitleFromMessage(displayContent)
    }

    if (!this.runtime.provider.isSupported(providerId)) {
      return generateTitleFromMessage(displayContent)
    }

    const authContext = await this.runtime.provider.resolveAuth(providerId, providerConfig as TProviderConfig)
    if (!authContext) {
      return generateTitleFromMessage(displayContent)
    }

    const apiType = this.runtime.provider.getApiType(settings, providerId)
    const providerConfigRecord = asRecord(providerConfig)
    return this.runtime.provider.generateTitle(
      providerId,
      {
        ...providerConfigRecord,
        apiKey: authKind(authContext) === 'api-key' ? authApiKey(authContext) : '',
        authContext,
        oauthToken: authKind(authContext) === 'oauth' ? authToken(authContext) : providerConfigRecord.oauthToken,
        baseUrl: providerConfigRecord.baseUrl,
        model,
        apiType,
      },
      displayContent,
      {
        thinking: settings.tools?.toolCallModel?.thinking === true,
        thinkingEffort: settings.tools?.toolCallModel?.thinkingEffort,
        debugSessionId: sessionId,
      },
    )
  }

  private async resolveProvider(
    sessionId: string,
    override?: { providerId?: string; model?: string; thinking?: boolean; thinkingEffort?: string } | null,
  ): Promise<{
    configWithApiKey: TProviderConfigWithKey
    providerId: string
    settings: TSettings
  } | null> {
    const settings = this.store.getSettings()
    const { providerId, providerConfig, model: effectiveModel } = this.runtime.provider.getEffectiveConfig(settings, sessionId, override)

    const authContext = await this.runtime.provider.resolveAuth(providerId, providerConfig)
    if (!authContext) {
      const isOAuth = this.runtime.provider.requiresOAuth(providerId)
      this.emitStreamError(sessionId, isOAuth
        ? `Not logged in to ${providerId}. Please login in settings.`
        : 'API Key not configured. Please configure your AI settings.')
      return null
    }

    if (!this.runtime.provider.isSupported(providerId)) {
      this.emitStreamError(sessionId, `Unsupported provider: ${providerId}`)
      return null
    }

    const providerConfigRecord = asRecord(providerConfig)
    const selectedModels = Array.isArray(providerConfigRecord.selectedModels)
      ? providerConfigRecord.selectedModels.filter((model): model is string => typeof model === 'string')
      : [effectiveModel]

    const configWithApiKey = {
      ...providerConfigRecord,
      model: effectiveModel,
      selectedModels,
      apiKey: authKind(authContext) === 'api-key' ? authApiKey(authContext) : '',
      authContext,
      oauthToken: authKind(authContext) === 'oauth' ? authToken(authContext) : providerConfigRecord.oauthToken,
    } as TProviderConfigWithKey

    return { configWithApiKey, providerId, settings }
  }

  private async maybeCompactBeforeSend(
    sessionId: string,
    providerId: string,
    configWithApiKey: TProviderConfigWithKey,
    settings: TSettings,
  ): Promise<boolean> {
    if (isCoreExternalAgentProvider(providerId)) return true

    const compactSettings = settings.chat
    if (compactSettings?.contextCompactEnabled === false) return true
    if (this.activeCompactions.has(sessionId)) {
      this.emitStreamError(sessionId, 'Context compact is already running. Please wait for it to finish before sending another message.')
      return false
    }

    let modelContextLength = 128000
    let reservedOutputTokens = settings.chat?.maxTokens || 4096
    try {
      modelContextLength = await this.runtime.models.getModelContextLength(configWithApiKey.model, providerId)
      const modelMaxOutputTokens = await this.runtime.models.getModelMaxOutputTokens(configWithApiKey.model, providerId)
      const perModelOverride = configWithApiKey.maxOutputByModel?.[configWithApiKey.model]
      const halfDefault = modelMaxOutputTokens > 0 ? Math.max(1, Math.floor(modelMaxOutputTokens / 2)) : 0
      const requested = perModelOverride ?? (halfDefault > 0 ? halfDefault : reservedOutputTokens)
      reservedOutputTokens = modelMaxOutputTokens > 0 ? Math.min(requested, modelMaxOutputTokens) : requested
    } catch (error) {
      this.logError('Failed to resolve model context length for compact:', error)
    }

    const configuredKeepTurns = compactSettings?.contextCompactKeepRecentTurns ?? 6
    let keepRecentTurns = configuredKeepTurns

    for (let pass = 1; pass <= configuredKeepTurns; pass++) {
      const latestSession = this.store.getSession(sessionId)
      if (!latestSession) return true
      const historyMessages = this.runtime.history.buildMessages(latestSession.messages, latestSession)
      const usage = buildContextUsageSnapshot({
        session: latestSession,
        historyMessages: historyMessages as unknown[],
        modelContextLength,
        thresholdPercent: compactSettings?.contextCompactThreshold ?? 85,
        reservedOutputTokens,
        providerId,
        model: configWithApiKey.model,
      })
      if (
        latestSession.contextSize !== usage.visibleInputTokens ||
        latestSession.lastInputTokens !== usage.visibleInputTokens
      ) {
        this.emitContextSizeUpdated(sessionId, usage.visibleInputTokens)
      }

      if (this.runtime.compaction.shouldSkipAutoCompactForProviderUsageMismatch({
        providerId,
        session: latestSession,
        modelContextLength,
        inputTokens: usage.visibleInputTokens,
      })) {
        this.logError('Skipping auto compact because provider usage exceeds registered model context length:', {
          sessionId,
          providerId,
          model: configWithApiKey.model,
          contextSize: usage.visibleInputTokens,
          modelContextLength,
          source: usage.source,
        })
        return true
      }

      const reason = this.runtime.compaction.getContextCompactReason({
        session: latestSession,
        modelContextLength,
        thresholdPercent: compactSettings?.contextCompactThreshold ?? 85,
        reservedOutputTokens,
        inputTokens: usage.visibleInputTokens,
      })
      if (!reason) return true

      this.log(`[ContextUsage] decision ${JSON.stringify({
        sessionId,
        providerId,
        model: configWithApiKey.model,
        visibleInputTokens: usage.visibleInputTokens,
        effectiveInputTokens: usage.effectiveInputTokens,
        providerInputTokens: usage.providerInputTokens,
        requestEstimatedInputTokens: usage.requestEstimatedInputTokens,
        modelContextLength: usage.modelContextLength,
        reservedOutputTokens: usage.reservedOutputTokens,
        thresholdPercent: usage.thresholdPercent,
        reason,
        source: usage.source,
        historyMessageCount: usage.details.historyMessageCount,
        summaryUsed: usage.details.summaryUsed,
      })}`)
      this.log(`Auto compact triggered before send session=${sessionId} model=${configWithApiKey.model} reason=${reason}`)

      const result = await this.runContextCompact({
        sessionId,
        providerId,
        configWithApiKey,
        settings,
        keepRecentTurns,
        onMessageCreated: (message: TMessage) => this.emitMessageCreated(sessionId, message),
        onMessageUpdated: (messageId: string, updates: Partial<TMessage>) => this.emitMessageUpdated(sessionId, messageId, updates),
      })

      await this.eventBus?.emit(sessionId, {
        type: 'context:compact-completed',
        success: result.success,
        skipped: result.skipped,
        summary: result.summary,
        error: result.error,
      })

      if (result.success && !result.skipped) {
        this.emitContextSizeUpdated(sessionId, result.retainedContextSize ?? 0)
      }

      if (!result.success) {
        if (result.error === 'Context compact is already running.') {
          this.emitStreamError(sessionId, 'Context compact is already running. Please wait for it to finish before sending another message.')
          return false
        }
        this.logError('Auto compact failed; continuing send:', result.error)
        return true
      }

      if (result.skipped) {
        keepRecentTurns--
        if (keepRecentTurns <= 0) break
      } else if (reason === 'hard-limit') {
        keepRecentTurns--
        if (keepRecentTurns <= 0) break
      } else {
        return true
      }
    }

    const latestSession = this.store.getSession(sessionId)
    if (!latestSession) return true
    const finalHistoryMessages = this.runtime.history.buildMessages(latestSession.messages, latestSession)
    const finalUsage = buildContextUsageSnapshot({
      session: latestSession,
      historyMessages: finalHistoryMessages as unknown[],
      modelContextLength,
      thresholdPercent: compactSettings?.contextCompactThreshold ?? 85,
      reservedOutputTokens,
      providerId,
      model: configWithApiKey.model,
    })
    if (
      latestSession.contextSize !== finalUsage.visibleInputTokens ||
      latestSession.lastInputTokens !== finalUsage.visibleInputTokens
    ) {
      this.emitContextSizeUpdated(sessionId, finalUsage.visibleInputTokens)
    }
    const finalReason = this.runtime.compaction.getContextCompactReason({
      session: latestSession,
      modelContextLength,
      thresholdPercent: compactSettings?.contextCompactThreshold ?? 85,
      reservedOutputTokens,
      inputTokens: finalUsage.visibleInputTokens,
    })
    if (finalReason === 'hard-limit') {
      const lastKnownInputTokens = finalUsage.visibleInputTokens
      const message = [
        'Context is still too large after compacting down to the latest turn.',
        `Last known provider input ${lastKnownInputTokens.toLocaleString()} + reserved output ${reservedOutputTokens.toLocaleString()} exceeds model context ${modelContextLength.toLocaleString()}.`,
        'Reduce the latest message/tool context or lower max output tokens before retrying.',
      ].join(' ')
      this.emitStreamError(sessionId, message)
      return false
    }

    return true
  }

  private async runContextCompact(options: unknown): Promise<TCompactResult> {
    const sessionId = asRecord(options).sessionId
    if (typeof sessionId !== 'string') {
      return {
        success: false,
        error: 'Session id is required.',
      } as TCompactResult
    }
    if (this.activeCompactions.has(sessionId)) {
      return {
        success: false,
        error: 'Context compact is already running.',
      } as TCompactResult
    }

    this.activeCompactions.add(sessionId)
    try {
      return await this.runtime.compaction.compactSessionContext(options)
    } finally {
      this.activeCompactions.delete(sessionId)
    }
  }

  protected emitStreamError(sessionId: string, error: string): void {
    if (this.eventBus) {
      this.eventBus.emit(sessionId, {
        type: 'stream:error',
        data: { error },
      }).catch(err => this.logError('stream:error emit failed:', err))
    }
  }

  private async emitMessageCreated(sessionId: string, message: TMessage): Promise<void> {
    await this.eventBus?.emit(sessionId, {
      type: 'message:created',
      message,
    })
  }

  private async emitMessageUpdated(
    sessionId: string,
    messageId: string,
    updates: Partial<TMessage>,
  ): Promise<void> {
    await this.eventBus?.emit(sessionId, {
      type: 'message:updated',
      messageId,
      updates,
    })
  }

  private emitContextSizeUpdated(sessionId: string, contextSize: number): void {
    this.eventBus?.emit(sessionId, {
      type: 'context:size-updated',
      contextSize,
    }).catch(err => this.logError('context:size-updated emit failed:', err))
  }

  private normalizeStreamError(error: unknown): CoreStreamErrorInfo {
    const normalized = error instanceof Error ? error : new Error(String(error))
    return this.options.normalizeStreamError?.(normalized) ?? normalizeErrorDefault(normalized)
  }
}
