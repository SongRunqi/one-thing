import {
  stringifyOnethingMessageContent,
  type OnethingAIMessageContent,
  type OnethingToolChatMessage,
} from './message-conversion.js'

export type OnethingThinkingEffort = 'minimal' | 'low' | 'medium' | 'high' | 'max' | 'xhigh'
export type OnethingAgentThinking = 'enabled' | 'disabled'
export type OnethingAgentReasoningEffort = 'high' | 'max'
export type OnethingProviderFinishReason =
  | 'stop'
  | 'length'
  | 'tool-calls'
  | 'content-filter'
  | 'error'
  | 'other'
  | 'unknown'

export type OnethingSystemMergeMessage = {
  role: 'user' | 'assistant' | 'system'
  content: OnethingAIMessageContent
  reasoningContent?: string
}

export interface OnethingChatTitleOptions {
  thinking?: boolean
  thinkingEffort?: OnethingThinkingEffort
  serviceTier?: string
  debugSessionId?: string
}

export interface OnethingChatTitleGenerationRequest {
  messages: Array<{ role: 'system' | 'user'; content: string }>
  options: {
    temperature: number
    maxTokens: number
    thinking: boolean
    thinkingEffort?: OnethingThinkingEffort
    serviceTier?: string
    debugPurpose: 'chat-title'
    debugSessionId?: string
  }
}

export interface GenerateOnethingProviderChatTitleOptions<TConfig = unknown> {
  providerId: string
  config: TConfig
  userMessage: string
  options?: OnethingChatTitleOptions
  isACPProvider(providerId: string): boolean
  generateChatResponse(
    providerId: string,
    config: TConfig,
    messages: OnethingChatTitleGenerationRequest['messages'],
    options: OnethingChatTitleGenerationRequest['options'],
  ): Promise<string>
}

export interface OnethingTextChatResponseResult {
  text: string
}

export interface OnethingChatResponseWithReasoningResult extends OnethingTextChatResponseResult {
  reasoning?: string
  toolCalls?: unknown[]
}

export interface OnethingReasoningTextStreamChunk {
  type: 'text'
  text?: string
  reasoning?: string
}

export interface OnethingProviderTokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export type OnethingChatReasoningStreamChunk =
  | { type: 'text'; text: string; reasoning?: string }
  | { type: 'finish'; usage: OnethingProviderTokenUsage }

export interface OnethingProviderReasoningSourceStreamChunk {
  type: string
  text?: string
  reasoning?: string
  usage?: OnethingProviderTokenUsage
}

export type OnethingProviderRuntimeChatRoute<TProvider = unknown> =
  | { kind: 'acp' }
  | { kind: 'deepseek' }
  | { kind: 'agent'; provider: TProvider }
  | { kind: 'unsupported' }

export type OnethingProviderToolStreamMode = 'stream-tools' | 'stream-ui-messages'

export interface OnethingACPReasoningStreamChunk {
  type: string
  text?: string
  reasoning?: string
}

export type OnethingACPChatStreamChunk =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; reasoning: string }
  | {
      type: 'finish'
      finishReason: OnethingProviderFinishReason
      usage: OnethingProviderTokenUsage
    }

export interface OnethingACPPromptStreamEvent {
  type: string
  message?: string
  stopReason?: string
  usage?: OnethingProviderTokenUsage
  notification?: {
    update?: unknown
  }
}

export interface OnethingACPStreamPromptRequest {
  localSessionId: string
  prompt: string
  cwd: string
  abortSignal?: AbortSignal
}

export interface StreamOnethingACPChatResponseWithToolsOptions<
  TConfig extends { model: string; baseUrl?: string } = { model: string; baseUrl?: string },
  TMessage extends OnethingToolChatMessage = OnethingToolChatMessage,
  TEvent extends OnethingACPPromptStreamEvent = OnethingACPPromptStreamEvent,
> {
  config: TConfig
  messages: TMessage[]
  options?: {
    abortSignal?: AbortSignal
    debugSessionId?: string
    workingDirectory?: string
  }
  defaultWorkingDirectory: string
  streamPrompt(
    agentId: string,
    request: OnethingACPStreamPromptRequest,
  ): AsyncIterable<TEvent>
}

export interface GenerateOnethingTextChatResponseOptions<
  TConfig = unknown,
  TMessage = unknown,
  TOptions = unknown,
  TResult extends OnethingTextChatResponseResult = OnethingTextChatResponseResult,
> {
  providerId: string
  config: TConfig
  messages: TMessage[]
  options: TOptions
  generateWithReasoning(
    providerId: string,
    config: TConfig,
    messages: TMessage[],
    options: TOptions,
  ): Promise<TResult>
}

export interface StreamOnethingTextChatResponseOptions<
  TConfig = unknown,
  TMessage = unknown,
  TOptions = unknown,
  TChunk extends OnethingReasoningTextStreamChunk = OnethingReasoningTextStreamChunk,
> {
  providerId: string
  config: TConfig
  messages: TMessage[]
  options: TOptions
  streamWithReasoning(
    providerId: string,
    config: TConfig,
    messages: TMessage[],
    options: TOptions,
  ): AsyncIterable<TChunk | { type: string }>
}

export interface GenerateOnethingChatResponseWithReasoningOptions<
  TConfig extends { baseUrl?: string } = { baseUrl?: string },
  TMessage = unknown,
  TOptions extends { abortSignal?: AbortSignal; debugSessionId?: string } = {},
  TProvider = unknown,
  TResult extends OnethingChatResponseWithReasoningResult = OnethingChatResponseWithReasoningResult,
> {
  providerId: string
  config: TConfig
  messages: TMessage[]
  options: TOptions
  streamACPResponse(
    config: TConfig,
    messages: TMessage[],
    options: {
      abortSignal?: AbortSignal
      debugSessionId?: string
      workingDirectory?: string
    },
  ): AsyncIterable<OnethingACPReasoningStreamChunk>
  mergeMessagesForGenerate(providerId: string, messages: TMessage[]): TMessage[]
  resolveRuntimeRoute(
    providerId: string,
    config: TConfig,
  ): OnethingProviderRuntimeChatRoute<TProvider>
  generateWithDeepSeek(
    config: TConfig,
    messages: TMessage[],
    options: TOptions,
  ): Promise<TResult>
  runUtilityAgentTurn(
    providerId: string,
    provider: TProvider,
    config: TConfig,
    messages: TMessage[],
    options: TOptions,
    mode: 'generate',
  ): Promise<TResult | undefined>
}

export interface StreamOnethingChatResponseWithReasoningOptions<
  TConfig = unknown,
  TMessage = unknown,
  TOptions = unknown,
  TProvider = unknown,
  TSourceChunk extends OnethingProviderReasoningSourceStreamChunk = OnethingProviderReasoningSourceStreamChunk,
  TResultChunk extends OnethingChatReasoningStreamChunk = OnethingChatReasoningStreamChunk,
> {
  providerId: string
  config: TConfig
  messages: TMessage[]
  options: TOptions
  mergeMessagesForGenerate(providerId: string, messages: TMessage[]): TMessage[]
  resolveRuntimeRoute(
    providerId: string,
    config: TConfig,
  ): OnethingProviderRuntimeChatRoute<TProvider>
  streamDeepSeekTurn(
    config: TConfig,
    messages: TMessage[],
    options: TOptions,
    mode: 'stream-reasoning',
  ): AsyncIterable<TSourceChunk>
  streamUtilityAgentTurn(
    providerId: string,
    provider: TProvider,
    config: TConfig,
    messages: TMessage[],
    options: TOptions,
    mode: 'stream-reasoning',
  ): AsyncIterable<TResultChunk>
}

export interface StreamOnethingChatResponseWithToolsOptions<
  TConfig = unknown,
  TMessage = unknown,
  TTools = unknown,
  TOptions = unknown,
  TProvider = unknown,
  TChunk = unknown,
> {
  providerId: string
  config: TConfig
  messages: TMessage[]
  tools: TTools
  options: TOptions
  mode: OnethingProviderToolStreamMode
  metadata?: Record<string, unknown>
  resolveRuntimeRoute(
    providerId: string,
    config: TConfig,
  ): OnethingProviderRuntimeChatRoute<TProvider>
  streamACPResponse?(
    config: TConfig,
    messages: TMessage[],
    options: TOptions,
  ): AsyncIterable<TChunk>
  streamDeepSeekTurn(
    config: TConfig,
    messages: TMessage[],
    tools: TTools,
    options: TOptions,
    mode: OnethingProviderToolStreamMode,
    metadata: Record<string, unknown>,
  ): AsyncIterable<TChunk>
  streamAgentToolTurn(
    providerId: string,
    provider: TProvider,
    config: TConfig,
    messages: TMessage[],
    tools: TTools,
    options: TOptions,
    mode: OnethingProviderToolStreamMode,
    metadata: Record<string, unknown>,
  ): AsyncIterable<TChunk>
}

export function isOnethingProviderDeepSeekThinkingModel(modelId: string): boolean {
  const lower = modelId.toLowerCase()
  return (
    lower.includes('reasoner') ||
    lower.includes('thinking') ||
    /(^|[^a-z])v4/.test(lower)
  )
}

export function normalizeOnethingDeepSeekAgentReasoningEffort(
  value: OnethingThinkingEffort | undefined,
): OnethingAgentReasoningEffort | undefined {
  if (value === 'high' || value === 'max') return value
  if (value === 'low' || value === 'medium') return 'high'
  if (value === 'xhigh') return 'max'
  return undefined
}

export function resolveOnethingDeepSeekAgentThinking(
  modelId: string,
  options: { thinking?: boolean },
): OnethingAgentThinking | undefined {
  if (options.thinking === true) return 'enabled'
  if (options.thinking === false) return 'disabled'
  if (isOnethingProviderDeepSeekThinkingModel(modelId)) return 'enabled'
  return undefined
}

export function normalizeOnethingAgentReasoningEffort(
  value: OnethingThinkingEffort | undefined,
): OnethingAgentReasoningEffort | undefined {
  if (value === 'max' || value === 'xhigh') return 'max'
  if (value === 'high' || value === 'medium' || value === 'low') return 'high'
  return undefined
}

export function resolveOnethingAgentThinking(
  options: { thinking?: boolean },
): OnethingAgentThinking | undefined {
  if (options.thinking === true) return 'enabled'
  if (options.thinking === false) return 'disabled'
  return undefined
}

export function getLatestOnethingUserMessageText(messages: OnethingToolChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role !== 'user') continue
    const text = stringifyOnethingMessageContent(message.content).trim()
    if (text) return text
  }
  return ''
}

export function mergeOnethingSystemMessagesForGenerateIfNeeded<
  TMessage extends OnethingSystemMergeMessage,
>(
  requiresSystemMerge: boolean,
  messages: TMessage[],
): Array<Omit<TMessage, 'role'> & { role: 'user' | 'assistant' }> | TMessage[] {
  if (!requiresSystemMerge) return messages

  const systemMessages: string[] = []
  const nonSystemMessages: Array<Omit<TMessage, 'role'> & { role: 'user' | 'assistant' }> = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemMessages.push(stringifyOnethingMessageContent(msg.content))
    } else {
      nonSystemMessages.push({
        ...msg,
        role: msg.role,
      })
    }
  }

  if (systemMessages.length === 0) return messages
  const firstUserIndex = nonSystemMessages.findIndex((msg) => msg.role === 'user')
  if (firstUserIndex === -1) return messages

  const systemPrefix = systemMessages.filter(Boolean).join('\n\n')
  const originalContent = nonSystemMessages[firstUserIndex].content
  const mergedPrefix = `[System Instructions]\n${systemPrefix}\n\n[User Message]\n`

  nonSystemMessages[firstUserIndex] = {
    ...nonSystemMessages[firstUserIndex],
    content:
      typeof originalContent === 'string'
        ? `${mergedPrefix}${originalContent}`
        : [
            { type: 'text', text: mergedPrefix },
            ...originalContent,
          ],
  }

  return nonSystemMessages
}

export function fallbackOnethingACPChatTitle(userMessage: string): string {
  return userMessage
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[`"'“”‘’#:\-\s]+/, '')
    .slice(0, 40) || 'ACP Chat'
}

export function buildOnethingChatTitleGenerationRequest(
  userMessage: string,
  options: OnethingChatTitleOptions = {},
): OnethingChatTitleGenerationRequest {
  const systemPrompt = [
    "Create a short topic title from the user's first message.",
    'Use the same language as the message when possible.',
    'Compress the message into its core subject or task instead of copying it verbatim.',
    'Prefer 2-5 English words or 4-12 CJK characters when possible.',
    'Respond with the title only. Do not add quotes, punctuation wrappers, or explanations.',
  ].join('\n')

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    options: {
      temperature: 0.2,
      maxTokens: 20,
      thinking: options.thinking ?? false,
      thinkingEffort: options.thinking ? options.thinkingEffort : undefined,
      serviceTier: options.serviceTier,
      debugPurpose: 'chat-title',
      debugSessionId: options.debugSessionId,
    },
  }
}

export function cleanOnethingGeneratedChatTitle(response: string): string {
  return response
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^title\s*:\s*/i, '')
    .replace(/^[`"'“”‘’#:\-\s]+/, '')
    .replace(/[`"'“”‘’\s]+$/, '')
}

export async function generateOnethingProviderChatTitle<TConfig = unknown>(
  options: GenerateOnethingProviderChatTitleOptions<TConfig>,
): Promise<string> {
  if (options.isACPProvider(options.providerId)) {
    return fallbackOnethingACPChatTitle(options.userMessage)
  }

  const request = buildOnethingChatTitleGenerationRequest(options.userMessage, options.options)
  const response = await options.generateChatResponse(
    options.providerId,
    options.config,
    request.messages,
    request.options,
  )
  return cleanOnethingGeneratedChatTitle(response)
}

export async function generateOnethingTextChatResponse<
  TConfig = unknown,
  TMessage = unknown,
  TOptions = unknown,
  TResult extends OnethingTextChatResponseResult = OnethingTextChatResponseResult,
>(
  options: GenerateOnethingTextChatResponseOptions<TConfig, TMessage, TOptions, TResult>,
): Promise<string> {
  const result = await options.generateWithReasoning(
    options.providerId,
    options.config,
    options.messages,
    options.options,
  )
  return result.text
}

export async function generateOnethingChatResponseWithReasoning<
  TConfig extends { baseUrl?: string } = { baseUrl?: string },
  TMessage = unknown,
  TOptions extends { abortSignal?: AbortSignal; debugSessionId?: string } = {},
  TProvider = unknown,
  TResult extends OnethingChatResponseWithReasoningResult = OnethingChatResponseWithReasoningResult,
>(
  options: GenerateOnethingChatResponseWithReasoningOptions<
    TConfig,
    TMessage,
    TOptions,
    TProvider,
    TResult
  >,
): Promise<TResult> {
  const runtimeRoute = options.resolveRuntimeRoute(options.providerId, options.config)

  if (runtimeRoute.kind === 'acp') {
    let text = ''
    let reasoning = ''
    for await (const chunk of options.streamACPResponse(
      options.config,
      options.messages,
      {
        abortSignal: options.options.abortSignal,
        debugSessionId: options.options.debugSessionId,
        workingDirectory: options.config.baseUrl,
      },
    )) {
      if (chunk.type === 'text' && chunk.text) text += chunk.text
      if (chunk.type === 'reasoning' && chunk.reasoning) reasoning += chunk.reasoning
    }
    return { text, reasoning: reasoning || undefined } as TResult
  }

  const effectiveMessages = options.mergeMessagesForGenerate(
    options.providerId,
    options.messages,
  )

  if (runtimeRoute.kind === 'deepseek') {
    return options.generateWithDeepSeek(
      options.config,
      effectiveMessages,
      options.options,
    )
  }

  if (runtimeRoute.kind === 'agent') {
    const agentResult = await options.runUtilityAgentTurn(
      options.providerId,
      runtimeRoute.provider,
      options.config,
      effectiveMessages,
      options.options,
      'generate',
    )
    if (agentResult) return agentResult
  }

  throw new Error(
    `Provider ${options.providerId} does not have an AgentProvider runtime for generate.`,
  )
}

export async function* streamOnethingChatResponseWithReasoning<
  TConfig = unknown,
  TMessage = unknown,
  TOptions = unknown,
  TProvider = unknown,
  TSourceChunk extends OnethingProviderReasoningSourceStreamChunk = OnethingProviderReasoningSourceStreamChunk,
  TResultChunk extends OnethingChatReasoningStreamChunk = OnethingChatReasoningStreamChunk,
>(
  options: StreamOnethingChatResponseWithReasoningOptions<
    TConfig,
    TMessage,
    TOptions,
    TProvider,
    TSourceChunk,
    TResultChunk
  >,
): AsyncGenerator<TResultChunk, void, void> {
  const effectiveMessages = options.mergeMessagesForGenerate(
    options.providerId,
    options.messages,
  )
  const runtimeRoute = options.resolveRuntimeRoute(options.providerId, options.config)

  if (runtimeRoute.kind === 'deepseek') {
    for await (const chunk of options.streamDeepSeekTurn(
      options.config,
      effectiveMessages,
      options.options,
      'stream-reasoning',
    )) {
      if (chunk.type === 'reasoning' && chunk.reasoning) {
        yield { type: 'text', text: '', reasoning: chunk.reasoning } as TResultChunk
      } else if (chunk.type === 'text' && chunk.text) {
        yield { type: 'text', text: chunk.text } as TResultChunk
      } else if (chunk.type === 'finish') {
        yield {
          type: 'finish',
          usage: chunk.usage ?? {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
          },
        } as TResultChunk
      }
    }
    return
  }

  if (runtimeRoute.kind === 'agent') {
    for await (const chunk of options.streamUtilityAgentTurn(
      options.providerId,
      runtimeRoute.provider,
      options.config,
      effectiveMessages,
      options.options,
      'stream-reasoning',
    )) {
      yield chunk
    }
    return
  }

  throw new Error(
    `Provider ${options.providerId} does not have an AgentProvider runtime for stream-reasoning.`,
  )
}

export async function* streamOnethingChatResponseWithTools<
  TConfig = unknown,
  TMessage = unknown,
  TTools = unknown,
  TOptions = unknown,
  TProvider = unknown,
  TChunk = unknown,
>(
  options: StreamOnethingChatResponseWithToolsOptions<
    TConfig,
    TMessage,
    TTools,
    TOptions,
    TProvider,
    TChunk
  >,
): AsyncGenerator<TChunk, void, void> {
  const runtimeRoute = options.resolveRuntimeRoute(options.providerId, options.config)
  const metadata = options.metadata ?? {}

  if (runtimeRoute.kind === 'acp' && options.streamACPResponse) {
    yield* options.streamACPResponse(
      options.config,
      options.messages,
      options.options,
    )
    return
  }

  if (runtimeRoute.kind === 'deepseek') {
    yield* options.streamDeepSeekTurn(
      options.config,
      options.messages,
      options.tools,
      options.options,
      options.mode,
      metadata,
    )
    return
  }

  if (runtimeRoute.kind === 'agent') {
    yield* options.streamAgentToolTurn(
      options.providerId,
      runtimeRoute.provider,
      options.config,
      options.messages,
      options.tools,
      options.options,
      options.mode,
      metadata,
    )
    return
  }

  throw new Error(
    `Provider ${options.providerId} does not have an AgentProvider runtime for ${options.mode}.`,
  )
}

export async function* streamOnethingACPChatResponseWithTools<
  TConfig extends { model: string; baseUrl?: string } = { model: string; baseUrl?: string },
  TMessage extends OnethingToolChatMessage = OnethingToolChatMessage,
  TEvent extends OnethingACPPromptStreamEvent = OnethingACPPromptStreamEvent,
>(
  input: StreamOnethingACPChatResponseWithToolsOptions<TConfig, TMessage, TEvent>,
): AsyncGenerator<OnethingACPChatStreamChunk, void, void> {
  const streamOptions = input.options ?? {}
  const agentId = input.config.model
  const prompt = getLatestOnethingUserMessageText(input.messages)
  if (!prompt) {
    throw new Error('ACP prompt is empty')
  }

  const localSessionId = streamOptions.debugSessionId || `acp-${agentId}`
  const cwd =
    streamOptions.workingDirectory ||
    input.config.baseUrl ||
    input.defaultWorkingDirectory

  for await (const event of input.streamPrompt(agentId, {
    localSessionId,
    prompt,
    cwd,
    abortSignal: streamOptions.abortSignal,
  })) {
    yield* projectOnethingACPPromptStreamEvent(event)
  }
}

export function* projectOnethingACPPromptStreamEvent(
  event: OnethingACPPromptStreamEvent,
): Generator<OnethingACPChatStreamChunk, void, void> {
  if (event.type === 'warning' && event.message) {
    yield { type: 'reasoning', reasoning: event.message }
    return
  }

  if (event.type === 'finish') {
    yield {
      type: 'finish',
      finishReason: mapOnethingACPStopReason(event.stopReason ?? ''),
      usage: event.usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    }
    return
  }

  const notification = recordFromValue(event.notification)
  const update = recordFromValue(notification.update)
  const updateContent = recordFromValue(update.content)

  switch (update.sessionUpdate) {
    case 'agent_message_chunk':
      if (updateContent.type === 'text' && typeof updateContent.text === 'string' && updateContent.text) {
        yield { type: 'text', text: updateContent.text }
      }
      break
    case 'agent_thought_chunk':
      if (updateContent.type === 'text' && typeof updateContent.text === 'string' && updateContent.text) {
        yield { type: 'reasoning', reasoning: updateContent.text }
      }
      break
    case 'plan':
      yield { type: 'reasoning', reasoning: formatOnethingACPPlan(update) }
      break
    case 'tool_call':
    case 'tool_call_update':
      yield { type: 'reasoning', reasoning: formatOnethingACPTool(update) }
      break
    case 'usage_update':
    default:
      break
  }
}

export async function* streamOnethingTextChatResponse<
  TConfig = unknown,
  TMessage = unknown,
  TOptions = unknown,
  TChunk extends OnethingReasoningTextStreamChunk = OnethingReasoningTextStreamChunk,
>(
  options: StreamOnethingTextChatResponseOptions<TConfig, TMessage, TOptions, TChunk>,
): AsyncGenerator<{ text: string; reasoning?: string }, void, void> {
  for await (const chunk of options.streamWithReasoning(
    options.providerId,
    options.config,
    options.messages,
    options.options,
  )) {
    if (chunk.type === 'text' && ('text' in chunk || 'reasoning' in chunk)) {
      const text = typeof chunk.text === 'string' ? chunk.text : ''
      const reasoning = typeof chunk.reasoning === 'string' ? chunk.reasoning : undefined
      if (text || reasoning) {
        yield { text, reasoning }
      }
    }
  }
}

export function formatOnethingACPPlan(update: unknown): string {
  const updateRecord = recordFromValue(update)
  const entries = Array.isArray(updateRecord.entries) ? updateRecord.entries : []
  if (entries.length === 0) return 'ACP agent updated its plan.'
  return [
    'ACP plan:',
    ...entries.map((entry) => {
      const entryRecord = recordFromValue(entry)
      const rawStatus = entryRecord.status
      const rawTitle =
        entryRecord.title ?? entryRecord.content ?? entryRecord.description ?? ''
      const status = typeof rawStatus === 'string' && rawStatus
        ? `[${rawStatus}] `
        : ''
      const title = typeof rawTitle === 'string' ? rawTitle : String(rawTitle)
      return `- ${status}${title}`.trim()
    }),
  ].join('\n')
}

export function formatOnethingACPTool(update: unknown): string {
  const updateRecord = recordFromValue(update)
  const rawStatus = updateRecord.status
  const rawTitle = updateRecord.title ?? updateRecord.toolCallId ?? 'tool call'
  const status = typeof rawStatus === 'string' && rawStatus ? ` (${rawStatus})` : ''
  const title = typeof rawTitle === 'string' ? rawTitle : String(rawTitle)
  return `ACP ${title}${status}`
}

export function mapOnethingACPStopReason(stopReason: string): OnethingProviderFinishReason {
  if (stopReason === 'end_turn') return 'stop'
  if (stopReason === 'max_tokens') return 'length'
  if (stopReason === 'cancelled') return 'other'
  if (stopReason === 'refusal') return 'content-filter'
  return 'other'
}

function recordFromValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}
