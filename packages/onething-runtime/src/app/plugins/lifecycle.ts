import type { AppSettings, ChatMessage, ChatSession, ProviderConfig } from '@shared/ipc.js'
import { pluginScope } from '@onething/core/plugins'
import {
  CorePluginLifecycleRegistry,
  type CoreAfterAssistantResponseContext,
  type CoreAfterAssistantResponseHook,
  type CoreBeforeContextCompactContext,
  type CoreBeforeContextCompactHook,
} from '@onething/core/plugins'
import {
  reportPluginRuntimeFailure,
  reportPluginRuntimeSuccess,
} from './health.js'

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
>({
  // 超时预算走 core 默认(5s):beforeContextCompact 挂在压缩路径上,
  // afterAssistantResponse 挂在每个回合结束后。
  onHookFailure({ pluginId, hookId, scope, error }) {
    reportPluginRuntimeFailure(pluginId, pluginScope.lifecycleHook(scope, hookId), error)
  },
  onHookSuccess({ pluginId, hookId, scope }) {
    reportPluginRuntimeSuccess(pluginId, pluginScope.lifecycleHook(scope, hookId))
  },
})

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

/** Registry footprint accessor — the teardown guard compares it across enable/disable. */
export function getLifecycleHookCounts(): { beforeContextCompact: number; afterAssistantResponse: number } {
  return lifecycleRegistry.getHookCounts()
}
