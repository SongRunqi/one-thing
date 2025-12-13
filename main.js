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

const store = new Store({
  defaults: {
    sessions: [],
    currentSessionId: '',
    settings: {
      ai: {
        provider: 'openai',
        apiKey: '',
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
      },
      theme: 'light',
    },
  },
})

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

    const settings = store.get('settings')

    if (!settings.ai.apiKey) {
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
  const { provider, apiKey, model, temperature, customApiUrl } = settings.ai

  if (provider === 'openai') {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
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
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
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
    if (!customApiUrl) {
      throw new Error('Custom API URL is not configured')
    }

    const response = await axios.post(
      customApiUrl,
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
    return {
      success: true,
      settings: store.get('settings'),
    }
  })

  ipcMain.handle('settings:save', async (_event, settings) => {
    store.set('settings', settings)
    return { success: true }
  })
}
