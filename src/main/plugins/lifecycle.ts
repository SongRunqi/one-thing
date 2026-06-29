import type { AppSettings, ChatMessage, ChatSession, ProviderConfig } from '../../shared/ipc.js'
import {
  CorePluginLifecycleRegistry,
  type CoreAfterAssistantResponseContext,
  type CoreAfterAssistantResponseHook,
  type CoreBeforeContextCompactContext,
  type CoreBeforeContextCompactHook,
} from '@onething/core/plugins'

export interface BeforeContextCompactContext extends CoreBeforeContextCompactContext<
  AppSettings,
  ChatMessage,
  ProviderConfig & { apiKey: string }
> {}

export type BeforeContextCompactHook = CoreBeforeContextCompactHook<BeforeContextCompactContext>

export interface AfterAssistantResponseContext extends CoreAfterAssistantResponseContext<
  AppSettings,
  ChatSession,
  ChatMessage,
  ProviderConfig
> {}

export type AfterAssistantResponseHook = CoreAfterAssistantResponseHook<AfterAssistantResponseContext>

const lifecycleRegistry = new CorePluginLifecycleRegistry<
  BeforeContextCompactContext,
  AfterAssistantResponseContext
>()

export function registerBeforeContextCompactHook(
  pluginId: string,
  hookId: string,
  hook: BeforeContextCompactHook,
): () => void {
  return lifecycleRegistry.registerBeforeContextCompactHook(pluginId, hookId, hook)
}

export function registerAfterAssistantResponseHook(
  pluginId: string,
  hookId: string,
  hook: AfterAssistantResponseHook,
): () => void {
  return lifecycleRegistry.registerAfterAssistantResponseHook(pluginId, hookId, hook)
}

export async function runBeforeContextCompactHooks(
  context: BeforeContextCompactContext,
): Promise<void> {
  await lifecycleRegistry.runBeforeContextCompactHooks(context)
}

export async function runAfterAssistantResponseHooks(
  context: AfterAssistantResponseContext,
): Promise<void> {
  await lifecycleRegistry.runAfterAssistantResponseHooks(context)
}

export function clearLifecycleHooksForPlugin(pluginId: string): void {
  lifecycleRegistry.clearLifecycleHooksForPlugin(pluginId)
}
