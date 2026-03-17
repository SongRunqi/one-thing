/**
 * StreamEngine — Single owner of active stream lifecycle.
 *
 * Phase 3c: drives streaming pipeline for all command types:
 * - send-message: resolve provider, build history, executeMessageStream()
 * - edit-and-resend: same flow, with truncated history
 * - resume-after-confirm: reconstruct conversation with tool results, runStream()
 *
 * IPC handlers do sync prep (validate, create messages, return IDs),
 * then delegate to StreamEngine for async streaming execution.
 */

import type { WebContents } from 'electron'
import type { ChatMessage } from '../../shared/ipc.js'
import type { SendMessageCommand, EditAndResendCommand, ResumeAfterConfirmCommand } from '../../shared/events/session-commands.js'
import type { EventBus } from '../events/event-bus.js'
import type { ToolChatMessage } from '../providers/index.js'
import { Permission } from '../permission/index.js'
import * as store from '../store.js'
import {
  getEffectiveProviderConfig,
  getApiKeyForProvider,
  extractErrorDetails,
} from '../ipc/chat/provider-helpers.js'
import { isProviderSupported, requiresOAuth, convertToolDefinitionsForAI } from '../providers/index.js'
import { buildHistoryMessages, buildSystemPrompt, formatMessagesForLog } from '../ipc/chat/message-helpers.js'
import { executeMessageStream, type ProviderConfigWithKey } from '../ipc/chat/stream-executor.js'
import { createStreamProcessor, type StreamContext } from '../ipc/chat/stream-processor.js'
import { runStream } from '../ipc/chat/tool-loop.js'
import { getSkillsForSession } from '../ipc/skills.js'
import { getCustomAgentById } from '../services/custom-agent/index.js'
import { getEnabledToolsAsync, setInitContext, initializeAsyncTools } from '../tools/index.js'
import { getMCPToolsForAI } from '../mcp/index.js'
import * as modelRegistry from '../services/ai/model-registry.js'
import {
  getTextFromContent,
  formatUserProfilePrompt,
  retrieveRelevantFacts,
  retrieveRelevantAgentMemories,
  formatAgentMemoryPrompt,
} from '../ipc/chat/memory-helpers.js'
import { getStorage } from '../storage/index.js'

export class StreamEngine {
  /** Active AbortControllers keyed by sessionId */
  private activeStreams = new Map<string, AbortController>()
  private eventBus: EventBus | null = null
  private sender: WebContents | null = null
  private unsubs: Array<() => void> = []

  /** Set the EventBus reference and subscribe to command events */
  setEventBus(eventBus: EventBus): void {
    this.eventBus = eventBus
    this.subscribeToCommands(eventBus)
  }

  /** Bind to a BrowserWindow's WebContents (called after window creation) */
  bind(sender: WebContents): void {
    this.sender = sender
    sender.on('destroyed', () => {
      this.sender = null
    })
  }

  private subscribeToCommands(eventBus: EventBus): void {
    // Subscribe to command events across all sessions
    this.unsubs.push(
      eventBus.onAnySession('command:send-message' as any, (envelope) => {
        if (!this.sender) return
        const { sessionId } = envelope
        this.handleSendMessage(sessionId, envelope.event as any, this.sender)
          .catch(err => console.error('[StreamEngine] command:send-message error:', err))
      }),
      eventBus.onAnySession('command:edit-and-resend' as any, (envelope) => {
        if (!this.sender) return
        const { sessionId } = envelope
        this.handleEditAndResend(sessionId, envelope.event as any, this.sender)
          .catch(err => console.error('[StreamEngine] command:edit-and-resend error:', err))
      }),
      eventBus.onAnySession('command:resume-after-confirm' as any, (envelope) => {
        if (!this.sender) return
        const { sessionId } = envelope
        this.handleResumeAfterConfirm(sessionId, envelope.event as any, this.sender)
          .catch(err => console.error('[StreamEngine] command:resume-after-confirm error:', err))
      }),
    )
  }

  // ── Command Handlers ───────────────────────────

  /**
   * Handle a send-message command.
   * Resolves provider, builds history, starts streaming.
   */
  async handleSendMessage(
    sessionId: string,
    cmd: SendMessageCommand,
    sender: WebContents
  ): Promise<void> {
    const { content: messageContent, attachments, assistantMessageId, sessionName } = cmd

    try {
      const resolved = await this.resolveProvider(sessionId)
      if (!resolved) return

      const { configWithApiKey, providerId, settings } = resolved

      console.log(`[StreamEngine] Starting stream: session=${sessionId}, provider=${providerId}, model=${configWithApiKey.model}`)

      const sessionForHistory = store.getSession(sessionId)
      const historyMessages = buildHistoryMessages(sessionForHistory?.messages || [], sessionForHistory)

      await executeMessageStream({
        sender, sessionId, assistantMessageId, messageContent,
        historyMessages, configWithApiKey, providerId, settings,
        toolSettings: settings.tools, sessionName,
      })
    } catch (error: any) {
      console.error('[StreamEngine] handleSendMessage error:', error)
      this.emitStreamError(sessionId, error.message || 'Streaming error')
    }
  }

  /**
   * Handle an edit-and-resend command.
   * Same as sendMessage but with truncated history.
   */
  async handleEditAndResend(
    sessionId: string,
    cmd: EditAndResendCommand,
    sender: WebContents
  ): Promise<void> {
    const { newContent, assistantMessageId, sessionName } = cmd

    try {
      const resolved = await this.resolveProvider(sessionId)
      if (!resolved) return

      const { configWithApiKey, providerId, settings } = resolved

      console.log(`[StreamEngine] Starting edit/resend stream: session=${sessionId}, provider=${providerId}`)

      const session = store.getSession(sessionId)
      const historyMessages = buildHistoryMessages(session?.messages || [], session)

      await executeMessageStream({
        sender, sessionId, assistantMessageId,
        messageContent: newContent,
        historyMessages, configWithApiKey, providerId, settings,
        toolSettings: settings.tools, sessionName,
      })
    } catch (error: any) {
      console.error('[StreamEngine] handleEditAndResend error:', error)
      this.emitStreamError(sessionId, error.message || 'Streaming error')
    }
  }

  /**
   * Handle resume-after-confirm command.
   * Reconstructs conversation with tool calls/results, loads memory,
   * builds system prompt, and calls runStream() directly.
   */
  async handleResumeAfterConfirm(
    sessionId: string,
    cmd: ResumeAfterConfirmCommand,
    sender: WebContents
  ): Promise<void> {
    const { messageId } = cmd

    try {
      // 1. Resolve provider
      const resolved = await this.resolveProvider(sessionId)
      if (!resolved) return

      const { configWithApiKey, providerId, settings } = resolved

      // 2. Get session and assistant message
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

      // 3. Build history and filter out current assistant message
      const historyMessages = buildHistoryMessages(session.messages, session)
      const historyWithoutCurrent = historyMessages.filter((_, idx) => {
        const msgCount = historyMessages.length
        return idx !== msgCount - 1 || historyMessages[idx].role !== 'assistant'
      })

      // 4. Load skills and set init context
      const skillsSettings = settings.skills
      const skillsEnabled = skillsSettings?.enableSkills !== false
      const enabledSkills = skillsEnabled ? getSkillsForSession(session.workingDirectory) : []
      const currentAgent = session.agentId
        ? getCustomAgentById(session.agentId, session.workingDirectory)
        : undefined

      if (settings.tools?.enableToolCalls) {
        setInitContext({
          agent: currentAgent ? {
            id: currentAgent.id,
            name: currentAgent.name,
            permissions: undefined,
          } : undefined,
          skills: enabledSkills.map(s => ({
            id: s.id, name: s.name, description: s.description,
            source: s.source, path: s.path, directoryPath: s.directoryPath,
            enabled: s.enabled, instructions: s.instructions,
            files: s.files?.map(f => ({ name: f.name, path: f.path, type: f.type as 'markdown' | 'script' | 'template' | 'other' })),
          })),
        })
        await initializeAsyncTools()
      }

      // 5. Get enabled tools + MCP tools
      const allEnabledTools = settings.tools?.enableToolCalls ? await getEnabledToolsAsync(settings.tools.tools) : []
      const enabledTools = allEnabledTools.filter(t => !t.id.startsWith('mcp:'))
      const mcpTools = settings.tools?.enableToolCalls ? getMCPToolsForAI(settings.tools.tools) : {}

      const supportsTools = await modelRegistry.modelSupportsTools(configWithApiKey.model, providerId)
      const hasTools = supportsTools && (enabledTools.length > 0 || Object.keys(mcpTools).length > 0)

      // 6. Retrieve memory context
      const lastUserMsgContent = historyWithoutCurrent.filter(m => m.role === 'user').pop()?.content
      const lastUserMsg = lastUserMsgContent ? getTextFromContent(lastUserMsgContent) : ''

      let userProfilePrompt: string | undefined
      let agentMemoryPrompt: string | undefined
      const memoryEnabled = settings.embedding?.memoryEnabled !== false

      if (memoryEnabled) {
        try {
          const storage = getStorage()
          const relevantFacts = await retrieveRelevantFacts(storage, lastUserMsg, 10, 0.3)
          if (relevantFacts.length > 0) {
            userProfilePrompt = formatUserProfilePrompt(relevantFacts)
            console.log(`[StreamEngine] Retrieved ${relevantFacts.length} relevant facts for resume context`)
          }
        } catch (error) {
          console.error('[StreamEngine] Failed to retrieve relevant facts:', error)
        }
      }

      if (session.agentId && memoryEnabled) {
        try {
          const storage = getStorage()
          const agentRelationship = await storage.agentMemory.getRelationship(session.agentId)
          if (agentRelationship) {
            const relevantMemories = await retrieveRelevantAgentMemories(
              storage, session.agentId, lastUserMsg, 5, 0.3
            )
            agentMemoryPrompt = formatAgentMemoryPrompt(agentRelationship, relevantMemories)
          }
        } catch (error) {
          console.error('[StreamEngine] Failed to load agent memory:', error)
        }
      }

      // 7. Build system prompt
      let characterSystemPrompt: string | undefined
      if (session.workspaceId) {
        const workspace = store.getWorkspace(session.workspaceId)
        characterSystemPrompt = workspace?.systemPrompt
      } else if (session.agentId) {
        const agent = getCustomAgentById(session.agentId, session.workingDirectory)
        characterSystemPrompt = agent?.systemPrompt
      }

      const systemPrompt = buildSystemPrompt({
        hasTools, skills: enabledSkills,
        workspaceSystemPrompt: characterSystemPrompt,
        userProfilePrompt, agentMemoryPrompt,
        providerId, workingDirectory: session.workingDirectory,
        builtinMode: session.builtinMode, sessionPlan: session.plan,
      })

      // 8. Build conversation messages
      const conversationMessages: ToolChatMessage[] = []
      conversationMessages.push({ role: 'system', content: systemPrompt })

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

      // Add assistant message with tool calls
      conversationMessages.push({
        role: 'assistant',
        content: assistantMessage.content || '',
        toolCalls: toolCalls.map(tc => ({
          toolCallId: tc.id, toolName: tc.toolName, args: tc.arguments,
        })),
        ...(assistantMessage.reasoning && { reasoningContent: assistantMessage.reasoning }),
      })

      // Add tool results
      conversationMessages.push({
        role: 'tool',
        content: toolCalls.map(tc => ({
          type: 'tool-result' as const,
          toolCallId: tc.id, toolName: tc.toolName,
          result: tc.status === 'completed' ? tc.result : { error: tc.error },
        })),
      })

      // 9. Emit continuation event
      this.eventBus?.emit(sessionId, { type: 'content:continuation', turnIndex: 1 })
        .catch(err => console.error('[StreamEngine] continuation emit error:', err))

      // 10. Create AbortController and StreamContext
      const abortController = new AbortController()
      this.registerController(sessionId, abortController)

      const ctx: StreamContext = {
        sender, sessionId,
        assistantMessageId: messageId,
        abortSignal: abortController.signal,
        settings, providerConfig: configWithApiKey,
        providerId, toolSettings: settings.tools,
      }

      const processor = createStreamProcessor(ctx, {
        content: assistantMessage.content || '',
        reasoning: assistantMessage.reasoning || '',
      })

      // 11. Run the stream
      try {
        console.log('[StreamEngine] Resuming tool loop after confirmation')
        const requestStartTime = Date.now()

        const builtinToolsForAI = convertToolDefinitionsForAI(enabledTools)
        const toolsForAI = { ...builtinToolsForAI, ...mcpTools }

        const result = await runStream(ctx, conversationMessages, systemPrompt, toolsForAI, processor, enabledSkills)

        const requestDuration = (Date.now() - requestStartTime) / 1000
        console.log(`[StreamEngine] Resume completed in ${requestDuration.toFixed(2)}s`)

        if (!result.pausedForConfirmation) {
          processor.finalize()
          this.eventBus?.emit(sessionId, {
            type: 'stream:complete',
            data: { sessionName: session.name },
          }).catch(err => console.error('[StreamEngine] stream:complete emit error:', err))
          this.removeController(sessionId)
        } else {
          console.log('[StreamEngine] Resume paused for another tool confirmation')
          // Keep controller in activeStreams for abort support
        }
      } catch (error: any) {
        const isAborted = error.name === 'AbortError' || abortController.signal.aborted
        if (isAborted) {
          console.log('[StreamEngine] Resume stream aborted by user')
          processor.finalize()
          this.eventBus?.emit(sessionId, {
            type: 'stream:aborted',
            reason: 'User cancelled',
          }).catch(err => console.error('[StreamEngine] stream:aborted emit error:', err))
        } else {
          console.error('[StreamEngine] Resume streaming error:', error)
          store.deleteMessage(sessionId, messageId)

          const errorMessage: ChatMessage = {
            id: `error-${Date.now()}`,
            role: 'error',
            content: error.message || 'Streaming error',
            timestamp: Date.now(),
            errorDetails: extractErrorDetails(error),
          }
          store.addMessage(sessionId, errorMessage)

          this.eventBus?.emit(sessionId, {
            type: 'stream:error',
            data: {
              error: error.message || 'Streaming error',
              errorDetails: extractErrorDetails(error),
            },
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

  /** Get all active session IDs */
  getActiveSessionIds(): string[] {
    return Array.from(this.activeStreams.keys())
  }

  /** Get AbortController for a session */
  getController(sessionId: string): AbortController | undefined {
    return this.activeStreams.get(sessionId)
  }

  /**
   * Register a new AbortController for a session.
   * If a controller already exists for this session, it is aborted first.
   */
  registerController(sessionId: string, controller: AbortController): void {
    const existing = this.activeStreams.get(sessionId)
    if (existing) {
      console.log(`[StreamEngine] Aborting previous stream for session: ${sessionId}`)
      existing.abort()
    }
    this.activeStreams.set(sessionId, controller)
  }

  /** Remove controller after stream completes or is paused */
  removeController(sessionId: string): void {
    this.activeStreams.delete(sessionId)
  }

  /**
   * Abort a specific session's stream.
   * Encapsulates: AbortController.abort() + Permission.clearSession() + Map removal.
   */
  abort(sessionId: string): boolean {
    const controller = this.activeStreams.get(sessionId)
    if (controller) {
      controller.abort()
      this.activeStreams.delete(sessionId)
    }
    Permission.clearSession(sessionId)
    return !!controller
  }

  /** Abort all active streams */
  abortAll(): void {
    if (this.activeStreams.size > 0) {
      console.log(`[StreamEngine] Aborting ${this.activeStreams.size} active stream(s)`)
      for (const [sid, controller] of this.activeStreams) {
        controller.abort()
        Permission.clearSession(sid)
      }
      this.activeStreams.clear()
    }
  }

  /** Shut down the engine */
  shutdown(): void {
    this.abortAll()
    for (const unsub of this.unsubs) unsub()
    this.unsubs = []
    this.sender = null
    console.log('[StreamEngine] Shut down')
  }

  // ── Internal Helpers ───────────────────────────

  /**
   * Common provider resolution logic shared by all command handlers.
   * Returns null (and emits stream:error) if resolution fails.
   */
  private async resolveProvider(sessionId: string): Promise<{
    configWithApiKey: ProviderConfigWithKey
    providerId: string
    settings: ReturnType<typeof store.getSettings>
  } | null> {
    const settings = store.getSettings()
    const { providerId, providerConfig, model: effectiveModel } = getEffectiveProviderConfig(settings, sessionId)

    const apiKey = await getApiKeyForProvider(providerId, providerConfig)
    if (!apiKey) {
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
      apiKey,
    }

    return { configWithApiKey, providerId, settings }
  }

  private emitStreamError(sessionId: string, error: string): void {
    if (this.eventBus) {
      this.eventBus.emit(sessionId, {
        type: 'stream:error',
        data: { error },
      }).catch(err => console.error('[StreamEngine] stream:error emit failed:', err))
    }
  }
}
