import type { AgentProviderRuntimeConfig } from '../agent-loop/providers/factory.js'
import { createAgentProviderFromRuntime } from '../agent-loop/providers/factory.js'
import type {
  AgentJsonObject,
  AgentJsonValue,
  AgentProvider,
} from '../agent-loop/types.js'

export const ACP_PROVIDER_ID = 'acp'
export const DEEPSEEK_PROVIDER_ID = 'deepseek'

export type AgentRuntimeProviderConfig = AgentProviderRuntimeConfig & {
  model: string
}

export type ProviderRuntimeRoute =
  | { kind: 'acp' }
  | { kind: 'deepseek' }
  | { kind: 'agent'; provider: AgentProvider }
  | { kind: 'unsupported' }

export interface ProviderToolParameter {
  name: string
  type: string
  description: string
  required?: boolean
  enum?: string[]
}

export interface ProviderToolDefinitionInput {
  description: string
  parameters: ProviderToolParameter[]
  parameterSchema?: AgentJsonObject
}

export interface ProviderToolSourceDefinition extends ProviderToolDefinitionInput {
  id: string
  name: string
}

export type ProviderToolDefinitionMap = Record<string, ProviderToolDefinitionInput>

export interface ProviderExecutableToolDefinition {
  description: string
  parameters?: object
  parameterSchema?: AgentJsonObject
  execute?: (args: AgentJsonObject) => Promise<AgentJsonValue>
}

export function isACPProviderRuntime(providerId: string): boolean {
  return providerId === ACP_PROVIDER_ID
}

export function isDeepSeekProviderRuntime(providerId: string): boolean {
  return providerId === DEEPSEEK_PROVIDER_ID
}

export function createUtilityAgentProvider(
  providerId: string,
  config: AgentRuntimeProviderConfig,
): AgentProvider | undefined {
  if (isACPProviderRuntime(providerId) || isDeepSeekProviderRuntime(providerId)) return undefined
  return createAgentProviderFromRuntime(providerId, {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    apiType: config.apiType,
    oauthToken: config.oauthToken,
    authContext: config.authContext,
    modelCapabilitiesByModel: config.modelCapabilitiesByModel,
    models: config.models,
  })
}

export function createDeepSeekAgentRuntimeProvider(config: AgentRuntimeProviderConfig): AgentProvider {
  const provider = createAgentProviderFromRuntime(DEEPSEEK_PROVIDER_ID, {
    apiKey: config.apiKey ?? '',
    baseUrl: config.baseUrl,
    model: config.model,
  })
  if (!provider) {
    throw new Error('DeepSeek AgentProvider runtime is not registered')
  }
  return provider
}

export function resolveProviderRuntimeRoute(
  providerId: string,
  config: AgentRuntimeProviderConfig,
): ProviderRuntimeRoute {
  if (isACPProviderRuntime(providerId)) return { kind: 'acp' }
  if (isDeepSeekProviderRuntime(providerId)) return { kind: 'deepseek' }
  const provider = createUtilityAgentProvider(providerId, config)
  return provider ? { kind: 'agent', provider } : { kind: 'unsupported' }
}
