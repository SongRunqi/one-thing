import type {
  CorePromptActiveProject,
  CorePromptKnownProjects,
  CorePromptProviderConfig,
  CorePromptProviderConfigValue,
} from '@onething/core/engine'

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
  contextVariables?: string
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

export interface CollectOnethingPluginPromptContextOptions {
  onProviderError?: (providerRef: string, error: unknown) => void
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

  for (const item of providers.values()) {
    try {
      const result = await item.provider(context)
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
    } catch (error) {
      options.onProviderError?.(`${item.pluginId}/${item.providerId}`, error)
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
