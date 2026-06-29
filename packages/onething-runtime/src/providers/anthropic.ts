import { assertOkResponse, type FetchLike, readSseEvents } from '@onething/core/http'
import { parseJsonObject, type JsonObject } from '@onething/core'
import type { AgentMessage } from '@onething/core/context'
import type { ToolCall, ToolDefinition } from '@onething/core/tools'
import type { Provider, ProviderRequest, ProviderUsage } from '@onething/core/providers'

export interface AnthropicProviderOptions {
  apiKey: string
  model?: string
  baseURL?: string
  maxTokens?: number
  fetch?: FetchLike
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: JsonObject }
  | { type: 'tool_result'; tool_use_id: string; content: string }

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

interface AnthropicTool {
  name: string
  description?: string
  input_schema: JsonObject
}

interface AnthropicStreamEvent {
  type: string
  content_block?: {
    type?: string
    id?: string
    name?: string
    input?: unknown
  }
  index?: number
  delta?: {
    type?: string
    text?: string
    partial_json?: string
    thinking?: string
  }
  message?: {
    usage?: {
      input_tokens?: number
      output_tokens?: number
    }
  }
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
  error?: {
    message?: string
  }
}

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1'
const DEFAULT_MODEL = 'claude-3-5-haiku-latest'
const DEFAULT_MAX_TOKENS = 1024

export function createAnthropicProvider(options: AnthropicProviderOptions): Provider {
  const fetchImpl = options.fetch ?? globalThis.fetch
  const baseURL = (options.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const model = options.model ?? DEFAULT_MODEL

  return {
    id: 'anthropic',
    model,
    async *stream(request: ProviderRequest) {
      const { system, messages } = toAnthropicMessages(request.messages)
      const body = {
        model,
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        stream: true,
        ...(system ? { system } : {}),
        messages,
        ...(request.tools?.length ? { tools: toAnthropicTools(request.tools) } : {}),
      }

      const response = await fetchImpl(`${baseURL}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': options.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: request.signal,
      })
      await assertOkResponse(response, 'Anthropic')

      const pendingToolCalls = new Map<number, { id: string; name: string; argumentsText: string }>()

      for await (const sseEvent of readSseEvents(response)) {
        if (sseEvent.data === '[DONE]') break
        const event = JSON.parse(sseEvent.data) as AnthropicStreamEvent

        if (event.type === 'error') {
          throw new Error(`Anthropic provider error: ${event.error?.message ?? 'unknown error'}`)
        }

        if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
          const index = event.index ?? 0
          pendingToolCalls.set(index, {
            id: event.content_block.id ?? `tool-${request.turn}-${index}`,
            name: event.content_block.name ?? '',
            argumentsText: stringifyInitialInput(event.content_block.input),
          })
        }

        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
          yield { type: 'text-delta', text: event.delta.text, turnIndex: request.turn }
        }

        if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta' && event.delta.thinking) {
          yield { type: 'reasoning-delta', reasoning: event.delta.thinking, turnIndex: request.turn }
        }

        if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
          const index = event.index ?? 0
          const current = pendingToolCalls.get(index) ?? {
            id: `tool-${request.turn}-${index}`,
            name: '',
            argumentsText: '',
          }
          current.argumentsText += event.delta.partial_json ?? ''
          pendingToolCalls.set(index, current)
          yield {
            type: 'tool-call-delta',
            toolCallId: current.id,
            index,
            toolName: current.name || undefined,
            argumentsDelta: event.delta.partial_json,
            turnIndex: request.turn,
          }
        }

        if (event.type === 'content_block_stop') {
          const index = event.index ?? 0
          const toolCall = pendingToolCalls.get(index)
          if (toolCall?.name) {
            yield {
              type: 'tool-call-done',
              toolCall: {
                id: toolCall.id,
                name: toolCall.name,
                args: parseToolArguments(toolCall.argumentsText),
              },
              turnIndex: request.turn,
            }
            pendingToolCalls.delete(index)
          }
        }

        const usage = event.message?.usage ?? event.usage
        if (usage) {
          yield { type: 'usage', usage: toUsage(usage), turnIndex: request.turn }
        }

        if (event.type === 'message_stop') {
          yield { type: 'finish', reason: 'stop', turnIndex: request.turn }
        }
      }
    },
  }
}

function toAnthropicMessages(messages: AgentMessage[]): { system?: string; messages: AnthropicMessage[] } {
  const systemMessages: string[] = []
  const result: AnthropicMessage[] = []

  for (const message of messages) {
    if (message.role === 'system') {
      if (message.content) systemMessages.push(message.content)
      continue
    }

    if (message.role === 'tool') {
      result.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: message.toolCallId ?? '',
          content: message.content,
        }],
      })
      continue
    }

    if (message.role === 'assistant' && message.toolCalls?.length) {
      const content: AnthropicContentBlock[] = []
      if (message.content) {
        content.push({ type: 'text', text: message.content })
      }
      for (const toolCall of message.toolCalls) {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.args,
        })
      }
      result.push({ role: 'assistant', content })
      continue
    }

    result.push({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    })
  }

  return {
    system: systemMessages.length ? systemMessages.join('\n\n') : undefined,
    messages: result,
  }
}

function toAnthropicTools(tools: ToolDefinition[]): AnthropicTool[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters ?? {
      type: 'object',
      properties: {},
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

function stringifyInitialInput(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  if (Object.keys(input).length === 0) return ''
  try {
    return JSON.stringify(input)
  } catch {
    return ''
  }
}

function toUsage(usage: NonNullable<AnthropicStreamEvent['usage']>): ProviderUsage {
  const inputTokens = usage.input_tokens ?? 0
  const outputTokens = usage.output_tokens ?? 0
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  }
}
