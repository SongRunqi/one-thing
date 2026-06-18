import type {
  AgentFinishReason,
  AgentMessage,
  AgentProvider,
  AgentStreamEvent,
  AgentTool,
  AgentToolCall,
  AgentToolChoice,
  AgentTurn,
  AgentTurnRequest,
  AgentUsage,
} from '../types.js'
import { createRequiredAppFetch } from '../../providers/bound-fetch.js'

type FetchFn = typeof globalThis.fetch

interface DeepSeekAgentProviderOptions {
  apiKey: string
  baseUrl?: string
  fetchImpl?: FetchFn
}

interface DeepSeekToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  reasoning_content?: string
  tool_calls?: DeepSeekToolCall[]
  tool_call_id?: string
}

interface DeepSeekTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

interface DeepSeekRequestBody {
  model: string
  messages: DeepSeekMessage[]
  stream: true
  stream_options: { include_usage: true }
  tools?: DeepSeekTool[]
  tool_choice?: AgentToolChoice
  temperature?: number
  max_tokens?: number
  thinking?: { type: 'enabled' | 'disabled' }
  reasoning_effort?: 'high' | 'max'
}

interface DeepSeekStreamChunk {
  choices?: Array<{
    index: number
    delta?: {
      content?: string | null
      reasoning_content?: string | null
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
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
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

function toDeepSeekMessage(message: AgentMessage): DeepSeekMessage {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      content: message.content ?? '',
      tool_call_id: message.toolCallId ?? '',
    }
  }

  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: message.content ?? null,
      ...(message.reasoningContent ? { reasoning_content: message.reasoningContent } : {}),
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

  return {
    role: message.role,
    content: message.content ?? '',
  }
}

function toDeepSeekTools(tools: AgentTool[] | undefined): DeepSeekTool[] | undefined {
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

function mapFinishReason(reason: string | null | undefined): AgentFinishReason {
  switch (reason) {
    case 'stop':
    case 'length':
    case 'content_filter':
      return reason
    case 'tool_calls':
      return 'tool_calls'
    default:
      return reason ? 'unknown' : 'unknown'
  }
}

function usageFromChunk(chunk: DeepSeekStreamChunk): AgentUsage | undefined {
  if (!chunk.usage) return undefined
  return {
    inputTokens: chunk.usage.prompt_tokens,
    outputTokens: chunk.usage.completion_tokens,
    totalTokens: chunk.usage.total_tokens,
  }
}

function emitToolCallDone(
  turn: number,
  entry: ToolCallAccumulator,
  onEvent?: (event: AgentStreamEvent) => void,
): AgentToolCall {
  const toolCall = {
    id: entry.id,
    name: entry.name,
    arguments: entry.arguments,
  }
  onEvent?.({ type: 'tool-call-done', turn, toolCall })
  return toolCall
}

async function readDeepSeekStream(
  response: Response,
  turn: number,
  onEvent?: (event: AgentStreamEvent) => void,
): Promise<AgentTurn> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('DeepSeek agent loop: response has no body')

  const decoder = new TextDecoder()
  const toolCalls = new Map<number, ToolCallAccumulator>()
  let buffer = ''
  let content = ''
  let reasoningContent = ''
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
        let chunk: DeepSeekStreamChunk
        try {
          chunk = JSON.parse(payload) as DeepSeekStreamChunk
        } catch (error) {
          throw new Error(`DeepSeek agent loop: invalid stream chunk: ${payload}`)
        }

        if (chunk.error) {
          throw new Error(`DeepSeek agent loop error: ${chunk.error.message ?? 'unknown error'}`)
        }

        usage = usageFromChunk(chunk) ?? usage
        const choice = chunk.choices?.[0]
        const delta = choice?.delta

        if (delta?.reasoning_content) {
          reasoningContent += delta.reasoning_content
          onEvent?.({ type: 'reasoning-delta', turn, delta: delta.reasoning_content })
        }

        if (delta?.content) {
          content += delta.content
          onEvent?.({ type: 'text-delta', turn, delta: delta.content })
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
              onEvent?.({
                type: 'tool-call-start',
                turn,
                toolCallId: entry.id,
                toolName: entry.name,
              })
            }

            if (argumentsDelta && entry.name) {
              onEvent?.({
                type: 'tool-call-delta',
                turn,
                toolCallId: entry.id,
                toolName: entry.name,
                argumentsDelta,
              })
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

  const finalToolCalls = [...toolCalls.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, entry]) => emitToolCallDone(turn, entry, onEvent))

  return {
    message: {
      role: 'assistant',
      content,
      ...(reasoningContent ? { reasoningContent } : {}),
      ...(finalToolCalls.length ? { toolCalls: finalToolCalls } : {}),
    },
    finishReason,
    usage,
  }
}

export function createDeepSeekAgentProvider(options: DeepSeekAgentProviderOptions): AgentProvider {
  const baseUrl = (options.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '')
  const fetchImpl = options.fetchImpl ?? createRequiredAppFetch()

  return {
    id: 'deepseek',

    async runTurn(request: AgentTurnRequest): Promise<AgentTurn> {
      const tools = toDeepSeekTools(request.tools)
      const body: DeepSeekRequestBody = {
        model: request.model,
        messages: request.messages.map(toDeepSeekMessage),
        stream: true,
        stream_options: { include_usage: true },
      }

      if (tools?.length) {
        body.tools = tools
        body.tool_choice = request.toolChoice ?? 'auto'
      }
      if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens
      if (request.thinking) body.thinking = { type: request.thinking }
      if (request.thinking === 'enabled' && request.reasoningEffort) {
        body.reasoning_effort = request.reasoningEffort
      }
      if (request.temperature !== undefined && request.thinking !== 'enabled') {
        body.temperature = request.temperature
      }

      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: request.abortSignal,
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`DeepSeek agent loop API error: ${response.status} ${text}`)
      }

      return readDeepSeekStream(response, request.turn, request.onEvent)
    },
  }
}
