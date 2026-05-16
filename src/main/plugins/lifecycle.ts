import type { AppSettings, ChatMessage, ChatSession, ProviderConfig } from '../../shared/ipc.js'

export interface BeforeContextCompactContext {
  sessionId: string
  providerId: string
  configWithApiKey: Record<string, unknown>
  settings: AppSettings
  keepRecentTurns?: number
  messagesToSummarize: ChatMessage[]
}

export type BeforeContextCompactHook = (
  context: BeforeContextCompactContext,
) => Promise<void> | void

export interface AfterAssistantResponseContext {
  sessionId: string
  assistantMessageId: string
  session: ChatSession
  messages: ChatMessage[]
  lastUserMessage: string
  lastAssistantMessage: string
  providerId: string
  providerConfig: ProviderConfig
  settings: AppSettings
}

export type AfterAssistantResponseHook = (
  context: AfterAssistantResponseContext,
) => Promise<void> | void

interface RegisteredBeforeCompactHook {
  pluginId: string
  hookId: string
  hook: BeforeContextCompactHook
}

interface RegisteredAfterResponseHook {
  pluginId: string
  hookId: string
  hook: AfterAssistantResponseHook
}

const beforeCompactHooks = new Map<string, RegisteredBeforeCompactHook>()
const afterResponseHooks = new Map<string, RegisteredAfterResponseHook>()

function key(pluginId: string, hookId: string): string {
  return `${pluginId}:${hookId.trim() || 'default'}`
}

export function registerBeforeContextCompactHook(
  pluginId: string,
  hookId: string,
  hook: BeforeContextCompactHook,
): () => void {
  const hookKey = key(pluginId, hookId)
  beforeCompactHooks.set(hookKey, {
    pluginId,
    hookId,
    hook,
  })
  return () => {
    beforeCompactHooks.delete(hookKey)
  }
}

export function registerAfterAssistantResponseHook(
  pluginId: string,
  hookId: string,
  hook: AfterAssistantResponseHook,
): () => void {
  const hookKey = key(pluginId, hookId)
  afterResponseHooks.set(hookKey, {
    pluginId,
    hookId,
    hook,
  })
  return () => {
    afterResponseHooks.delete(hookKey)
  }
}

export async function runBeforeContextCompactHooks(
  context: BeforeContextCompactContext,
): Promise<void> {
  for (const item of beforeCompactHooks.values()) {
    try {
      await item.hook(context)
    } catch (error) {
      console.error(`[PluginLifecycle] beforeContextCompact failed for "${item.pluginId}/${item.hookId}":`, error)
    }
  }
}

export async function runAfterAssistantResponseHooks(
  context: AfterAssistantResponseContext,
): Promise<void> {
  for (const item of afterResponseHooks.values()) {
    try {
      await item.hook(context)
    } catch (error) {
      console.error(`[PluginLifecycle] afterAssistantResponse failed for "${item.pluginId}/${item.hookId}":`, error)
    }
  }
}

export function clearLifecycleHooksForPlugin(pluginId: string): void {
  for (const item of beforeCompactHooks.values()) {
    if (item.pluginId === pluginId) {
      beforeCompactHooks.delete(key(item.pluginId, item.hookId))
    }
  }
  for (const item of afterResponseHooks.values()) {
    if (item.pluginId === pluginId) {
      afterResponseHooks.delete(key(item.pluginId, item.hookId))
    }
  }
}
