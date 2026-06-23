import { createRequiredAppFetch } from '../../providers/bound-fetch.js'
import { agentContentToText, collectAgentTurnFromStream } from '../stream.js'
import type {
  AgentContentPart,
  AgentFinishReason,
  AgentMessage,
  AgentMessageContent,
  AgentModelCapabilities,
  AgentProvider,
  AgentTool,
  AgentToolChoice,
  AgentTurn,
  AgentTurnRequest,
  AgentTurnStreamEvent,
  AgentUsage,
} from '../types.js'

type FetchFn = typeof globalThis.fetch

export interface OpenAICompatibleAgentProviderOptions {
  providerId: string
  apiKey?: string
  baseUrl?: string
  defaultBaseUrl: string
  fetchImpl?: FetchFn
  supportsVision?: boolean
  supportsReasoning?: boolean
  supportsTools?: boolean
  maxTokensField?: 'max_tokens' | 'max_completion_tokens'
  includeAssistantReasoning?: boolean
}

type OpenAICompatibleMessage =
  | {
      role: 'system'
      content: string
    }
  | {
      role: 'user'
      content: string | Array<Record<string, unknown>>
    }
  | {
      role: 'assistant'
      content: string | null
      reasoning_content?: string
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: {
          name: string
          arguments: string
        }
      }>
    }
  | {
      role: 'tool'
      tool_call_id: string
      content: string
    }

interface OpenAICompatibleTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

interface OpenAICompatibleStreamChunk {
  choices?: Array<{
    index: number
    delta?: {
      content?: string | null
      reasoning_content?: string | null
      reasoning?: string | null
      tool_calls?: Array<{
        index: number
        id?: string
        type?: 'function'
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  error?: {
    message?: string
    type?: string
    code?: string
  }
}

interface ToolCallAccumulator {
  id: string
  name: string
  arguments: string
  started: boolean
}

function dataContentToImageUrl(data: unknown, mediaType?: string): string | undefined {
  if (typeof data === 'string') {
    if (data.startsWith('data:') || data.startsWith('http://') || data.startsWith('https://')) {
      return data
    }
    return `data:${mediaType || 'image/png'};base64,${data}`
  }

  if (data instanceof URL) return data.toString()
  if (data instanceof Uint8Array) {
    return `data:${mediaType || 'image/png'};base64,${Buffer.from(data).toString('base64')}`
  }
  return undefined
}

function contentToText(content: AgentMessageContent): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part): part is Extract<AgentContentPart, { type: 'text' }> => part.type === 'text')
    .map(part => part.text)
    .filter(Boolean)
    .join('\n')
}

function toUserContent(content: AgentMessageContent): OpenAICompatibleMessage & { role: 'user' } {
  if (typeof content === 'string') return { role: 'user', content }
  if (!Array.isArray(content)) return { role: 'user', content: '' }

  const parts: Array<Record<string, unknown>> = []
  for (const part of content) {
    if (part.type === 'text') {
      parts.push({ type: 'text', text: part.text })
      continue
    }
    if (part.type === 'image') {
      const imageUrl = dataContentToImageUrl(part.image, part.mediaType)
      if (imageUrl) parts.push({ type: 'image_url', image_url: { url: imageUrl } })
      continue
    }
    if (part.type === 'file' && part.mediaType.startsWith('image/')) {
      const imageUrl = dataContentToImageUrl(part.data, part.mediaType)
      if (imageUrl) parts.push({ type: 'image_url', image_url: { url: imageUrl } })
    }
  }

  return {
    role: 'user',
    content: parts.length > 0 ? parts : '',
  }
}

function toOpenAICompatibleMessages(
  messages: AgentMessage[],
  includeAssistantReasoning: boolean,
): OpenAICompatibleMessage[] {
  return messages.map((message): OpenAICompatibleMessage => {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: message.toolCallId ?? '',
        content: agentContentToText(message.content),
      }
    }

    if (message.role === 'assistant') {
      const content = contentToText(message.content)
      return {
        role: 'assistant',
        content: content || null,
        ...(includeAssistantReasoning && message.reasoningContent
          ? { reasoning_content: message.reasoningContent }
          : {}),
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map(toolCall => ({
                id: toolCall.id,
                type: 'function' as const,
                function: {
                  name: toolCall.name,
                  arguments: toolCall.arguments,
                },
              })),
            }
          : {}),
      }
    }

    if (message.role === 'user') {
      return toUserContent(message.content)
    }

    return {
      role: 'system',
      content: contentToText(message.content),
    }
  })
}

function toOpenAICompatibleTools(tools: AgentTool[] | undefined): OpenAICompatibleTool[] | undefined {
  if (!tools?.length) return undefined
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

function normalizeToolChoice(choice: AgentToolChoice | undefined): AgentToolChoice | undefined {
  if (!choice || choice === 'auto' || choice === 'none') return choice
  return choice
}

function mapFinishReason(reason: string | null | undefined): AgentFinishReason {
  switch (reason) {
    case 'stop':
    case 'length':
      return reason
    case 'tool_calls':
    case 'function_call':
      return 'tool_calls'
    case 'content_filter':
      return 'content_filter'
    default:
      return reason ? 'unknown' : 'unknown'
  }
}

function usageFromChunk(chunk: OpenAICompatibleStreamChunk): AgentUsage | undefined {
  if (!chunk.usage) return undefined
  const inputTokens = chunk.usage.prompt_tokens ?? 0
  const outputTokens = chunk.usage.completion_tokens ?? 0
  const totalTokens = chunk.usage.total_tokens ?? inputTokens + outputTokens
  return { inputTokens, outputTokens, totalTokens }
}

function toolCallDoneEvent(
  turn: number,
  entry: ToolCallAccumulator,
): Extract<AgentTurnStreamEvent, { type: 'tool-call-done' }> {
  return {
    type: 'tool-call-done',
    turn,
    toolCall: {
      id: entry.id,
      name: entry.name,
      arguments: entry.arguments,
    },
  }
}

async function* streamOpenAICompatibleResponse(
  response: Response,
  turn: number,
  providerId: string,
): AsyncGenerator<AgentTurnStreamEvent, void, unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error(`${providerId} agent loop: response has no body`)

  const decoder = new TextDecoder()
  const toolCalls = new Map<number, ToolCallAccumulator>()
  let buffer = ''
  let usage: AgentUsage | undefined
  let finishReason: AgentFinishReason = 'unknown'

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        if (trimmed === 'data: [DONE]') continue

        const payload = trimmed.slice(6)
        let chunk: OpenAICompatibleStreamChunk
        try {
          chunk = JSON.parse(payload) as OpenAICompatibleStreamChunk
        } catch {
          throw new Error(`${providerId} agent loop: invalid stream chunk: ${payload}`)
        }

        if (chunk.error) {
          throw new Error(`${providerId} agent loop error: ${chunk.error.message ?? 'unknown error'}`)
        }

        usage = usageFromChunk(chunk) ?? usage
        const choice = chunk.choices?.[0]
        const delta = choice?.delta

        const reasoning = delta?.reasoning_content ?? delta?.reasoning
        if (reasoning) {
          yield { type: 'reasoning-delta', turn, delta: reasoning }
        }

        if (delta?.content) {
          yield { type: 'text-delta', turn, delta: delta.content }
        }

        if (delta?.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index
            let entry = toolCalls.get(index)
            if (!entry) {
              entry = {
                id: toolCallDelta.id ?? `tool-${turn}-${index}`,
                name: '',
                arguments: '',
                started: false,
              }
              toolCalls.set(index, entry)
            }

            if (toolCallDelta.id) entry.id = toolCallDelta.id
            if (toolCallDelta.function?.name) entry.name += toolCallDelta.function.name
            const argumentsDelta = toolCallDelta.function?.arguments ?? ''
            if (argumentsDelta) entry.arguments += argumentsDelta

            if (!entry.started && entry.name) {
              entry.started = true
              yield {
                type: 'tool-call-start',
                turn,
                toolCallId: entry.id,
                toolName: entry.name,
              }
            }

            if (argumentsDelta && entry.name) {
              yield {
                type: 'tool-call-delta',
                turn,
                toolCallId: entry.id,
                toolName: entry.name,
                argumentsDelta,
              }
            }
          }
        }

        if (choice?.finish_reason) {
          finishReason = mapFinishReason(choice.finish_reason)
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  for (const [, entry] of [...toolCalls.entries()].sort(([a], [b]) => a - b)) {
    yield toolCallDoneEvent(turn, entry)
  }

  yield { type: 'finish', turn, finishReason, usage }
}

function buildCapabilities(options: OpenAICompatibleAgentProviderOptions): AgentModelCapabilities {
  const capabilities: AgentModelCapabilities['capabilities'] = ['text-input', 'text-output', 'streaming']
  const inputModalities: AgentModelCapabilities['inputModalities'] = ['text']
  const outputModalities: AgentModelCapabilities['outputModalities'] = ['text']

  if (options.supportsVision) {
    capabilities.push('vision-input', 'file-input')
    inputModalities.push('image', 'file')
  }
  if (options.supportsTools !== false) {
    capabilities.push('tool-calls')
  }
  if (options.supportsReasoning) {
    capabilities.push('reasoning')
  }

  return {
    capabilities,
    inputModalities,
    outputModalities,
    supportsTools: options.supportsTools !== false,
    supportsReasoning: Boolean(options.supportsReasoning),
    supportsStreaming: true,
  }
}

export function createOpenAICompatibleAgentProvider(options: OpenAICompatibleAgentProviderOptions): AgentProvider {
  const baseUrl = (options.baseUrl || options.defaultBaseUrl).replace(/\/$/, '')
  const fetchImpl = options.fetchImpl ?? createRequiredAppFetch()
  const capabilities = buildCapabilities(options)

  async function* streamTurn(request: AgentTurnRequest): AsyncGenerator<AgentTurnStreamEvent, void, unknown> {
    const tools = toOpenAICompatibleTools(request.tools)
    const body: Record<string, unknown> = {
      model: request.model,
      messages: toOpenAICompatibleMessages(request.messages, Boolean(options.includeAssistantReasoning)),
      stream: true,
      stream_options: { include_usage: true },
    }

    if (tools?.length) {
      body.tools = tools
      body.tool_choice = normalizeToolChoice(request.toolChoice) ?? 'auto'
    }
    if (request.maxTokens !== undefined) {
      body[options.maxTokensField ?? 'max_tokens'] = request.maxTokens
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature
    }

    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey ?? ''}`,
      },
      body: JSON.stringify(body),
      signal: request.abortSignal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`${options.providerId} agent loop API error: ${response.status} ${text}`)
    }

    yield* streamOpenAICompatibleResponse(response, request.turn, options.providerId)
  }

  return {
    id: options.providerId,
    capabilities,
    getModelCapabilities: () => capabilities,
    streamTurn,
    async runTurn(request: AgentTurnRequest): Promise<AgentTurn> {
      return collectAgentTurnFromStream(streamTurn(request), request.onEvent)
    },
  }
}
