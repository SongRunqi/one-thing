// 开发模式下的 Electron 入口
// 使用 ES Module 格式

import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import isDev from 'electron-is-dev'
import Store from 'electron-store'
import { v4 as uuidv4 } from 'uuid'
import axios from 'axios'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const defaultSettings = {
  ai: {
    provider: 'openai',
    temperature: 0.7,
    providers: {
      openai: {
        apiKey: '',
        model: 'gpt-4',
      },
      claude: {
        apiKey: '',
        model: 'claude-sonnet-4-5-20250929',
      },
      custom: {
        apiKey: '',
        baseUrl: '',
        model: '',
      },
    },
  },
  theme: 'light',
}

const store = new Store({
  defaults: {
    sessions: [],
    currentSessionId: '',
    settings: defaultSettings,
    modelsCache: {},
  },
})

// Migrate old settings format to new format
function migrateSettings(settings) {
  if (settings.ai && !settings.ai.providers && settings.ai.apiKey !== undefined) {
    console.log('Migrating old settings format to new format')
    const oldApiKey = settings.ai.apiKey || ''
    const oldBaseUrl = settings.ai.baseUrl || settings.ai.customApiUrl || ''
    const oldModel = settings.ai.model || ''
    const currentProvider = settings.ai.provider || 'openai'

    const migratedSettings = {
      ai: {
        provider: currentProvider,
        temperature: settings.ai.temperature ?? 0.7,
        providers: {
          openai: {
            apiKey: currentProvider === 'openai' ? oldApiKey : '',
            model: currentProvider === 'openai' ? oldModel : 'gpt-4',
            baseUrl: currentProvider === 'openai' ? oldBaseUrl : undefined,
          },
          claude: {
            apiKey: currentProvider === 'claude' ? oldApiKey : '',
            model: currentProvider === 'claude' ? oldModel : 'claude-sonnet-4-5-20250929',
            baseUrl: currentProvider === 'claude' ? oldBaseUrl : undefined,
          },
          custom: {
            apiKey: currentProvider === 'custom' ? oldApiKey : '',
            model: currentProvider === 'custom' ? oldModel : '',
            baseUrl: currentProvider === 'custom' ? oldBaseUrl : '',
          },
        },
      },
      theme: settings.theme || 'light',
    }

    store.set('settings', migratedSettings)
    return migratedSettings
  }

  // Ensure providers object exists
  if (settings.ai && !settings.ai.providers) {
    settings.ai.providers = defaultSettings.ai.providers
    store.set('settings', settings)
  }

  return settings
}

// Helper to get current provider config
function getProviderConfig(settings) {
  return settings.ai.providers[settings.ai.provider]
}

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    minWidth: 600,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    const tryLoadPort = (port) => {
      const url = `http://127.0.0.1:${port}`
      console.log(`Attempting to load from ${url}`)

      mainWindow.loadURL(url).catch(err => {
        if (port < 5180) {
          console.log(`Port ${port} failed, trying ${port + 1}...`)
          tryLoadPort(port + 1)
        } else {
          console.error('Could not connect to Vite dev server, loading from dist...')
          mainWindow.loadFile(path.join(__dirname, 'dist/renderer/index.html'))
        }
      })
    }

    tryLoadPort(5173)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/renderer/index.html'))
  }

  return mainWindow
}

app.on('ready', () => {
  createWindow()
  initializeIPC()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

// ============================================
// IPC Handlers - 模块化组织
// ============================================

function initializeIPC() {
  registerSessionHandlers()
  registerChatHandlers()
  registerSettingsHandlers()
}

// --------------------------------------------
// Session Handlers (会话管理)
// --------------------------------------------
function registerSessionHandlers() {
  ipcMain.handle('sessions:get-all', async () => {
    return {
      success: true,
      sessions: store.get('sessions', []),
    }
  })

  ipcMain.handle('sessions:create', async (_event, { name }) => {
    const sessionId = uuidv4()
    const session = {
      id: sessionId,
      name: name || `Chat ${new Date().toLocaleString()}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const sessions = store.get('sessions', [])
    sessions.push(session)
    store.set('sessions', sessions)
    store.set('currentSessionId', sessionId)

    return { success: true, session }
  })

  ipcMain.handle('sessions:switch', async (_event, { sessionId }) => {
    const sessions = store.get('sessions', [])
    const session = sessions.find(s => s.id === sessionId)

    if (!session) {
      return { success: false, error: 'Session not found' }
    }

    store.set('currentSessionId', sessionId)
    return { success: true, session }
  })

  ipcMain.handle('sessions:delete', async (_event, { sessionId }) => {
    let sessions = store.get('sessions', [])
    sessions = sessions.filter(s => s.id !== sessionId)
    store.set('sessions', sessions)

    if (store.get('currentSessionId') === sessionId) {
      const nextSession = sessions[0]
      store.set('currentSessionId', nextSession?.id || '')
    }

    return { success: true }
  })

  ipcMain.handle('sessions:rename', async (_event, { sessionId, newName }) => {
    const sessions = store.get('sessions', [])
    const session = sessions.find(s => s.id === sessionId)

    if (session) {
      session.name = newName
      session.updatedAt = Date.now()
      store.set('sessions', sessions)
    }

    return { success: true }
  })
}

// --------------------------------------------
// Chat Handlers (聊天功能)
// --------------------------------------------
function registerChatHandlers() {
  ipcMain.handle('chat:get-history', async (_event, { sessionId }) => {
    const sessions = store.get('sessions', [])
    const session = sessions.find(s => s.id === sessionId)

    if (!session) {
      return { success: false, error: 'Session not found' }
    }

    return { success: true, messages: session.messages }
  })

  ipcMain.handle('chat:send-message', async (_event, { sessionId, message }) => {
    return handleSendMessage(sessionId, message)
  })

  ipcMain.handle('chat:generate-title', async (_event, { message }) => {
    return handleGenerateTitle(message)
  })
}

// Generate chat title
async function handleGenerateTitle(userMessage) {
  try {
    const rawSettings = store.get('settings')
    const settings = migrateSettings(rawSettings)
    const providerConfig = getProviderConfig(settings)

    if (!providerConfig.apiKey) {
      // If no API key, use simple truncation
      return {
        success: true,
        title: userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : ''),
      }
    }

    const prompt = `Generate a short, concise title (max 6 words) for a chat conversation that starts with this message. Only respond with the title, nothing else:\n\n"${userMessage}"`

    let title
    const provider = settings.ai.provider

    if (provider === 'openai') {
      const url = providerConfig.baseUrl || 'https://api.openai.com/v1'
      const response = await axios.post(
        `${url}/chat/completions`,
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
          timeout: 10000,
        }
      )
      title = response.data.choices[0].message.content.trim().replace(/^["']|["']$/g, '')
    } else if (provider === 'claude') {
      const url = providerConfig.baseUrl || 'https://api.anthropic.com/v1'
      const response = await axios.post(
        `${url}/messages`,
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
          timeout: 10000,
        }
      )
      title = response.data.content[0].text.trim().replace(/^["']|["']$/g, '')
    } else {
      // Custom or fallback
      title = userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '')
    }

    return { success: true, title }
  } catch (error) {
    console.error('Error generating title:', error)
    return {
      success: true,
      title: userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : ''),
    }
  }
}

async function handleSendMessage(sessionId, message) {
  try {
    const sessions = store.get('sessions', [])
    const session = sessions.find(s => s.id === sessionId)

    if (!session) {
      return { success: false, error: 'Session not found' }
    }

    const userMessage = {
      id: uuidv4(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    }

    session.messages.push(userMessage)
    session.updatedAt = Date.now()

    const rawSettings = store.get('settings')
    const settings = migrateSettings(rawSettings)
    const providerConfig = getProviderConfig(settings)

    if (!providerConfig.apiKey) {
      store.set('sessions', sessions)
      return {
        success: false,
        error: 'API Key not configured. Please configure your AI settings.',
      }
    }

    let assistantMessage

    try {
      assistantMessage = await callAIProvider(settings, message)
    } catch (apiError) {
      console.error('API Error:', apiError.message)
      store.set('sessions', sessions)
      return {
        success: false,
        error: `API Error: ${apiError.response?.data?.error?.message || apiError.message}`,
      }
    }

    session.messages.push(assistantMessage)
    store.set('sessions', sessions)

    return {
      success: true,
      userMessage,
      assistantMessage,
    }
  } catch (error) {
    console.error('Error sending message:', error)
    return {
      success: false,
      error: error.message || 'Failed to send message',
    }
  }
}

async function callAIProvider(settings, message) {
  const provider = settings.ai.provider
  const providerConfig = getProviderConfig(settings)
  const { apiKey, model, baseUrl } = providerConfig
  const temperature = settings.ai.temperature

  if (provider === 'openai') {
    const url = baseUrl || 'https://api.openai.com/v1'
    const response = await axios.post(
      `${url}/chat/completions`,
      {
        model,
        messages: [{ role: 'user', content: message }],
        temperature,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    )

    return {
      id: uuidv4(),
      role: 'assistant',
      content: response.data.choices[0].message.content,
      timestamp: Date.now(),
    }
  }

  if (provider === 'claude') {
    const url = baseUrl || 'https://api.anthropic.com/v1'
    const response = await axios.post(
      `${url}/messages`,
      {
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: message }],
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    )

    return {
      id: uuidv4(),
      role: 'assistant',
      content: response.data.content[0].text,
      timestamp: Date.now(),
    }
  }

  if (provider === 'custom') {
    if (!baseUrl) {
      throw new Error('Custom API URL is not configured')
    }

    const response = await axios.post(
      baseUrl,
      { message, model },
      {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeout: 30000,
      }
    )

    return {
      id: uuidv4(),
      role: 'assistant',
      content: response.data.message || response.data.content,
      timestamp: Date.now(),
    }
  }

  throw new Error('Unknown AI provider')
}

// --------------------------------------------
// Settings Handlers (设置管理)
// --------------------------------------------
function registerSettingsHandlers() {
  ipcMain.handle('settings:get', async () => {
    const settings = store.get('settings')
    const migratedSettings = migrateSettings(settings)
    return {
      success: true,
      settings: migratedSettings,
    }
  })

  ipcMain.handle('settings:save', async (_event, settings) => {
    store.set('settings', settings)
    return { success: true }
  })

  // Models handlers
  ipcMain.handle('models:fetch', async (_event, { provider, apiKey, baseUrl, forceRefresh }) => {
    return handleFetchModels(provider, apiKey, baseUrl, forceRefresh)
  })

  ipcMain.handle('models:get-cached', async (_event, { provider }) => {
    const cache = store.get('modelsCache', {})
    const cached = cache[provider]
    if (cached) {
      return {
        success: true,
        models: cached.models,
        cachedAt: cached.cachedAt,
      }
    }
    return { success: true, models: [] }
  })
}

// Claude fallback models
const CLAUDE_FALLBACK_MODELS = [
  { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', description: 'Latest and most intelligent' },
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Powerful for complex tasks' },
  { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', description: 'Extended thinking' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Best balance' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fast and efficient' },
]

async function handleFetchModels(provider, apiKey, baseUrl, forceRefresh) {
  const cache = store.get('modelsCache', {})
  const cached = cache[provider]

  // Return cache if not forcing refresh and cache exists and is less than 24 hours old
  if (!forceRefresh && cached && (Date.now() - cached.cachedAt) < 24 * 60 * 60 * 1000) {
    return { success: true, models: cached.models, fromCache: true }
  }

  try {
    let models = []

    if (provider === 'openai') {
      const url = baseUrl || 'https://api.openai.com/v1'
      const response = await axios.get(`${url}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeout: 10000,
      })
      models = response.data.data
        .filter(m => m.id.includes('gpt'))
        .map(m => ({ id: m.id, name: m.id }))
        .sort((a, b) => a.id.localeCompare(b.id))
    } else if (provider === 'claude') {
      const url = baseUrl || 'https://api.anthropic.com/v1'
      try {
        const response = await axios.get(`${url}/models`, {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          timeout: 10000,
        })
        models = response.data.data.map(m => ({
          id: m.id,
          name: m.display_name || m.id,
          description: m.description,
        }))
      } catch (err) {
        // Use fallback models if API fails
        console.log('Using fallback Claude models')
        models = CLAUDE_FALLBACK_MODELS
      }
    }

    // Save to cache
    cache[provider] = { provider, models, cachedAt: Date.now() }
    store.set('modelsCache', cache)

    return { success: true, models }
  } catch (error) {
    // Return cached data if available on error
    if (cached) {
      return {
        success: true,
        models: cached.models,
        fromCache: true,
        error: 'Network error, using cached data',
      }
    }

    // For Claude, return fallback models
    if (provider === 'claude') {
      return { success: true, models: CLAUDE_FALLBACK_MODELS }
    }

    return { success: false, error: error.message }
  }
}
