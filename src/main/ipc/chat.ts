/**
 * Chat IPC Handlers
 * Main entry point for chat-related IPC handlers
 */

import { ipcMain } from 'electron'
import * as store from '../store.js'
import type { ChatMessage, MessageAttachment } from '../../shared/ipc.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { v4 as uuidv4 } from 'uuid'
import {
  generateChatResponseWithReasoning,
  generateChatTitle,
  isProviderSupported,
  requiresOAuth,
} from '../providers/index.js'
import { triggerManager } from '../services/triggers/index.js'
import { textMemoryUpdateTrigger } from '../services/triggers/text-memory-update.js'
// Note: contextCompactingTrigger removed - compacting now happens in real-time during tool loop
import { Permission } from '../permission/index.js'

// Import from chat sub-modules
import {
  buildMessageContent,
  buildHistoryMessages,
  filterHistoryForNonToolAPI,
} from './chat/message-helpers.js'
import {
  extractErrorDetails,
  getProviderConfig,
  getApiKeyForProvider,
  getEffectiveProviderConfig,
  getProviderApiType,
} from './chat/provider-helpers.js'
import { getStreamEngine } from '../engine/index.js'
import { getEventBus } from '../events/index.js'

// Register triggers on module load
triggerManager.register(textMemoryUpdateTrigger)
// Note: contextCompactingTrigger removed - compacting now happens in real-time during tool loop
// Note: Using text-based memory system instead of SQLite + embeddings

// ============================================
// IPC Handlers
// ============================================

export function registerChatHandlers() {
  // 发送消息（非流式）
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (_event, { sessionId, message }) => {
    return handleSendMessage(sessionId, message)
  })

  // 发送消息（流式）- 使用事件发射器
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE_STREAM, async (event, { sessionId, message, attachments }) => {
    return handleSendMessageStream(event.sender, sessionId, message, attachments)
  })

  // 获取聊天历史
  ipcMain.handle(IPC_CHANNELS.GET_CHAT_HISTORY, async (_event, { sessionId }) => {
    const session = store.getSession(sessionId)
    if (!session) {
      return { success: false, error: 'Session not found' }
    }
    return { success: true, messages: session.messages }
  })

  // 编辑消息并重新发送
  ipcMain.handle(IPC_CHANNELS.EDIT_AND_RESEND, async (_event, { sessionId, messageId, newContent }) => {
    return handleEditAndResend(sessionId, messageId, newContent)
  })

  // 编辑消息并重新发送（流式）
  ipcMain.handle(IPC_CHANNELS.EDIT_AND_RESEND_STREAM, async (event, { sessionId, messageId, newContent }) => {
    return handleEditAndResendStream(event.sender, sessionId, messageId, newContent)
  })

  // 生成聊天标题
  ipcMain.handle(IPC_CHANNELS.GENERATE_TITLE, async (_event, { message }) => {
    return handleGenerateTitle(message)
  })

  // 更新消息的 contentParts
  ipcMain.handle(IPC_CHANNELS.UPDATE_CONTENT_PARTS, async (_event, { sessionId, messageId, contentParts }) => {
    const updated = store.updateMessageContentParts(sessionId, messageId, contentParts)
    return { success: updated }
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
    const cancelPendingSteps = (sid: string) => {
      const session = store.getSession(sid)
      if (!session) return

      // Find the latest streaming message
      const streamingMessage = session.messages.find(m => m.isStreaming)
      if (!streamingMessage?.steps) return

      // Cancel all awaiting-confirmation and running steps
      // Store mutations + EventBus emit (IPCBridge handles IPC delivery)
      let eventBus: ReturnType<typeof getEventBus> | null = null
      try { eventBus = getEventBus() } catch { /* not initialized */ }

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
          eventBus?.emit(sid, {
            type: 'step:updated',
            stepId: step.id,
            updates: { status: 'cancelled', toolCall: step.toolCall },
          }).catch(err => console.error('[Chat] step:updated emit error:', err))
        }
      }

      // Mark message as not streaming and send aborted via EventBus
      store.updateMessageStreaming(sid, streamingMessage.id, false)
      eventBus?.emit(sid, {
        type: 'stream:aborted',
        reason: 'User cancelled',
      }).catch(err => console.error('[Chat] stream:aborted emit error:', err))
    }

    const engine = getStreamEngine()

    if (sessionId) {
      // Abort specific session's stream (includes Permission.clearSession)
      const hadStream = engine.abort(sessionId)
      // Cancel any waiting steps (store + EventBus mutations)
      cancelPendingSteps(sessionId)
      if (hadStream) {
        console.log(`[Backend] Aborted stream for session: ${sessionId}`)
        return { success: true }
      }
      return { success: false, error: 'No active stream for this session' }
    } else {
      // Abort all streams (backwards compatibility)
      const sessionIds = engine.getActiveSessionIds()
      if (sessionIds.length > 0) {
        engine.abortAll()
        return { success: true }
      }
      return { success: false, error: 'No active streams to abort' }
    }
  })

  // Get active streaming sessions
  ipcMain.handle(IPC_CHANNELS.GET_ACTIVE_STREAMS, async () => {
    return {
      success: true,
      sessionIds: getStreamEngine().getActiveSessionIds()
    }
  })

  // Resume streaming after user confirms a tool
  ipcMain.handle(IPC_CHANNELS.RESUME_AFTER_TOOL_CONFIRM, async (event, { sessionId, messageId }) => {
    return handleResumeAfterToolConfirm(event.sender, sessionId, messageId)
  })

  // ── Unified command channel (Phase 4) ──────────
  ipcMain.handle(IPC_CHANNELS.SESSION_COMMAND, async (event, { sessionId, command }) => {
    const engine = getStreamEngine()
    switch (command.type) {
      case 'command:abort-stream':
        engine.abort(sessionId)
        // cancelPendingSteps is defined above in the ABORT_STREAM handler scope
        // For unified path, we'd need to extract it. For now, delegate to existing handler.
        return { success: true }

      case 'command:permission-respond':
        // Emit to EventBus with channel='ipc' — Permission subscription validates & processes
        try {
          getEventBus().emit(sessionId, { ...command, channel: 'ipc' })
        } catch { /* EventBus not initialized */ }
        return { success: true }

      default:
        return { success: false, error: `Unknown command type: ${command.type}` }
    }
  })
}

// ============================================
// Handler Implementations
// ============================================

// Edit a user message and resend to get new AI response
async function handleEditAndResend(sessionId: string, messageId: string, newContent: string) {
  try {
    // Update the message and truncate messages after it
    const updated = store.updateMessageAndTruncate(sessionId, messageId, newContent)
    if (!updated) {
      return { success: false, error: 'Message not found' }
    }

    // Get settings and call AI
    const settings = store.getSettings()
    const providerId = settings.ai.provider
    const providerConfig = getProviderConfig(settings)

    // Get API key (handles OAuth providers)
    const apiKey = await getApiKeyForProvider(providerId, providerConfig)
    if (!apiKey) {
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

    // Get the updated session with truncated messages to build history
    const session = store.getSession(sessionId)
    const historyMessages = buildHistoryMessages(session?.messages || [], session)

    // Use AI SDK to generate response (use OAuth token as apiKey)
    const apiType = getProviderApiType(settings, providerId)
    const response = await generateChatResponseWithReasoning(
      providerId,
      {
        apiKey,  // Use the apiKey we got (OAuth token or regular API key)
        baseUrl: providerConfig?.baseUrl,
        model: providerConfig?.model || '',
        apiType,
      },
      filterHistoryForNonToolAPI(historyMessages),
      { temperature: settings.ai.temperature }
    )

    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      model: providerConfig?.model,
      content: response.text,
      timestamp: Date.now(),
      reasoning: response.reasoning,
    }

    // Save assistant message
    store.addMessage(sessionId, assistantMessage)

    return {
      success: true,
      assistantMessage,
    }
  } catch (error: any) {
    console.error('Error editing and resending message:', error)
    return {
      success: false,
      error: error.message || 'Failed to edit and resend message',
      errorDetails: extractErrorDetails(error),
    }
  }
}

// Handle streaming edit and resend (similar to handleSendMessageStream but for edits)
async function handleEditAndResendStream(sender: Electron.WebContents, sessionId: string, messageId: string, newContent: string) {
  try {
    // Update the message and truncate messages after it
    const updated = store.updateMessageAndTruncate(sessionId, messageId, newContent)
    if (!updated) {
      return { success: false, error: 'Message not found' }
    }

    // Create assistant message
    const assistantMessageId = uuidv4()
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      thinkingStartTime: Date.now(),
      toolCalls: [],
    }
    store.addMessage(sessionId, assistantMessage)

    const session = store.getSession(sessionId)
    const sessionName = session?.name

    // Return response to renderer IMMEDIATELY
    const initialResponse = {
      success: true,
      messageId: assistantMessageId,
      sessionName,
    }

    // Emit command to EventBus — StreamEngine subscribes and drives streaming
    process.nextTick(() => {
      try {
        getEventBus().emit(sessionId, {
          type: 'command:edit-and-resend',
          channel: 'ipc',
          messageId,
          newContent,
          assistantMessageId,
          sessionName,
        }).catch(err => console.error('[Chat] command:edit-and-resend emit error:', err))
      } catch { /* EventBus not initialized */ }
    })

    return initialResponse
  } catch (error: any) {
    console.error('Error in edit and resend stream:', error)
    return {
      success: false,
      error: error.message || 'Failed to edit and resend message',
      errorDetails: extractErrorDetails(error),
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

async function handleSendMessage(sessionId: string, messageContent: string) {
  try {
    // Get session to check if this is the first user message
    const session = store.getSession(sessionId)
    const isFirstUserMessage = session && session.messages.filter(m => m.role === 'user').length === 0

    // For branch sessions, check if this is the first NEW user message (after inherited messages)
    const isBranchFirstMessage = session?.parentSessionId && session.messages.length > 0 &&
      !session.messages.some(m => m.role === 'user' && m.timestamp > session.createdAt)

    // Save user message - use same ID format as frontend
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: messageContent,
      timestamp: Date.now(),
    }
    console.log('[Backend] Created user message with id:', userMessage.id)

    store.addMessage(sessionId, userMessage)

    // Auto-rename session based on first user message
    if (isFirstUserMessage || isBranchFirstMessage) {
      const newTitle = generateTitleFromMessage(messageContent)
      store.renameSession(sessionId, newTitle)
    }

    // Get settings and call AI
    const settings = store.getSettings()
    const providerId = settings.ai.provider
    const providerConfig = getProviderConfig(settings)

    // Get API key (handles OAuth providers)
    const apiKey = await getApiKeyForProvider(providerId, providerConfig)
    if (!apiKey) {
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

    // Build conversation history from session messages
    const historyMessages = buildHistoryMessages(session?.messages || [], session)

    // Use AI SDK to generate response
    const apiType = getProviderApiType(settings, providerId)
    const response = await generateChatResponseWithReasoning(
      providerId,
      {
        apiKey,
        baseUrl: providerConfig?.baseUrl,
        model: providerConfig?.model || '',
        apiType,
      },
      filterHistoryForNonToolAPI(historyMessages),
      { temperature: settings.ai.temperature }
    )

    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      model: providerConfig?.model || '',
      content: response.text,
      timestamp: Date.now(),
      reasoning: response.reasoning,
    }

    // Save assistant message
    store.addMessage(sessionId, assistantMessage)

    // Get updated session name if it was renamed
    const updatedSession = store.getSession(sessionId)
    const sessionName = updatedSession?.name

    return {
      success: true,
      userMessage,
      assistantMessage,
      sessionName, // Include updated session name for UI update
    }
  } catch (error: any) {
    console.error('Error sending message:', error)
    return {
      success: false,
      error: error.message || 'Failed to send message',
      errorDetails: extractErrorDetails(error),
    }
  }
}

// Generate chat title using AI SDK
async function handleGenerateTitle(userMessage: string) {
  try {
    const settings = store.getSettings()
    const providerId = settings.ai.provider
    const providerConfig = getProviderConfig(settings)

    // Get API key (handles OAuth providers)
    const apiKey = await getApiKeyForProvider(providerId, providerConfig)
    if (!apiKey || !isProviderSupported(providerId)) {
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
        apiKey,
        baseUrl: providerConfig?.baseUrl,
        model: providerConfig?.model || '',
        apiType,
      },
      userMessage
    )

    return { success: true, title }
  } catch (error: any) {
    console.error('Error generating title:', error)
    // Fallback to simple truncation
    return {
      success: true,
      title: userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : ''),
    }
  }
}

// Handle streaming message with event emitter
async function handleSendMessageStream(sender: Electron.WebContents, sessionId: string, messageContent: string, attachments?: MessageAttachment[]) {
  console.log(`[Backend] handleSendMessageStream called`)
  try {
    // Get session to check if this is the first user message
    const session = store.getSession(sessionId)
    const isFirstUserMessage = session && session.messages.filter(m => m.role === 'user').length === 0

    // For branch sessions, check if this is the first NEW user message (after inherited messages)
    const isBranchFirstMessage = session?.parentSessionId && session.messages.length > 0 &&
      !session.messages.some(m => m.role === 'user' && m.timestamp > session.createdAt)

    // Save user message (with attachments if provided)
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: messageContent,
      timestamp: Date.now(),
      attachments: attachments,
    }
    console.log('[Backend] Created user message with id:', userMessage.id, 'attachments:', attachments?.length || 0)
    store.addMessage(sessionId, userMessage)

    // Emit message:user-created event
    try {
      getEventBus().emit(sessionId, {
        type: 'message:user-created',
        messageId: userMessage.id,
        content: messageContent,
      }).catch(err => console.error('[Chat] message:user-created emit error:', err))
    } catch {
      // Event system not initialized — ignore
    }

    // Auto-rename session based on first user message
    if (isFirstUserMessage || isBranchFirstMessage) {
      const newTitle = generateTitleFromMessage(messageContent)
      store.renameSession(sessionId, newTitle)
    }

    // Create assistant message (model resolved later by StreamEngine)
    const assistantMessageId = uuidv4()
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      thinkingStartTime: Date.now(),
      toolCalls: [],
    }
    store.addMessage(sessionId, assistantMessage)

    // Emit message:assistant-created event
    try {
      getEventBus().emit(sessionId, {
        type: 'message:assistant-created',
        messageId: assistantMessageId,
      }).catch(err => console.error('[Chat] message:assistant-created emit error:', err))
    } catch {
      // Event system not initialized — ignore
    }

    // Get updated session name (may have been renamed above)
    const updatedSessionForName = store.getSession(sessionId)
    const sessionName = updatedSessionForName?.name

    // Return response to renderer IMMEDIATELY (sync phase done)
    const initialResponse = {
      success: true,
      userMessage,
      messageId: assistantMessageId,
      sessionName,
    }

    // Emit command to EventBus — StreamEngine subscribes and drives streaming
    process.nextTick(() => {
      try {
        getEventBus().emit(sessionId, {
          type: 'command:send-message',
          channel: 'ipc',
          content: messageContent,
          attachments,
          assistantMessageId,
          sessionName,
        }).catch(err => console.error('[Chat] command:send-message emit error:', err))
      } catch { /* EventBus not initialized */ }
    })

    return initialResponse

  } catch (error: any) {
    console.error('Error starting stream:', error)
    return {
      success: false,
      error: error.message || 'Failed to start streaming',
      errorDetails: extractErrorDetails(error),
    }
  }
}

// Handle resuming streaming after user confirms a tool
async function handleResumeAfterToolConfirm(sender: Electron.WebContents, sessionId: string, messageId: string) {
  try {
    console.log(`[Backend] Resuming after tool confirm for session: ${sessionId}, message: ${messageId}`)

    // Validate session and message state (sync checks)
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

    const pendingToolCalls = toolCalls.filter(tc => tc.status === 'pending' && tc.requiresConfirmation)
    if (pendingToolCalls.length > 0) {
      console.log(`[Backend] Still have ${pendingToolCalls.length} pending tool calls, not resuming yet`)
      return { success: false, error: 'Still have pending tool calls awaiting confirmation' }
    }

    // Delegate to StreamEngine (fire-and-forget)
    // Emit command to EventBus — StreamEngine subscribes and drives streaming
    process.nextTick(() => {
      try {
        getEventBus().emit(sessionId, {
          type: 'command:resume-after-confirm',
          messageId,
        }).catch(err => console.error('[Chat] command:resume-after-confirm emit error:', err))
      } catch { /* EventBus not initialized */ }
    })

    return { success: true }

  } catch (error: any) {
    console.error('Error resuming after tool confirm:', error)
    return {
      success: false,
      error: error.message || 'Failed to resume streaming',
      errorDetails: extractErrorDetails(error),
    }
  }
}
