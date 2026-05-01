/**
 * OpenAI Provider Definition
 *
 * Custom LanguageModelV2 implementation that uses the official `openai`
 * SDK directly instead of `@ai-sdk/openai`. The outer contract (the V2
 * shape consumed by `streamText`) is preserved, but the wire layer is
 * the OpenAI SDK's `chat.completions.create({ stream: true })`.
 */

import OpenAI from 'openai'
import type {
  LanguageModelV2,
  LanguageModelV2StreamPart,
  LanguageModelV2CallOptions,
  LanguageModelV2FunctionTool,
} from '@ai-sdk/provider'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionContentPart,
  ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions'
import type { ProviderDefinition } from '../types.js'
import { createBoundFetch } from '../bound-fetch.js'

type FetchFn = typeof globalThis.fetch

// Helpers ------------------------------------------------------------------

function mapFinishReason(
  reason: string | null | undefined,
): 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error' | 'other' | 'unknown' {
  switch (reason) {
    case 'stop':
      return 'stop'
    case 'length':
      return 'length'
    case 'tool_calls':
    case 'function_call':
      return 'tool-calls'
    case 'content_filter':
      return 'content-filter'
    default:
      return reason ? 'other' : 'unknown'
  }
}

function stringifyToolResult(output: unknown): string {
  if (output == null) return ''
  if (typeof output === 'string') return output
  // AI SDK v6 wraps results as { type: 'json' | 'text' | 'error-text', value }
  if (typeof output === 'object' && output !== null && 'value' in (output as any)) {
    const val = (output as any).value
    return typeof val === 'string' ? val : JSON.stringify(val)
  }
  return JSON.stringify(output)
}

/**
 * Convert AI SDK v2 prompt parts into OpenAI Chat Completions messages.
 * Handles multimodal user content (text + image) and assistant tool calls.
 */
function convertToOpenAIMessages(prompt: any[]): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = []

  for (const msg of prompt) {
    if (msg.role === 'system') {
      const content =
        typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .filter((p: any) => p.type === 'text')
                .map((p: any) => p.text)
                .join('\n')
            : JSON.stringify(msg.content)
      messages.push({ role: 'system', content })
      continue
    }

    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        messages.push({ role: 'user', content: msg.content })
        continue
      }
      if (Array.isArray(msg.content)) {
        const parts: ChatCompletionContentPart[] = []
        for (const part of msg.content) {
          if (part.type === 'text') {
            parts.push({ type: 'text', text: part.text })
          } else if (part.type === 'image' || part.type === 'file') {
            // AI SDK v2 prompt encodes images either as `image` (with `image` field)
            // or as `file` (with `data` + `mediaType`). Normalize both to OpenAI's
            // image_url part with a data URL.
            const raw = part.image ?? part.data
            if (!raw) continue
            const mediaType: string = part.mediaType || 'image/png'
            let url: string
            if (typeof raw === 'string') {
              url = raw.startsWith('data:') || raw.startsWith('http')
                ? raw
                : `data:${mediaType};base64,${raw}`
            } else if (raw instanceof URL) {
              url = raw.toString()
            } else {
              const b64 = Buffer.from(raw as Uint8Array).toString('base64')
              url = `data:${mediaType};base64,${b64}`
            }
            parts.push({ type: 'image_url', image_url: { url } })
          }
        }
        messages.push({ role: 'user', content: parts.length > 0 ? parts : '' })
      } else {
        messages.push({ role: 'user', content: String(msg.content ?? '') })
      }
      continue
    }

    if (msg.role === 'assistant') {
      const textParts: string[] = []
      const toolCalls: Array<{
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }> = []

      if (typeof msg.content === 'string') {
        textParts.push(msg.content)
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            textParts.push(part.text)
          } else if (part.type === 'tool-call') {
            toolCalls.push({
              id: part.toolCallId,
              type: 'function',
              function: {
                name: part.toolName,
                arguments:
                  typeof part.input === 'string'
                    ? part.input
                    : JSON.stringify(part.input ?? {}),
              },
            })
          }
          // 'reasoning' parts are dropped — OpenAI chat.completions does not
          // accept reasoning content on assistant turns; reasoning models
          // surface it only in the response stream.
        }
      }

      const text = textParts.join('\n')
      if (toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: text || null,
          tool_calls: toolCalls,
        })
      } else {
        messages.push({ role: 'assistant', content: text })
      }
      continue
    }

    if (msg.role === 'tool') {
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'tool-result') {
            messages.push({
              role: 'tool',
              tool_call_id: part.toolCallId,
              content: stringifyToolResult(part.output),
            })
          }
        }
      }
    }
  }

  return messages
}

function buildTools(
  tools: LanguageModelV2CallOptions['tools'] | undefined,
): ChatCompletionTool[] | undefined {
  if (!tools || tools.length === 0) return undefined
  const converted = tools
    .filter((t): t is LanguageModelV2FunctionTool => t.type === 'function')
    .map<ChatCompletionTool>((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema as Record<string, unknown>,
      },
    }))
  return converted.length > 0 ? converted : undefined
}

// Model implementation -----------------------------------------------------

function createOpenAIModel(
  modelId: string,
  client: OpenAI,
): LanguageModelV2 {
  return {
    specificationVersion: 'v2',
    provider: 'openai',
    modelId,
    defaultObjectGenerationMode: undefined,

    async doStream(options: LanguageModelV2CallOptions) {
      const { prompt, tools, ...rest } = options
      const messages = convertToOpenAIMessages(prompt)
      const convertedTools = buildTools(tools)

      const request: ChatCompletionCreateParamsStreaming = {
        model: modelId,
        messages,
        stream: true,
        stream_options: { include_usage: true },
      }

      if (rest.temperature !== undefined) {
        request.temperature = rest.temperature
      }
      if ((rest as any).topP !== undefined) {
        request.top_p = (rest as any).topP
      }
      if (rest.maxOutputTokens !== undefined) {
        request.max_completion_tokens = rest.maxOutputTokens
      }
      if (convertedTools) {
        request.tools = convertedTools
        request.tool_choice = 'auto'
      }

      const stream = await client.chat.completions.create(request, {
        signal: rest.abortSignal,
      })

      async function* processStream(): AsyncGenerator<LanguageModelV2StreamPart> {
        let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
        let textStarted = false
        const textId = 'text-0'
        const toolsInProgress = new Map<
          number,
          { id: string; name: string; arguments: string; started: boolean }
        >()
        let pendingFinishReason: string | null = null
        let toolCallsEmitted = false

        const closeOpenBlocks = function* (): Generator<LanguageModelV2StreamPart> {
          if (textStarted) {
            yield { type: 'text-end', id: textId } as any
            textStarted = false
          }
        }

        const emitToolCalls = function* (): Generator<LanguageModelV2StreamPart> {
          if (toolCallsEmitted) return
          toolCallsEmitted = true
          for (const [, tc] of toolsInProgress) {
            let parsedInput: unknown = {}
            try {
              parsedInput = tc.arguments ? JSON.parse(tc.arguments) : {}
            } catch {
              parsedInput = {}
            }
            yield {
              type: 'tool-call',
              toolCallId: tc.id,
              toolName: tc.name,
              input: parsedInput,
            } as any
          }
        }

        try {
          for await (const chunk of stream) {
            const choice = chunk.choices?.[0]
            const delta = choice?.delta
            const finishReason = choice?.finish_reason

            if (delta?.content) {
              if (!textStarted) {
                textStarted = true
                yield { type: 'text-start', id: textId } as any
              }
              yield {
                type: 'text-delta',
                id: textId,
                delta: delta.content,
              } as any
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index
                let entry = toolsInProgress.get(idx)
                if (!entry) {
                  entry = {
                    id: tc.id || `tool-${idx}`,
                    name: tc.function?.name || '',
                    arguments: tc.function?.arguments || '',
                    started: false,
                  }
                  toolsInProgress.set(idx, entry)
                } else {
                  if (tc.id) entry.id = tc.id
                  if (tc.function?.name) entry.name += tc.function.name
                  if (tc.function?.arguments) {
                    entry.arguments += tc.function.arguments
                  }
                }

                // Defer tool-input-start until we have both id and name,
                // and emit any buffered argument deltas in order.
                if (!entry.started && entry.id && entry.name) {
                  yield {
                    type: 'tool-input-start',
                    toolCallId: entry.id,
                    toolName: entry.name,
                  } as any
                  entry.started = true
                  if (entry.arguments) {
                    yield {
                      type: 'tool-input-delta',
                      toolCallId: entry.id,
                      inputTextDelta: entry.arguments,
                    } as any
                  }
                } else if (entry.started && tc.function?.arguments) {
                  yield {
                    type: 'tool-input-delta',
                    toolCallId: entry.id,
                    inputTextDelta: tc.function.arguments,
                  } as any
                }
              }
            }

            if (chunk.usage) {
              usage = {
                inputTokens: chunk.usage.prompt_tokens,
                outputTokens: chunk.usage.completion_tokens,
                totalTokens: chunk.usage.total_tokens,
              }
            }

            if (finishReason) {
              yield* closeOpenBlocks()
              yield* emitToolCalls()
              pendingFinishReason = finishReason
            }
          }
        } catch (err) {
          // Make sure structural blocks are closed even on error so the
          // consumer state machine doesn't get stuck.
          yield* closeOpenBlocks()
          throw err
        }

        yield* closeOpenBlocks()
        yield* emitToolCalls()
        yield {
          type: 'finish',
          finishReason: mapFinishReason(pendingFinishReason),
          usage,
        } as any
      }

      const generator = processStream()
      const v2Stream = new ReadableStream<LanguageModelV2StreamPart>({
        async pull(controller) {
          try {
            const { done, value } = await generator.next()
            if (done) controller.close()
            else controller.enqueue(value)
          } catch (e) {
            controller.error(e)
          }
        },
        async cancel() {
          await generator.return?.(undefined)
        },
      })

      return {
        stream: v2Stream,
        request: { body: JSON.stringify(request) },
        response: { id: undefined, timestamp: new Date(), modelId },
      } as any
    },
  } as unknown as LanguageModelV2
}

// Provider definition ------------------------------------------------------

const openaiProvider: ProviderDefinition = {
  id: 'openai',

  info: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4, GPT-3.5 and other OpenAI models',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    icon: 'openai',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
  },

  create: ({ apiKey, baseUrl, localAddress }) => {
    const boundFetch = createBoundFetch(localAddress)
    const client = new OpenAI({
      apiKey: apiKey ?? '',
      baseURL: (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, ''),
      fetch: boundFetch as unknown as FetchFn,
    })
    return {
      createModel: (modelId: string) =>
        createOpenAIModel(modelId, client) as any,
    }
  },
}

export default openaiProvider
