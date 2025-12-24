/**
 * Zhipu (GLM) Provider Definition
 *
 * Custom implementation for Zhipu AI API with full support for:
 * - System/User/Assistant/Tool roles
 * - Thinking mode for GLM-4.5+ models
 * - Streaming responses
 * - Tool calls
 */

import type { LanguageModelV2, LanguageModelV2StreamPart } from '@ai-sdk/provider'
import type { ProviderDefinition } from '../types.js'

// Check if model supports thinking mode (GLM-4.5 and above)
function supportsThinking(modelId: string): boolean {
  const lower = modelId.toLowerCase()
  // GLM-4.5, GLM-4.6, GLM-4.7 and their variants support thinking
  return lower.includes('glm-4.5') || lower.includes('glm-4.6') || lower.includes('glm-4.7')
}

// Zhipu API message types
interface ZhipuMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  tool_call_id?: string
}

interface ZhipuTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

interface ZhipuRequest {
  model: string
  messages: ZhipuMessage[]
  temperature?: number
  top_p?: number
  max_tokens?: number
  stream?: boolean
  tools?: ZhipuTool[]
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  thinking?: {
    type: 'enabled' | 'disabled'
    clear_thinking?: boolean
  }
}

interface ZhipuStreamChunk {
  id: string
  choices: Array<{
    index: number
    delta: {
      role?: string
      content?: string
      reasoning_content?: string
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
}

/**
 * Create a Zhipu language model (V2 API)
 */
function createZhipuModel(modelId: string, apiKey: string, baseUrl: string): LanguageModelV2 {
  const enableThinking = supportsThinking(modelId)

  return {
    specificationVersion: 'v2',
    provider: 'zhipu',
    modelId,
    defaultObjectGenerationMode: undefined,

    async doGenerate(options) {
      const { prompt, tools, ...rest } = options

      // Convert AI SDK messages to Zhipu format
      const messages = convertToZhipuMessages(prompt)

      // Build request
      const request: ZhipuRequest = {
        model: modelId,
        messages,
        stream: false,
      }

      // Add temperature if provided
      if (rest.temperature !== undefined) {
        request.temperature = rest.temperature
      }

      // Add max tokens if provided
      if (rest.maxOutputTokens !== undefined) {
        request.max_tokens = rest.maxOutputTokens
      }

      // Add thinking mode for supported models
      if (enableThinking) {
        request.thinking = {
          type: 'enabled',
          clear_thinking: true,
        }
      }

      // Add tools if provided
      if (tools && tools.length > 0) {
        request.tools = tools
          .filter((tool) => tool.type === 'function')
          .map((tool: any) => ({
            type: 'function' as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters as Record<string, unknown>,
            },
          }))
        if (request.tools.length > 0) {
          request.tool_choice = 'auto'
        }
      }

      // Make API request
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(request),
        signal: rest.abortSignal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Zhipu API error: ${response.status} ${errorText}`)
      }

      const data = await response.json()
      const choice = data.choices?.[0]

      if (!choice) {
        throw new Error('No response from Zhipu API')
      }

      // Build content array (V2 format)
      const content: any[] = []

      // Add reasoning if present
      if (choice.message?.reasoning_content) {
        content.push({
          type: 'reasoning',
          text: choice.message.reasoning_content,
        })
      }

      // Add text content
      if (choice.message?.content) {
        content.push({
          type: 'text',
          text: choice.message.content,
        })
      }

      // Add tool calls if present
      if (choice.message?.tool_calls) {
        for (const tc of choice.message.tool_calls) {
          content.push({
            type: 'tool-call',
            toolCallId: tc.id,
            toolName: tc.function.name,
            args: tc.function.arguments,
          })
        }
      }

      return {
        content,
        finishReason: mapFinishReason(choice.finish_reason),
        usage: {
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0,
          totalTokens: (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0),
        },
        request: { body: JSON.stringify(request) },
        response: {
          id: data.id,
          timestamp: new Date(),
          modelId,
        },
        warnings: [],
      }
    },

    async doStream(options) {
      const { prompt, tools, ...rest } = options

      // Convert AI SDK messages to Zhipu format
      const messages = convertToZhipuMessages(prompt)

      // Build request
      const request: ZhipuRequest = {
        model: modelId,
        messages,
        stream: true,
      }

      // Add temperature if provided (but not for thinking models)
      if (rest.temperature !== undefined && !enableThinking) {
        request.temperature = rest.temperature
      }

      // Add max tokens if provided
      if (rest.maxOutputTokens !== undefined) {
        request.max_tokens = rest.maxOutputTokens
      }

      // Add thinking mode for supported models
      if (enableThinking) {
        request.thinking = {
          type: 'enabled',
          clear_thinking: true,
        }
      }

      // Add tools if provided
      if (tools && tools.length > 0) {
        request.tools = tools
          .filter((tool) => tool.type === 'function')
          .map((tool: any) => ({
            type: 'function' as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters as Record<string, unknown>,
            },
          }))
        if (request.tools.length > 0) {
          request.tool_choice = 'auto'
        }
      }

      console.log('[Zhipu] Streaming request:', JSON.stringify(request, null, 2))

      // Make streaming API request
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(request),
        signal: rest.abortSignal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Zhipu] API error:', response.status, errorText)
        throw new Error(`Zhipu API error: ${response.status} ${errorText}`)
      }

      // Create an async generator for stream processing
      async function* processStream(): AsyncGenerator<LanguageModelV2StreamPart> {
        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body')
        }

        const decoder = new TextDecoder()
        let buffer = ''
        const toolCallsInProgress: Map<
          number,
          { id: string; name: string; arguments: string }
        > = new Map()
        let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
        let reasoningStarted = false
        const reasoningId = 'reasoning-0'
        let textStarted = false
        const textId = 'text-0'

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })

            // Process SSE lines
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // Keep incomplete line in buffer

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed || trimmed === 'data: [DONE]') continue
              if (!trimmed.startsWith('data: ')) continue

              const jsonStr = trimmed.slice(6) // Remove 'data: ' prefix
              try {
                const chunk: ZhipuStreamChunk = JSON.parse(jsonStr)
                const delta = chunk.choices?.[0]?.delta

                if (!delta) continue

                // Handle reasoning content (thinking) - use proper AI SDK v5 types
                if (delta.reasoning_content) {
                  // Emit reasoning-start on first reasoning chunk
                  if (!reasoningStarted) {
                    reasoningStarted = true
                    yield {
                      type: 'reasoning-start',
                      id: reasoningId,
                    } as any
                  }
                  yield {
                    type: 'reasoning-delta',
                    id: reasoningId,
                    delta: delta.reasoning_content,
                  } as any
                }

                // Handle text content
                if (delta.content) {
                  // End reasoning when text content starts
                  if (reasoningStarted) {
                    yield {
                      type: 'reasoning-end',
                      id: reasoningId,
                    } as any
                    reasoningStarted = false
                  }
                  // Emit text-start on first text chunk
                  if (!textStarted) {
                    textStarted = true
                    yield {
                      type: 'text-start',
                      id: textId,
                    } as any
                  }
                  yield {
                    type: 'text-delta',
                    id: textId,
                    delta: delta.content,
                  } as any
                }

                // Handle tool calls
                if (delta.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const index = tc.index

                    if (!toolCallsInProgress.has(index)) {
                      // New tool call - emit tool-input-start
                      const toolCallId = tc.id || `tool-${index}`
                      const toolName = tc.function?.name || ''
                      const initialArgs = tc.function?.arguments || ''
                      toolCallsInProgress.set(index, {
                        id: toolCallId,
                        name: toolName,
                        arguments: initialArgs,
                      })
                      if (toolName) {
                        yield {
                          type: 'tool-input-start',
                          toolCallId,
                          toolName,
                        } as any
                        // Also emit initial arguments if present
                        if (initialArgs) {
                          yield {
                            type: 'tool-input-delta',
                            toolCallId,
                            inputTextDelta: initialArgs,
                          } as any
                        }
                      }
                    } else {
                      // Continue existing tool call
                      const existing = toolCallsInProgress.get(index)!
                      if (tc.id) existing.id = tc.id
                      if (tc.function?.name) existing.name += tc.function.name
                      if (tc.function?.arguments) {
                        existing.arguments += tc.function.arguments
                        // Emit tool-input-delta for argument chunks
                        yield {
                          type: 'tool-input-delta',
                          toolCallId: existing.id,
                          inputTextDelta: tc.function.arguments,
                        } as any
                      }
                    }
                  }
                }

                // Handle finish reason
                const finishReason = chunk.choices?.[0]?.finish_reason
                if (finishReason) {
                  // Close reasoning if still open
                  if (reasoningStarted) {
                    yield {
                      type: 'reasoning-end',
                      id: reasoningId,
                    } as any
                    reasoningStarted = false
                  }

                  // Close text if started
                  if (textStarted) {
                    yield {
                      type: 'text-end',
                      id: textId,
                    } as any
                    textStarted = false
                  }

                  // Emit tool-call for completed tool calls
                  for (const [, tc] of toolCallsInProgress) {
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

                  // Update usage before finish
                  if (chunk.usage) {
                    usage = {
                      inputTokens: chunk.usage.prompt_tokens,
                      outputTokens: chunk.usage.completion_tokens,
                      totalTokens: chunk.usage.total_tokens,
                    }
                  }

                  yield {
                    type: 'finish',
                    finishReason: mapFinishReason(finishReason),
                    usage,
                  } as any
                }

                // Update usage if provided (for non-finish chunks)
                if (chunk.usage && !chunk.choices?.[0]?.finish_reason) {
                  usage = {
                    inputTokens: chunk.usage.prompt_tokens,
                    outputTokens: chunk.usage.completion_tokens,
                    totalTokens: chunk.usage.total_tokens,
                  }
                }
              } catch (e) {
                console.error('[Zhipu] Failed to parse chunk:', jsonStr, e)
              }
            }
          }
        } finally {
          reader.releaseLock()
        }
      }

      // Convert async generator to ReadableStream
      const generator = processStream()
      const stream = new ReadableStream<LanguageModelV2StreamPart>({
        async pull(controller) {
          try {
            const { done, value } = await generator.next()
            if (done) {
              controller.close()
            } else {
              controller.enqueue(value)
            }
          } catch (e) {
            controller.error(e)
          }
        },
      })

      return {
        stream,
        request: { body: JSON.stringify(request) },
        response: {
          id: undefined,
          timestamp: new Date(),
          modelId,
        },
      } as any
    },
  } as unknown as LanguageModelV2
}

/**
 * Convert AI SDK prompt to Zhipu message format
 */
function convertToZhipuMessages(prompt: any[]): ZhipuMessage[] {
  const messages: ZhipuMessage[] = []

  for (const msg of prompt) {
    if (msg.role === 'system') {
      messages.push({
        role: 'system',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      })
    } else if (msg.role === 'user') {
      // Handle user messages (may have multiple content parts)
      let content = ''
      if (typeof msg.content === 'string') {
        content = msg.content
      } else if (Array.isArray(msg.content)) {
        // Extract text from content parts
        content = msg.content
          .filter((part: any) => part.type === 'text')
          .map((part: any) => part.text)
          .join('\n')
      }
      messages.push({ role: 'user', content })
    } else if (msg.role === 'assistant') {
      // Handle assistant messages (may have tool calls)
      const assistantMsg: ZhipuMessage = {
        role: 'assistant',
        content: null,
      }

      if (typeof msg.content === 'string') {
        assistantMsg.content = msg.content
      } else if (Array.isArray(msg.content)) {
        // Extract text and tool calls
        const textParts = msg.content.filter((part: any) => part.type === 'text')
        const toolCallParts = msg.content.filter((part: any) => part.type === 'tool-call')

        if (textParts.length > 0) {
          assistantMsg.content = textParts.map((part: any) => part.text).join('\n')
        }

        if (toolCallParts.length > 0) {
          assistantMsg.tool_calls = toolCallParts.map((part: any) => ({
            id: part.toolCallId,
            type: 'function' as const,
            function: {
              name: part.toolName,
              // AI SDK v5 uses 'input' instead of 'args'
              arguments: typeof (part.input ?? part.args) === 'string'
                ? (part.input ?? part.args)
                : JSON.stringify(part.input ?? part.args ?? {}),
            },
          }))
        }
      }

      messages.push(assistantMsg)
    } else if (msg.role === 'tool') {
      // Handle tool results
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'tool-result') {
            // AI SDK v5 uses 'output' instead of 'result', and wraps it in {type, value}
            let resultContent = part.output ?? part.result
            // Extract value from AI SDK wrapper format
            if (resultContent && typeof resultContent === 'object' && 'value' in resultContent) {
              resultContent = resultContent.value
            }
            messages.push({
              role: 'tool',
              content: typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent),
              tool_call_id: part.toolCallId,
            })
          }
        }
      }
    }
  }

  return messages
}

/**
 * Map Zhipu finish reason to AI SDK finish reason
 */
function mapFinishReason(reason: string | null | undefined): 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error' | 'other' | 'unknown' {
  switch (reason) {
    case 'stop':
      return 'stop'
    case 'length':
      return 'length'
    case 'tool_calls':
      return 'tool-calls'
    case 'sensitive':
      return 'content-filter'
    default:
      return 'unknown'
  }
}

const zhipuProvider: ProviderDefinition = {
  id: 'zhipu',

  info: {
    id: 'zhipu',
    name: '智谱 GLM',
    description: 'GLM-4, GLM-3 and other Zhipu AI models',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    icon: 'zhipu',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
  },

  create: ({ apiKey, baseUrl }) => {
    const finalBaseUrl = baseUrl || 'https://open.bigmodel.cn/api/paas/v4'
    return {
      createModel: (modelId: string) => createZhipuModel(modelId, apiKey, finalBaseUrl) as any,
    }
  },
}

export default zhipuProvider
