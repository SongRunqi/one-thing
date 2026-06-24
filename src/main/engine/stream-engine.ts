/**
 * StreamEngine — Single owner of active stream lifecycle.
 *
 * Fully event-driven: commands arrive via EventBus, messages are created
 * and persisted here, events are emitted back through EventBus for
 * subscribers (IPCBridge → renderer, Permission, etc.).
 *
 * Command flow:
 *   Renderer emitCommand() → EventBus → StreamEngine.handle*()
 *     → store.addMessage() (persist)
 *     → EventBus.emit('message:*-created') (notify renderer)
 *     → executeMessageStream() (start AI streaming)
 */

import type { WebContents } from 'electron'
import type { PermissionMode } from '../../shared/ipc.js'
import { v4 as uuidv4 } from 'uuid'
import type { AppSettings, ChatMessage, MessageAttachment } from '../../shared/ipc.js'
import type { SendMessageCommand, EditAndResendCommand, ResumeAfterConfirmCommand, RetryMessageCommand, InjectSteeringCommand, InjectFollowUpCommand, CompactContextCommand, AbortCommand } from '../../shared/events/session-commands.js'
import type { EventBus } from '../events/event-bus.js'
import { Permission } from '../permission/index.js'
import * as store from '../store.js'
import {
  getEffectiveProviderConfig,
  resolveProviderAuth,
  extractErrorDetails,
  type ProviderErrorDetails,
  getProviderApiType,
} from './stream/provider-helpers.js'
import { isProviderSupported, requiresOAuth, generateChatTitle } from '../providers/index.js'
import { buildHistoryMessages } from './stream/message-helpers.js'
import { buildResumeHistoryAfterToolConfirmation } from './stream/resume-history.js'
import { executeMessageStream, type ProviderConfigWithKey } from './stream/stream-executor.js'
import { type StreamContext } from './stream/stream-processor.js'
import {
  executeAgentLoopStreamGeneration,
} from './stream/agent-loop-executor.js'
import { getSkillsForSession } from '../ipc/skills.js'
import { mediaLibraryService } from '../media/media-library-service.js'
import * as modelRegistry from '../providers/model-registry.js'
import { PendingMessageQueue } from './stream/message-queue.js'
import { compactSessionContext, getContextCompactReason, shouldSkipAutoCompactForProviderUsageMismatch, type ContextCompactResult } from './context-compact.js'
import { resolvePromptReferences } from '../prompts/resolver.js'

/**
 * Generate a short title from user message content
 */
function generateTitleFromMessage(content: string, maxLength: number = 30): string {
  const cleaned = content.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= maxLength) return cleaned
  return cleaned.slice(0, maxLength).trim() + '...'
}

interface StreamErrorInfo {
  error: Error
  message: string
  details?: string
  isAbortError: boolean
}

function normalizeStreamError(error: Error & Partial<ProviderErrorDetails>): StreamErrorInfo {
  const providerDetails: ProviderErrorDetails = {
    message: error.message,
    stack: error.stack,
    responseBody: error.responseBody,
    data: error.data,
  }
  return {
    error,
    message: error.message || 'Streaming error',
    details: extractErrorDetails(providerDetails),
    isAbortError: error.name === 'AbortError',
  }
}

export class StreamEngine {
  private activeStreams = new Map<string, AbortController>()
  private activeCompactions = new Set<string>()
  private sessionChannels = new Map<string, string>()
  private sessionTitleGenerations = new Map<string, number>()
  private titleGenerationSeq = 0
  private eventBus: EventBus | null = null
  private sender: WebContents | null = null
  private unsubs: Array<() => void> = []

  /** Per-session steering message queues (injected mid-stream after each turn) */
  private steeringQueues = new Map<string, PendingMessageQueue>()
  /** Per-session follow-up message queues (injected only after agent stops) */
  private followUpQueues = new Map<string, PendingMessageQueue>()

  getChannel(sessionId: string): string {
    return this.sessionChannels.get(sessionId) || 'ipc'
  }

  getPermissionMode(sessionId: string): PermissionMode {
    const session = store.getSession(sessionId)
    return session?.permissionMode ?? store.getSettings().tools?.permissionMode ?? 'normal'
  }

  /** Get or create the steering queue for a session */
  getSteeringQueue(sessionId: string): PendingMessageQueue {
    let q = this.steeringQueues.get(sessionId)
    if (!q) {
      q = new PendingMessageQueue('one-at-a-time')
      this.steeringQueues.set(sessionId, q)
    }
    return q
  }

  /** Get or create the follow-up queue for a session */
  getFollowUpQueue(sessionId: string): PendingMessageQueue {
    let q = this.followUpQueues.get(sessionId)
    if (!q) {
      q = new PendingMessageQueue('all')
      this.followUpQueues.set(sessionId, q)
    }
    return q
  }

  /**
   * Inject a steering message that will be processed after the current turn ends.
   * This interrupts the agent's current work — use for urgent guidance.
   */
  steerMessage(sessionId: string, content: string, source = 'api'): void {
    const q = this.getSteeringQueue(sessionId)
    q.enqueue({ content, source, timestamp: Date.now() })
    console.log(`[StreamEngine] Steering queued for ${sessionId.slice(0, 8)}: "${content.slice(0, 60)}..."`)
  }

  /**
   * Inject a follow-up message that waits until the agent finishes.
   * This doesn't interrupt — the agent completes its current work first.
   */
  followUpMessage(sessionId: string, content: string, source = 'api'): void {
    const q = this.getFollowUpQueue(sessionId)
    q.enqueue({ content, source, timestamp: Date.now() })
    console.log(`[StreamEngine] Follow-up queued for ${sessionId.slice(0, 8)}: "${content.slice(0, 60)}..."`)
  }

  setEventBus(eventBus: EventBus): void {
    this.eventBus = eventBus
    this.subscribeToCommands(eventBus)
  }

  bind(sender: WebContents): void {
    this.sender = sender
    sender.on('destroyed', () => { this.sender = null })
  }

  hasBoundSender(): boolean {
    return Boolean(this.sender && !this.sender.isDestroyed())
  }

  private subscribeToCommands(eventBus: EventBus): void {
    this.unsubs.push(
      eventBus.onAnySession('command:send-message', (envelope) => {
        if (!this.sender) return
        this.handleSendMessage(envelope.sessionId, envelope.event as SendMessageCommand, this.sender)
          .catch(err => console.error('[StreamEngine] command:send-message error:', err))
      }, 'StreamEngine'),
      eventBus.onAnySession('command:edit-and-resend', (envelope) => {
        if (!this.sender) return
        this.handleEditAndResend(envelope.sessionId, envelope.event as EditAndResendCommand, this.sender)
          .catch(err => console.error('[StreamEngine] command:edit-and-resend error:', err))
      }, 'StreamEngine'),
      eventBus.onAnySession('command:retry-message', (envelope) => {
        if (!this.sender) return
        this.handleRetryMessage(envelope.sessionId, envelope.event as RetryMessageCommand, this.sender)
          .catch(err => console.error('[StreamEngine] command:retry-message error:', err))
      }, 'StreamEngine'),
      eventBus.onAnySession('command:compact-context', (envelope) => {
        this.handleCompactContext(envelope.sessionId, envelope.event as CompactContextCommand)
          .catch(err => console.error('[StreamEngine] command:compact-context error:', err))
      }, 'StreamEngine'),
      eventBus.onAnySession('command:abort', (envelope) => {
        this.handleAbort(envelope.sessionId, envelope.event as AbortCommand)
      }, 'StreamEngine'),
      eventBus.onAnySession('command:resume-after-confirm', (envelope) => {
        if (!this.sender) return
        this.handleResumeAfterConfirm(envelope.sessionId, envelope.event as ResumeAfterConfirmCommand, this.sender)
          .catch(err => console.error('[StreamEngine] command:resume-after-confirm error:', err))
      }, 'StreamEngine'),
      eventBus.onAnySession('command:inject-steering', (envelope) => {
        const cmd = envelope.event as InjectSteeringCommand
        this.steerMessage(envelope.sessionId, cmd.content, cmd.source || 'eventbus')
      }, 'StreamEngine'),
      eventBus.onAnySession('command:inject-followup', (envelope) => {
        const cmd = envelope.event as InjectFollowUpCommand
        this.followUpMessage(envelope.sessionId, cmd.content, cmd.source || 'eventbus')
      }, 'StreamEngine'),
    )
  }

  // ── Command Handlers ───────────────────────────

  handleAbort(sessionId: string, cmd: AbortCommand = { type: 'command:abort' }): boolean {
    return this.abort(sessionId, cmd.reason)
  }

  /**
   * Handle send-message command.
   * Creates user + assistant messages, emits events, starts streaming.
   */
  async handleSendMessage(
    sessionId: string,
    cmd: SendMessageCommand,
    sender: WebContents
  ): Promise<void> {
    this.sessionChannels.set(sessionId, cmd.channel || 'ipc')
    const { content: messageContent, attachments } = cmd

    try {
      // 1. Create and persist user message
      const sessionForRefs = store.getSession(sessionId)
      const settingsForRefs = store.getSettings()
      const skillsForRefs = settingsForRefs.skills?.enableSkills === false
        ? []
        : getSkillsForSession(sessionForRefs?.workingDirectory)
      const resolvedPromptRefs = resolvePromptReferences(messageContent, { skills: skillsForRefs })
      const session = sessionForRefs
      const isFirstUserMessage = session && session.messages.filter(m => m.role === 'user').length === 0
      const isBranchFirstMessage = session?.parentSessionId && session.messages.length > 0 &&
        !session.messages.some(m => m.role === 'user' && m.timestamp > session.createdAt)

      const userMessage: ChatMessage = {
        id: uuidv4(),
        role: 'user',
        content: resolvedPromptRefs.modelContent,
        timestamp: Date.now(),
        attachments: attachments as MessageAttachment[] | undefined,
        contentParts: resolvedPromptRefs.contentParts,
        source: cmd.source || (cmd.channel === 'voice' ? 'voice' : 'text'),
        voice: cmd.voice,
      }
      mediaLibraryService.ingestMessageAttachments(
        sessionId,
        userMessage.id,
        userMessage.role,
        userMessage.attachments,
      )
      store.addMessage(sessionId, userMessage)

      // Emit user message created event
      await this.eventBus?.emit(sessionId, {
        type: 'message:user-created',
        message: userMessage,
      })

      // 2. Auto-rename session on first message using the configured utility model.
      if (isFirstUserMessage || isBranchFirstMessage) {
        this.generateAndApplySessionTitle(
          sessionId,
          resolvedPromptRefs.displayContent,
          session?.name || '',
        ).catch(err => console.warn('[StreamEngine] chat title generation failed:', err))
      }

      // 3. Resolve provider
      const resolved = await this.resolveProvider(sessionId)
      if (!resolved) return
      const { configWithApiKey, providerId, settings } = resolved

      if (!await this.maybeCompactBeforeSend(sessionId, providerId, configWithApiKey, settings)) return

      // 4. Create and persist assistant message
      const assistantMessageId = uuidv4()
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        model: configWithApiKey.model,
        provider: providerId,
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
        thinkingStartTime: Date.now(),
        toolCalls: [],
      }
      store.addMessage(sessionId, assistantMessage)

      // Emit assistant message created event
      await this.eventBus?.emit(sessionId, {
        type: 'message:assistant-created',
        message: assistantMessage,
      })

      // 5. Start streaming
      console.log(`[StreamEngine] Starting stream: session=${sessionId}, provider=${providerId}, model=${configWithApiKey.model}`)

      const sessionForHistory = store.getSession(sessionId)
      const historyMessages = buildHistoryMessages(sessionForHistory?.messages || [], sessionForHistory)
      const sessionName = sessionForHistory?.name

      await executeMessageStream({
        sender, sessionId, assistantMessageId, messageContent: resolvedPromptRefs.modelContent,
        historyMessages, configWithApiKey, providerId, settings,
        toolSettings: settings.tools, sessionName,
        voiceConversation: userMessage.source === 'voice',
        speakMode: userMessage.source === 'voice',
      })
    } catch (error) {
      const streamError = normalizeStreamError(error instanceof Error ? error : new Error(String(error)))
      console.error('[StreamEngine] handleSendMessage error:', streamError.error)
      this.emitStreamError(sessionId, streamError.message)
    }
  }

  async handleCompactContext(
    sessionId: string,
    cmd: CompactContextCommand,
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
      onMessageCreated: message => this.emitMessageCreated(sessionId, message),
      onMessageUpdated: (messageId, updates) => this.emitMessageUpdated(sessionId, messageId, updates),
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

  /**
   * Handle edit-and-resend command.
   * Truncates history, creates new assistant message, starts streaming.
   */
  async handleEditAndResend(
    sessionId: string,
    cmd: EditAndResendCommand,
    sender: WebContents
  ): Promise<void> {
    this.sessionChannels.set(sessionId, cmd.channel || 'ipc')
    const { messageId, newContent } = cmd

    try {
      const sessionForRefs = store.getSession(sessionId)
      const settingsForRefs = store.getSettings()
      const skillsForRefs = settingsForRefs.skills?.enableSkills === false
        ? []
        : getSkillsForSession(sessionForRefs?.workingDirectory)
      const resolvedPromptRefs = resolvePromptReferences(newContent, { skills: skillsForRefs })
      // 1. Truncate messages after the edited one and update content
      const updated = store.updateMessageAndTruncate(sessionId, messageId, resolvedPromptRefs.modelContent, {
        contentParts: resolvedPromptRefs.contentParts ?? null,
      })
      if (!updated) {
        this.emitStreamError(sessionId, 'Message not found')
        return
      }

      // Notify renderer of message list change
      const sessionAfterTruncate = store.getSession(sessionId)
      await this.eventBus?.emit(sessionId, {
        type: 'messages:replaced',
        messages: sessionAfterTruncate?.messages || [],
      })

      // 2. Resolve provider
      const resolved = await this.resolveProvider(sessionId)
      if (!resolved) return
      const { configWithApiKey, providerId, settings } = resolved

      if (!await this.maybeCompactBeforeSend(sessionId, providerId, configWithApiKey, settings)) return

      // 3. Create and persist new assistant message
      const assistantMessageId = uuidv4()
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        model: configWithApiKey.model,
        provider: providerId,
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
        thinkingStartTime: Date.now(),
        toolCalls: [],
      }
      store.addMessage(sessionId, assistantMessage)

      await this.eventBus?.emit(sessionId, {
        type: 'message:assistant-created',
        message: assistantMessage,
      })

      // 4. Start streaming
      console.log(`[StreamEngine] Starting edit/resend stream: session=${sessionId}, provider=${providerId}`)

      const session = store.getSession(sessionId)
      const historyMessages = buildHistoryMessages(session?.messages || [], session)

      await executeMessageStream({
        sender, sessionId, assistantMessageId,
        messageContent: resolvedPromptRefs.modelContent,
        historyMessages, configWithApiKey, providerId, settings,
        toolSettings: settings.tools, sessionName: session?.name,
      })
    } catch (error) {
      const streamError = normalizeStreamError(error instanceof Error ? error : new Error(String(error)))
      console.error('[StreamEngine] handleEditAndResend error:', streamError.error)
      this.emitStreamError(sessionId, streamError.message)
    }
  }

  /**
   * Handle retry-message command (regenerate).
   * Truncates from the old assistant message, creates new one, starts streaming.
   */
  async handleRetryMessage(
    sessionId: string,
    cmd: RetryMessageCommand,
    sender: WebContents
  ): Promise<void> {
    const { messageId } = cmd

    try {
      // 1. Delete the old assistant response and any later conversation.
      const sessionBeforeTruncate = store.getSession(sessionId)
      const targetMessage = sessionBeforeTruncate?.messages.find(m => m.id === messageId)
      if (!targetMessage) {
        this.emitStreamError(sessionId, 'Message not found')
        return
      }
      if (targetMessage.role !== 'assistant') {
        this.emitStreamError(sessionId, 'Only assistant messages can be retried')
        return
      }

      const truncated = store.deleteMessageAndTruncate(sessionId, messageId)
      if (!truncated) {
        this.emitStreamError(sessionId, 'Message not found')
        return
      }

      const sessionAfterTruncate = store.getSession(sessionId)
      await this.eventBus?.emit(sessionId, {
        type: 'messages:replaced',
        messages: sessionAfterTruncate?.messages || [],
      })

      // 2. Resolve provider
      const resolved = await this.resolveProvider(sessionId)
      if (!resolved) return
      const { configWithApiKey, providerId, settings } = resolved

      if (!await this.maybeCompactBeforeSend(sessionId, providerId, configWithApiKey, settings)) return

      // 3. Create new assistant message
      const assistantMessageId = uuidv4()
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        model: configWithApiKey.model,
        provider: providerId,
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
        thinkingStartTime: Date.now(),
        toolCalls: [],
      }
      store.addMessage(sessionId, assistantMessage)

      await this.eventBus?.emit(sessionId, {
        type: 'message:assistant-created',
        message: assistantMessage,
      })

      // 4. Start streaming
      console.log(`[StreamEngine] Starting retry stream: session=${sessionId}, provider=${providerId}`)

      const session = store.getSession(sessionId)
      const historyMessages = buildHistoryMessages(session?.messages || [], session)

      // Get the last user message content for the prompt
      const lastUserMessage = session?.messages.filter(m => m.role === 'user').pop()
      const messageContent = lastUserMessage?.content || ''

      await executeMessageStream({
        sender, sessionId, assistantMessageId, messageContent,
        historyMessages, configWithApiKey, providerId, settings,
        toolSettings: settings.tools, sessionName: session?.name,
      })
    } catch (error) {
      const streamError = normalizeStreamError(error instanceof Error ? error : new Error(String(error)))
      console.error('[StreamEngine] handleRetryMessage error:', streamError.error)
      this.emitStreamError(sessionId, streamError.message)
    }
  }

  /**
   * Handle resume-after-confirm command.
   * Reconstructs conversation with tool calls/results, resumes streaming.
   */
  async handleResumeAfterConfirm(
    sessionId: string,
    cmd: ResumeAfterConfirmCommand,
    sender: WebContents
  ): Promise<void> {
    const { messageId } = cmd

    try {
      const resolved = await this.resolveProvider(sessionId)
      if (!resolved) return
      const { configWithApiKey, providerId, settings } = resolved

      const session = store.getSession(sessionId)
      if (!session) {
        this.emitStreamError(sessionId, 'Session not found')
        return
      }
      const assistantMessage = session.messages.find(m => m.id === messageId)
      if (!assistantMessage) {
        this.emitStreamError(sessionId, 'Assistant message not found')
        return
      }
      const historyMessages = buildHistoryMessages(session.messages, session)
      const historyWithoutCurrent = historyMessages.filter((_, idx) => {
        const msgCount = historyMessages.length
        return idx !== msgCount - 1 || historyMessages[idx].role !== 'assistant'
      })

      const voiceConversation = [...session.messages]
        .reverse()
        .find(message => message.role === 'user')?.source === 'voice'

      this.eventBus?.emit(sessionId, { type: 'content:continuation', turnIndex: 1 })
        .catch(err => console.error('[StreamEngine] continuation emit error:', err))

      const abortController = new AbortController()
      this.registerController(sessionId, abortController)

      const ctx: StreamContext = {
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
        console.log('[StreamEngine] Resuming agent loop after confirmation')
        const requestStartTime = Date.now()
        const resumeHistoryMessages = buildResumeHistoryAfterToolConfirmation(historyWithoutCurrent, assistantMessage)

        const result = await executeAgentLoopStreamGeneration(
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

        const requestDuration = (Date.now() - requestStartTime) / 1000
        console.log(`[StreamEngine] Agent loop resume completed in ${requestDuration.toFixed(2)}s`)

        if (!result.pausedForConfirmation) {
          this.removeController(sessionId)
        }
      } catch (error) {
        const streamError = normalizeStreamError(error instanceof Error ? error : new Error(String(error)))
        const isAborted = streamError.isAbortError || abortController.signal.aborted
        if (isAborted) {
          this.eventBus?.emit(sessionId, { type: 'stream:aborted', reason: 'User cancelled' })
            .catch(err => console.error('[StreamEngine] stream:aborted emit error:', err))
        } else {
          console.error('[StreamEngine] Resume streaming error:', streamError.error)
          store.deleteMessage(sessionId, messageId)
          const errorMessage: ChatMessage = {
            id: `error-${Date.now()}`, role: 'error',
            content: streamError.message, timestamp: Date.now(),
            errorDetails: streamError.details,
          }
          store.addMessage(sessionId, errorMessage)
          this.eventBus?.emit(sessionId, {
            type: 'stream:error',
            data: { error: streamError.message, errorDetails: streamError.details },
          }).catch(err => console.error('[StreamEngine] stream:error emit error:', err))
        }
        this.removeController(sessionId)
      }
    } catch (error) {
      const streamError = normalizeStreamError(error instanceof Error ? error : new Error(String(error)))
      console.error('[StreamEngine] handleResumeAfterConfirm error:', streamError.error)
      this.emitStreamError(sessionId, streamError.message || 'Resume error')
    }
  }

  // ── Lifecycle Management ───────────────────────

  getActiveSessionIds(): string[] {
    return Array.from(this.activeStreams.keys())
  }

  getController(sessionId: string): AbortController | undefined {
    return this.activeStreams.get(sessionId)
  }

  registerController(sessionId: string, controller: AbortController): void {
    const existing = this.activeStreams.get(sessionId)
    if (existing) {
      console.log(`[StreamEngine] Aborting previous stream for session: ${sessionId}`)
      existing.abort()
    }
    this.activeStreams.set(sessionId, controller)
  }

  removeController(sessionId: string): void {
    this.activeStreams.delete(sessionId)
    this.sessionChannels.delete(sessionId)
  }

  abort(sessionId: string, reason = 'User cancelled'): boolean {
    const controller = this.activeStreams.get(sessionId)
    if (controller) {
      console.log(`[StreamEngine] Aborting stream for session: ${sessionId} (${reason})`)
      controller.abort()
      this.activeStreams.delete(sessionId)
    }
    this.sessionChannels.delete(sessionId)
    // Clear message queues for this session
    this.steeringQueues.get(sessionId)?.clear()
    this.followUpQueues.get(sessionId)?.clear()
    this.sessionTitleGenerations.delete(sessionId)
    Permission.clearSession(sessionId)
    return !!controller
  }

  abortAll(): void {
    if (this.activeStreams.size > 0) {
      console.log(`[StreamEngine] Aborting ${this.activeStreams.size} active stream(s)`)
      for (const [sid, controller] of this.activeStreams) {
        controller.abort()
        Permission.clearSession(sid)
      }
      this.activeStreams.clear()
      this.sessionChannels.clear()
      this.sessionTitleGenerations.clear()
    }
  }

  shutdown(): void {
    this.abortAll()
    for (const unsub of this.unsubs) unsub()
    this.unsubs = []
    this.steeringQueues.clear()
    this.followUpQueues.clear()
    this.sessionTitleGenerations.clear()
    this.sender = null
    console.log('[StreamEngine] Shut down')
  }

  // ── Internal Helpers ───────────────────────────

  private async generateAndApplySessionTitle(
    sessionId: string,
    displayContent: string,
    expectedSessionName: string,
  ): Promise<void> {
    const requestId = ++this.titleGenerationSeq
    this.sessionTitleGenerations.set(sessionId, requestId)

    try {
      const generatedTitle = await this.generateSessionTitle(sessionId, displayContent)
      const title = this.normalizeSessionTitle(generatedTitle) || generateTitleFromMessage(displayContent)
      if (!title) return

      if (this.sessionTitleGenerations.get(sessionId) !== requestId) return

      const session = store.getSession(sessionId)
      if (!session) return
      if (!this.canApplyGeneratedSessionTitle(session.name, expectedSessionName)) {
        return
      }
      if (session.name === title) return

      store.renameSession(sessionId, title)
      await this.eventBus?.emit(sessionId, {
        type: 'session:renamed',
        name: title,
      })
    } catch (error) {
      const fallbackTitle = generateTitleFromMessage(displayContent)
      const session = store.getSession(sessionId)
      if (
        session &&
        fallbackTitle &&
        this.sessionTitleGenerations.get(sessionId) === requestId &&
        this.canApplyGeneratedSessionTitle(session.name, expectedSessionName)
      ) {
        store.renameSession(sessionId, fallbackTitle)
        await this.eventBus?.emit(sessionId, {
          type: 'session:renamed',
          name: fallbackTitle,
        })
      }
      console.warn('[StreamEngine] Falling back to local chat title:', error)
    } finally {
      if (this.sessionTitleGenerations.get(sessionId) === requestId) {
        this.sessionTitleGenerations.delete(sessionId)
      }
    }
  }

  private async generateSessionTitle(sessionId: string, displayContent: string): Promise<string> {
    const settings = store.getSettings()
    const { providerId, providerConfig, model } = this.resolveToolCallModel(settings)
    if (!providerId || !providerConfig || !model) {
      return generateTitleFromMessage(displayContent)
    }

    if (!isProviderSupported(providerId)) {
      return generateTitleFromMessage(displayContent)
    }

    const authContext = await resolveProviderAuth(providerId, providerConfig)
    if (!authContext) {
      return generateTitleFromMessage(displayContent)
    }

    const apiType = getProviderApiType(settings, providerId)
    return generateChatTitle(
      providerId,
      {
        ...providerConfig,
        apiKey: authContext.kind === 'api-key' ? authContext.apiKey : '',
        authContext,
        oauthToken: authContext.kind === 'oauth' ? authContext.token : providerConfig.oauthToken,
        baseUrl: providerConfig.baseUrl,
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

  private resolveToolCallModel(settings: AppSettings): {
    providerId: string
    providerConfig: AppSettings['ai']['providers'][string] | undefined
    model: string
  } {
    const configuredProviderId = settings.tools?.toolCallModel?.providerId?.trim()
    const configuredModel = settings.tools?.toolCallModel?.model?.trim()
    const fallbackProviderId = settings.ai.provider ||
      Object.entries(settings.ai.providers).find(([, config]) => Boolean(config?.model || config?.selectedModels?.[0]))?.[0] ||
      ''
    const providerId = configuredProviderId && settings.ai.providers[configuredProviderId]
      ? configuredProviderId
      : fallbackProviderId
    const providerConfig = providerId ? settings.ai.providers[providerId] : undefined
    const model = providerId === configuredProviderId && configuredModel
      ? configuredModel
      : providerConfig?.model || providerConfig?.selectedModels?.[0] || ''

    return { providerId, providerConfig, model }
  }

  private normalizeSessionTitle(title: string): string {
    const cleaned = title
      .replace(/\s+/g, ' ')
      .replace(/^[`"'“”‘’#:\-\s]+/, '')
      .replace(/[`"'“”‘’\s]+$/, '')
      .replace(/^title\s*:\s*/i, '')
      .trim()
    return Array.from(cleaned).slice(0, 60).join('').trim()
  }

  private canApplyGeneratedSessionTitle(currentName: string | undefined, expectedName: string): boolean {
    const current = (currentName || '').trim()
    const expected = (expectedName || '').trim()
    if (current === expected) return true
    return (current === '' || current === 'New Chat') && (expected === '' || expected === 'New Chat')
  }

  private async resolveProvider(sessionId: string): Promise<{
    configWithApiKey: ProviderConfigWithKey
    providerId: string
    settings: ReturnType<typeof store.getSettings>
  } | null> {
    const settings = store.getSettings()
    const { providerId, providerConfig, model: effectiveModel } = getEffectiveProviderConfig(settings, sessionId)

    const authContext = await resolveProviderAuth(providerId, providerConfig)
    if (!authContext) {
      const isOAuth = requiresOAuth(providerId)
      this.emitStreamError(sessionId, isOAuth
        ? `Not logged in to ${providerId}. Please login in settings.`
        : 'API Key not configured. Please configure your AI settings.')
      return null
    }

    if (!isProviderSupported(providerId)) {
      this.emitStreamError(sessionId, `Unsupported provider: ${providerId}`)
      return null
    }

    const configWithApiKey: ProviderConfigWithKey = {
      ...providerConfig,
      model: effectiveModel,
      selectedModels: providerConfig?.selectedModels ?? [effectiveModel],
      apiKey: authContext.kind === 'api-key' ? authContext.apiKey : '',
      authContext,
      oauthToken: authContext.kind === 'oauth' ? authContext.token : providerConfig?.oauthToken,
    }

    return { configWithApiKey, providerId, settings }
  }

  private async maybeCompactBeforeSend(
    sessionId: string,
    providerId: string,
    configWithApiKey: ProviderConfigWithKey,
    settings: AppSettings,
  ): Promise<boolean> {
    if (providerId === 'acp') return true

    const compactSettings = settings.chat
    if (compactSettings?.contextCompactEnabled === false) return true
    if (this.activeCompactions.has(sessionId)) {
      this.emitStreamError(sessionId, 'Context compact is already running. Please wait for it to finish before sending another message.')
      return false
    }

    let modelContextLength = 128000
    let reservedOutputTokens = settings.chat?.maxTokens || 4096
    try {
      modelContextLength = await modelRegistry.getModelContextLength(configWithApiKey.model, providerId)
      const modelMaxOutputTokens = await modelRegistry.getModelMaxOutputTokens(configWithApiKey.model, providerId)
      const perModelOverride = configWithApiKey.maxOutputByModel?.[configWithApiKey.model]
      const halfDefault = modelMaxOutputTokens > 0 ? Math.max(1, Math.floor(modelMaxOutputTokens / 2)) : 0
      const requested = perModelOverride ?? (halfDefault > 0 ? halfDefault : reservedOutputTokens)
      reservedOutputTokens = modelMaxOutputTokens > 0 ? Math.min(requested, modelMaxOutputTokens) : requested
    } catch (error) {
      console.warn('[StreamEngine] Failed to resolve model context length for compact:', error)
    }

    const configuredKeepTurns = compactSettings?.contextCompactKeepRecentTurns ?? 6
    let keepRecentTurns = configuredKeepTurns

    for (let pass = 1; pass <= configuredKeepTurns; pass++) {
      const latestSession = store.getSession(sessionId)
      if (!latestSession) return true

      if (shouldSkipAutoCompactForProviderUsageMismatch({
        providerId,
        session: latestSession,
        modelContextLength,
      })) {
        console.warn('[StreamEngine] Skipping auto compact because provider usage exceeds registered model context length:', {
          sessionId,
          providerId,
          model: configWithApiKey.model,
          contextSize: latestSession.contextSize ?? latestSession.lastInputTokens ?? 0,
          modelContextLength,
        })
        return true
      }

      const reason = getContextCompactReason({
        session: latestSession,
        modelContextLength,
        thresholdPercent: compactSettings?.contextCompactThreshold ?? 85,
        reservedOutputTokens,
      })
      if (!reason) return true

      console.log('[StreamEngine] Auto compact triggered before send', {
        sessionId,
        model: configWithApiKey.model,
        modelContextLength,
        reservedOutputTokens,
        threshold: compactSettings?.contextCompactThreshold ?? 85,
        keepRecentTurns,
        pass,
        reason,
      })

      const result = await this.runContextCompact({
        sessionId,
        providerId,
        configWithApiKey,
        settings,
        keepRecentTurns,
        onMessageCreated: message => this.emitMessageCreated(sessionId, message),
        onMessageUpdated: (messageId, updates) => this.emitMessageUpdated(sessionId, messageId, updates),
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
        console.warn('[StreamEngine] Auto compact failed; continuing send:', result.error)
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

    const latestSession = store.getSession(sessionId)
    if (!latestSession) return true
    const finalReason = getContextCompactReason({
      session: latestSession,
      modelContextLength,
      thresholdPercent: compactSettings?.contextCompactThreshold ?? 85,
      reservedOutputTokens,
    })
    if (finalReason === 'hard-limit') {
      const lastKnownInputTokens = latestSession.contextSize ?? latestSession.lastInputTokens ?? 0
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

  private async runContextCompact(options: {
    sessionId: string
    providerId: string
    configWithApiKey: ProviderConfigWithKey
    settings: AppSettings
    keepRecentTurns?: number
    onMessageCreated?: (message: ChatMessage) => Promise<void>
    onMessageUpdated?: (messageId: string, updates: Partial<ChatMessage>) => Promise<void>
  }): Promise<ContextCompactResult> {
    if (this.activeCompactions.has(options.sessionId)) {
      return {
        success: false,
        error: 'Context compact is already running.',
      }
    }

    this.activeCompactions.add(options.sessionId)
    try {
      return await compactSessionContext(options)
    } finally {
      this.activeCompactions.delete(options.sessionId)
    }
  }

  private emitStreamError(sessionId: string, error: string): void {
    if (this.eventBus) {
      this.eventBus.emit(sessionId, {
        type: 'stream:error',
        data: { error },
      }).catch(err => console.error('[StreamEngine] stream:error emit failed:', err))
    }
  }

  private async emitMessageCreated(sessionId: string, message: ChatMessage): Promise<void> {
    await this.eventBus?.emit(sessionId, {
      type: 'message:created',
      message,
    })
  }

  private async emitMessageUpdated(
    sessionId: string,
    messageId: string,
    updates: Partial<ChatMessage>,
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
    }).catch(err => console.error('[StreamEngine] context:size-updated emit failed:', err))
  }
}
