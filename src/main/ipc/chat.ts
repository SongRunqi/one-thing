/**
 * Chat IPC Handlers
 * Main entry point for chat-related IPC handlers
 */

import { ipcMain } from 'electron'
import * as store from '../store.js'
import type { ChatMessage, MessageAttachment, ProviderConfig } from '../../shared/ipc.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { v4 as uuidv4 } from 'uuid'
import {
  generateChatTitle,
  isProviderSupported,
  requiresOAuth,
} from '../providers/index.js'
import { getSkillsForSession } from './skills.js'
import { Permission } from '../permission/index.js'
import { mediaLibraryService } from '../media/media-library-service.js'

// Import from chat sub-modules
import {
  executeMessageStream,
} from '../engine/stream/stream-executor.js'
import {
  buildHistoryMessages,
} from '../engine/stream/message-helpers.js'
import {
  extractErrorDetails,
  getProviderConfig,
  resolveProviderAuth,
  getEffectiveProviderConfig,
  getProviderApiType,
  type ProviderErrorDetails,
} from '../engine/stream/provider-helpers.js'
import {
  activeStreams,
} from '../engine/stream/stream-processor.js'
import type { ProviderConfigWithKey } from '../engine/stream/stream-executor.js'
import { getStreamEngine } from '../engine/index.js'
import { sanitizeMessagesForRenderer } from './message-sanitizer.js'
import { resolvePromptReferences } from '../prompts/resolver.js'
import { buildSystemPromptSnapshot } from '../engine/prompt/system-prompt-snapshot.js'
import { getEventBus } from '../events/index.js'

// ============================================
// IPC Handlers
// ============================================

async function emitSessionEvent(sessionId: string, event: Parameters<ReturnType<typeof getEventBus>['emit']>[1]): Promise<void> {
  try {
    await getEventBus().emit(sessionId, event)
  } catch (error) {
    console.error('[ChatIPC] EventBus emit failed:', error)
  }
}

function caughtErrorMessage(error: object | undefined, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (error && 'message' in error && typeof error.message === 'string' && error.message) {
    return error.message
  }
  return fallback
}

function caughtErrorDetails(error: object | undefined): string | undefined {
  if (!error) return undefined
  const details: ProviderErrorDetails = {
    message: caughtErrorMessage(error, ''),
    stack: error instanceof Error ? error.stack : undefined,
    responseBody: 'responseBody' in error && typeof error.responseBody === 'string'
      ? error.responseBody
      : undefined,
  }
  return extractErrorDetails(details)
}

export function registerChatHandlers() {
  // 获取聊天历史
  ipcMain.handle(IPC_CHANNELS.GET_CHAT_HISTORY, async (_event, { sessionId }) => {
    const session = store.getSession(sessionId)
    if (!session) {
      return { success: false, error: 'Session not found' }
    }
    return { success: true, messages: sanitizeMessagesForRenderer(session.messages) }
  })

  // 生成聊天标题
  ipcMain.handle(IPC_CHANNELS.GENERATE_TITLE, async (_event, { message }) => {
    return handleGenerateTitle(message)
  })

  ipcMain.handle(IPC_CHANNELS.GET_SYSTEM_PROMPT_SNAPSHOT, async (_event, { sessionId }) => {
    try {
      return {
        success: true,
        snapshot: await buildSystemPromptSnapshot(sessionId),
      }
    } catch (error) {
      const errorObject = error && typeof error === 'object' ? error : undefined
      console.error('[Chat] Failed to build system prompt snapshot:', error)
      return {
        success: false,
        error: caughtErrorMessage(errorObject, 'Failed to build system prompt snapshot'),
      }
    }
  })

  // 更新消息的 thinkingTime（用于持久化thinking时长）
  ipcMain.handle(IPC_CHANNELS.UPDATE_MESSAGE_THINKING_TIME, async (_event, { sessionId, messageId, thinkingTime }) => {
    const updated = store.updateMessageThinkingTime(sessionId, messageId, thinkingTime)
    return { success: updated }
  })

  // 中止当前流式请求 (支持指定 sessionId)
  ipcMain.handle(IPC_CHANNELS.ABORT_STREAM, async (event, { sessionId } = {}) => {
    const sender = event.sender

    // Helper to cancel pending/running steps for a session
    const cancelPendingSteps = async (sid: string) => {
      const session = store.getSession(sid)
      if (!session) return

      // Find the latest streaming message
      const streamingMessage = session.messages.find(m => m.isStreaming)
      if (!streamingMessage?.steps) return

      // Cancel all awaiting-confirmation and running steps
      for (const step of streamingMessage.steps) {
        if (step.status === 'awaiting-confirmation' || step.status === 'running') {
          step.status = 'cancelled'
          if (step.toolCall) {
            step.toolCall.status = 'cancelled'
          }
          store.updateMessageStep(sid, streamingMessage.id, step.id, {
            status: 'cancelled',
            toolCall: step.toolCall,
          })
          await emitSessionEvent(sid, {
            type: 'step:updated',
            stepId: step.id,
            updates: { status: 'cancelled', toolCall: step.toolCall },
          })
        }
      }

      // Mark message as not streaming and send complete
      store.updateMessageStreaming(sid, streamingMessage.id, false)
      await store.flushSessionSave(sid)
      await emitSessionEvent(sid, {
        type: 'message:updated',
        messageId: streamingMessage.id,
        updates: { isStreaming: false },
      })
      await emitSessionEvent(sid, {
        type: 'stream:complete',
        data: { aborted: true },
      })
    }

    if (sessionId) {
      // Abort specific session's stream
      // Check both legacy activeStreams map AND StreamEngine's map
      const controller = activeStreams.get(sessionId)
      let aborted = false
      if (controller) {
        console.log(`[Backend] Aborting stream for session (legacy): ${sessionId}`)
        controller.abort()
        activeStreams.delete(sessionId)
        aborted = true
      }
      // Also try StreamEngine (new EventBus-driven path)
      try {
        const engine = getStreamEngine()
        if (engine.abort(sessionId)) {
          console.log(`[Backend] Aborting stream for session (engine): ${sessionId}`)
          aborted = true
        }
      } catch {
        // StreamEngine not initialized, ignore
      }
      // Clear any pending permission requests for this session
      Permission.clearSession(sessionId)
      // Cancel any waiting steps
      await cancelPendingSteps(sessionId)
      return { success: aborted }
    } else {
      // Abort all streams (backwards compatibility)
      let aborted = false
      if (activeStreams.size > 0) {
        console.log(`[Backend] Aborting all active streams (${activeStreams.size})`)
        for (const [sid, controller] of activeStreams) {
          controller.abort()
          Permission.clearSession(sid)
        }
        activeStreams.clear()
        aborted = true
      }
      // Also abort all in StreamEngine
      try {
        const engine = getStreamEngine()
        engine.abortAll()
        aborted = true
      } catch {
        // StreamEngine not initialized, ignore
      }
      return { success: aborted }
    }
  })

  // Get active streaming sessions
  ipcMain.handle(IPC_CHANNELS.GET_ACTIVE_STREAMS, async () => {
    let engineSessionIds: string[] = []
    try {
      engineSessionIds = getStreamEngine().getActiveSessionIds()
    } catch {
      // StreamEngine may not be initialized in legacy/bootstrap contexts.
    }

    return {
      success: true,
      sessionIds: Array.from(new Set([...activeStreams.keys(), ...engineSessionIds]))
    }
  })

  // Resume streaming after user confirms a tool
  ipcMain.handle(IPC_CHANNELS.RESUME_AFTER_TOOL_CONFIRM, async (event, { sessionId, messageId }) => {
    return handleResumeAfterToolConfirm(event.sender, sessionId, messageId)
  })
}

// ============================================
// Handler Implementations
// ============================================

async function resolveConfigWithAuth(
  providerId: string,
  providerConfig: ProviderConfig | undefined,
  model: string,
): Promise<ProviderConfigWithKey | null> {
  const authContext = await resolveProviderAuth(providerId, providerConfig)
  if (!authContext) return null

  return {
    ...providerConfig,
    model,
    selectedModels: providerConfig?.selectedModels ?? [model],
    apiKey: authContext.kind === 'api-key' ? authContext.apiKey : '',
    authContext,
    oauthToken: authContext.kind === 'oauth' ? authContext.token : providerConfig?.oauthToken,
  }
}

function resolveComposerReferencesForSession(sessionId: string, rawContent: string) {
  const session = store.getSession(sessionId)
  const settings = store.getSettings()
  const skills = settings.skills?.enableSkills === false
    ? []
    : getSkillsForSession(session?.workingDirectory)
  return {
    session,
    resolved: resolvePromptReferences(rawContent, { skills }),
  }
}

// Handle streaming edit and resend (similar to _handleSendMessageStream but for edits)
async function _handleEditAndResendStream(sender: Electron.WebContents, sessionId: string, messageId: string, newContent: string) {
  try {
    const { resolved: resolvedPromptRefs } = resolveComposerReferencesForSession(sessionId, newContent)
    // Update the message and truncate messages after it
    const updated = store.updateMessageAndTruncate(sessionId, messageId, resolvedPromptRefs.modelContent, {
      contentParts: resolvedPromptRefs.contentParts ?? null,
    })
    if (!updated) {
      return { success: false, error: 'Message not found' }
    }

    // Get settings and validate (use session-level model if available)
    const settings = store.getSettings()
    const { providerId, providerConfig, model: effectiveModel } = getEffectiveProviderConfig(settings, sessionId)

    const configWithApiKey = await resolveConfigWithAuth(providerId, providerConfig, effectiveModel)
    if (!configWithApiKey) {
      const isOAuth = requiresOAuth(providerId)
      return {
        success: false,
        error: isOAuth
          ? `Not logged in to ${providerId}. Please login in settings.`
          : 'API Key not configured. Please configure your AI settings.',
      }
    }

    if (!isProviderSupported(providerId)) {
      return {
        success: false,
        error: `Unsupported provider: ${providerId}`,
      }
    }

    // Create assistant message
    const assistantMessageId = uuidv4()
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      model: effectiveModel,
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      thinkingStartTime: Date.now(),
      toolCalls: [],
    }
    store.addMessage(sessionId, assistantMessage)

    // Get session and build history
    const session = store.getSession(sessionId)
    const historyMessages = buildHistoryMessages(session?.messages || [], session)

    const initialResponse = {
      success: true,
      messageId: assistantMessageId,
      sessionName: session?.name,
    }

    // Start streaming in background using unified stream executor
    process.nextTick(async () => {
      console.log(`[Backend] Starting edit/resend stream for session: ${sessionId}`)

      try {
        // Use unified stream executor (handles both image generation and text streaming)
        await executeMessageStream({
          sender,
          sessionId,
          assistantMessageId,
          messageContent: resolvedPromptRefs.modelContent,  // Use the edited content as prompt
          historyMessages,
          configWithApiKey,
          providerId,
          settings,
          toolSettings: settings.tools,
          sessionName: session?.name,
        })
      } catch (error) {
        console.error('[Backend] Error in edit/resend stream execution:', error)
      }
    })

    return initialResponse
  } catch (error) {
    const errorObject = error && typeof error === 'object' ? error : undefined
    console.error('Error in edit and resend stream:', error)
    return {
      success: false,
      error: caughtErrorMessage(errorObject, 'Failed to edit and resend message'),
      errorDetails: caughtErrorDetails(errorObject),
    }
  }
}

// Generate a short title from message content
function generateTitleFromMessage(content: string, maxLength: number = 30): string {
  // Remove extra whitespace and newlines
  const cleaned = content.replace(/\s+/g, ' ').trim()

  if (cleaned.length <= maxLength) {
    return cleaned
  }

  // Truncate and add ellipsis
  return cleaned.slice(0, maxLength).trim() + '...'
}

// Generate chat title
async function handleGenerateTitle(userMessage: string) {
  try {
    const settings = store.getSettings()
    const configuredProviderId = settings.tools?.toolCallModel?.providerId?.trim()
    const configuredModel = settings.tools?.toolCallModel?.model?.trim()
    const providerId = configuredProviderId && settings.ai.providers[configuredProviderId]
      ? configuredProviderId
      : settings.ai.provider
    const providerConfig = settings.ai.providers[providerId] || getProviderConfig(settings)
    const model = providerId === configuredProviderId && configuredModel
      ? configuredModel
      : providerConfig?.model || providerConfig?.selectedModels?.[0] || ''

    const authContext = await resolveProviderAuth(providerId, providerConfig)
    if (!model || !authContext || !isProviderSupported(providerId)) {
      // Fallback to simple truncation
      return {
        success: true,
        title: userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : ''),
      }
    }

    const apiType = getProviderApiType(settings, providerId)
    const title = await generateChatTitle(
      providerId,
      {
        apiKey: authContext.kind === 'api-key' ? authContext.apiKey : '',
        authContext,
        oauthToken: authContext.kind === 'oauth' ? authContext.token : providerConfig?.oauthToken,
        baseUrl: providerConfig?.baseUrl,
        model,
        apiType,
      },
      userMessage,
      {
        thinking: settings.tools?.toolCallModel?.thinking === true,
        thinkingEffort: settings.tools?.toolCallModel?.thinkingEffort,
      }
    )

    return { success: true, title }
  } catch (error) {
    console.error('Error generating title:', error)
    // Fallback to simple truncation
    return {
      success: true,
      title: userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : ''),
    }
  }
}

// Handle streaming message with event emitter
async function _handleSendMessageStream(sender: Electron.WebContents, sessionId: string, messageContent: string, attachments?: MessageAttachment[]) {
  console.log(`[Backend] handleSendMessageStream called - BUILD_VERSION: 2025-01-05-v2`)
  try {
    const { session, resolved: resolvedPromptRefs } = resolveComposerReferencesForSession(sessionId, messageContent)
    // Get session to check if this is the first user message
    const isFirstUserMessage = session && session.messages.filter(m => m.role === 'user').length === 0

    // For branch sessions, check if this is the first NEW user message (after inherited messages)
    const isBranchFirstMessage = session?.parentSessionId && session.messages.length > 0 &&
      !session.messages.some(m => m.role === 'user' && m.timestamp > session.createdAt)

    // Save user message (with attachments if provided)
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: resolvedPromptRefs.modelContent,
      timestamp: Date.now(),
      attachments: attachments, // Include file/image attachments
      contentParts: resolvedPromptRefs.contentParts,
    }
    mediaLibraryService.ingestMessageAttachments(
      sessionId,
      userMessage.id,
      userMessage.role,
      userMessage.attachments,
    )
    console.log('[Backend] Created user message with id:', userMessage.id, 'attachments:', attachments?.length || 0)
    store.addMessage(sessionId, userMessage)

    // Auto-rename session based on first user message
    if (isFirstUserMessage || isBranchFirstMessage) {
      const newTitle = generateTitleFromMessage(resolvedPromptRefs.displayContent)
      store.renameSession(sessionId, newTitle)
    }

    // Get settings and validate (use session-level model if available)
    const settings = store.getSettings()
    const { providerId, providerConfig, model: effectiveModel } = getEffectiveProviderConfig(settings, sessionId)

    const configWithApiKey = await resolveConfigWithAuth(providerId, providerConfig, effectiveModel)
    if (!configWithApiKey) {
      const isOAuth = requiresOAuth(providerId)
      return {
        success: false,
        error: isOAuth
          ? `Not logged in to ${providerId}. Please login in settings.`
          : 'API Key not configured. Please configure your AI settings.',
      }
    }

    if (!isProviderSupported(providerId)) {
      return {
        success: false,
        error: `Unsupported provider: ${providerId}`,
      }
    }

    console.log(`[Backend] Using provider: ${providerId}, model: ${effectiveModel}`)

    // Create assistant message
    const assistantMessageId = uuidv4()
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      model: effectiveModel,
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      thinkingStartTime: Date.now(),
      toolCalls: [],
    }
    store.addMessage(sessionId, assistantMessage)

    // Get updated session name (may have been renamed above)
    const updatedSessionForName = store.getSession(sessionId)
    const initialResponse = {
      success: true,
      userMessage,
      messageId: assistantMessageId,
      sessionName: updatedSessionForName?.name,
    }

    // Start streaming in background using unified stream executor
    process.nextTick(async () => {
      console.log(`[Backend] Starting stream for session: ${sessionId}, model: ${configWithApiKey.model}`)

      try {
        // Build history from updated session (includes user message)
        const sessionForHistory = store.getSession(sessionId)
        const historyMessages = buildHistoryMessages(sessionForHistory?.messages || [], sessionForHistory)

        // Use unified stream executor (handles both image generation and text streaming)
        await executeMessageStream({
          sender,
          sessionId,
          assistantMessageId,
          messageContent: resolvedPromptRefs.modelContent,
          historyMessages,
          configWithApiKey,
          providerId,
          settings,
          toolSettings: settings.tools,
          sessionName: updatedSessionForName?.name,
        })
      } catch (error) {
        console.error('[Backend] Error in stream execution:', error)
      }
    })

    return initialResponse

  } catch (error) {
    const errorObject = error && typeof error === 'object' ? error : undefined
    console.error('Error starting stream:', error)
    return {
      success: false,
      error: caughtErrorMessage(errorObject, 'Failed to start streaming'),
      errorDetails: caughtErrorDetails(errorObject),
    }
  }
}

// Handle resuming streaming after user confirms a tool
async function handleResumeAfterToolConfirm(sender: Electron.WebContents, sessionId: string, messageId: string) {
  try {
    console.log(`[Backend] Resuming after tool confirm for session: ${sessionId}, message: ${messageId}`)

    const session = store.getSession(sessionId)
    if (!session) {
      return { success: false, error: 'Session not found' }
    }

    const assistantMessage = session.messages.find(m => m.id === messageId)
    if (!assistantMessage || assistantMessage.role !== 'assistant') {
      return { success: false, error: 'Assistant message not found' }
    }

    const toolCalls = assistantMessage.toolCalls || []
    const completedToolCalls = toolCalls.filter(tc => tc.status === 'completed' || tc.status === 'failed')
    if (completedToolCalls.length === 0) {
      return { success: false, error: 'No completed tool calls to process' }
    }

    // Check if there are still pending tool calls
    const pendingToolCalls = toolCalls.filter(tc => tc.status === 'pending' && tc.requiresConfirmation)
    if (pendingToolCalls.length > 0) {
      console.log(`[Backend] Still have ${pendingToolCalls.length} pending tool calls, not resuming yet`)
      return { success: false, error: 'Still have pending tool calls awaiting confirmation' }
    }

    await emitSessionEvent(sessionId, {
      type: 'content:continuation',
    })

    process.nextTick(async () => {
      try {
        await getStreamEngine().handleResumeAfterConfirm(
          sessionId,
          { type: 'command:resume-after-confirm', messageId },
          sender,
        )
      } catch (error) {
        const errorObject = error && typeof error === 'object' ? error : undefined
        console.error('[Backend] StreamEngine resume-after-confirm error:', error)
        await emitSessionEvent(sessionId, {
          type: 'stream:error',
          data: {
            error: caughtErrorMessage(errorObject, 'Failed to resume streaming'),
            errorDetails: caughtErrorDetails(errorObject),
          },
        })
      }
    })

    return { success: true }

  } catch (error) {
    const errorObject = error && typeof error === 'object' ? error : undefined
    console.error('Error resuming after tool confirm:', error)
    return {
      success: false,
      error: caughtErrorMessage(errorObject, 'Failed to resume streaming'),
      errorDetails: caughtErrorDetails(errorObject),
    }
  }
}
