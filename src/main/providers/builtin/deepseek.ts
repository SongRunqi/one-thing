/**
 * DeepSeek Provider Definition
 *
 * Custom implementation against the OpenAI-compatible DeepSeek REST API.
 * We don't use `@ai-sdk/deepseek` because its message converter drops
 * `reasoning_content` from any assistant turn that isn't the most recent
 * one, which makes thinking-mode models (e.g. deepseek-v4-pro) reject
 * multi-turn / edit-and-resend requests with:
 *   "The reasoning_content in the thinking mode must be passed back to the API."
 *
 * This implementation always preserves `reasoning_content` on every
 * historical assistant message.
 */

import type {
  LanguageModelV2,
  LanguageModelV2StreamPart,
  LanguageModelV2CallOptions,
  LanguageModelV2FunctionTool,
} from '@ai-sdk/provider'
import type { ProviderDefinition } from '../types.js'
import { createRequiredAppFetch } from '../bound-fetch.js'

type FetchFn = typeof globalThis.fetch

// Wire types ---------------------------------------------------------------

interface DeepSeekToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
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

interface DeepSeekRequest {
  model: string
  messages: DeepSeekMessage[]
  stream: boolean
  stream_options?: { include_usage: boolean }
  temperature?: number
  top_p?: number
  max_tokens?: number
  tools?: DeepSeekTool[]
  tool_choice?: 'auto' | 'none'
  thinking?: { type: 'enabled' | 'disabled' }
  reasoning_effort?: 'high' | 'max'
}

interface DeepSeekStreamChunk {
  id?: string
  choices?: Array<{
    index: number
    delta?: {
      role?: string
      content?: string | null
      reasoning_content?: string | null
      tool_calls?: Array<{
        index: number
        id?: string
        type?: 'function'
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  error?: { message?: string; type?: string; code?: string }
}

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
      return 'tool-calls'
    case 'content_filter':
      return 'content-filter'
    case 'insufficient_system_resource':
      return 'other'
    default:
      return reason ? 'other' : 'unknown'
  }
}

/**
 * Models that operate in thinking mode by default — the API returns
 * `reasoning_content` and rejects requests where prior assistant turns
 * dropped it. We err on the side of inclusion: a non-thinking model that
 * happens to receive a `reasoning_content` field will simply ignore it,
 * but missing it on a thinking model is a hard 400.
 */
function isThinkingModel(modelId: string): boolean {
  const lower = modelId.toLowerCase()
  return (
    lower.includes('reasoner') ||
    lower.includes('thinking') ||
    /(^|[^a-z])v4/.test(lower)
  )
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

function isCompleteToolArguments(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed) return false
  try {
    const parsed = JSON.parse(trimmed)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
  } catch {
    return false
  }
}

/**
 * Convert AI SDK v2 prompt parts into DeepSeek wire messages. Crucially,
 * `{ type: 'reasoning' }` parts on assistant messages are aggregated into
 * the `reasoning_content` field for **every** assistant turn — including
 * those before the most recent user message.
 */
function convertToDeepSeekMessages(prompt: any[]): DeepSeekMessage[] {
  const messages: DeepSeekMessage[] = []

  for (const msg of prompt) {
    if (msg.role === 'system') {
      messages.push({
        role: 'system',
        content:
          typeof msg.content === 'string'
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content
                  .filter((p: any) => p.type === 'text')
                  .map((p: any) => p.text)
                  .join('\n')
              : JSON.stringify(msg.content),
      })
      continue
    }

    if (msg.role === 'user') {
      let content = ''
      if (typeof msg.content === 'string') {
        content = msg.content
      } else if (Array.isArray(msg.content)) {
        content = msg.content
          .filter((p: any) => p.type === 'text')
          .map((p: any) => p.text)
          .join('\n')
      }
      messages.push({ role: 'user', content })
      continue
    }

    if (msg.role === 'assistant') {
      const out: DeepSeekMessage = { role: 'assistant', content: null }
      let reasoningText = ''
      const textParts: string[] = []
      const toolCalls: DeepSeekToolCall[] = []

      if (typeof msg.content === 'string') {
        out.content = msg.content
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            textParts.push(part.text)
          } else if (part.type === 'reasoning') {
            reasoningText += part.text
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
        }
        out.content = textParts.length > 0 ? textParts.join('\n') : ''
      }

      if (reasoningText) out.reasoning_content = reasoningText
      if (toolCalls.length > 0) out.tool_calls = toolCalls

      messages.push(out)
      continue
    }

    if (msg.role === 'tool') {
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'tool-result') {
            messages.push({
              role: 'tool',
              content: stringifyToolResult(part.output),
              tool_call_id: part.toolCallId,
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
): DeepSeekTool[] | undefined {
  if (!tools || tools.length === 0) return undefined
  const converted = tools
    .filter((t): t is LanguageModelV2FunctionTool => t.type === 'function')
    .map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema as Record<string, unknown>,
      },
    }))
  return converted.length > 0 ? converted : undefined
}

// Model implementation -----------------------------------------------------

function createDeepSeekModel(
  modelId: string,
  apiKey: string,
  baseUrl: string,
  fetchImpl: FetchFn,
): LanguageModelV2 {
  const thinking = isThinkingModel(modelId)

  return {
    specificationVersion: 'v2',
    provider: 'deepseek',
    modelId,
    defaultObjectGenerationMode: undefined,

    async doStream(options: LanguageModelV2CallOptions) {
      const { prompt, tools, ...rest } = options
      const messages = convertToDeepSeekMessages(prompt)
      const convertedTools = buildTools(tools)

      // Resolve effective thinking state:
      //   1. Explicit per-call user preference via providerOptions.deepseek.thinking
      //      ('enabled' | 'disabled'), wired up from the UI's ThinkToggle.
      //   2. Otherwise, fall back to the model-name heuristic.
      const userThinking = (rest as any).providerOptions?.deepseek?.thinking as
        | 'enabled'
        | 'disabled'
        | undefined
      const configuredReasoningEffort = (rest as any).providerOptions?.deepseek?.reasoningEffort
      const userReasoningEffort =
        configuredReasoningEffort === 'high' || configuredReasoningEffort === 'max'
          ? configuredReasoningEffort
          : undefined
      const effectiveThinking =
        userThinking === 'enabled'
          ? true
          : userThinking === 'disabled'
            ? false
            : thinking

      const request: DeepSeekRequest = {
        model: modelId,
        messages,
        stream: true,
        stream_options: { include_usage: true },
      }

      // Thinking models reject `temperature` per DeepSeek docs.
      if (rest.temperature !== undefined && !effectiveThinking) {
        request.temperature = rest.temperature
      }
      if ((rest as any).topP !== undefined && !effectiveThinking) {
        request.top_p = (rest as any).topP
      }
      if (rest.maxOutputTokens !== undefined) {
        request.max_tokens = rest.maxOutputTokens
      }
      if (convertedTools) {
        request.tools = convertedTools
        request.tool_choice = 'auto'
      }
      // Explicitly send the thinking flag whenever we have an opinion —
      // either from the user's ThinkToggle or from the model heuristic.
      if (userThinking || thinking) {
        request.thinking = {
          type: effectiveThinking ? 'enabled' : 'disabled',
        }
      }
      if (effectiveThinking && userReasoningEffort) {
        request.reasoning_effort = userReasoningEffort
      }

      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(request),
        signal: rest.abortSignal,
      })

      if (!response.ok) {
        const text = await response.text()
        const err = new Error(`DeepSeek API error: ${response.status} ${text}`)
        ;(err as any).statusCode = response.status
        ;(err as any).responseBody = text
        throw err
      }

      async function* processStream(): AsyncGenerator<LanguageModelV2StreamPart> {
        const reader = response.body?.getReader()
        if (!reader) throw new Error('DeepSeek: no response body')

        const decoder = new TextDecoder()
        let buffer = ''
        let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
        let reasoningStarted = false
        const reasoningId = 'reasoning-0'
        let textStarted = false
        const textId = 'text-0'
        const toolsInProgress = new Map<
          number,
          { id: string; name: string; arguments: string; started: boolean; ended: boolean }
        >()
        // We defer the `finish` event until the stream actually ends.
        // Per DeepSeek docs, with `stream_options.include_usage: true`,
        // the usage totals arrive in a separate trailing chunk *after*
        // the chunk carrying `finish_reason`. Emitting finish on the
        // first finish_reason chunk would lose that usage.
        let pendingFinishReason: string | null = null
        let toolCallsEmitted = false

        const closeOpenBlocks = function* (): Generator<LanguageModelV2StreamPart> {
          if (reasoningStarted) {
            yield { type: 'reasoning-end', id: reasoningId } as any
            reasoningStarted = false
          }
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
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed || !trimmed.startsWith('data: ')) continue
              if (trimmed === 'data: [DONE]') continue

              const payload = trimmed.slice(6)
              let chunk: DeepSeekStreamChunk
              try {
                chunk = JSON.parse(payload)
              } catch (e) {
                console.error('[DeepSeek] failed to parse chunk:', payload, e)
                continue
              }

              if (chunk.error) {
                throw new Error(
                  `DeepSeek stream error: ${chunk.error.message ?? 'unknown'}`,
                )
              }

              const delta = chunk.choices?.[0]?.delta
              const finishReason = chunk.choices?.[0]?.finish_reason

              if (delta?.reasoning_content) {
                if (!reasoningStarted) {
                  reasoningStarted = true
                  yield { type: 'reasoning-start', id: reasoningId } as any
                }
                yield {
                  type: 'reasoning-delta',
                  id: reasoningId,
                  delta: delta.reasoning_content,
                } as any
              }

              if (delta?.content) {
                if (reasoningStarted) {
                  yield { type: 'reasoning-end', id: reasoningId } as any
                  reasoningStarted = false
                }
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
                      ended: false,
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

                  if (entry.started && !entry.ended && isCompleteToolArguments(entry.arguments)) {
                    yield {
                      type: 'tool-input-end',
                      toolCallId: entry.id,
                    } as any
                    entry.ended = true
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
                // Buffer the finish reason; close open text/reasoning blocks
                // and flush completed tool-calls now (they need to fire
                // before `finish`), but wait to emit `finish` until the
                // stream really ends so we can fold in the trailing
                // usage-only chunk.
                yield* closeOpenBlocks()
                yield* emitToolCalls()
                pendingFinishReason = finishReason
              }
            }
          }
        } finally {
          reader.releaseLock()
        }

        // Stream ended — flush any unfinished structural events and
        // emit a single finish event with the final accumulated usage.
        yield* closeOpenBlocks()
        yield* emitToolCalls()
        yield {
          type: 'finish',
          finishReason: mapFinishReason(pendingFinishReason),
          usage,
        } as any
      }

      const generator = processStream()
      const stream = new ReadableStream<LanguageModelV2StreamPart>({
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
        stream,
        request: { body: JSON.stringify(request) },
        response: { id: undefined, timestamp: new Date(), modelId },
      } as any
    },
  } as unknown as LanguageModelV2
}

// Provider definition ------------------------------------------------------

const deepseekProvider: ProviderDefinition = {
  id: 'deepseek',

  info: {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek-V3, DeepSeek-R1, DeepSeek-V4 and other DeepSeek models',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    icon: 'deepseek',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
  },

  create: ({ apiKey, baseUrl }) => {
    const finalBaseUrl = (baseUrl || 'https://api.deepseek.com').replace(/\/$/, '')
    const fetchImpl = createRequiredAppFetch()
    return {
      createModel: (modelId: string) =>
        createDeepSeekModel(modelId, apiKey ?? '', finalBaseUrl, fetchImpl) as any,
    }
  },
}

export default deepseekProvider
