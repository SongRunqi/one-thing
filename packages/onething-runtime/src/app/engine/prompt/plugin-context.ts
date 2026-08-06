import {
  clearPromptContextProvidersForPlugin as clearRuntimePromptContextProvidersForPlugin,
  collectPluginPromptContext as collectRuntimePluginPromptContext,
  getPromptContextProviderCount as getRuntimePromptContextProviderCount,
  registerPromptContextProvider as registerRuntimePromptContextProvider,
  type OnethingPluginPromptContext,
  type OnethingPluginPromptContextFragmentInput,
  type OnethingPluginPromptContextProvider,
  type OnethingPromptProviderConfig,
  type OnethingPromptProviderConfigValue,
} from '@onething/runtime/prompts'
import type {
  AppSettings,
  PromptContextFragment,
  PromptContextRole,
  SkillDefinition,
} from '@shared/ipc.js'
import type {
  PromptActiveProject,
  PromptKnownProjects,
} from './types.js'
import { reportPluginRuntimeFailure } from '../../plugins/health.js'

export type PromptProviderConfigValue = OnethingPromptProviderConfigValue
export type PromptProviderConfig = OnethingPromptProviderConfig

export interface PluginPromptContext extends Omit<OnethingPluginPromptContext, 'settings' | 'skills' | 'activeProject' | 'knownProjects'> {
  settings?: AppSettings
  skills: SkillDefinition[]
  activeProject?: PromptActiveProject
  knownProjects?: PromptKnownProjects
}

export interface PluginPromptContextFragmentInput extends Omit<OnethingPluginPromptContextFragmentInput, 'role'> {
  role: PromptContextRole
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

export function registerPromptContextProvider(
  pluginId: string,
  providerId: string,
  provider: PluginPromptContextProvider,
): () => void {
  return registerRuntimePromptContextProvider(pluginId, providerId, provider as OnethingPluginPromptContextProvider)
}

export function clearPromptContextProvidersForPlugin(pluginId: string): void {
  clearRuntimePromptContextProvidersForPlugin(pluginId)
}

export function getPromptContextProviderCount(): number {
  return getRuntimePromptContextProviderCount()
}

export async function collectPluginPromptContext(
  context: PluginPromptContext,
): Promise<PluginPromptContextFragmentInput[]> {
  return collectRuntimePluginPromptContext(context, {
    onProviderError(providerRef, error) {
      console.error(`[PluginPromptContext] Provider "${providerRef}" failed:`, error)
    },
    // 超时/异常都记一次失败:连续 N 次由熔断器自动禁用该插件。
    onProviderFailure({ pluginId, providerId, error, timedOut }) {
      reportPluginRuntimeFailure(pluginId, `promptContext:${providerId}${timedOut ? ' (timeout)' : ''}`, error)
    },
  }) as Promise<PluginPromptContextFragmentInput[]>
}

export type {
  PromptContextFragment,
}
