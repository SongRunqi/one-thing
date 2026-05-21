import type {
  AppSettings,
  PromptContextFragment,
  PromptContextRole,
  SkillDefinition,
} from '../../../shared/ipc.js'
import type {
  PromptActiveProject,
  PromptKnownProjects,
} from './types.js'

export interface PluginPromptContext {
  sessionId?: string
  providerId?: string
  providerConfig?: Record<string, unknown>
  settings?: AppSettings
  hasTools: boolean
  skills: SkillDefinition[]
  workingDirectory?: string
  workingDirectoryRoots?: string[]
  contextVariables?: string
  activeProject?: PromptActiveProject
  knownProjects?: PromptKnownProjects
  toolNames?: string[]
  mcpToolNames?: string[]
}

export interface PluginPromptContextFragmentInput {
  role: PromptContextRole
  source?: string
  content: string
}

export type PluginPromptContextProvider = (
  context: PluginPromptContext,
) =>
  | Promise<PluginPromptContextFragmentInput | PluginPromptContextFragmentInput[] | string | null | undefined>
  | PluginPromptContextFragmentInput
  | PluginPromptContextFragmentInput[]
  | string
  | null
  | undefined

interface RegisteredProvider {
  pluginId: string
  providerId: string
  provider: PluginPromptContextProvider
}

const providers = new Map<string, RegisteredProvider>()

function key(pluginId: string, providerId: string): string {
  return `${pluginId}:${providerId}`
}

function normalizeProviderId(value: string): string {
  return value.trim().replace(/^\/+/, '') || 'default'
}

export function registerPromptContextProvider(
  pluginId: string,
  providerId: string,
  provider: PluginPromptContextProvider,
): () => void {
  const normalizedId = normalizeProviderId(providerId)
  const providerKey = key(pluginId, normalizedId)
  providers.set(providerKey, { pluginId, providerId: normalizedId, provider })

  return () => {
    providers.delete(providerKey)
  }
}

export async function collectPluginPromptContext(
  context: PluginPromptContext,
): Promise<PluginPromptContextFragmentInput[]> {
  const fragments: PluginPromptContextFragmentInput[] = []

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
          role: entry.role,
          source: entry.source || `plugins/${item.pluginId}/${item.providerId}`,
          content: entry.content,
        })
      }
    } catch (error) {
      console.error(`[PluginPromptContext] Provider "${item.pluginId}/${item.providerId}" failed:`, error)
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
