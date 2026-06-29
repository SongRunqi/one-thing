import { assertOkResponse, type FetchLike, readJsonSseData } from '@onething/core/http'
import { parseJsonObject, type JsonObject } from '@onething/core'
import type { AgentMessage } from '@onething/core/context'
import type { ToolCall, ToolDefinition } from '@onething/core/tools'
import type { Provider, ProviderFinishReason, ProviderRequest, ProviderUsage } from '@onething/core/providers'

export interface DeepSeekProviderOptions {
  apiKey: string
  model?: string
  baseURL?: string
  fetch?: FetchLike
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
  tool_call_id?: string
  tool_calls?: DeepSeekToolCall[]
}

interface DeepSeekTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: JsonObject
  }
}

interface DeepSeekStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string
      reasoning_content?: string
      tool_calls?: Array<{
        index?: number
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
  } | null
  error?: {
    message?: string
  }
}

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'

export function createDeepSeekProvider(options: DeepSeekProviderOptions): Provider {
  const fetchImpl = options.fetch ?? globalThis.fetch
  const baseURL = (options.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const model = options.model ?? DEFAULT_MODEL

  return {
    id: 'deepseek',
    model,
    async *stream(request: ProviderRequest) {
      const body = {
        model,
        messages: request.messages.map(toDeepSeekMessage),
        stream: true,
        stream_options: { include_usage: true },
        ...(request.tools?.length ? { tools: toDeepSeekTools(request.tools) } : {}),
      }

      const response = await fetchImpl(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: request.signal,
      })
      await assertOkResponse(response, 'DeepSeek')

      const pendingToolCalls = new Map<number, { id: string; name: string; argumentsText: string }>()

      for await (const chunk of readJsonSseData<DeepSeekStreamChunk>(response)) {
        if (chunk.error) {
          throw new Error(`DeepSeek provider error: ${chunk.error.message ?? 'unknown error'}`)
        }

        const choice = chunk.choices?.[0]
        const delta = choice?.delta

        if (delta?.reasoning_content) {
          yield { type: 'reasoning-delta', reasoning: delta.reasoning_content, turnIndex: request.turn }
        }

        if (delta?.content) {
          yield { type: 'text-delta', text: delta.content, turnIndex: request.turn }
        }

        if (delta?.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index ?? 0
            const current = pendingToolCalls.get(index) ?? {
              id: toolCallDelta.id ?? `tool-${request.turn}-${index}`,
              name: '',
              argumentsText: '',
            }
            if (toolCallDelta.id) current.id = toolCallDelta.id
            if (toolCallDelta.function?.name) current.name += toolCallDelta.function.name
            if (toolCallDelta.function?.arguments) current.argumentsText += toolCallDelta.function.arguments
            pendingToolCalls.set(index, current)

            yield {
              type: 'tool-call-delta',
              toolCallId: current.id,
              index,
              toolName: current.name || undefined,
              argumentsDelta: toolCallDelta.function?.arguments,
              turnIndex: request.turn,
            }
          }
        }

        if (chunk.usage) {
          yield { type: 'usage', usage: toUsage(chunk.usage), turnIndex: request.turn }
        }

        if (choice?.finish_reason) {
          yield { type: 'finish', reason: mapFinishReason(choice.finish_reason), turnIndex: request.turn }
        }
      }

      for (const [index, toolCall] of [...pendingToolCalls].sort(([a], [b]) => a - b)) {
        if (!toolCall.name) continue
        yield {
          type: 'tool-call-done',
          toolCall: {
            id: toolCall.id,
            name: toolCall.name,
            args: parseToolArguments(toolCall.argumentsText),
          },
          turnIndex: request.turn,
        }
      }
    },
  }
}

function toDeepSeekMessage(message: AgentMessage): DeepSeekMessage {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      content: message.content,
      tool_call_id: message.toolCallId ?? '',
    }
  }

  const toolCalls = message.toolCalls?.map(toDeepSeekToolCall)
  return {
    role: message.role,
    content: message.content || (toolCalls?.length ? null : ''),
    ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
  }
}

function toDeepSeekToolCall(toolCall: ToolCall): DeepSeekToolCall {
  return {
    id: toolCall.id,
    type: 'function',
    function: {
      name: toolCall.name,
      arguments: JSON.stringify(toolCall.args),
    },
  }
}

function toDeepSeekTools(tools: ToolDefinition[]): DeepSeekTool[] {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters ?? {
        type: 'object',
        properties: {},
      },
    },
  }))
}

function parseToolArguments(value: string): JsonObject {
  try {
    return parseJsonObject(value)
  } catch {
    return { __rawArguments: value }
  }
}

function toUsage(usage: NonNullable<DeepSeekStreamChunk['usage']>): ProviderUsage {
  const inputTokens = usage.prompt_tokens ?? 0
  const outputTokens = usage.completion_tokens ?? 0
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage.total_tokens ?? inputTokens + outputTokens,
  }
}

function mapFinishReason(reason: string): ProviderFinishReason {
  switch (reason) {
    case 'stop':
      return 'stop'
    case 'length':
      return 'length'
    case 'tool_calls':
      return 'tool_calls'
    case 'content_filter':
      return 'content_filter'
    default:
      return 'unknown'
  }
}
