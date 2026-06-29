import type {
  AgentJsonObject,
  AgentProvider,
  AgentProviderData,
} from '@onething/core/agent-loop'
import {
  generateWithOnethingDeepSeekAgent,
  runOnethingUtilityAgentTurn,
  streamOnethingAgentProviderToolTurn,
  streamOnethingDeepSeekAgentTurn,
  streamOnethingUtilityAgentTurn,
  type OnethingChatResponseResult,
  type OnethingProviderRequestDumpContext,
  type OnethingProviderRequestDumpMode,
  type OnethingProviderRequestDumpValue,
  type OnethingReasoningStreamChunk,
  type OnethingUtilityAgentMessage,
  type OnethingUtilityAgentOptions,
} from './agent-turn.js'
import {
  isOnethingACPProviderRuntime,
  type OnethingAgentRuntimeProviderConfig,
} from './agent-runtime-route.js'
import {
  convertOnethingToolDefinitionsForProvider,
  onethingToolChatMessagesFromUIMessages,
  type OnethingAIMessageContent,
  type OnethingDeepSeekAgentSourceMessage,
  type OnethingProviderOpaqueValue,
  type OnethingProviderToolDefinitionMap,
  type OnethingProviderToolSourceDefinition,
  type OnethingToolChatMessage,
  type OnethingUIMessage,
} from './message-conversion.js'
import {
  generateOnethingChatResponseWithReasoning,
  generateOnethingProviderChatTitle,
  generateOnethingTextChatResponse,
  mergeOnethingSystemMessagesForGenerateIfNeeded,
  streamOnethingACPChatResponseWithTools,
  streamOnethingChatResponseWithReasoning,
  streamOnethingChatResponseWithTools,
  streamOnethingTextChatResponse,
  type OnethingACPPromptStreamEvent,
  type OnethingACPReasoningStreamChunk,
  type OnethingACPStreamPromptRequest,
  type OnethingChatReasoningStreamChunk,
  type OnethingProviderRuntimeChatRoute,
  type OnethingThinkingEffort,
  type OnethingProviderToolStreamMode,
} from './provider-routing.js'
import { resolveOnethingOAuthProviderConfig } from './oauth-config.js'

export type OnethingProviderFacadeConfig = OnethingAgentRuntimeProviderConfig & {
  model: string
  fetchImpl?: typeof globalThis.fetch
}

export interface OnethingProviderFacadeToolCall {
  toolCallId: string
  toolName: string
  args: AgentJsonObject
}

export interface OnethingProviderFacadeChatResponseResult {
  text: string
  reasoning?: string
  toolCalls?: OnethingProviderFacadeToolCall[]
}

export interface OnethingProviderFacadeStreamChunkWithTools {
  type:
    | 'text'
    | 'reasoning'
    | 'tool-call'
    | 'tool-result'
    | 'finish'
    | 'tool-input-start'
    | 'tool-input-delta'
    | 'tool-input-end'
    | 'provider-data'
  text?: string
  reasoning?: string
  toolCall?: OnethingProviderFacadeToolCall
  toolResult?: {
    toolCallId: string
    result: OnethingProviderOpaqueValue
  }
  toolInputStart?: { toolCallId: string; toolName: string }
  toolInputDelta?: { toolCallId: string; argsTextDelta: string }
  toolInputEnd?: { toolCallId: string }
  finishReason?:
    | 'stop'
    | 'length'
    | 'tool-calls'
    | 'content-filter'
    | 'error'
    | 'other'
    | 'unknown'
  providerData?: AgentProviderData
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

export type OnethingProviderFacadeReasoningStreamChunk =
  | { type: 'text'; text: string; reasoning?: string }
  | {
      type: 'finish'
      usage: { inputTokens: number; outputTokens: number; totalTokens: number }
    }

export interface OnethingProviderFacadeStreamCallbacks {
  onReasoningDelta?: (delta: string) => void
  onTextDelta?: (delta: string) => void
  onComplete?: (result: OnethingProviderFacadeChatResponseResult) => void
  onError?: (error: Error) => void
}

export type OnethingProviderFacadeRawPrimitive = string | number | boolean | null | undefined
export type OnethingProviderFacadeRawRecord = { [key: string]: OnethingProviderFacadeRawValue }
export type OnethingProviderFacadeRawValue =
  | OnethingProviderFacadeRawPrimitive
  | OnethingProviderFacadeRawRecord
  | OnethingProviderFacadeRawValue[]
  | Error
  | object

export interface OnethingChatGenerationOptions {
  temperature?: number
  maxTokens?: number
  abortSignal?: AbortSignal
  thinking?: boolean
  thinkingEffort?: OnethingThinkingEffort
  serviceTier?: string
  debugPurpose?: string
  debugSessionId?: string
}

export interface OnethingProviderFacadeAdapters<
  TConfig extends OnethingProviderFacadeConfig = OnethingProviderFacadeConfig,
  TProvider extends AgentProvider = AgentProvider,
> {
  requiresOAuth(providerId: string): boolean
  refreshOAuthToken(providerId: string): Promise<{ accessToken: string }>
  requiresSystemMerge(providerId: string): boolean
  resolveRuntimeRoute(providerId: string, config: TConfig): OnethingProviderRuntimeChatRoute<TProvider>
  createRequiredFetch(): typeof globalThis.fetch
  dumpProviderRequest?(context: OnethingProviderRequestDumpContext): void | Promise<void>
  streamACPPrompt(
    agentId: string,
    request: OnethingACPStreamPromptRequest,
  ): AsyncIterable<OnethingACPPromptStreamEvent>
  defaultWorkingDirectory?(): string
  isACPProvider?(providerId: string): boolean
  logger?: Pick<Console, 'error'>
}

export interface OnethingProviderFacade<
  TConfig extends OnethingProviderFacadeConfig = OnethingProviderFacadeConfig,
  TProvider extends AgentProvider = AgentProvider,
> {
  getOAuthProviderConfig(
    providerId: string,
    baseConfig: { baseUrl?: string; model?: string },
  ): Promise<{ apiKey: string; baseUrl?: string } | null>
  generateChatResponse(
    providerId: string,
    config: TConfig,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options?: OnethingChatGenerationOptions,
  ): Promise<string>
  streamChatResponse(
    providerId: string,
    config: TConfig,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options?: { temperature?: number; maxTokens?: number },
  ): AsyncGenerator<{ text: string; reasoning?: string }, void, void>
  streamChatResponseWithReasoning(
    providerId: string,
    config: TConfig,
    messages: Array<{
      role: 'user' | 'assistant' | 'system'
      content: OnethingAIMessageContent
      reasoningContent?: string
    }>,
    options?: {
      temperature?: number
      maxTokens?: number
      abortSignal?: AbortSignal
      thinking?: boolean
      thinkingEffort?: OnethingThinkingEffort
      serviceTier?: string
    },
  ): AsyncGenerator<OnethingProviderFacadeReasoningStreamChunk, void, void>
  generateChatResponseWithReasoning(
    providerId: string,
    config: TConfig,
    messages: Array<{
      role: 'user' | 'assistant' | 'system'
      content: OnethingAIMessageContent
      reasoningContent?: string
    }>,
    options?: OnethingChatGenerationOptions,
  ): Promise<OnethingProviderFacadeChatResponseResult>
  shouldUseStreaming(providerId: string, modelId: string): boolean
  generateChatTitle(
    providerId: string,
    config: TConfig,
    userMessage: string,
    options?: Pick<
      OnethingChatGenerationOptions,
      'thinking' | 'thinkingEffort' | 'serviceTier' | 'debugSessionId'
    >,
  ): Promise<string>
  streamChatResponseWithTools(
    providerId: string,
    config: TConfig,
    messages: OnethingToolChatMessage[],
    tools: OnethingProviderToolDefinitionMap,
    options?: {
      temperature?: number
      maxTokens?: number
      abortSignal?: AbortSignal
      thinking?: boolean
      thinkingEffort?: OnethingThinkingEffort
      serviceTier?: string
      codexNativeTools?: string[]
      debugSessionId?: string
      debugTurn?: number
      workingDirectory?: string
    },
  ): AsyncGenerator<OnethingProviderFacadeStreamChunkWithTools, void, void>
  convertToolDefinitionsForProvider(
    toolDefinitions: OnethingProviderToolSourceDefinition[],
  ): OnethingProviderToolDefinitionMap
  streamChatWithUIMessages(
    providerId: string,
    config: TConfig,
    uiMessages: OnethingUIMessage[],
    tools: OnethingProviderToolDefinitionMap,
    options?: {
      temperature?: number
      maxTokens?: number
      abortSignal?: AbortSignal
    },
  ): AsyncGenerator<OnethingProviderFacadeStreamChunkWithTools, void, void>
}

function withDeepSeekFetch<TConfig extends OnethingProviderFacadeConfig>(
  config: TConfig,
  adapters: Pick<OnethingProviderFacadeAdapters<TConfig>, 'createRequiredFetch'>,
): TConfig {
  return {
    ...config,
    fetchImpl: config.fetchImpl ?? adapters.createRequiredFetch(),
  }
}

function providerRequestDumpRecord(
  metadata: Record<string, unknown> | undefined,
): Record<string, OnethingProviderRequestDumpValue> | undefined {
  return metadata as Record<string, OnethingProviderRequestDumpValue> | undefined
}

function toolChatMessagesFromUIMessages(messages: OnethingUIMessage[]): OnethingToolChatMessage[] {
  return onethingToolChatMessagesFromUIMessages(messages)
}

export function createOnethingProviderFacade<
  TConfig extends OnethingProviderFacadeConfig = OnethingProviderFacadeConfig,
  TProvider extends AgentProvider = AgentProvider,
>(
  adapters: OnethingProviderFacadeAdapters<TConfig, TProvider>,
): OnethingProviderFacade<TConfig, TProvider> {
  const onRequestPrepared = adapters.dumpProviderRequest

  const runUtilityTurn = async (
    providerId: string,
    provider: TProvider,
    config: TConfig,
    messages: OnethingUtilityAgentMessage[],
    options: OnethingChatGenerationOptions,
    mode: OnethingProviderRequestDumpMode,
  ): Promise<OnethingProviderFacadeChatResponseResult | undefined> =>
    runOnethingUtilityAgentTurn({
      providerId,
      provider,
      config,
      messages,
      options,
      mode,
      onRequestPrepared,
    }) as Promise<OnethingProviderFacadeChatResponseResult | undefined>

  const streamUtilityTurn = async function* (
    providerId: string,
    provider: TProvider,
    config: TConfig,
    messages: OnethingUtilityAgentMessage[],
    options: OnethingChatGenerationOptions,
    mode: OnethingProviderRequestDumpMode,
  ): AsyncGenerator<OnethingProviderFacadeReasoningStreamChunk, void, void> {
    yield* (streamOnethingUtilityAgentTurn({
      providerId,
      provider,
      config,
      messages,
      options,
      mode,
      onRequestPrepared,
    }) as AsyncGenerator<OnethingProviderFacadeReasoningStreamChunk, void, void>)
  }

  const streamAgentToolTurn = async function* (
    providerId: string,
    provider: TProvider,
    config: TConfig,
    messages: OnethingToolChatMessage[],
    tools: OnethingProviderToolDefinitionMap,
    options: OnethingUtilityAgentOptions,
    mode: OnethingProviderToolStreamMode = 'stream-tools',
    metadata: Record<string, unknown> = {},
  ): AsyncGenerator<OnethingProviderFacadeStreamChunkWithTools, void, void> {
    yield* (streamOnethingAgentProviderToolTurn({
      providerId,
      provider,
      config,
      messages,
      tools,
      options,
      mode,
      metadata: providerRequestDumpRecord(metadata),
      onRequestPrepared,
    }) as AsyncGenerator<OnethingProviderFacadeStreamChunkWithTools, void, void>)
  }

  const generateWithDeepSeek = (
    config: TConfig,
    messages: OnethingUtilityAgentMessage[],
    options: OnethingChatGenerationOptions = {},
  ): Promise<OnethingProviderFacadeChatResponseResult> =>
    generateWithOnethingDeepSeekAgent({
      config: withDeepSeekFetch(config, adapters),
      messages,
      options,
      onRequestPrepared,
    }) as Promise<OnethingProviderFacadeChatResponseResult>

  const streamDeepSeekTurn = async function* (
    config: TConfig,
    messages: OnethingDeepSeekAgentSourceMessage[],
    tools: OnethingProviderToolDefinitionMap = {},
    options: OnethingChatGenerationOptions & { debugTurn?: number } = {},
    mode: OnethingProviderToolStreamMode | OnethingProviderRequestDumpMode = 'stream-tools',
    metadata: Record<string, unknown> = {},
  ): AsyncGenerator<OnethingProviderFacadeStreamChunkWithTools, void, void> {
    yield* (streamOnethingDeepSeekAgentTurn({
      config: withDeepSeekFetch(config, adapters),
      messages,
      tools,
      options,
      mode: mode as OnethingProviderRequestDumpMode,
      metadata: providerRequestDumpRecord(metadata),
      onRequestPrepared,
    }) as AsyncGenerator<OnethingProviderFacadeStreamChunkWithTools, void, void>)
  }

  const mergeMessagesForGenerate = (
    providerId: string,
    messages: OnethingUtilityAgentMessage[],
  ): OnethingUtilityAgentMessage[] =>
    mergeOnethingSystemMessagesForGenerateIfNeeded(
      adapters.requiresSystemMerge(providerId),
      messages,
    ) as OnethingUtilityAgentMessage[]

  const streamACPWithTools = async function* (
    config: TConfig,
    messages: OnethingToolChatMessage[],
    options: {
      abortSignal?: AbortSignal
      debugSessionId?: string
      workingDirectory?: string
    } = {},
  ): AsyncGenerator<OnethingProviderFacadeStreamChunkWithTools, void, void> {
    yield* (streamOnethingACPChatResponseWithTools({
      config,
      messages,
      options,
      defaultWorkingDirectory: adapters.defaultWorkingDirectory?.() ?? process.cwd(),
      streamPrompt: (agentId, request) => adapters.streamACPPrompt(agentId, request),
    }) as AsyncGenerator<OnethingProviderFacadeStreamChunkWithTools, void, void>)
  }

  const facade: OnethingProviderFacade<TConfig, TProvider> = {
    getOAuthProviderConfig(providerId, baseConfig) {
      return resolveOnethingOAuthProviderConfig({
        providerId,
        baseConfig,
        requiresOAuth: adapters.requiresOAuth,
        refreshTokenIfNeeded: id => adapters.refreshOAuthToken(id),
        logger: adapters.logger,
      })
    },

    generateChatResponse(providerId, config, messages, options = {}) {
      return generateOnethingTextChatResponse({
        providerId,
        config,
        messages,
        options,
        generateWithReasoning: facade.generateChatResponseWithReasoning,
      })
    },

    async *streamChatResponse(providerId, config, messages, options = {}) {
      yield* streamOnethingTextChatResponse({
        providerId,
        config,
        messages,
        options,
        streamWithReasoning: facade.streamChatResponseWithReasoning,
      })
    },

    async *streamChatResponseWithReasoning(providerId, config, messages, options = {}) {
      yield* (streamOnethingChatResponseWithReasoning({
        providerId,
        config,
        messages,
        options,
        mergeMessagesForGenerate,
        resolveRuntimeRoute: adapters.resolveRuntimeRoute,
        streamDeepSeekTurn: (runtimeConfig, runtimeMessages, runtimeOptions, mode) =>
          streamDeepSeekTurn(
            runtimeConfig,
            runtimeMessages as OnethingDeepSeekAgentSourceMessage[],
            {},
            runtimeOptions,
            mode,
          ) as AsyncIterable<OnethingChatReasoningStreamChunk>,
        streamUtilityAgentTurn: streamUtilityTurn,
      }) as AsyncGenerator<OnethingProviderFacadeReasoningStreamChunk, void, void>)
    },

    generateChatResponseWithReasoning(providerId, config, messages, options = {}) {
      return generateOnethingChatResponseWithReasoning({
        providerId,
        config,
        messages,
        options,
        streamACPResponse: (runtimeConfig, runtimeMessages, runtimeOptions) =>
          streamACPWithTools(
            runtimeConfig,
            runtimeMessages as OnethingToolChatMessage[],
            runtimeOptions,
          ) as AsyncIterable<OnethingACPReasoningStreamChunk>,
        mergeMessagesForGenerate,
        resolveRuntimeRoute: adapters.resolveRuntimeRoute,
        generateWithDeepSeek,
        runUtilityAgentTurn: runUtilityTurn,
      }) as Promise<OnethingProviderFacadeChatResponseResult>
    },

    shouldUseStreaming() {
      return true
    },

    generateChatTitle(providerId, config, userMessage, options = {}) {
      return generateOnethingProviderChatTitle({
        providerId,
        config,
        userMessage,
        options,
        isACPProvider: adapters.isACPProvider ?? isOnethingACPProviderRuntime,
        generateChatResponse: facade.generateChatResponse,
      })
    },

    async *streamChatResponseWithTools(providerId, config, messages, tools, options = {}) {
      yield* (streamOnethingChatResponseWithTools({
        providerId,
        config,
        messages,
        tools,
        options,
        mode: 'stream-tools',
        metadata: {
          originalMessageCount: messages.length,
          convertedMessageCount: messages.length,
        },
        resolveRuntimeRoute: adapters.resolveRuntimeRoute,
        streamACPResponse: (runtimeConfig, runtimeMessages, runtimeOptions) =>
          streamACPWithTools(runtimeConfig, runtimeMessages, {
            abortSignal: runtimeOptions.abortSignal,
            debugSessionId: runtimeOptions.debugSessionId,
            workingDirectory: runtimeOptions.workingDirectory,
          }),
        streamDeepSeekTurn: (runtimeConfig, runtimeMessages, runtimeTools, runtimeOptions, mode, metadata) =>
          streamDeepSeekTurn(
            runtimeConfig,
            runtimeMessages as OnethingDeepSeekAgentSourceMessage[],
            runtimeTools,
            runtimeOptions,
            mode,
            metadata,
          ),
        streamAgentToolTurn,
      }) as AsyncGenerator<OnethingProviderFacadeStreamChunkWithTools, void, void>)
    },

    convertToolDefinitionsForProvider(toolDefinitions) {
      return convertOnethingToolDefinitionsForProvider(toolDefinitions)
    },

    async *streamChatWithUIMessages(providerId, config, uiMessages, tools, options = {}) {
      const toolMessages = toolChatMessagesFromUIMessages(uiMessages)
      yield* (streamOnethingChatResponseWithTools({
        providerId,
        config,
        messages: toolMessages,
        tools,
        options,
        mode: 'stream-ui-messages',
        metadata: {
          uiMessageCount: uiMessages.length,
          modelMessageCount: toolMessages.length,
        },
        resolveRuntimeRoute: adapters.resolveRuntimeRoute,
        streamDeepSeekTurn: (runtimeConfig, runtimeMessages, runtimeTools, runtimeOptions, mode, metadata) =>
          streamDeepSeekTurn(
            runtimeConfig,
            runtimeMessages as OnethingDeepSeekAgentSourceMessage[],
            runtimeTools,
            runtimeOptions,
            mode,
            metadata,
          ),
        streamAgentToolTurn,
      }) as AsyncGenerator<OnethingProviderFacadeStreamChunkWithTools, void, void>)
    },
  }

  return facade
}
