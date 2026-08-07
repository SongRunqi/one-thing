import { pluginScope } from '@onething/core/plugins'
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
import {
  reportPluginRuntimeFailure,
  reportPluginRuntimeSuccess,
} from '../../plugins/health.js'

function describeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error)
}

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
    // 超时/异常都记一次失败:同一 scope 连续 N 次由熔断器自动禁用该插件。
    // scope 里不带 "(timeout)" 之类的可变后缀 —— 那会把同一条车道拆成两条,
    // 交替出现的超时与异常就永远攒不满阈值。
    onProviderFailure({ pluginId, providerId, error, timedOut }) {
      reportPluginRuntimeFailure(
        pluginId,
        pluginScope.promptContext(providerId),
        timedOut ? new Error(`timed out: ${describeError(error)}`) : error,
      )
    },
    // 成功清同 scope 的账:没有它,这条车道的连败数永远只增不减。
    onProviderSuccess({ pluginId, providerId }) {
      reportPluginRuntimeSuccess(pluginId, pluginScope.promptContext(providerId))
    },
  }) as Promise<PluginPromptContextFragmentInput[]>
}

export type {
  PromptContextFragment,
}
