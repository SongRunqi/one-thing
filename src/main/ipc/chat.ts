import { ipcMain, BrowserWindow } from 'electron'
import * as store from '../store.js'
import type { ChatMessage, AppSettings, ProviderConfig, CustomProviderConfig } from '../../shared/ipc.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { v4 as uuidv4 } from 'uuid'
import {
  generateChatResponseWithReasoning,
  generateChatTitle,
  isProviderSupported,
  streamChatResponseWithReasoning,
  shouldUseStreaming,
} from '../providers/index.js'

// Extract detailed error information from API responses
function extractErrorDetails(error: any): string | undefined {
  // AI SDK wraps errors with additional context
  if (error.cause) {
    return extractErrorDetails(error.cause)
  }

  // For API errors with response data
  if (error.data) {
    const data = error.data

    // OpenAI error format: { error: { message: "...", type: "...", code: "..." } }
    if (data.error?.message) {
      const err = data.error
      let details = err.message
      if (err.type) details += ` (type: ${err.type})`
      if (err.code) details += ` (code: ${err.code})`
      return details
    }

    // Claude/Anthropic error format
    if (data.type === 'error' && data.error) {
      const err = data.error
      return `${err.type}: ${err.message}`
    }

    if (data.message) {
      return data.message
    }

    if (typeof data === 'string') {
      return data
    }

    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return undefined
    }
  }

  // Return message or stack trace
  return error.message || error.stack
}

// Helper to get current provider config
function getProviderConfig(settings: AppSettings): ProviderConfig {
  return settings.ai.providers[settings.ai.provider]
}

// Helper to get custom provider config by ID
function getCustomProviderConfig(settings: AppSettings, providerId: string): CustomProviderConfig | undefined {
  return settings.ai.customProviders?.find(p => p.id === providerId)
}

// Helper to get apiType for a provider
function getProviderApiType(settings: AppSettings, providerId: string): 'openai' | 'anthropic' | undefined {
  if (providerId.startsWith('custom-')) {
    const customProvider = getCustomProviderConfig(settings, providerId)
    return customProvider?.apiType
  }
  return undefined
}

export function registerChatHandlers() {
  // 发送消息（所有模型都使用流式，为了更快的反馈）
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (event, { sessionId, message }) => {
    return handleSendMessageStream(sessionId, message, event.sender)
  })

  // 发送消息（流式，用于 reasoning 模型） - 保持向后兼容
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE_STREAM, async (event, { sessionId, message }) => {
    return handleSendMessageStream(sessionId, message, event.sender)
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

  // 生成聊天标题
  ipcMain.handle(IPC_CHANNELS.GENERATE_TITLE, async (_event, { message }) => {
    return handleGenerateTitle(message)
  })
}

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

    if (!providerConfig.apiKey) {
      return {
        success: false,
        error: 'API Key not configured. Please configure your AI settings.',
      }
    }

    if (!isProviderSupported(providerId)) {
      return {
        success: false,
        error: `Unsupported provider: ${providerId}`,
      }
    }

    // Use AI SDK to generate response
    const apiType = getProviderApiType(settings, providerId)
    const response = await generateChatResponseWithReasoning(
      providerId,
      {
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        model: providerConfig.model,
        apiType,
      },
      [{ role: 'user', content: newContent }],
      { temperature: settings.ai.temperature }
    )

    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
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


// Generate chat title using AI SDK
async function handleGenerateTitle(userMessage: string) {
  try {
    const settings = store.getSettings()
    const providerId = settings.ai.provider
    const providerConfig = getProviderConfig(settings)

    if (!providerConfig.apiKey || !isProviderSupported(providerId)) {
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
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        model: providerConfig.model,
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

// Handle streaming message for reasoning models
async function handleSendMessageStream(
  sessionId: string,
  messageContent: string,
  webContents: Electron.WebContents
) {
  try {
    // Get session to check if this is the first user message
    const session = store.getSession(sessionId)
    const isFirstUserMessage = session && session.messages.filter(m => m.role === 'user').length === 0

    // For branch sessions, check if this is the first NEW user message (after inherited messages)
    const isBranchFirstMessage = session?.parentSessionId && session.messages.length > 0 &&
      !session.messages.some(m => m.role === 'user' && m.timestamp > session.createdAt)

    // Save user message
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: messageContent,
      timestamp: Date.now(),
    }

    store.addMessage(sessionId, userMessage)

    // Auto-rename session based on first user message
    if (isFirstUserMessage || isBranchFirstMessage) {
      const newTitle = generateTitleFromMessage(messageContent)
      store.renameSession(sessionId, newTitle)
    }

    // Get settings
    const settings = store.getSettings()
    const providerId = settings.ai.provider
    const providerConfig = getProviderConfig(settings)

    if (!providerConfig.apiKey) {
      webContents.send(IPC_CHANNELS.STREAM_ERROR, {
        error: 'API Key not configured. Please configure your AI settings.',
      })
      return {
        success: false,
        error: 'API Key not configured. Please configure your AI settings.',
      }
    }

    if (!isProviderSupported(providerId)) {
      webContents.send(IPC_CHANNELS.STREAM_ERROR, {
        error: `Unsupported provider: ${providerId}`,
      })
      return {
        success: false,
        error: `Unsupported provider: ${providerId}`,
      }
    }

    // Generate message ID for the assistant message
    const assistantMessageId = uuidv4()

    // Use streaming API with callbacks
    const apiType = getProviderApiType(settings, providerId)
    const response = await streamChatResponseWithReasoning(
      providerId,
      {
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        model: providerConfig.model,
        apiType,
      },
      [{ role: 'user', content: messageContent }],
      {
        onReasoningDelta: (delta) => {
          webContents.send(IPC_CHANNELS.STREAM_REASONING_DELTA, {
            messageId: assistantMessageId,
            delta,
          })
        },
        onTextDelta: (delta) => {
          webContents.send(IPC_CHANNELS.STREAM_TEXT_DELTA, {
            messageId: assistantMessageId,
            delta,
          })
        },
        onComplete: (result) => {
          webContents.send(IPC_CHANNELS.STREAM_COMPLETE, {
            messageId: assistantMessageId,
            text: result.text,
            reasoning: result.reasoning,
          })
        },
        onError: (error) => {
          webContents.send(IPC_CHANNELS.STREAM_ERROR, {
            messageId: assistantMessageId,
            error: error.message,
            errorDetails: extractErrorDetails(error),
          })
        },
      },
      { temperature: settings.ai.temperature }
    )

    // Save final assistant message
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: response.text,
      timestamp: Date.now(),
      reasoning: response.reasoning,
    }

    store.addMessage(sessionId, assistantMessage)

    // Get updated session name if it was renamed
    const updatedSession = store.getSession(sessionId)
    const sessionName = updatedSession?.name

    return {
      success: true,
      userMessage,
      assistantMessageId,
      sessionName,
    }
  } catch (error: any) {
    console.error('Error sending streaming message:', error)
    webContents.send(IPC_CHANNELS.STREAM_ERROR, {
      error: error.message || 'Failed to send message',
      errorDetails: extractErrorDetails(error),
    })
    return {
      success: false,
      error: error.message || 'Failed to send message',
      errorDetails: extractErrorDetails(error),
    }
  }
}

// Export helper to check if streaming should be used
export function checkShouldUseStreaming(): boolean {
  const settings = store.getSettings()
  const providerId = settings.ai.provider
  const providerConfig = getProviderConfig(settings)
  return shouldUseStreaming(providerId, providerConfig.model)
}
