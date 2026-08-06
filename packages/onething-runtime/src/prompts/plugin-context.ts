import type {
  CorePromptActiveProject,
  CorePromptKnownProjects,
  CorePromptProviderConfig,
  CorePromptProviderConfigValue,
} from '@onething/core/engine'
import {
  CORE_PLUGIN_PROMPT_CONTEXT_TIMEOUT_MS,
  isCorePluginTimeoutError,
  runWithPluginTimeout,
} from '@onething/core/plugins'

export type OnethingPromptContextRole = 'system' | 'developer' | 'user'
export type OnethingPromptProviderConfigValue = CorePromptProviderConfigValue
export type OnethingPromptProviderConfig = CorePromptProviderConfig

export interface OnethingPromptSkillDefinition {
  name: string
  description: string
  source: string
  directoryPath?: string
  path?: string
  files?: Array<{ name: string }>
  instructions?: string
}

export interface OnethingPluginPromptContext {
  sessionId?: string
  providerId?: string
  model?: string
  providerConfig?: OnethingPromptProviderConfig
  settings?: unknown
  hasTools: boolean
  skills: OnethingPromptSkillDefinition[]
  workingDirectory?: string
  workingDirectoryRoots?: string[]
  activeProject?: CorePromptActiveProject
  knownProjects?: CorePromptKnownProjects
  toolNames?: string[]
  mcpToolNames?: string[]
}

export interface OnethingPluginPromptContextFragmentInput {
  role: OnethingPromptContextRole
  source?: string
  content: string
}

export type OnethingPluginPromptContextProvider = (
  context: OnethingPluginPromptContext,
) =>
  | Promise<OnethingPluginPromptContextFragmentInput | OnethingPluginPromptContextFragmentInput[] | string | null | undefined>
  | OnethingPluginPromptContextFragmentInput
  | OnethingPluginPromptContextFragmentInput[]
  | string
  | null
  | undefined

export interface OnethingPluginPromptContextFailure {
  pluginId: string
  providerId: string
  error: unknown
  timedOut: boolean
}

export interface OnethingPluginPromptContextSuccess {
  pluginId: string
  providerId: string
}

export interface CollectOnethingPluginPromptContextOptions {
  onProviderError?: (providerRef: string, error: unknown) => void
  /** 结构化失败上报 —— 失败计数熔断按 pluginId + scope 记账。 */
  onProviderFailure?: (failure: OnethingPluginPromptContextFailure) => void
  /**
   * 成功上报 —— 没有它,promptContext 这条车道的连败计数永远清不掉,
   * 一个偶发超时会跨天累加成误禁。必须是零 IO 的纯内存回调(它在每次发消息的
   * 热路径上,每个 provider 各调一次)。
   */
  onProviderSuccess?: (success: OnethingPluginPromptContextSuccess) => void
  /** 每个 provider 的超时预算;<=0 关闭(仅测试用)。 */
  timeoutMs?: number
}

interface RegisteredProvider {
  pluginId: string
  providerId: string
  provider: OnethingPluginPromptContextProvider
}

const providers = new Map<string, RegisteredProvider>()

export function normalizeInjectedPromptContextRole(_role: OnethingPromptContextRole): OnethingPromptContextRole {
  return 'developer'
}

function key(pluginId: string, providerId: string): string {
  return `${pluginId}:${providerId}`
}

export function normalizePromptContextProviderId(value: string): string {
  return value.trim().replace(/^\/+/, '') || 'default'
}

export function registerPromptContextProvider(
  pluginId: string,
  providerId: string,
  provider: OnethingPluginPromptContextProvider,
): () => void {
  const normalizedId = normalizePromptContextProviderId(providerId)
  const providerKey = key(pluginId, normalizedId)
  providers.set(providerKey, { pluginId, providerId: normalizedId, provider })

  return () => {
    providers.delete(providerKey)
  }
}

export async function collectPluginPromptContext(
  context: OnethingPluginPromptContext,
  options: CollectOnethingPluginPromptContextOptions = {},
): Promise<OnethingPluginPromptContextFragmentInput[]> {
  const fragments: OnethingPluginPromptContextFragmentInput[] = []
  const timeoutMs = options.timeoutMs ?? CORE_PLUGIN_PROMPT_CONTEXT_TIMEOUT_MS

  for (const item of [...providers.values()]) {
    try {
      // 这里挂在**每次发消息**的热路径上(prompts/builder.ts 的 collectPlugins)。
      // 之前是裸 await:一个不 resolve 的 provider = 所有会话的发消息永久卡死,
      // 而插件卡片还显示 Active。超时后丢弃这一段,绝不阻塞发消息。
      const result = await runWithPluginTimeout(
        `promptContext:${item.pluginId}/${item.providerId}`,
        timeoutMs,
        () => item.provider(context),
      )
      const entries = Array.isArray(result) ? result : [result]
      for (const entry of entries) {
        if (!entry) continue
        if (typeof entry === 'string') {
          fragments.push({
            role: 'developer',
            source: `plugins/${item.pluginId}/${item.providerId}`,
            content: entry,
          })
          continue
        }
        fragments.push({
          role: normalizeInjectedPromptContextRole(entry.role),
          source: entry.source || `plugins/${item.pluginId}/${item.providerId}`,
          content: entry.content,
        })
      }
      options.onProviderSuccess?.({ pluginId: item.pluginId, providerId: item.providerId })
    } catch (error) {
      options.onProviderError?.(`${item.pluginId}/${item.providerId}`, error)
      options.onProviderFailure?.({
        pluginId: item.pluginId,
        providerId: item.providerId,
        error,
        timedOut: isCorePluginTimeoutError(error),
      })
    }
  }

  return fragments
}

export function clearPromptContextProvidersForPlugin(pluginId: string): void {
  for (const item of providers.values()) {
    if (item.pluginId === pluginId) {
      providers.delete(key(item.pluginId, item.providerId))
    }
  }
}

export function getPromptContextProviderCount(): number {
  return providers.size
}

export function clearAllPromptContextProviders(): void {
  providers.clear()
}
