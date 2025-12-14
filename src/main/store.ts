import Store from 'electron-store'
import type { ChatMessage, ChatSession, AppSettings, AIProvider, CachedModels } from '../shared/ipc.js'
import { AIProvider as AIProviderEnum } from '../shared/ipc.js'

interface StoreSchema {
  sessions: ChatSession[]
  currentSessionId: string
  settings: AppSettings
  modelsCache: Record<string, CachedModels>
}

const defaultSettings: AppSettings = {
  ai: {
    provider: AIProviderEnum.OpenAI,
    temperature: 0.7,
    providers: {
      [AIProviderEnum.OpenAI]: {
        apiKey: '',
        model: 'gpt-4',
      },
      [AIProviderEnum.Claude]: {
        apiKey: '',
        model: 'claude-sonnet-4-5-20250929',
      },
      [AIProviderEnum.Custom]: {
        apiKey: '',
        baseUrl: '',
        model: '',
      },
    },
  },
  theme: 'light',
}

const store = new Store<StoreSchema>({
  defaults: {
    sessions: [],
    currentSessionId: '',
    settings: defaultSettings,
    modelsCache: {},
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
  sessions.unshift(session)
  store.set('sessions', sessions)
  store.set('currentSessionId', sessionId)

  return session
}

export function createBranchSession(
  sessionId: string,
  name: string,
  parentSessionId: string,
  branchFromMessageId: string,
  inheritedMessages: ChatMessage[]
): ChatSession {
  const session: ChatSession = {
    id: sessionId,
    name,
    messages: inheritedMessages,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    parentSessionId,
    branchFromMessageId,
  }

  const sessions = getSessions()
  sessions.unshift(session)
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
  message: ChatMessage
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

// Migrate old settings format to new format
function migrateSettings(settings: any): AppSettings {
  // Check if settings have the old format (apiKey at root level of ai)
  if (settings.ai && !settings.ai.providers && settings.ai.apiKey !== undefined) {
    console.log('Migrating old settings format to new format')
    const oldApiKey = settings.ai.apiKey || ''
    const oldBaseUrl = settings.ai.baseUrl || ''
    const oldModel = settings.ai.model || ''
    const currentProvider = settings.ai.provider || AIProviderEnum.OpenAI

    // Create new format with providers
    const migratedSettings: AppSettings = {
      ai: {
        provider: currentProvider,
        temperature: settings.ai.temperature ?? 0.7,
        providers: {
          [AIProviderEnum.OpenAI]: {
            apiKey: currentProvider === AIProviderEnum.OpenAI ? oldApiKey : '',
            model: currentProvider === AIProviderEnum.OpenAI ? oldModel : 'gpt-4',
            baseUrl: currentProvider === AIProviderEnum.OpenAI ? oldBaseUrl : undefined,
          },
          [AIProviderEnum.Claude]: {
            apiKey: currentProvider === AIProviderEnum.Claude ? oldApiKey : '',
            model: currentProvider === AIProviderEnum.Claude ? oldModel : 'claude-sonnet-4-5-20250929',
            baseUrl: currentProvider === AIProviderEnum.Claude ? oldBaseUrl : undefined,
          },
          [AIProviderEnum.Custom]: {
            apiKey: currentProvider === AIProviderEnum.Custom ? oldApiKey : '',
            model: currentProvider === AIProviderEnum.Custom ? oldModel : '',
            baseUrl: currentProvider === AIProviderEnum.Custom ? oldBaseUrl : '',
          },
        },
      },
      theme: settings.theme || 'light',
    }

    // Save migrated settings
    store.set('settings', migratedSettings)
    return migratedSettings
  }

  // Ensure providers object exists (partial migration case)
  if (settings.ai && !settings.ai.providers) {
    settings.ai.providers = defaultSettings.ai.providers
    store.set('settings', settings)
  }

  return settings as AppSettings
}

export function getSettings(): AppSettings {
  const settings = store.get('settings', defaultSettings)
  return migrateSettings(settings)
}

export function saveSettings(settings: AppSettings): void {
  store.set('settings', settings)
}

// Models cache functions
export function getCachedModels(provider: AIProvider): CachedModels | undefined {
  const cache = store.get('modelsCache', {})
  return cache[provider]
}

export function setCachedModels(provider: AIProvider, models: CachedModels['models']): void {
  const cache = store.get('modelsCache', {})
  cache[provider] = {
    provider,
    models,
    cachedAt: Date.now(),
  }
  store.set('modelsCache', cache)
}

export function clearModelsCache(provider?: AIProvider): void {
  if (provider) {
    const cache = store.get('modelsCache', {})
    delete cache[provider]
    store.set('modelsCache', cache)
  } else {
    store.set('modelsCache', {})
  }
}

export { store }
