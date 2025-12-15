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
  // 发送消息（非流式）
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (_event, { sessionId, message }) => {
    return handleSendMessage(sessionId, message)
  })

  // 发送消息（流式）- 使用事件发射器
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE_STREAM, async (event, { sessionId, message }) => {
    return handleSendMessageStream(event.sender, sessionId, message)
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

async function handleSendMessage(sessionId: string, messageContent: string) {
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
      [{ role: 'user', content: messageContent }],
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

// Handle streaming message with event emitter
async function handleSendMessageStream(sender: Electron.WebContents, sessionId: string, messageContent: string) {
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

    // Create assistant message with empty content initially
    const assistantMessageId = uuidv4()
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    }

    // Add empty assistant message to store
    store.addMessage(sessionId, assistantMessage)

    // Send initial response with message ID and user message
    const initialResponse = {
      success: true,
      userMessage,
      messageId: assistantMessageId,
      sessionName: session?.name,
    }

    // Start streaming in background
    setTimeout(async () => {
      try {
        // Use AI SDK to generate streaming response
        const apiType = getProviderApiType(settings, providerId)
        const stream = streamChatResponseWithReasoning(
          providerId,
          {
            apiKey: providerConfig.apiKey,
            baseUrl: providerConfig.baseUrl,
            model: providerConfig.model,
            apiType,
          },
          [{ role: 'user', content: messageContent }],
          { temperature: settings.ai.temperature }
        )

        let accumulatedContent = ''
        let accumulatedReasoning = ''

        // Process stream chunks
        for await (const chunk of stream) {
          if (chunk.text) {
            accumulatedContent += chunk.text

            // Update message in store with accumulated content
            store.updateMessageContent(sessionId, assistantMessageId, accumulatedContent)

            // Send text chunk via event
            sender.send('chat:stream-chunk', {
              type: 'text',
              content: chunk.text,
              messageId: assistantMessageId,
            })
          }

          if (chunk.reasoning) {
            accumulatedReasoning = chunk.reasoning

            // Update reasoning in store
            store.updateMessageReasoning(sessionId, assistantMessageId, accumulatedReasoning)

            // Send reasoning chunk via event
            sender.send('chat:stream-chunk', {
              type: 'reasoning',
              content: '',
              messageId: assistantMessageId,
              reasoning: chunk.reasoning,
            })
          }
        }

        // Stream complete - finalize message
        store.updateMessageStreaming(sessionId, assistantMessageId, false)

        // Get updated session name if it was renamed
        const updatedSession = store.getSession(sessionId)
        const sessionName = updatedSession?.name

        // Send completion event
        sender.send('chat:stream-complete', {
          messageId: assistantMessageId,
          sessionName,
        })

      } catch (error: any) {
        console.error('Error in streaming background task:', error)

        // Send error event
        sender.send('chat:stream-error', {
          messageId: assistantMessageId,
          error: error.message || 'Failed to stream message',
          errorDetails: extractErrorDetails(error),
        })
      }
    }, 0)

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
