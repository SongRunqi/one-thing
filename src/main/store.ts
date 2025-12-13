import Store from 'electron-store'
import type { ChatSession, AppSettings, AIProvider } from '@shared/ipc'
import { AIProvider as AIProviderEnum } from '@shared/ipc'

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
