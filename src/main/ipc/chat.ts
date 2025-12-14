import { ipcMain } from 'electron'
import axios, { AxiosError } from 'axios'
import * as store from '../store.js'
import type { ChatMessage } from '../../shared/ipc.js'
import { IPC_CHANNELS, AIProvider } from '../../shared/ipc.js'
import { v4 as uuidv4 } from 'uuid'

// Parse API errors into user-friendly messages with original API response
interface ParsedError {
  message: string // User-friendly message
  details?: string // Original API error details
}

function parseAPIError(error: AxiosError, provider: string, model: string): ParsedError {
  const status = error.response?.status
  const data = error.response?.data as any

  // Extract error message from response
  const apiMessage =
    data?.error?.message || data?.error?.code || data?.message || data?.error || ''

  // Format original API response for display
  const details = apiMessage
    ? `[${status || 'Error'}] ${apiMessage}`
    : status
      ? `HTTP ${status}`
      : undefined

  // Common error patterns with user-friendly messages
  if (status === 400) {
    if (apiMessage.includes('model') || apiMessage.includes('does not exist')) {
      return {
        message: `Invalid model "${model}". Please check your model name in Settings.`,
        details,
      }
    }
    if (apiMessage.includes('messages')) {
      return { message: `Invalid message format.`, details }
    }
    return { message: `Bad request. Please check your API configuration.`, details }
  }

  if (status === 401) {
    return {
      message: `Authentication failed. Your ${provider} API key is invalid or expired.`,
      details,
    }
  }

  if (status === 403) {
    return {
      message: `Access denied. Your API key doesn't have permission to use model "${model}".`,
      details,
    }
  }

  if (status === 404) {
    return {
      message: `Model "${model}" not found. Please check the model name in Settings.`,
      details,
    }
  }

  if (status === 429) {
    return {
      message: `Rate limit exceeded. Please wait a moment and try again.`,
      details,
    }
  }

  if (status === 500 || status === 502 || status === 503) {
    return {
      message: `${provider} service is temporarily unavailable. Please try again later.`,
      details,
    }
  }

  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return {
      message: `Cannot connect to ${provider} API. Please check your internet connection.`,
      details: error.code,
    }
  }

  if (error.code === 'ETIMEDOUT') {
    return { message: `Request timed out. Please try again.`, details: error.code }
  }

  // Fallback
  return {
    message: error.message || 'An unexpected error occurred',
    details,
  }
}

export function registerChatHandlers() {
  // 发送消息
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (_event, { sessionId, message }) => {
    return handleSendMessage(sessionId, message)
  })

  // 获取聊天历史
  ipcMain.handle(IPC_CHANNELS.GET_CHAT_HISTORY, async (_event, { sessionId }) => {
    const session = store.getSession(sessionId)
    if (!session) {
      return { success: false, error: 'Session not found' }
    }
    return { success: true, messages: session.messages }
  })

  // 生成聊天标题
  ipcMain.handle(IPC_CHANNELS.GENERATE_TITLE, async (_event, { message }) => {
    return handleGenerateTitle(message)
  })

  // 编辑消息并重新发送
  ipcMain.handle(
    IPC_CHANNELS.EDIT_AND_RESEND,
    async (_event, { sessionId, messageId, newContent }) => {
      return handleEditAndResend(sessionId, messageId, newContent)
    }
  )
}

async function handleSendMessage(sessionId: string, messageContent: string) {
  try {
    // Save user message
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: messageContent,
      timestamp: Date.now(),
    }

    store.addMessage(sessionId, userMessage)

    // Get settings and call AI
    const settings = store.getSettings()

    if (!settings.ai.apiKey) {
      return {
        success: false,
        error: 'API Key not configured. Please configure your AI settings.',
      }
    }

    let assistantMessage: ChatMessage

    switch (settings.ai.provider) {
      case AIProvider.OpenAI:
        assistantMessage = await callOpenAI(messageContent, settings)
        break
      case AIProvider.Claude:
        assistantMessage = await callClaude(messageContent, settings)
        break
      case AIProvider.Custom:
        assistantMessage = await callCustomAPI(messageContent, settings)
        break
      default:
        throw new Error('Unknown AI provider')
    }

    // Save assistant message
    store.addMessage(sessionId, assistantMessage)

    return {
      success: true,
      userMessage,
      assistantMessage,
    }
  } catch (error: any) {
    console.error('Error sending message:', error)

    const settings = store.getSettings()
    const providerNames: Record<string, string> = {
      openai: 'OpenAI',
      claude: 'Claude',
      custom: 'Custom API',
    }
    const providerName = providerNames[settings.ai.provider] || settings.ai.provider

    // Parse error for user-friendly message with details
    let errorMessage: string
    let errorDetails: string | undefined

    if (axios.isAxiosError(error)) {
      const parsed = parseAPIError(error, providerName, settings.ai.model)
      errorMessage = parsed.message
      errorDetails = parsed.details
    } else {
      errorMessage = error.message || 'Failed to send message'
    }

    return {
      success: false,
      error: errorMessage,
      errorDetails, // Original API response for debugging
    }
  }
}

async function callOpenAI(message: string, settings: any): Promise<ChatMessage> {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: settings.ai.model,
      messages: [{ role: 'user', content: message }],
      temperature: settings.ai.temperature,
    },
    {
      headers: {
        'Authorization': `Bearer ${settings.ai.apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  )

  const assistantMessage: ChatMessage = {
    id: uuidv4(),
    role: 'assistant',
    content: response.data.choices[0].message.content,
    timestamp: Date.now(),
  }

  return assistantMessage
}

async function callClaude(message: string, settings: any): Promise<ChatMessage> {
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: settings.ai.model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: message }],
    },
    {
      headers: {
        'x-api-key': settings.ai.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    }
  )

  const assistantMessage: ChatMessage = {
    id: uuidv4(),
    role: 'assistant',
    content: response.data.content[0].text,
    timestamp: Date.now(),
  }

  return assistantMessage
}

async function callCustomAPI(message: string, settings: any): Promise<ChatMessage> {
  if (!settings.ai.customApiUrl) {
    throw new Error('Custom API URL is not configured')
  }

  // Use OpenAI-compatible format for custom API
  const response = await axios.post(
    settings.ai.customApiUrl,
    {
      model: settings.ai.model,
      messages: [{ role: 'user', content: message }],
      temperature: settings.ai.temperature,
    },
    {
      headers: {
        'Authorization': `Bearer ${settings.ai.apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  )

  // Handle OpenAI-compatible response format
  const content =
    response.data.choices?.[0]?.message?.content ||
    response.data.message ||
    response.data.content

  const assistantMessage: ChatMessage = {
    id: uuidv4(),
    role: 'assistant',
    content,
    timestamp: Date.now(),
  }

  return assistantMessage
}

// 生成聊天标题
async function handleGenerateTitle(userMessage: string) {
  try {
    const settings = store.getSettings()

    if (!settings.ai.apiKey) {
      // 如果没有 API key，使用简单的截取方式
      return {
        success: true,
        title: userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : ''),
      }
    }

    const prompt = `Generate a short, concise title (max 6 words) for a chat conversation that starts with this message. Only respond with the title, nothing else:\n\n"${userMessage}"`

    let title: string

    switch (settings.ai.provider) {
      case AIProvider.OpenAI:
        title = await generateTitleWithOpenAI(prompt, settings)
        break
      case AIProvider.Claude:
        title = await generateTitleWithClaude(prompt, settings)
        break
      case AIProvider.Custom:
        title = await generateTitleWithCustomAPI(prompt, settings)
        break
      default:
        title = userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '')
    }

    return { success: true, title }
  } catch (error: any) {
    console.error('Error generating title:', error)
    // 失败时使用简单的截取方式
    return {
      success: true,
      title: userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : ''),
    }
  }
}

async function generateTitleWithOpenAI(prompt: string, settings: any): Promise<string> {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: settings.ai.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 20,
    },
    {
      headers: {
        Authorization: `Bearer ${settings.ai.apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  )

  return response.data.choices[0].message.content.trim().replace(/^["']|["']$/g, '')
}

async function generateTitleWithClaude(prompt: string, settings: any): Promise<string> {
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: settings.ai.model,
      max_tokens: 20,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'x-api-key': settings.ai.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    }
  )

  return response.data.content[0].text.trim().replace(/^["']|["']$/g, '')
}

async function generateTitleWithCustomAPI(prompt: string, settings: any): Promise<string> {
  if (!settings.ai.customApiUrl) {
    throw new Error('Custom API URL is not configured')
  }

  // Use OpenAI-compatible format for custom API
  const response = await axios.post(
    settings.ai.customApiUrl,
    {
      model: settings.ai.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 20,
    },
    {
      headers: {
        Authorization: `Bearer ${settings.ai.apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  )

  // Handle OpenAI-compatible response format
  const content =
    response.data.choices?.[0]?.message?.content ||
    response.data.message ||
    response.data.content
  return content.trim().replace(/^["']|["']$/g, '')
}

// Edit message and resend to AI
async function handleEditAndResend(sessionId: string, messageId: string, newContent: string) {
  try {
    const session = store.getSession(sessionId)
    if (!session) {
      return { success: false, error: 'Session not found' }
    }

    // Find the message index
    const messageIndex = session.messages.findIndex((m) => m.id === messageId)
    if (messageIndex === -1) {
      return { success: false, error: 'Message not found' }
    }

    // Remove all messages after this one
    store.removeMessagesFrom(sessionId, messageIndex)

    // Update the message content and get new message ID
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: newContent,
      timestamp: Date.now(),
    }
    store.addMessage(sessionId, userMessage)

    // Get settings and call AI
    const settings = store.getSettings()

    if (!settings.ai.apiKey) {
      return {
        success: false,
        error: 'API Key not configured. Please configure your AI settings.',
      }
    }

    let assistantMessage: ChatMessage

    switch (settings.ai.provider) {
      case AIProvider.OpenAI:
        assistantMessage = await callOpenAI(newContent, settings)
        break
      case AIProvider.Claude:
        assistantMessage = await callClaude(newContent, settings)
        break
      case AIProvider.Custom:
        assistantMessage = await callCustomAPI(newContent, settings)
        break
      default:
        throw new Error('Unknown AI provider')
    }

    // Save assistant message
    store.addMessage(sessionId, assistantMessage)

    return {
      success: true,
      userMessage,
      assistantMessage,
    }
  } catch (error: any) {
    console.error('Error editing and resending message:', error)

    const settings = store.getSettings()
    const providerNames: Record<string, string> = {
      openai: 'OpenAI',
      claude: 'Claude',
      custom: 'Custom API',
    }
    const providerName = providerNames[settings.ai.provider] || settings.ai.provider

    let errorMessage: string
    let errorDetails: string | undefined

    if (axios.isAxiosError(error)) {
      const parsed = parseAPIError(error, providerName, settings.ai.model)
      errorMessage = parsed.message
      errorDetails = parsed.details
    } else {
      errorMessage = error.message || 'Failed to send message'
    }

    return {
      success: false,
      error: errorMessage,
      errorDetails,
    }
  }
}
