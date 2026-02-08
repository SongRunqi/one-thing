/**
 * Chat IPC Handlers
 * Main entry point for chat-related IPC handlers
 */

import { ipcMain } from 'electron'
import {
  getSession,
  addMessage,
  deleteMessage,
  renameSession,
  updateMessageAndTruncate,
  updateMessageContentParts,
  updateMessageThinkingTime,
  updateMessageStreaming,
  updateMessageStep,
  updateMessageContent,
  updateMessageUsage,
  updateMessageError,
} from '../stores/sessions.js'
import { getSettings } from '../stores/settings.js'
import { getWorkspace } from '../stores/workspaces.js'
import type { ChatMessage, MessageAttachment } from '../../shared/ipc.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { v4 as uuidv4 } from 'uuid'
import {
  generateChatResponseWithReasoning,
  generateChatTitle,
  isProviderSupported,
  requiresOAuth,
  convertToolDefinitionsForAI,
  type ToolChatMessage,
} from '../providers/index.js'
import {
  getEnabledToolsAsync,
  setInitContext,
  initializeAsyncTools,
} from '../tools/index.js'
import { getMCPToolsForAI } from '../mcp/index.js'
import { getSkillsForSession } from './skills.js'
import { getStorage } from '../storage/index.js'
import { getCustomAgentById } from '../services/custom-agent/index.js'
import { triggerManager } from '../services/triggers/index.js'
import { textMemoryUpdateTrigger } from '../services/triggers/text-memory-update.js'
// Note: contextCompactingTrigger removed - compacting now happens in real-time during tool loop
// Note: memoryExtractionTrigger replaced with textMemoryUpdateTrigger for text-based memory system
import { Permission } from '../permission/index.js'
import { saveMediaImage } from './media.js'
import * as modelRegistry from '../services/ai/model-registry.js'

// Import from chat sub-modules
import {
  sendUIMessageFinish,
} from './chat/stream-helpers.js'
import {
  executeMessageStream,
} from './chat/stream-executor.js'
import {
  formatUserProfilePrompt,
  retrieveRelevantFacts,
  retrieveRelevantAgentMemories,
  formatAgentMemoryPrompt,
  getTextFromContent,
} from './chat/memory-helpers.js'
import {
  formatMessagesForLog,
  buildMessageContent,
  buildHistoryMessages,
  buildSystemPrompt,
  filterHistoryForNonToolAPI,
} from './chat/message-helpers.js'
import {
  extractErrorDetails,
  getProviderConfig,
  getApiKeyForProvider,
  getEffectiveProviderConfig,
  getProviderApiType,
} from './chat/provider-helpers.js'
import {
  activeStreams,
  createStreamProcessor,
  type StreamContext,
} from './chat/stream-processor.js'
import type { ProviderConfigWithKey } from './chat/stream-executor.js'
import {
  executeToolAndUpdate,
} from './chat/tool-execution.js'
import {
  runStream,
  executeStreamGeneration,
} from './chat/tool-loop.js'

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
    const session = getSession(sessionId)
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
    const updated = updateMessageContentParts(sessionId, messageId, contentParts)
    return { success: updated }
  })

  // 更新消息的 thinkingTime（用于持久化thinking时长）
  ipcMain.handle(IPC_CHANNELS.UPDATE_MESSAGE_THINKING_TIME, async (_event, { sessionId, messageId, thinkingTime }) => {
    const updated = updateMessageThinkingTime(sessionId, messageId, thinkingTime)
    return { success: updated }
  })

  // 中止当前流式请求 (支持指定 sessionId)
  ipcMain.handle(IPC_CHANNELS.ABORT_STREAM, async (event, { sessionId } = {}) => {
    const sender = event.sender

    // Helper to cancel pending/running steps for a session
    const cancelPendingSteps = (sid: string) => {
      const session = getSession(sid)
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
          updateMessageStep(sid, streamingMessage.id, step.id, {
            status: 'cancelled',
            toolCall: step.toolCall,
          })
          sender.send(IPC_CHANNELS.STEP_UPDATED, {
            sessionId: sid,
            messageId: streamingMessage.id,
            stepId: step.id,
            updates: { status: 'cancelled', toolCall: step.toolCall },
          })
        }
      }

      // Mark message as not streaming and send complete
      updateMessageStreaming(sid, streamingMessage.id, false)
      sender.send(IPC_CHANNELS.STREAM_COMPLETE, {
        messageId: streamingMessage.id,
        sessionId: sid,
        aborted: true,
      })
    }

    if (sessionId) {
      // Abort specific session's stream
      const controller = activeStreams.get(sessionId)
      if (controller) {
        console.log(`[Backend] Aborting stream for session: ${sessionId}`)
        controller.abort()
        activeStreams.delete(sessionId)
        // Clear any pending permission requests for this session
        Permission.clearSession(sessionId)
        // Cancel any waiting steps
        cancelPendingSteps(sessionId)
        return { success: true }
      }
      // Even if no active stream, still clear pending permissions and cancel waiting steps
      Permission.clearSession(sessionId)
      cancelPendingSteps(sessionId)
      return { success: false, error: 'No active stream for this session' }
    } else {
      // Abort all streams (backwards compatibility)
      if (activeStreams.size > 0) {
        console.log(`[Backend] Aborting all active streams (${activeStreams.size})`)
        for (const [sid, controller] of activeStreams) {
          controller.abort()
          // Clear any pending permission requests for each session
          Permission.clearSession(sid)
        }
        activeStreams.clear()
        return { success: true }
      }
      return { success: false, error: 'No active streams to abort' }
    }
  })

  // Get active streaming sessions
  ipcMain.handle(IPC_CHANNELS.GET_ACTIVE_STREAMS, async () => {
    return {
      success: true,
      sessionIds: Array.from(activeStreams.keys())
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

// Edit a user message and resend to get new AI response
async function handleEditAndResend(sessionId: string, messageId: string, newContent: string) {
  try {
    // Update the message and truncate messages after it
    const updated = updateMessageAndTruncate(sessionId, messageId, newContent)
    if (!updated) {
      return { success: false, error: 'Message not found' }
    }

    // Get settings and call AI
    const settings = getSettings()
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
    const session = getSession(sessionId)
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
    addMessage(sessionId, assistantMessage)

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
    const updated = updateMessageAndTruncate(sessionId, messageId, newContent)
    if (!updated) {
      return { success: false, error: 'Message not found' }
    }

    // Get settings and validate (use session-level model if available)
    const settings = getSettings()
    const { providerId, providerConfig, model: effectiveModel } = getEffectiveProviderConfig(settings, sessionId)

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

    // Create config with the API key (for OAuth providers, this is the OAuth token)
    const configWithApiKey: ProviderConfigWithKey = {
      ...providerConfig,
      model: effectiveModel,
      selectedModels: providerConfig?.selectedModels ?? [effectiveModel],
      apiKey,
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
    addMessage(sessionId, assistantMessage)

    // Get session and build history
    const session = getSession(sessionId)
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
          messageContent: newContent,  // Use the edited content as prompt
          historyMessages,
          configWithApiKey,
          providerId,
          settings,
          toolSettings: settings.tools,
          sessionName: session?.name,
        })
      } catch (error: any) {
        console.error('[Backend] Error in edit/resend stream execution:', error)
      }
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
    const session = getSession(sessionId)
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

    addMessage(sessionId, userMessage)

    // Auto-rename session based on first user message
    if (isFirstUserMessage || isBranchFirstMessage) {
      const newTitle = generateTitleFromMessage(messageContent)
      renameSession(sessionId, newTitle)
    }

    // Get settings and call AI
    const settings = getSettings()
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
    addMessage(sessionId, assistantMessage)

    // Get updated session name if it was renamed
    const updatedSession = getSession(sessionId)
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
    const settings = getSettings()
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
  console.log(`[Backend] handleSendMessageStream called - BUILD_VERSION: 2025-01-05-v2`)
  try {
    // Get session to check if this is the first user message
    const session = getSession(sessionId)
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
      attachments: attachments, // Include file/image attachments
    }
    console.log('[Backend] Created user message with id:', userMessage.id, 'attachments:', attachments?.length || 0)
    addMessage(sessionId, userMessage)

    // Auto-rename session based on first user message
    if (isFirstUserMessage || isBranchFirstMessage) {
      const newTitle = generateTitleFromMessage(messageContent)
      renameSession(sessionId, newTitle)
    }

    // Get settings and validate (use session-level model if available)
    const settings = getSettings()
    const { providerId, providerConfig, model: effectiveModel } = getEffectiveProviderConfig(settings, sessionId)

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

    // Create config with the API key (for OAuth providers, this is the OAuth token)
    const configWithApiKey: ProviderConfigWithKey = {
      ...providerConfig,
      model: effectiveModel,
      selectedModels: providerConfig?.selectedModels ?? [effectiveModel],
      apiKey,
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
    addMessage(sessionId, assistantMessage)

    // Get updated session name (may have been renamed above)
    const updatedSessionForName = getSession(sessionId)
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
        const sessionForHistory = getSession(sessionId)
        const historyMessages = buildHistoryMessages(sessionForHistory?.messages || [], sessionForHistory)

        // Use unified stream executor (handles both image generation and text streaming)
        await executeMessageStream({
          sender,
          sessionId,
          assistantMessageId,
          messageContent,
          historyMessages,
          configWithApiKey,
          providerId,
          settings,
          toolSettings: settings.tools,
          sessionName: updatedSessionForName?.name,
        })
      } catch (error: any) {
        console.error('[Backend] Error in stream execution:', error)
      }
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

    // Get session
    const session = getSession(sessionId)
    if (!session) {
      return { success: false, error: 'Session not found' }
    }

    // Find the assistant message with tool calls
    const assistantMessage = session.messages.find(m => m.id === messageId)
    if (!assistantMessage || assistantMessage.role !== 'assistant') {
      return { success: false, error: 'Assistant message not found' }
    }

    // Check if there are completed tool calls to process
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

    // Get settings and validate (use session-level model if available)
    const settings = getSettings()
    const { providerId, providerConfig, model: effectiveModel } = getEffectiveProviderConfig(settings, sessionId)

    // Get API key (handles OAuth providers)
    const apiKey = await getApiKeyForProvider(providerId, providerConfig)
    if (!apiKey) {
      const isOAuth = requiresOAuth(providerId)
      return {
        success: false,
        error: isOAuth
          ? `Not logged in to ${providerId}. Please login in settings.`
          : 'API Key not configured',
      }
    }

    // Create config with the API key (for OAuth providers, this is the OAuth token)
    const configWithApiKey: ProviderConfigWithKey = {
      ...providerConfig,
      model: effectiveModel,
      selectedModels: providerConfig?.selectedModels ?? [effectiveModel],
      apiKey,
    }

    if (!isProviderSupported(providerId)) {
      return { success: false, error: `Unsupported provider: ${providerId}` }
    }

    // Build conversation messages for continuation
    // We need to include history + assistant message with tool calls + tool results
    const historyMessages = buildHistoryMessages(session.messages, session)

    // Filter out the current assistant message from history (we'll add it with tool calls)
    const historyWithoutCurrent = historyMessages.filter((_, idx) => {
      // Remove the last assistant message if it matches our message
      const msgCount = historyMessages.length
      return idx !== msgCount - 1 || historyMessages[idx].role !== 'assistant'
    })

    // Build tool-aware conversation messages
    const conversationMessages: ToolChatMessage[] = []

    // Load skills first (before tools, as SkillTool needs them in InitContext)
    const skillsSettings = settings.skills
    const skillsEnabled = skillsSettings?.enableSkills !== false
    const enabledSkills = skillsEnabled ? getSkillsForSession(session.workingDirectory) : []

    // Get agent for permission context
    const currentAgent = session.agentId ? getCustomAgentById(session.agentId, session.workingDirectory) : undefined

    // Set init context for async tools (like SkillTool)
    if (settings.tools?.enableToolCalls) {
      setInitContext({
        agent: currentAgent ? {
          id: currentAgent.id,
          name: currentAgent.name,
          permissions: undefined, // CustomAgents use allowBuiltinTools/allowedBuiltinTools instead
        } : undefined,
        skills: enabledSkills.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          source: s.source,
          path: s.path,
          directoryPath: s.directoryPath,
          enabled: s.enabled,
          instructions: s.instructions,
          files: s.files?.map(f => ({ name: f.name, path: f.path, type: f.type as 'markdown' | 'script' | 'template' | 'other' })),
        })),
      })
      await initializeAsyncTools()
    }

    // Add system prompt
    // Use async version to include tools with dynamic descriptions
    // Pass toolSettings.tools to filter based on user's per-tool enabled settings
    const allEnabledTools = settings.tools?.enableToolCalls ? await getEnabledToolsAsync(settings.tools.tools) : []
    const enabledTools = allEnabledTools.filter(t => !t.id.startsWith('mcp:'))
    const mcpTools = settings.tools?.enableToolCalls ? getMCPToolsForAI(settings.tools.tools) : {}

    // Check if the current model supports tools using Models.dev tool_call field
    const supportsTools = await modelRegistry.modelSupportsTools(providerConfig?.model || '', providerId)
    if (!supportsTools) {
      console.log(`[Chat] Model ${providerConfig?.model} does not support tools, skipping tool calls`)
    }

    const hasTools = supportsTools && (enabledTools.length > 0 || Object.keys(mcpTools).length > 0)

    // Load user profile (shared) and agent memory (per-agent) for system prompt
    let userProfilePrompt: string | undefined
    let agentMemoryPrompt: string | undefined
    const agentId = session.agentId

    // Get the last user message for retrieval-based memory injection
    const lastUserMsgContent = historyWithoutCurrent
      .filter(m => m.role === 'user')
      .pop()?.content
    const lastUserMsg = lastUserMsgContent ? getTextFromContent(lastUserMsgContent) : ''

    // Check if memory is enabled in settings
    const memorySettings = getSettings()
    const memoryEnabled = memorySettings.embedding?.memoryEnabled !== false

    // Retrieve relevant user facts based on conversation context (semantic search)
    if (memoryEnabled) {
      try {
        const storage = getStorage()
        const relevantFacts = await retrieveRelevantFacts(storage, lastUserMsg, 10, 0.3)
        if (relevantFacts.length > 0) {
          userProfilePrompt = formatUserProfilePrompt(relevantFacts)
          console.log(`[Chat] Retrieved ${relevantFacts.length} relevant facts for resume context`)
        }
      } catch (error) {
        console.error('Failed to retrieve relevant facts:', error)
      }
    }

    // Load agent-specific memory only for agent sessions
    if (agentId && memoryEnabled) {
      try {
        const storage = getStorage()
        const agentRelationship = await storage.agentMemory.getRelationship(agentId)
        if (agentRelationship) {
          // Use semantic search to retrieve context-relevant memories
          const relevantMemories = await retrieveRelevantAgentMemories(
            storage, agentId, lastUserMsg, 5, 0.3
          )
          if (relevantMemories.length > 0) {
            console.log(`[Chat] Retrieved ${relevantMemories.length} relevant agent memories for resume context`)
          }
          agentMemoryPrompt = formatAgentMemoryPrompt(agentRelationship, relevantMemories)
        }
      } catch (error) {
        console.error('Failed to load agent memory:', error)
      }
    }

    // Get workspace/agent system prompt
    let characterSystemPrompt: string | undefined
    if (session.workspaceId) {
      const workspace = getWorkspace(session.workspaceId)
      characterSystemPrompt = workspace?.systemPrompt
    } else if (session.agentId) {
      const agent = getCustomAgentById(session.agentId, session.workingDirectory)
      characterSystemPrompt = agent?.systemPrompt
    }

    const systemPrompt = buildSystemPrompt({
      hasTools,
      skills: enabledSkills,
      workspaceSystemPrompt: characterSystemPrompt,
      userProfilePrompt,
      agentMemoryPrompt,
      providerId,
      workingDirectory: session.workingDirectory,
      builtinMode: session.builtinMode,
      sessionPlan: session.plan,
    })

    conversationMessages.push({ role: 'system', content: systemPrompt })

    // Add history messages (excluding current assistant message)
    for (const msg of historyWithoutCurrent) {
      if (msg.role === 'user') {
        conversationMessages.push({ role: 'user', content: msg.content })
      } else if (msg.role === 'assistant') {
        conversationMessages.push({
          role: 'assistant',
          content: msg.content,
          ...(msg.toolCalls && { toolCalls: msg.toolCalls }),
          ...(msg.reasoningContent && { reasoningContent: msg.reasoningContent }),
        })
      } else if (msg.role === 'tool') {
        conversationMessages.push({ role: 'tool', content: msg.content })
      }
    }

    // Add the assistant message with tool calls
    conversationMessages.push({
      role: 'assistant',
      content: assistantMessage.content || '',
      toolCalls: toolCalls.map(tc => ({
        toolCallId: tc.id,
        toolName: tc.toolName,
        args: tc.arguments,
      })),
      ...(assistantMessage.reasoning && { reasoningContent: assistantMessage.reasoning }),
    })

    // Add tool results
    conversationMessages.push({
      role: 'tool',
      content: toolCalls.map(tc => ({
        type: 'tool-result' as const,
        toolCallId: tc.id,
        toolName: tc.toolName,
        result: tc.status === 'completed' ? tc.result : { error: tc.error },
      })),
    })

    // Send continuation chunk immediately to show waiting indicator
    sender.send(IPC_CHANNELS.STREAM_CHUNK, {
      type: 'continuation',
      content: '',
      messageId,
      sessionId,
    })

    // Start streaming continuation in background
    process.nextTick(async () => {
      const abortController = new AbortController()
      activeStreams.set(sessionId, abortController)

      const ctx: StreamContext = {
        sender,
        sessionId,
        assistantMessageId: messageId,
        abortSignal: abortController.signal,
        settings,
        providerConfig: configWithApiKey,
        providerId,
        toolSettings: settings.tools,
      }

      // Initialize processor with existing message content to preserve it
      const processor = createStreamProcessor(ctx, {
        content: assistantMessage.content || '',
        reasoning: assistantMessage.reasoning || '',
      })

      try {
        console.log('[Backend] Continuing tool loop after confirmation')

        // Log request start
        const requestStartTime = Date.now()
        console.log('[Chat] ===== Resume Request Start =====')
        console.log('[Chat] Time:', new Date(requestStartTime).toISOString())
        console.log('[Chat] Provider:', providerId)
        console.log('[Chat] Model:', configWithApiKey.model)
        console.log('[Chat] System Prompt:', systemPrompt)
        console.log('[Chat] Messages:', JSON.stringify(formatMessagesForLog(conversationMessages), null, 2))

        // Build tools for AI
        const builtinToolsForAI = convertToolDefinitionsForAI(enabledTools)
        const toolsForAI = { ...builtinToolsForAI, ...mcpTools }

        // Continue the stream (resume after tool confirmation)
        const result = await runStream(ctx, conversationMessages, systemPrompt, toolsForAI, processor, enabledSkills)

        // Log request end
        const requestEndTime = Date.now()
        const requestDuration = (requestEndTime - requestStartTime) / 1000
        console.log('[Chat] ===== Resume Request End =====')
        console.log('[Chat] End Time:', new Date(requestEndTime).toISOString())
        console.log('[Chat] Duration:', requestDuration.toFixed(2), 'seconds')

        // Only finalize and send complete if not paused for another confirmation
        if (!result.pausedForConfirmation) {
          processor.finalize()
          sender.send(IPC_CHANNELS.STREAM_COMPLETE, {
            messageId,
            sessionId,
            sessionName: session.name,
          })
          console.log('[Backend] Resume streaming complete')
          // Only remove controller if stream completed
          activeStreams.delete(sessionId)
        } else {
          console.log('[Backend] Resume paused for another tool confirmation')
          // Keep controller in activeStreams for abort support
        }

      } catch (error: any) {
        const isAborted = error.name === 'AbortError' || abortController.signal.aborted
        if (isAborted) {
          console.log('[Backend] Resume stream aborted by user')
          processor.finalize()
          sender.send(IPC_CHANNELS.STREAM_COMPLETE, {
            messageId,
            sessionId,
            sessionName: session.name,
            aborted: true,
          })
        } else {
          console.error('[Backend] Resume streaming error:', error)

          // Remove the failed assistant message from storage
          deleteMessage(sessionId, messageId)

          // Add an error message to the session (persisted)
          const errorMessage: ChatMessage = {
            id: `error-${Date.now()}`,
            role: 'error',
            content: error.message || 'Streaming error',
            timestamp: Date.now(),
            errorDetails: extractErrorDetails(error),
          }
          addMessage(sessionId, errorMessage)

          sender.send(IPC_CHANNELS.STREAM_ERROR, {
            messageId,
            sessionId,
            error: error.message || 'Streaming error',
            errorDetails: extractErrorDetails(error),
          })
        }
        // On error/abort, always remove controller
        activeStreams.delete(sessionId)
      }
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
