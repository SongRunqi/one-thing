import type {
  AgentJsonObject,
  AgentJsonValue,
  AgentProvider,
} from '@onething/core/agent-loop'
import type {
  AgentProviderRuntimeConfig,
} from '../agent-loop/providers/factory.js'

export const ONETHING_ACP_RUNTIME_PROVIDER_ID = 'acp'
export const ONETHING_DEEPSEEK_RUNTIME_PROVIDER_ID = 'deepseek'

export type OnethingAgentRuntimeProviderConfig = AgentProviderRuntimeConfig & {
  model: string
}

export type OnethingProviderRuntimeRoute =
  | { kind: 'acp' }
  | { kind: 'deepseek' }
  | { kind: 'agent'; provider: AgentProvider }
  | { kind: 'unsupported' }

export interface OnethingProviderExecutableToolDefinition {
  description: string
  parameters?: object
  parameterSchema?: AgentJsonObject
  execute?: (args: AgentJsonObject) => Promise<AgentJsonValue>
}

export interface OnethingProviderRuntimeRouteAdapters {
  createAgentProvider(
    providerId: string,
    config: AgentProviderRuntimeConfig,
  ): AgentProvider | undefined
}

export function isOnethingACPProviderRuntime(providerId: string): boolean {
  return providerId === ONETHING_ACP_RUNTIME_PROVIDER_ID
}

export function isOnethingDeepSeekProviderRuntime(providerId: string): boolean {
  return providerId === ONETHING_DEEPSEEK_RUNTIME_PROVIDER_ID
}

export function createOnethingUtilityAgentProvider(
  providerId: string,
  config: OnethingAgentRuntimeProviderConfig,
  adapters: OnethingProviderRuntimeRouteAdapters,
): AgentProvider | undefined {
  if (isOnethingACPProviderRuntime(providerId) || isOnethingDeepSeekProviderRuntime(providerId)) {
    return undefined
  }
  return adapters.createAgentProvider(providerId, {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    zhipuApiMode: config.zhipuApiMode,
    model: config.model,
    apiType: config.apiType,
    oauthToken: config.oauthToken,
    authContext: config.authContext,
    modelCapabilitiesByModel: config.modelCapabilitiesByModel,
    models: config.models,
  })
}

export function createOnethingDeepSeekAgentRuntimeProvider(
  config: OnethingAgentRuntimeProviderConfig,
  adapters: OnethingProviderRuntimeRouteAdapters,
): AgentProvider {
  const provider = adapters.createAgentProvider(ONETHING_DEEPSEEK_RUNTIME_PROVIDER_ID, {
    apiKey: config.apiKey ?? '',
    baseUrl: config.baseUrl,
    model: config.model,
  })
  if (!provider) {
    throw new Error('DeepSeek AgentProvider runtime is not registered')
  }
  return provider
}

export function resolveOnethingProviderRuntimeRoute(
  providerId: string,
  config: OnethingAgentRuntimeProviderConfig,
  adapters: OnethingProviderRuntimeRouteAdapters,
): OnethingProviderRuntimeRoute {
  if (isOnethingACPProviderRuntime(providerId)) return { kind: 'acp' }
  if (isOnethingDeepSeekProviderRuntime(providerId)) return { kind: 'deepseek' }
  const provider = createOnethingUtilityAgentProvider(providerId, config, adapters)
  return provider ? { kind: 'agent', provider } : { kind: 'unsupported' }
}
