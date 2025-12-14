import Store from 'electron-store'
import type { ChatSession, AppSettings, AIProvider } from '../shared/ipc.js'
import { AIProvider as AIProviderEnum } from '../shared/ipc.js'

interface StoreSchema {
  sessions: ChatSession[]
  currentSessionId: string
  settings: AppSettings
}

const defaultSettings: AppSettings = {
  ai: {
    provider: AIProviderEnum.OpenAI,
    apiKey: '',
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
  },
  theme: 'light',
}

const store = new Store<StoreSchema>({
  defaults: {
    sessions: [],
    currentSessionId: '',
    settings: defaultSettings,
  },
})

export function getSessions(): ChatSession[] {
  return store.get('sessions', [])
}

export function getSession(sessionId: string): ChatSession | undefined {
  const sessions = getSessions()
  return sessions.find(s => s.id === sessionId)
}

export function createSession(sessionId: string, name: string): ChatSession {
  const session: ChatSession = {
    id: sessionId,
    name,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  const sessions = getSessions()
  sessions.push(session)
  store.set('sessions', sessions)
  store.set('currentSessionId', sessionId)

  return session
}

export function deleteSession(sessionId: string): void {
  let sessions = getSessions()
  sessions = sessions.filter(s => s.id !== sessionId)
  store.set('sessions', sessions)

  if (store.get('currentSessionId') === sessionId) {
    const nextSession = sessions[0]
    store.set('currentSessionId', nextSession?.id || '')
  }
}

export function renameSession(sessionId: string, newName: string): void {
  const sessions = getSessions()
  const session = sessions.find(s => s.id === sessionId)

  if (session) {
    session.name = newName
    session.updatedAt = Date.now()
    store.set('sessions', sessions)
  }
}

// Create a branch session from a parent session
export function createBranchSession(
  sessionId: string,
  name: string,
  parentId: string,
  branchFromMessageId: string,
  inheritedMessages: any[]
): ChatSession {
  const session: ChatSession = {
    id: sessionId,
    name,
    messages: inheritedMessages,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    parentId,
    branchFromMessageId,
  }

  const sessions = getSessions()
  sessions.push(session)
  store.set('sessions', sessions)
  store.set('currentSessionId', sessionId)

  return session
}

// Truncate messages after a specific message ID and update session
export function truncateMessagesAfter(sessionId: string, messageId: string): void {
  const sessions = getSessions()
  const session = sessions.find(s => s.id === sessionId)

  if (session) {
    const messageIndex = session.messages.findIndex(m => m.id === messageId)
    if (messageIndex !== -1) {
      // Keep messages up to and including the target message
      session.messages = session.messages.slice(0, messageIndex + 1)
      session.updatedAt = Date.now()
      store.set('sessions', sessions)
    }
  }
}

// Remove messages from a specific index onwards
export function removeMessagesFrom(sessionId: string, fromIndex: number): void {
  const sessions = getSessions()
  const session = sessions.find(s => s.id === sessionId)

  if (session) {
    session.messages = session.messages.slice(0, fromIndex)
    session.updatedAt = Date.now()
    store.set('sessions', sessions)
  }
}

// Update a message content
export function updateMessage(sessionId: string, messageId: string, newContent: string): void {
  const sessions = getSessions()
  const session = sessions.find(s => s.id === sessionId)

  if (session) {
    const message = session.messages.find(m => m.id === messageId)
    if (message) {
      message.content = newContent
      message.timestamp = Date.now()
      session.updatedAt = Date.now()
      store.set('sessions', sessions)
    }
  }
}

export function addMessage(
  sessionId: string,
  message: any
): void {
  const sessions = getSessions()
  const session = sessions.find(s => s.id === sessionId)

  if (session) {
    session.messages.push(message)
    session.updatedAt = Date.now()
    store.set('sessions', sessions)
  }
}

export function getCurrentSessionId(): string {
  return store.get('currentSessionId', '')
}

export function setCurrentSessionId(sessionId: string): void {
  store.set('currentSessionId', sessionId)
}

export function getSettings(): AppSettings {
  return store.get('settings', defaultSettings)
}

export function saveSettings(settings: AppSettings): void {
  store.set('settings', settings)
}

export { store }
