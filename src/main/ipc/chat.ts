import { ipcMain } from 'electron'
import axios from 'axios'
import * as store from '../store.js'
import type { ChatMessage, AppSettings, ProviderConfig } from '../../shared/ipc.js'
import { IPC_CHANNELS, AIProvider } from '../../shared/ipc.js'
import { v4 as uuidv4 } from 'uuid'

// Helper to get current provider config
function getProviderConfig(settings: AppSettings): ProviderConfig {
  return settings.ai.providers[settings.ai.provider]
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
    const providerConfig = getProviderConfig(settings)

    if (!providerConfig.apiKey) {
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
    return {
      success: false,
      error: error.message || 'Failed to send message',
    }
  }
}

async function callOpenAI(message: string, settings: AppSettings): Promise<ChatMessage> {
  const providerConfig = getProviderConfig(settings)
  const baseUrl = providerConfig.baseUrl || 'https://api.openai.com/v1'

  const response = await axios.post(
    `${baseUrl}/chat/completions`,
    {
      model: providerConfig.model,
      messages: [{ role: 'user', content: message }],
      temperature: settings.ai.temperature,
    },
    {
      headers: {
        'Authorization': `Bearer ${providerConfig.apiKey}`,
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

async function callClaude(message: string, settings: AppSettings): Promise<ChatMessage> {
  const providerConfig = getProviderConfig(settings)
  const baseUrl = providerConfig.baseUrl || 'https://api.anthropic.com/v1'

  const response = await axios.post(
    `${baseUrl}/messages`,
    {
      model: providerConfig.model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: message }],
    },
    {
      headers: {
        'x-api-key': providerConfig.apiKey,
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

async function callCustomAPI(message: string, settings: AppSettings): Promise<ChatMessage> {
  const providerConfig = getProviderConfig(settings)

  if (!providerConfig.baseUrl) {
    throw new Error('Custom API URL is not configured')
  }

  const response = await axios.post(
    providerConfig.baseUrl,
    {
      message,
      model: providerConfig.model,
    },
    {
      headers: {
        'Authorization': `Bearer ${providerConfig.apiKey}`,
      },
    }
  )

  const assistantMessage: ChatMessage = {
    id: uuidv4(),
    role: 'assistant',
    content: response.data.message || response.data.content,
    timestamp: Date.now(),
  }

  return assistantMessage
}

// 生成聊天标题
async function handleGenerateTitle(userMessage: string) {
  try {
    const settings = store.getSettings()
    const providerConfig = getProviderConfig(settings)

    if (!providerConfig.apiKey) {
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

async function generateTitleWithOpenAI(prompt: string, settings: AppSettings): Promise<string> {
  const providerConfig = getProviderConfig(settings)
  const baseUrl = providerConfig.baseUrl || 'https://api.openai.com/v1'

  const response = await axios.post(
    `${baseUrl}/chat/completions`,
    {
      model: providerConfig.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 20,
    },
    {
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  )

  return response.data.choices[0].message.content.trim().replace(/^["']|["']$/g, '')
}

async function generateTitleWithClaude(prompt: string, settings: AppSettings): Promise<string> {
  const providerConfig = getProviderConfig(settings)
  const baseUrl = providerConfig.baseUrl || 'https://api.anthropic.com/v1'

  const response = await axios.post(
    `${baseUrl}/messages`,
    {
      model: providerConfig.model,
      max_tokens: 20,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'x-api-key': providerConfig.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    }
  )

  return response.data.content[0].text.trim().replace(/^["']|["']$/g, '')
}

async function generateTitleWithCustomAPI(prompt: string, settings: AppSettings): Promise<string> {
  const providerConfig = getProviderConfig(settings)

  if (!providerConfig.baseUrl) {
    throw new Error('Custom API URL is not configured')
  }

  const response = await axios.post(
    providerConfig.baseUrl,
    {
      message: prompt,
      model: providerConfig.model,
    },
    {
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
    }
  )

  const content = response.data.message || response.data.content
  return content.trim().replace(/^["']|["']$/g, '')
}
