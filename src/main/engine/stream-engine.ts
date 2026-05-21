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
import { v4 as uuidv4 } from 'uuid'
import type { AppSettings, ChatMessage, MessageAttachment } from '../../shared/ipc.js'
import type { SendMessageCommand, EditAndResendCommand, ResumeAfterConfirmCommand, RetryMessageCommand, InjectSteeringCommand, InjectFollowUpCommand, CompactContextCommand } from '../../shared/events/session-commands.js'
import type { EventBus } from '../events/event-bus.js'
import type { ToolChatMessage } from '../providers/index.js'
import { Permission } from '../permission/index.js'
import * as store from '../store.js'
import {
  getEffectiveProviderConfig,
  resolveProviderAuth,
  extractErrorDetails,
} from './stream/provider-helpers.js'
import { isProviderSupported, requiresOAuth, convertToolDefinitionsForAI } from '../providers/index.js'
import { buildHistoryMessages } from './stream/message-helpers.js'
import { executeMessageStream, type ProviderConfigWithKey } from './stream/stream-executor.js'
import { createStreamProcessor, type StreamContext } from './stream/stream-processor.js'
import { runStream } from './stream/tool-loop.js'
import { buildPromptContext, buildRequestMessages } from './prompt/index.js'
import { getSkillsForSession } from '../ipc/skills.js'
import { getEnabledToolsAsync, setInitContext, initializeAsyncTools } from '../tools/index.js'
import { getMCPToolsForAI } from '../mcp/index.js'
import { mediaLibraryService } from '../media/media-library-service.js'
import * as modelRegistry from '../providers/model-registry.js'
import { buildContextVariablesPromptText } from '../variables/index.js'
import { buildProjectDirsPromptVars } from '../project-dirs/index.js'
import { getAIToolName } from '../providers/tool-name-alias.js'
import { PendingMessageQueue, type PendingMessage } from './stream/message-queue.js'
import { compactSessionContext, getContextCompactReason } from './context-compact.js'
import { resolvePromptReferences } from '../prompts/resolver.js'

/**
 * Generate a short title from user message content
 */
function generateTitleFromMessage(content: string, maxLength: number = 30): string {
  const cleaned = content.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= maxLength) return cleaned
  return cleaned.slice(0, maxLength).trim() + '...'
}

export class StreamEngine {
  private activeStreams = new Map<string, AbortController>()
  private sessionChannels = new Map<string, string>()
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

      // 2. Auto-rename session on first message
      if (isFirstUserMessage || isBranchFirstMessage) {
        const newTitle = generateTitleFromMessage(resolvedPromptRefs.displayContent)
        store.renameSession(sessionId, newTitle)
        await this.eventBus?.emit(sessionId, {
          type: 'session:renamed',
          name: newTitle,
        })
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
      })
    } catch (error: any) {
      console.error('[StreamEngine] handleSendMessage error:', error)
      this.emitStreamError(sessionId, error.message || 'Streaming error')
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

    const result = await compactSessionContext({
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
      this.emitContextSizeReset(sessionId)
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
    } catch (error: any) {
      console.error('[StreamEngine] handleEditAndResend error:', error)
      this.emitStreamError(sessionId, error.message || 'Streaming error')
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
    } catch (error: any) {
      console.error('[StreamEngine] handleRetryMessage error:', error)
      this.emitStreamError(sessionId, error.message || 'Streaming error')
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
      const toolCalls = assistantMessage.toolCalls || []

      const historyMessages = buildHistoryMessages(session.messages, session)
      const historyWithoutCurrent = historyMessages.filter((_, idx) => {
        const msgCount = historyMessages.length
        return idx !== msgCount - 1 || historyMessages[idx].role !== 'assistant'
      })

      // Load skills and set init context
      const skillsSettings = settings.skills
      const skillsEnabled = skillsSettings?.enableSkills !== false
      const enabledSkills = skillsEnabled ? getSkillsForSession(session.workingDirectory) : []

      if (settings.tools?.enableToolCalls) {
        setInitContext({
          skills: enabledSkills.map(s => ({
            id: s.id, name: s.name, description: s.description,
            source: s.source, path: s.path, directoryPath: s.directoryPath,
            enabled: s.enabled, instructions: s.instructions,
            files: s.files?.map(f => ({ name: f.name, path: f.path, type: f.type as 'markdown' | 'script' | 'template' | 'other' })),
          })),
        })
        await initializeAsyncTools()
      }

      const allEnabledTools = settings.tools?.enableToolCalls ? await getEnabledToolsAsync(settings.tools.tools) : []
      const enabledTools = allEnabledTools.filter(t => !t.id.startsWith('mcp:'))
      const mcpTools = settings.tools?.enableToolCalls ? getMCPToolsForAI(settings.tools.tools) : {}

      const supportsTools = await modelRegistry.modelSupportsTools(configWithApiKey.model, providerId)
      const hasTools = supportsTools && (enabledTools.length > 0 || Object.keys(mcpTools).length > 0)
      const builtinToolsForAI = hasTools ? convertToolDefinitionsForAI(enabledTools) : {}
      const toolsForAI = hasTools ? { ...builtinToolsForAI, ...mcpTools } : {}

      const projectVars = buildProjectDirsPromptVars(session.workingDirectory)
      const promptContext = await buildPromptContext({
        previousState: session.promptContext ?? undefined,
        sessionId,
        agentId: session.agentId,
        providerId,
        providerConfig: configWithApiKey as unknown as Record<string, unknown>,
        settings,
        hasTools,
        skills: enabledSkills,
        workingDirectory: session.workingDirectory,
        workingDirectoryRoots: session.workingDirectoryRoots,
        contextVariables: await buildContextVariablesPromptText(sessionId),
        activeProject: projectVars.active,
        knownProjects: projectVars.known,
        toolNames: Object.keys(builtinToolsForAI),
        mcpToolNames: Object.keys(mcpTools),
      })
      store.updateSessionPromptContext(sessionId, promptContext.state)
      const requestMessages = buildRequestMessages({
        providerId,
        promptContext: promptContext.state,
        emittedFragments: promptContext.emittedFragments,
        historyMessages: [],
      })
      const { systemPrompt, systemPromptSegments } = requestMessages

      const conversationMessages = [...requestMessages.messages] as ToolChatMessage[]

      for (const msg of historyWithoutCurrent) {
        if (msg.role === 'user') {
          conversationMessages.push({ role: 'user', content: msg.content })
        } else if (msg.role === 'assistant') {
          conversationMessages.push({
            role: 'assistant', content: msg.content,
            ...(msg.toolCalls && { toolCalls: msg.toolCalls }),
            ...(msg.reasoningContent && { reasoningContent: msg.reasoningContent }),
          })
        } else if (msg.role === 'tool') {
          conversationMessages.push({ role: 'tool', content: msg.content })
        }
      }

      conversationMessages.push({
        role: 'assistant',
        content: assistantMessage.content || '',
        toolCalls: toolCalls.map(tc => ({
          toolCallId: tc.id, toolName: getAIToolName(tc.toolId || tc.toolName), args: tc.arguments,
        })),
        ...(assistantMessage.reasoning && { reasoningContent: assistantMessage.reasoning }),
      })

      conversationMessages.push({
        role: 'tool',
        content: toolCalls.map(tc => ({
          type: 'tool-result' as const,
          toolCallId: tc.id, toolName: getAIToolName(tc.toolId || tc.toolName),
          result: tc.status === 'completed' ? tc.result : { error: tc.error },
        })),
      })

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
      }

      const processor = createStreamProcessor(ctx, {
        content: assistantMessage.content || '',
        reasoning: assistantMessage.reasoning || '',
      })

      try {
        console.log('[StreamEngine] Resuming tool loop after confirmation')
        const requestStartTime = Date.now()

        const result = await runStream(ctx, conversationMessages, systemPrompt, toolsForAI, [], processor, enabledSkills, ctx.steeringQueue, ctx.followUpQueue, systemPromptSegments)

        const requestDuration = (Date.now() - requestStartTime) / 1000
        console.log(`[StreamEngine] Resume completed in ${requestDuration.toFixed(2)}s`)

        if (!result.pausedForConfirmation) {
          await processor.finalize()
          this.eventBus?.emit(sessionId, {
            type: 'stream:complete',
            data: { sessionName: session.name },
          }).catch(err => console.error('[StreamEngine] stream:complete emit error:', err))
          this.removeController(sessionId)
        }
      } catch (error: any) {
        const isAborted = error.name === 'AbortError' || abortController.signal.aborted
        if (isAborted) {
          await processor.finalize()
          this.eventBus?.emit(sessionId, { type: 'stream:aborted', reason: 'User cancelled' })
            .catch(err => console.error('[StreamEngine] stream:aborted emit error:', err))
        } else {
          console.error('[StreamEngine] Resume streaming error:', error)
          store.deleteMessage(sessionId, messageId)
          const errorMessage: ChatMessage = {
            id: `error-${Date.now()}`, role: 'error',
            content: error.message || 'Streaming error', timestamp: Date.now(),
            errorDetails: extractErrorDetails(error),
          }
          store.addMessage(sessionId, errorMessage)
          this.eventBus?.emit(sessionId, {
            type: 'stream:error',
            data: { error: error.message || 'Streaming error', errorDetails: extractErrorDetails(error) },
          }).catch(err => console.error('[StreamEngine] stream:error emit error:', err))
        }
        this.removeController(sessionId)
      }
    } catch (error: any) {
      console.error('[StreamEngine] handleResumeAfterConfirm error:', error)
      this.emitStreamError(sessionId, error.message || 'Resume error')
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

  abort(sessionId: string): boolean {
    const controller = this.activeStreams.get(sessionId)
    if (controller) {
      controller.abort()
      this.activeStreams.delete(sessionId)
    }
    this.sessionChannels.delete(sessionId)
    // Clear message queues for this session
    this.steeringQueues.get(sessionId)?.clear()
    this.followUpQueues.get(sessionId)?.clear()
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
    }
  }

  shutdown(): void {
    this.abortAll()
    for (const unsub of this.unsubs) unsub()
    this.unsubs = []
    this.steeringQueues.clear()
    this.followUpQueues.clear()
    this.sender = null
    console.log('[StreamEngine] Shut down')
  }

  // ── Internal Helpers ───────────────────────────

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
    const compactSettings = settings.chat
    if (compactSettings?.contextCompactEnabled === false) return true

    let modelContextLength = 128000
    let reservedOutputTokens = settings.chat?.maxTokens || 4096
    try {
      const modelInfo = await modelRegistry.getModelById(configWithApiKey.model)
      modelContextLength = modelInfo?.context_length || modelInfo?.top_provider?.context_length || modelContextLength
      const modelMaxOutputTokens = await modelRegistry.getModelMaxOutputTokens(configWithApiKey.model)
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

      const result = await compactSessionContext({
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
        this.emitContextSizeReset(sessionId)
      }

      if (!result.success) {
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
      const lastKnownInputTokens = latestSession.contextSize || latestSession.lastInputTokens || 0
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
      type: 'message:user-created',
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

  private emitContextSizeReset(sessionId: string): void {
    this.eventBus?.emit(sessionId, {
      type: 'context:size-updated',
      contextSize: 0,
    }).catch(err => console.error('[StreamEngine] context:size-updated emit failed:', err))
  }
}
