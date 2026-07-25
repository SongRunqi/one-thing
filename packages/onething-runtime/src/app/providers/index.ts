/**
 * Provider facade.
 *
 * onething-runtime owns provider orchestration; Electron main only binds host
 * adapters such as OAuth, ACP prompt streaming, request dumps, and app fetch.
 */

import type { ThinkingEffort, UIMessage } from '@shared/ipc.js'
import {
  createOnethingProviderFacade,
  type OnethingAIMessageContent,
  type OnethingProviderFacadeChatResponseResult,
  type OnethingProviderFacadeRawRecord,
  type OnethingProviderFacadeReasoningStreamChunk,
  type OnethingProviderFacadeStreamCallbacks,
  type OnethingProviderFacadeStreamChunkWithTools,
  type OnethingProviderFacadeToolCall,
  type OnethingToolChatMessage,
} from '@onething/runtime/providers'
import { ACPManager } from '../acp/index.js'
import type {
  AgentProvider,
} from '@onething/core/agent-loop'
import { oauthManager } from '../providers/auth/oauth-manager.js'
import {
  createRequiredAppFetch,
} from './bound-fetch.js'
import {
  isACPProviderRuntime as isACPProvider,
  resolveProviderRuntimeRoute,
  type AgentRuntimeProviderConfig,
  type ProviderToolDefinitionMap,
  type ProviderToolSourceDefinition,
} from './agent-runtime.js'
import {
  dumpProviderRequest,
  type ProviderRequestDumpMode,
} from './request-dump.js'
import {
  getAvailableProviders as getProvidersFromRegistry,
  getProviderInfo as getInfoFromRegistry,
  initializeRegistry,
  isProviderSupported as isSupportedFromRegistry,
  requiresOAuth as requiresOAuthFromRegistry,
  requiresSystemMerge as requiresSystemMergeFromRegistry,
} from './registry.js'
import type {
  ProviderConfig,
  ProviderInfo,
} from './types.js'

type RuntimeProviderConfig = ProviderConfig & AgentRuntimeProviderConfig & {
  fetchImpl?: typeof globalThis.fetch
}

export type {
  ProviderExecutableToolDefinition,
  ProviderToolDefinitionInput,
  ProviderToolDefinitionMap,
  ProviderToolParameter,
  ProviderToolSourceDefinition,
} from './agent-runtime.js'

export type {
  ProviderInfo,
  ProviderConfig,
  ProviderDefinition,
} from './types.js'

export type AIMessageContent = OnethingAIMessageContent
export type AIToolCall = OnethingProviderFacadeToolCall
export type ChatResponseResult = OnethingProviderFacadeChatResponseResult
export type StreamChunkWithTools = OnethingProviderFacadeStreamChunkWithTools
export type ReasoningStreamChunk = OnethingProviderFacadeReasoningStreamChunk
export type StreamCallbacks = OnethingProviderFacadeStreamCallbacks
export type ToolChatMessage = OnethingToolChatMessage

initializeRegistry()

export function getAvailableProviders(): ProviderInfo[] {
  return getProvidersFromRegistry()
}

export function getProviderInfo(providerId: string): ProviderInfo | undefined {
  return getInfoFromRegistry(providerId)
}

export function isProviderSupported(providerId: string): boolean {
  return isSupportedFromRegistry(providerId)
}

export function requiresOAuth(providerId: string): boolean {
  return requiresOAuthFromRegistry(providerId)
}

async function dumpRuntimeProviderRequest(context: Parameters<typeof createOnethingProviderFacade>[0] extends {
  dumpProviderRequest?: infer TDumper
} ? TDumper extends (context: infer TContext) => unknown ? TContext : never : never): Promise<void> {
  await dumpProviderRequest({
    providerId: context.providerId,
    model: context.model,
    mode: context.mode as ProviderRequestDumpMode,
    metadata: context.metadata as OnethingProviderFacadeRawRecord | undefined,
    requestBody: context.requestBody,
  })
}

const providerFacade = createOnethingProviderFacade<RuntimeProviderConfig, AgentProvider>({
  requiresOAuth,
  refreshOAuthToken: id => oauthManager.refreshTokenIfNeeded(id),
  requiresSystemMerge: requiresSystemMergeFromRegistry,
  resolveRuntimeRoute: resolveProviderRuntimeRoute,
  createRequiredFetch: () => createRequiredAppFetch({ policy: 'streaming' }),
  dumpProviderRequest: dumpRuntimeProviderRequest,
  streamACPPrompt: (agentId, request) => ACPManager.streamPrompt(agentId, request),
  defaultWorkingDirectory: () => process.cwd(),
  isACPProvider,
  logger: console,
})

export async function getOAuthProviderConfig(
  providerId: string,
  baseConfig: { baseUrl?: string; model?: string },
): Promise<{ apiKey: string; baseUrl?: string } | null> {
  return providerFacade.getOAuthProviderConfig(providerId, baseConfig)
}

export async function generateChatResponse(
  providerId: string,
  config: RuntimeProviderConfig,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  options: {
    temperature?: number
    maxTokens?: number
    abortSignal?: AbortSignal
    thinking?: boolean
    thinkingEffort?: ThinkingEffort
    serviceTier?: string
    debugPurpose?: string
    debugSessionId?: string
    /** Side channel for token usage, so side-line callers can bill their calls. */
    onUsage?: (usage: { inputTokens: number; outputTokens: number; totalTokens: number }) => void
  } = {},
): Promise<string> {
  return providerFacade.generateChatResponse(providerId, config, messages, options)
}

export async function* streamChatResponse(
  providerId: string,
  config: RuntimeProviderConfig,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  options: { temperature?: number; maxTokens?: number } = {},
): AsyncGenerator<{ text: string; reasoning?: string }, void, void> {
  yield* providerFacade.streamChatResponse(providerId, config, messages, options)
}

export async function* streamChatResponseWithReasoning(
  providerId: string,
  config: RuntimeProviderConfig,
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: AIMessageContent
    reasoningContent?: string
  }>,
  options: {
    temperature?: number
    maxTokens?: number
    abortSignal?: AbortSignal
    thinking?: boolean
    thinkingEffort?: ThinkingEffort
    serviceTier?: string
  } = {},
): AsyncGenerator<ReasoningStreamChunk, void, void> {
  yield* providerFacade.streamChatResponseWithReasoning(providerId, config, messages, options)
}

export async function generateChatResponseWithReasoning(
  providerId: string,
  config: RuntimeProviderConfig,
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: AIMessageContent
    reasoningContent?: string
  }>,
  options: {
    temperature?: number
    maxTokens?: number
    abortSignal?: AbortSignal
    thinking?: boolean
    thinkingEffort?: ThinkingEffort
    serviceTier?: string
    debugPurpose?: string
    debugSessionId?: string
  } = {},
): Promise<ChatResponseResult> {
  return providerFacade.generateChatResponseWithReasoning(providerId, config, messages, options)
}

export function shouldUseStreaming(providerId: string, modelId: string): boolean {
  return providerFacade.shouldUseStreaming(providerId, modelId)
}

export async function generateChatTitle(
  providerId: string,
  config: RuntimeProviderConfig,
  userMessage: string,
  options: Pick<
    NonNullable<Parameters<typeof generateChatResponse>[3]>,
    'thinking' | 'thinkingEffort' | 'serviceTier' | 'debugSessionId' | 'onUsage'
  > = {},
): Promise<string> {
  return providerFacade.generateChatTitle(providerId, config, userMessage, options)
}

export async function* streamChatResponseWithTools(
  providerId: string,
  config: RuntimeProviderConfig,
  messages: ToolChatMessage[],
  tools: ProviderToolDefinitionMap,
  options: {
    temperature?: number
    maxTokens?: number
    abortSignal?: AbortSignal
    thinking?: boolean
    thinkingEffort?: ThinkingEffort
    serviceTier?: string
    codexNativeTools?: string[]
    debugSessionId?: string
    debugTurn?: number
    workingDirectory?: string
  } = {},
): AsyncGenerator<StreamChunkWithTools, void, void> {
  yield* providerFacade.streamChatResponseWithTools(providerId, config, messages, tools, options)
}

export function convertToolDefinitionsForProvider(
  toolDefinitions: ProviderToolSourceDefinition[],
): ProviderToolDefinitionMap {
  return providerFacade.convertToolDefinitionsForProvider(toolDefinitions)
}

export async function* streamChatWithUIMessages(
  providerId: string,
  config: RuntimeProviderConfig,
  uiMessages: UIMessage[],
  tools: ProviderToolDefinitionMap,
  options: {
    temperature?: number
    maxTokens?: number
    abortSignal?: AbortSignal
  } = {},
): AsyncGenerator<StreamChunkWithTools, void, void> {
  yield* providerFacade.streamChatWithUIMessages(
    providerId,
    config,
    uiMessages as unknown as Parameters<typeof providerFacade.streamChatWithUIMessages>[2],
    tools,
    options,
  )
}

export const providerRegistry: Record<string, ProviderInfo> =
  Object.fromEntries(getProvidersFromRegistry().map(provider => [provider.id, provider]))
