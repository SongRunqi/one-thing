import type { OAuthToken } from '../../../shared/ipc.js'
import type { ProviderAuthContext } from '../../auth/types.js'
import type { AgentProvider } from '../types.js'
import { createACPAgentProvider } from './acp.js'
import { createCodexAgentProvider } from './codex.js'
import { createDeepSeekAgentProvider } from './deepseek.js'
import { createOpenAICompatibleAgentProvider } from './openai-compatible.js'

export interface AgentProviderRuntimeConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
  oauthToken?: OAuthToken
  authContext?: ProviderAuthContext
}

export interface CreateAgentProviderFromRuntimeOptions {
  workingDirectory?: string
  localSessionId?: string
  fetchImpl?: typeof globalThis.fetch
}

export type AgentProviderRuntimeFactory = (
  config: AgentProviderRuntimeConfig,
  options: CreateAgentProviderFromRuntimeOptions,
) => AgentProvider | undefined

export interface RegisterAgentProviderRuntimeOptions {
  replace?: boolean
}

const agentProviderRuntimeFactories = new Map<string, AgentProviderRuntimeFactory>()

export function registerAgentProviderRuntime(
  providerId: string,
  factory: AgentProviderRuntimeFactory,
  options: RegisterAgentProviderRuntimeOptions = {},
): () => void {
  if (!options.replace && agentProviderRuntimeFactories.has(providerId)) {
    throw new Error(`Agent provider runtime already registered: ${providerId}`)
  }

  agentProviderRuntimeFactories.set(providerId, factory)
  return () => {
    if (agentProviderRuntimeFactories.get(providerId) === factory) {
      agentProviderRuntimeFactories.delete(providerId)
    }
  }
}

export function getSupportedAgentProviderRuntimeIds(): string[] {
  return [...agentProviderRuntimeFactories.keys()]
}

export function isAgentProviderRuntimeSupported(providerId: string): boolean {
  return agentProviderRuntimeFactories.has(providerId)
}

export function createAgentProviderFromRuntime(
  providerId: string,
  config: AgentProviderRuntimeConfig,
  options: CreateAgentProviderFromRuntimeOptions = {},
): AgentProvider | undefined {
  return agentProviderRuntimeFactories.get(providerId)?.(config, options)
}

registerAgentProviderRuntime('deepseek', (config, options) => createDeepSeekAgentProvider({
  apiKey: config.apiKey ?? '',
  baseUrl: config.baseUrl,
  fetchImpl: options.fetchImpl,
}), { replace: true })

registerAgentProviderRuntime('codex', (config, options) => createCodexAgentProvider({
  apiKey: config.apiKey,
  baseUrl: config.baseUrl,
  oauthToken: config.oauthToken,
  authContext: config.authContext,
  fetchImpl: options.fetchImpl,
}), { replace: true })

registerAgentProviderRuntime('openai', (config, options) => createOpenAICompatibleAgentProvider({
  providerId: 'openai',
  apiKey: config.apiKey,
  baseUrl: config.baseUrl,
  defaultBaseUrl: 'https://api.openai.com/v1',
  fetchImpl: options.fetchImpl,
  supportsVision: true,
  supportsReasoning: true,
  maxTokensField: 'max_completion_tokens',
}), { replace: true })

registerAgentProviderRuntime('openrouter', (config, options) => createOpenAICompatibleAgentProvider({
  providerId: 'openrouter',
  apiKey: config.apiKey,
  baseUrl: config.baseUrl,
  defaultBaseUrl: 'https://openrouter.ai/api/v1',
  fetchImpl: options.fetchImpl,
  supportsVision: true,
  supportsReasoning: true,
}), { replace: true })

registerAgentProviderRuntime('kimi', (config, options) => createOpenAICompatibleAgentProvider({
  providerId: 'kimi',
  apiKey: config.apiKey,
  baseUrl: config.baseUrl,
  defaultBaseUrl: 'https://api.moonshot.cn/v1',
  fetchImpl: options.fetchImpl,
  supportsReasoning: true,
  includeAssistantReasoning: true,
}), { replace: true })

registerAgentProviderRuntime('zhipu', (config, options) => createOpenAICompatibleAgentProvider({
  providerId: 'zhipu',
  apiKey: config.apiKey,
  baseUrl: config.baseUrl,
  defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  fetchImpl: options.fetchImpl,
  supportsReasoning: true,
  includeAssistantReasoning: true,
}), { replace: true })

registerAgentProviderRuntime('acp', (_config, options) => createACPAgentProvider({
  workingDirectory: options.workingDirectory,
  localSessionId: options.localSessionId,
}), { replace: true })
