import {
  agentContentToText,
  agentEventsToProviderStreamChunks,
  agentModelToolsFromDefinitions,
  collectAgentTurnFromStream,
  streamAgentProviderTurnEvents,
  type AgentJsonObject,
  type AgentMessage,
  type AgentProvider,
  type AgentProviderStreamChunk,
  type AgentTool,
  type AgentTurnRequest,
  type AgentUsage,
} from '@onething/core/agent-loop'
import { createDeepSeekAgentProvider } from '../agent-loop/providers/deepseek.js'
import {
  onethingDeepSeekAgentMessagesFromMessages,
  onethingAgentMessagesFromToolChatMessages,
  onethingUtilityAgentMessagesFromMessages,
  type OnethingAIMessageContent,
  type OnethingDeepSeekAgentSourceMessage,
  type OnethingProviderToolDefinitionMap,
  type OnethingToolChatMessage,
} from './message-conversion.js'
import {
  normalizeOnethingDeepSeekAgentReasoningEffort,
  normalizeOnethingAgentReasoningEffort,
  resolveOnethingDeepSeekAgentThinking,
  resolveOnethingAgentThinking,
  type OnethingAgentReasoningEffort,
  type OnethingAgentThinking,
  type OnethingThinkingEffort,
} from './provider-routing.js'

export type OnethingProviderRequestDumpMode =
  | 'stream'
  | 'stream-reasoning'
  | 'stream-tools'
  | 'stream-ui-messages'
  | 'generate'
  | 'codex-http'

export type OnethingProviderRequestDumpValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | bigint
  | Error
  | object
  | OnethingProviderRequestDumpValue[]
  | { [key: string]: OnethingProviderRequestDumpValue }

export interface OnethingProviderRequestDumpContext {
  providerId: string
  model: string
  mode: OnethingProviderRequestDumpMode
  metadata?: Record<string, OnethingProviderRequestDumpValue>
  requestBody: OnethingProviderRequestDumpValue
}

export interface OnethingUtilityAgentConfig {
  model: string
}

export interface OnethingDeepSeekAgentConfig extends OnethingUtilityAgentConfig {
  apiKey?: string
  baseUrl?: string
  fetchImpl?: typeof globalThis.fetch
}

export interface OnethingUtilityAgentOptions {
  temperature?: number
  maxTokens?: number
  abortSignal?: AbortSignal
  thinking?: boolean
  thinkingEffort?: OnethingThinkingEffort
  debugPurpose?: string
  debugSessionId?: string
  debugTurn?: number
}

export type OnethingUtilityAgentMessage = {
  role: 'user' | 'assistant' | 'system'
  content: OnethingAIMessageContent
  reasoningContent?: string
}

export interface OnethingChatResponseResult {
  text: string
  reasoning?: string
  toolCalls?: Array<{
    toolCallId: string
    toolName: string
    args: AgentJsonObject
  }>
  /**
   * Token usage for this turn, when the provider reported it. Side-line
   * callers (title generation, memory capture/review) need this to bill their
   * calls — without it their tokens are invisible in the usage ledger.
   */
  usage?: AgentUsage
}

export type OnethingReasoningStreamChunk =
  | { type: 'text'; text: string; reasoning?: string }
  | {
      type: 'finish'
      usage: { inputTokens: number; outputTokens: number; totalTokens: number }
    }

export interface OnethingUtilityAgentTurnRunnerOptions {
  providerId: string
  provider: AgentProvider
  config: OnethingUtilityAgentConfig
  messages: OnethingUtilityAgentMessage[]
  options?: OnethingUtilityAgentOptions
  mode: OnethingProviderRequestDumpMode
  onRequestPrepared?: (context: OnethingProviderRequestDumpContext) => void | Promise<void>
}

export interface OnethingAgentProviderToolTurnRunnerOptions {
  providerId: string
  provider: AgentProvider
  config: OnethingUtilityAgentConfig
  messages: OnethingToolChatMessage[]
  tools: OnethingProviderToolDefinitionMap
  options?: OnethingUtilityAgentOptions
  mode?: OnethingProviderRequestDumpMode
  metadata?: Record<string, OnethingProviderRequestDumpValue>
  onRequestPrepared?: (context: OnethingProviderRequestDumpContext) => void | Promise<void>
}

export interface OnethingDeepSeekAgentGenerateOptions {
  config: OnethingDeepSeekAgentConfig
  messages: OnethingUtilityAgentMessage[]
  options?: OnethingUtilityAgentOptions
  onRequestPrepared?: (context: OnethingProviderRequestDumpContext) => void | Promise<void>
}

export interface OnethingDeepSeekAgentStreamOptions {
  config: OnethingDeepSeekAgentConfig
  messages: OnethingDeepSeekAgentSourceMessage[]
  tools?: OnethingProviderToolDefinitionMap
  options?: OnethingUtilityAgentOptions
  mode?: OnethingProviderRequestDumpMode
  metadata?: Record<string, OnethingProviderRequestDumpValue>
  onRequestPrepared?: (context: OnethingProviderRequestDumpContext) => void | Promise<void>
}

interface PreparedUtilityAgentTurn {
  agentMessages: AgentMessage[]
  agentTools?: AgentTool[]
  thinking: OnethingAgentThinking | undefined
  reasoningEffort: OnethingAgentReasoningEffort | undefined
  maxTokens: number
  toolChoice: 'auto' | 'none'
  request: AgentTurnRequest
}

function parseToolArgs(value: string): AgentJsonObject {
  try {
    const parsed = JSON.parse(value || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as AgentJsonObject
      : {}
  } catch {
    return {}
  }
}

function prepareUtilityAgentTurn(options: {
  config: OnethingUtilityAgentConfig
  messages: AgentMessage[]
  agentTools?: AgentTool[]
  runnerOptions?: OnethingUtilityAgentOptions
  toolChoice: 'auto' | 'none'
  turn?: number
}): PreparedUtilityAgentTurn {
  const runnerOptions = options.runnerOptions ?? {}
  const thinking = resolveOnethingAgentThinking(runnerOptions)
  const reasoningEffort = normalizeOnethingAgentReasoningEffort(runnerOptions.thinkingEffort)
  const maxTokens = runnerOptions.maxTokens || 4096
  return {
    agentMessages: options.messages,
    agentTools: options.agentTools,
    thinking,
    reasoningEffort,
    maxTokens,
    toolChoice: options.toolChoice,
    request: {
      model: options.config.model,
      messages: options.messages,
      ...(options.agentTools?.length ? { tools: options.agentTools } : {}),
      toolChoice: options.toolChoice,
      maxTokens,
      temperature: runnerOptions.temperature,
      thinking,
      reasoningEffort,
      abortSignal: runnerOptions.abortSignal,
      turn: options.turn ?? 1,
    },
  }
}

function utilityAgentRequestDumpContext(options: {
  providerId: string
  config: OnethingUtilityAgentConfig
  mode: OnethingProviderRequestDumpMode
  prepared: PreparedUtilityAgentTurn
  metadata?: Record<string, OnethingProviderRequestDumpValue>
}): OnethingProviderRequestDumpContext {
  return {
    providerId: options.providerId,
    model: options.config.model,
    mode: options.mode,
    metadata: {
      ...options.metadata,
      transport: 'agent-provider',
    },
    requestBody: {
      model: options.config.model,
      messages: options.prepared.agentMessages,
      stream: true,
      tools: options.prepared.agentTools?.length
        ? options.prepared.agentTools.map((tool) => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          }))
        : undefined,
      tool_choice: options.prepared.toolChoice,
      temperature: options.prepared.request.temperature,
      max_tokens: options.prepared.maxTokens,
      thinking: options.prepared.thinking,
      reasoning_effort: options.prepared.reasoningEffort,
    },
  }
}

function deepSeekAgentRequestDumpContext(options: {
  config: OnethingDeepSeekAgentConfig
  messages: AgentMessage[]
  tools?: AgentTool[]
  temperature?: number
  maxTokens?: number
  thinking?: OnethingAgentThinking
  reasoningEffort?: OnethingAgentReasoningEffort
  mode: OnethingProviderRequestDumpMode
  metadata?: Record<string, OnethingProviderRequestDumpValue>
}): OnethingProviderRequestDumpContext {
  return {
    providerId: 'deepseek',
    model: options.config.model,
    mode: options.mode,
    metadata: options.metadata,
    requestBody: {
      model: options.config.model,
      messages: options.messages,
      stream: true,
      stream_options: { include_usage: true },
      tools: options.tools?.length
        ? options.tools.map((tool) => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          }))
        : undefined,
      tool_choice: options.tools?.length ? 'auto' : undefined,
      temperature: options.thinking === 'enabled' ? undefined : options.temperature,
      max_tokens: options.maxTokens,
      thinking: options.thinking ? { type: options.thinking } : undefined,
      reasoning_effort: options.thinking === 'enabled' ? options.reasoningEffort : undefined,
    },
  }
}

function metadataFromOptions(
  options: OnethingUtilityAgentOptions | undefined,
): Record<string, OnethingProviderRequestDumpValue> | undefined {
  if (!options?.debugPurpose && !options?.debugSessionId) return undefined
  return {
    purpose: options.debugPurpose,
    sessionId: options.debugSessionId,
  }
}

export async function runOnethingUtilityAgentTurn(
  runnerOptions: OnethingUtilityAgentTurnRunnerOptions,
): Promise<OnethingChatResponseResult | undefined> {
  const options = runnerOptions.options ?? {}
  const agentMessages = onethingUtilityAgentMessagesFromMessages(runnerOptions.messages)
  const prepared = prepareUtilityAgentTurn({
    config: runnerOptions.config,
    messages: agentMessages,
    runnerOptions: options,
    toolChoice: 'none',
  })

  await runnerOptions.onRequestPrepared?.(utilityAgentRequestDumpContext({
    providerId: runnerOptions.providerId,
    config: runnerOptions.config,
    mode: runnerOptions.mode,
    prepared,
    metadata: metadataFromOptions(options),
  }))

  const turn = await collectAgentTurnFromStream(
    streamAgentProviderTurnEvents(runnerOptions.provider, prepared.request),
  )

  return {
    text: agentContentToText(turn.message.content),
    reasoning: turn.message.reasoningContent || undefined,
    toolCalls: turn.message.toolCalls?.map(toolCall => ({
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      args: parseToolArgs(toolCall.arguments),
    })),
    usage: turn.usage,
  }
}

export async function* streamOnethingUtilityAgentTurn(
  runnerOptions: OnethingUtilityAgentTurnRunnerOptions,
): AsyncGenerator<OnethingReasoningStreamChunk, void, void> {
  const options = runnerOptions.options ?? {}
  const agentMessages = onethingUtilityAgentMessagesFromMessages(runnerOptions.messages)
  const prepared = prepareUtilityAgentTurn({
    config: runnerOptions.config,
    messages: agentMessages,
    runnerOptions: options,
    toolChoice: 'none',
  })

  await runnerOptions.onRequestPrepared?.(utilityAgentRequestDumpContext({
    providerId: runnerOptions.providerId,
    config: runnerOptions.config,
    mode: runnerOptions.mode,
    prepared,
    metadata: metadataFromOptions(options),
  }))

  for await (const event of streamAgentProviderTurnEvents(runnerOptions.provider, prepared.request)) {
    if (event.type === 'reasoning-delta' && event.delta) {
      yield { type: 'text', text: '', reasoning: event.delta }
    } else if (event.type === 'text-delta' && event.delta) {
      yield { type: 'text', text: event.delta }
    } else if (event.type === 'finish') {
      yield {
        type: 'finish',
        usage: event.usage ?? {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
      }
    }
  }
}

export async function* streamOnethingAgentProviderToolTurn(
  runnerOptions: OnethingAgentProviderToolTurnRunnerOptions,
): AsyncGenerator<AgentProviderStreamChunk, void, void> {
  const options = runnerOptions.options ?? {}
  const agentMessages = onethingAgentMessagesFromToolChatMessages(runnerOptions.messages)
  const agentTools = agentModelToolsFromDefinitions(runnerOptions.tools)
  const prepared = prepareUtilityAgentTurn({
    config: runnerOptions.config,
    messages: agentMessages,
    agentTools,
    runnerOptions: options,
    toolChoice: agentTools.length > 0 ? 'auto' : 'none',
    turn: options.debugTurn ?? 1,
  })

  await runnerOptions.onRequestPrepared?.(utilityAgentRequestDumpContext({
    providerId: runnerOptions.providerId,
    config: runnerOptions.config,
    mode: runnerOptions.mode ?? 'stream-tools',
    prepared,
    metadata: {
      ...runnerOptions.metadata,
      sessionId: options.debugSessionId,
      turn: options.debugTurn,
      originalMessageCount: runnerOptions.messages.length,
      convertedMessageCount: agentMessages.length,
    },
  }))

  const events = streamAgentProviderTurnEvents(runnerOptions.provider, prepared.request)
  for await (const chunk of agentEventsToProviderStreamChunks(events)) {
    if (chunk.type === 'turn-start' || chunk.type === 'tool-metadata' || chunk.type === 'tool-partial-result') {
      continue
    }
    yield chunk
  }
}

function createOnethingDeepSeekAgentProvider(config: OnethingDeepSeekAgentConfig): AgentProvider {
  return createDeepSeekAgentProvider({
    apiKey: config.apiKey ?? '',
    baseUrl: config.baseUrl,
    fetchImpl: config.fetchImpl,
  })
}

export async function generateWithOnethingDeepSeekAgent(
  runnerOptions: OnethingDeepSeekAgentGenerateOptions,
): Promise<OnethingChatResponseResult> {
  const options = runnerOptions.options ?? {}
  const agentMessages = onethingDeepSeekAgentMessagesFromMessages(runnerOptions.messages)
  const maxTokens = options.maxTokens || 4096
  const thinking = resolveOnethingDeepSeekAgentThinking(runnerOptions.config.model, options)
  const reasoningEffort = normalizeOnethingDeepSeekAgentReasoningEffort(options.thinkingEffort)

  await runnerOptions.onRequestPrepared?.(deepSeekAgentRequestDumpContext({
    config: runnerOptions.config,
    messages: agentMessages,
    maxTokens,
    temperature: options.temperature,
    thinking,
    reasoningEffort,
    mode: 'stream-reasoning',
    metadata: options.debugPurpose || options.debugSessionId
      ? {
          purpose: options.debugPurpose,
          sessionId: options.debugSessionId,
          transport: 'deepseek-agent',
        }
      : { transport: 'deepseek-agent' },
  }))

  const provider = createOnethingDeepSeekAgentProvider(runnerOptions.config)
  const turn = await collectAgentTurnFromStream(streamAgentProviderTurnEvents(provider, {
    model: runnerOptions.config.model,
    messages: agentMessages,
    toolChoice: 'none',
    maxTokens,
    temperature: thinking === 'enabled' ? undefined : options.temperature,
    thinking,
    reasoningEffort,
    abortSignal: options.abortSignal,
    turn: 1,
  }))

  return {
    text: agentContentToText(turn.message.content),
    reasoning: turn.message.reasoningContent || undefined,
  }
}

export async function* streamOnethingDeepSeekAgentTurn(
  runnerOptions: OnethingDeepSeekAgentStreamOptions,
): AsyncGenerator<AgentProviderStreamChunk, void, void> {
  const options = runnerOptions.options ?? {}
  const metadata = runnerOptions.metadata ?? {}
  const tools = runnerOptions.tools ?? {}
  const agentMessages = onethingDeepSeekAgentMessagesFromMessages(runnerOptions.messages)
  const agentTools = agentModelToolsFromDefinitions(tools)
  const maxTokens = options.maxTokens || 4096
  const thinking = resolveOnethingDeepSeekAgentThinking(runnerOptions.config.model, options)
  const reasoningEffort = normalizeOnethingDeepSeekAgentReasoningEffort(options.thinkingEffort)

  await runnerOptions.onRequestPrepared?.(deepSeekAgentRequestDumpContext({
    config: runnerOptions.config,
    messages: agentMessages,
    tools: agentTools,
    maxTokens,
    temperature: options.temperature,
    thinking,
    reasoningEffort,
    mode: runnerOptions.mode ?? 'stream-tools',
    metadata: {
      ...metadata,
      sessionId: options.debugSessionId,
      turn: options.debugTurn,
      transport: 'deepseek-agent',
    },
  }))

  const provider = createOnethingDeepSeekAgentProvider(runnerOptions.config)
  const events = streamAgentProviderTurnEvents(provider, {
    model: runnerOptions.config.model,
    messages: agentMessages,
    tools: agentTools,
    toolChoice: agentTools.length > 0 ? 'auto' : 'none',
    maxTokens,
    temperature: thinking === 'enabled' ? undefined : options.temperature,
    thinking,
    reasoningEffort,
    abortSignal: options.abortSignal,
    turn: options.debugTurn ?? 1,
  })

  for await (const chunk of agentEventsToProviderStreamChunks(events)) {
    if (chunk.type === 'turn-start' || chunk.type === 'tool-metadata' || chunk.type === 'tool-partial-result') {
      continue
    }
    yield chunk
  }
}
