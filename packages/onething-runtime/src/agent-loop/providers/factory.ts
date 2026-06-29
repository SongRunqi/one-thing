import type { AgentCapability, AgentModelCapabilities, AgentProvider } from '@onething/core/agent-loop'
import { createClaudeAgentProvider } from './claude.js'
import { createCodexAgentProvider, type CodexAgentProviderOptions } from './codex.js'
import { createDeepSeekAgentProvider } from './deepseek.js'
import { createGeminiAgentProvider } from './gemini.js'
import { createOpenAICompatibleAgentProvider } from './openai-compatible.js'
import { createACPAgentProvider, type CoreACPAgentProviderOptions } from './acp.js'
import { resolveOnethingProviderBaseUrl, type OnethingZhipuApiMode } from '../../providers/zhipu.js'

export interface AgentProviderRuntimeOAuthToken {
  accessToken: string
}

export interface AgentProviderRuntimeAuthContext {
  kind: string
  token?: AgentProviderRuntimeOAuthToken
}

export interface AgentProviderRuntimeConfig {
  apiKey?: string
  baseUrl?: string
  zhipuApiMode?: OnethingZhipuApiMode
  model?: string
  apiType?: 'openai' | 'anthropic'
  oauthToken?: AgentProviderRuntimeOAuthToken
  authContext?: AgentProviderRuntimeAuthContext
  modelCapabilitiesByModel?: Record<string, {
    tools?: boolean
    vision?: boolean
    reasoning?: boolean
  }>
  models?: Record<string, {
    supportsTools?: boolean
    supportsVision?: boolean
    supportsReasoning?: boolean
    contextLength?: number
    maxOutputTokens?: number
  }>
}

export interface CreateAgentProviderFromRuntimeOptions {
  workingDirectory?: string
  localSessionId?: string
  fetchImpl?: typeof globalThis.fetch
  acpStreamPrompt?: CoreACPAgentProviderOptions['streamPrompt']
  acpCwd?: CoreACPAgentProviderOptions['cwd']
  codexRefreshOAuthToken?: CodexAgentProviderOptions['refreshOAuthToken']
  codexRequestDumper?: CodexAgentProviderOptions['requestDumper']
}

export type AgentProviderRuntimeFactory = (
  config: AgentProviderRuntimeConfig,
  options: CreateAgentProviderFromRuntimeOptions,
) => AgentProvider | undefined

export interface RegisterAgentProviderRuntimeOptions {
  replace?: boolean
}

const agentProviderRuntimeFactories = new Map<string, AgentProviderRuntimeFactory>()

interface CopilotCompletionToken {
  token: string
  expiresAt: number
}

interface CopilotTokenResponse {
  token?: string
  expires_in?: number
}

const copilotTokenCache = new Map<string, CopilotCompletionToken>()
const CLAUDE_CODE_HEADER = "You are Claude Code, Anthropic's official CLI for Claude."
const CLAUDE_CODE_OAUTH_BETA_HEADERS = [
  'oauth-2025-04-20',
  'claude-code-20250219',
  'interleaved-thinking-2025-05-14',
  'fine-grained-tool-streaming-2025-05-14',
].join(',')

function accessTokenFromRuntimeConfig(config: AgentProviderRuntimeConfig): string {
  if (config.authContext?.kind === 'oauth') {
    return config.authContext.token?.accessToken ?? ''
  }
  return config.oauthToken?.accessToken || config.apiKey || ''
}

async function getCopilotCompletionToken(
  githubAccessToken: string,
  fetchImpl: typeof globalThis.fetch,
): Promise<string> {
  const cached = copilotTokenCache.get(githubAccessToken)
  if (cached && cached.expiresAt > Date.now() + 60000) {
    return cached.token
  }

  const response = await fetchImpl('https://api.github.com/copilot_internal/v2/token', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${githubAccessToken}`,
      Accept: 'application/json',
      'User-Agent': 'onething/1.0',
      'Editor-Version': 'vscode/1.85.1',
      'Editor-Plugin-Version': 'copilot-chat/0.29.1',
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Failed to get Copilot token: ${response.status} ${text}`)
  }

  const data = await response.json() as CopilotTokenResponse
  if (!data.token) {
    throw new Error('Failed to get Copilot token: response did not include a token')
  }

  copilotTokenCache.set(githubAccessToken, {
    token: data.token,
    expiresAt: Date.now() + (data.expires_in ?? 1800) * 1000,
  })
  return data.token
}

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
  return agentProviderRuntimeFactories.has(providerId) || isCustomAgentProviderRuntime(providerId)
}

export function createAgentProviderFromRuntime(
  providerId: string,
  config: AgentProviderRuntimeConfig,
  options: CreateAgentProviderFromRuntimeOptions = {},
): AgentProvider | undefined {
  return agentProviderRuntimeFactories.get(providerId)?.(config, options)
    ?? createCustomAgentProviderFromRuntime(providerId, config, options)
}

function isCustomAgentProviderRuntime(providerId: string): boolean {
  return providerId.startsWith('custom-')
}

function runtimeCapabilityFlags(
  config: AgentProviderRuntimeConfig,
  defaults: {
    tools: boolean
    vision: boolean
    reasoning: boolean
  },
) {
  const model = config.model
  const override = model ? config.modelCapabilitiesByModel?.[model] : undefined
  const metadata = model ? config.models?.[model] : undefined

  return {
    tools: override?.tools ?? metadata?.supportsTools ?? defaults.tools,
    vision: override?.vision ?? metadata?.supportsVision ?? defaults.vision,
    reasoning: override?.reasoning ?? metadata?.supportsReasoning ?? defaults.reasoning,
  }
}

function capabilitiesFromFlags(flags: { tools: boolean; vision: boolean; reasoning: boolean }): AgentModelCapabilities {
  const capabilities: AgentCapability[] = ['text-input', 'text-output', 'streaming']
  if (flags.tools) capabilities.push('tool-calls', 'structured-tool-results')
  if (flags.vision) capabilities.push('vision-input')
  if (flags.reasoning) capabilities.push('reasoning')

  return {
    capabilities,
    inputModalities: flags.vision ? ['text', 'image'] : ['text'],
    outputModalities: ['text'],
    toolResultModalities: flags.tools && flags.vision ? ['text', 'image'] : ['text'],
    supportsTools: flags.tools,
    supportsStructuredToolResults: flags.tools,
    supportsReasoning: flags.reasoning,
    supportsStreaming: true,
  }
}

function positiveInteger(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined
}

function capabilityLimitsFromRuntimeConfig(config: AgentProviderRuntimeConfig): Pick<AgentModelCapabilities, 'maxInputTokens' | 'maxOutputTokens'> {
  const metadata = config.model ? config.models?.[config.model] : undefined
  return {
    maxInputTokens: positiveInteger(metadata?.contextLength),
    maxOutputTokens: positiveInteger(metadata?.maxOutputTokens),
  }
}

function createCustomAgentProviderFromRuntime(
  providerId: string,
  config: AgentProviderRuntimeConfig,
  options: CreateAgentProviderFromRuntimeOptions,
): AgentProvider | undefined {
  if (!isCustomAgentProviderRuntime(providerId)) return undefined

  if (config.apiType === 'anthropic') {
    const capabilities = runtimeCapabilityFlags(config, {
      tools: true,
      vision: true,
      reasoning: true,
    })
    return createClaudeAgentProvider({
      providerId,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      fetchImpl: options.fetchImpl,
      capabilities: capabilitiesFromFlags(capabilities),
    })
  }

  const capabilities = runtimeCapabilityFlags(config, {
    tools: true,
    vision: true,
    reasoning: true,
  })

  return createOpenAICompatibleAgentProvider({
    providerId,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    defaultBaseUrl: 'https://api.openai.com/v1',
    fetchImpl: options.fetchImpl,
    supportsVision: capabilities.vision,
    supportsReasoning: capabilities.reasoning,
    supportsTools: capabilities.tools,
    includeAssistantReasoning: capabilities.reasoning,
  })
}

registerAgentProviderRuntime('deepseek', (config, options) => createDeepSeekAgentProvider({
  apiKey: config.apiKey ?? '',
  baseUrl: config.baseUrl,
  fetchImpl: options.fetchImpl,
  capabilities: {
    ...capabilitiesFromFlags(runtimeCapabilityFlags(config, {
      tools: true,
      vision: false,
      reasoning: true,
    })),
    ...capabilityLimitsFromRuntimeConfig(config),
  },
}), { replace: true })

registerAgentProviderRuntime('acp', (_config, options) => {
  if (!options.acpStreamPrompt) return undefined

  return createACPAgentProvider({
    workingDirectory: options.workingDirectory,
    localSessionId: options.localSessionId,
    cwd: options.acpCwd,
    streamPrompt: options.acpStreamPrompt,
  })
}, { replace: true })

registerAgentProviderRuntime('codex', (config, options) => createCodexAgentProvider({
  apiKey: config.apiKey,
  baseUrl: config.baseUrl,
  oauthToken: config.oauthToken,
  authContext: config.authContext,
  fetchImpl: options.fetchImpl,
  refreshOAuthToken: options.codexRefreshOAuthToken,
  requestDumper: options.codexRequestDumper,
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
  baseUrl: resolveOnethingProviderBaseUrl('zhipu', config),
  defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  fetchImpl: options.fetchImpl,
  supportsReasoning: true,
  includeAssistantReasoning: true,
}), { replace: true })

registerAgentProviderRuntime('github-copilot', (config, options) => {
  const githubAccessToken = accessTokenFromRuntimeConfig(config)
  if (!githubAccessToken) {
    throw new Error('Not logged in to GitHub Copilot. Please login first.')
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  return createOpenAICompatibleAgentProvider({
    providerId: 'github-copilot',
    baseUrl: config.baseUrl,
    defaultBaseUrl: 'https://api.individual.githubcopilot.com',
    fetchImpl,
    headers: {
      'Editor-Version': 'vscode/1.85.1',
      'Editor-Plugin-Version': 'copilot-chat/0.29.1',
      'Copilot-Integration-Id': 'vscode-chat',
      'User-Agent': 'onething/1.0',
      'OpenAI-Intent': 'conversation-panel',
    },
    resolveAuth: async () => ({
      apiKey: await getCopilotCompletionToken(githubAccessToken, fetchImpl),
    }),
    supportsVision: true,
    supportsReasoning: true,
    supportsTools: true,
  })
}, { replace: true })

registerAgentProviderRuntime('claude', (config, options) => createClaudeAgentProvider({
  apiKey: config.apiKey,
  baseUrl: config.baseUrl,
  fetchImpl: options.fetchImpl,
}), { replace: true })

registerAgentProviderRuntime('claude-code', (config, options) => {
  const accessToken = accessTokenFromRuntimeConfig(config)
  if (!accessToken) {
    throw new Error('Not logged in to Claude Code. Please login first.')
  }
  return createClaudeAgentProvider({
    providerId: 'claude-code',
    baseUrl: config.baseUrl,
    fetchImpl: options.fetchImpl,
    omitApiKeyHeader: true,
    systemHeader: CLAUDE_CODE_HEADER,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'anthropic-beta': CLAUDE_CODE_OAUTH_BETA_HEADERS,
    },
  })
}, { replace: true })

registerAgentProviderRuntime('gemini', (config, options) => createGeminiAgentProvider({
  apiKey: config.apiKey,
  baseUrl: config.baseUrl,
  fetchImpl: options.fetchImpl,
}), { replace: true })
