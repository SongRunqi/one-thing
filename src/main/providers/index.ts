/**
 * AI Provider Registry
 *
 * Uses Vercel AI SDK to provide a unified interface for multiple AI providers.
 *
 * ADDING A NEW PROVIDER:
 * 1. Create a new file in src/main/providers/builtin/ (e.g., myprovider.ts)
 * 2. Export it from src/main/providers/builtin/index.ts
 *
 * That's it! The provider will be automatically registered and available.
 */

import { generateText, streamText } from 'ai'
import { z } from 'zod'
import {
  initializeRegistry,
  getAvailableProviders as getProvidersFromRegistry,
  getProviderInfo as getInfoFromRegistry,
  isProviderSupported as isSupportedFromRegistry,
  createProviderInstance,
} from './registry.js'
import type { ProviderInfo, ProviderConfig } from './types.js'

// Initialize registry on module load
initializeRegistry()

// Re-export types
export type { ProviderInfo, ProviderConfig, ProviderDefinition, ProviderInstance } from './types.js'

/**
 * Get list of all available providers
 */
export function getAvailableProviders(): ProviderInfo[] {
  return getProvidersFromRegistry()
}

/**
 * Get provider info by ID
 */
export function getProviderInfo(providerId: string): ProviderInfo | undefined {
  return getInfoFromRegistry(providerId)
}

/**
 * Check if a provider is supported
 * Note: Custom providers (starting with 'custom-') are always supported
 */
export function isProviderSupported(providerId: string): boolean {
  return isSupportedFromRegistry(providerId)
}

/**
 * Create a provider instance
 * For user-defined custom providers (IDs starting with 'custom-'), use apiType to determine the SDK
 */
export function createProvider(
  providerId: string,
  config: { apiKey: string; baseUrl?: string; apiType?: 'openai' | 'anthropic' }
) {
  return createProviderInstance(providerId, config)
}

/**
 * Check if a model is a reasoning/thinking model that doesn't support temperature
 */
function isReasoningModel(modelId: string): boolean {
  const reasoningModels = [
    'deepseek-reasoner',
    'o1',
    'o1-preview',
    'o1-mini',
    'o3',
    'o3-mini',
  ]
  const lowerModelId = modelId.toLowerCase()
  return reasoningModels.some(rm => lowerModelId.includes(rm))
}

/**
 * Tool call information from AI response
 */
export interface AIToolCall {
  toolCallId: string
  toolName: string
  args: Record<string, any>
}

/**
 * Chat response result with optional reasoning/thinking content
 */
export interface ChatResponseResult {
  text: string
  reasoning?: string  // Thinking/reasoning process if available
  toolCalls?: AIToolCall[]  // Tool calls made by the assistant
}

/**
 * Stream chunk types for tool-enabled responses
 */
export interface StreamChunkWithTools {
  type: 'text' | 'reasoning' | 'tool-call' | 'tool-result'
  text?: string
  reasoning?: string
  toolCall?: AIToolCall
  toolResult?: {
    toolCallId: string
    result: any
  }
}

/**
 * Tool definition for AI SDK
 */
export interface AIToolDefinition {
  description: string
  parameters: z.ZodObject<any>
  execute?: (args: any) => Promise<any>
}

/**
 * Convert tool parameters to Zod schema
 */
function createZodSchema(parameters: Array<{ name: string; type: string; description: string; required?: boolean; enum?: string[] }>): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const param of parameters) {
    let zodType: z.ZodTypeAny

    switch (param.type) {
      case 'string':
        zodType = param.enum ? z.enum(param.enum as [string, ...string[]]) : z.string()
        break
      case 'number':
        zodType = z.number()
        break
      case 'boolean':
        zodType = z.boolean()
        break
      case 'object':
        zodType = z.record(z.string(), z.any())
        break
      case 'array':
        zodType = z.array(z.any())
        break
      default:
        zodType = z.any()
    }

    zodType = zodType.describe(param.description)

    if (!param.required) {
      zodType = zodType.optional()
    }

    shape[param.name] = zodType
  }

  return z.object(shape)
}

/**
 * Generate a chat response using the AI SDK
 * For reasoning models (like deepseek-reasoner, o1), temperature is automatically disabled
 */
export async function generateChatResponse(
  providerId: string,
  config: { apiKey: string; baseUrl?: string; model: string; apiType?: 'openai' | 'anthropic' },
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const result = await generateChatResponseWithReasoning(providerId, config, messages, options)
  return result.text
}

/**
 * Stream a chat response using the AI SDK
 * Returns an async generator that yields text chunks
 */
export async function* streamChatResponse(
  providerId: string,
  config: { apiKey: string; baseUrl?: string; model: string; apiType?: 'openai' | 'anthropic' },
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  options: { temperature?: number; maxTokens?: number } = {}
): AsyncGenerator<{ text: string; reasoning?: string }, void, unknown> {
  const provider = createProvider(providerId, config)
  const model = provider.createModel(config.model)

  const isReasoning = isReasoningModel(config.model)

  // Build streamText options
  const streamOptions: Parameters<typeof streamText>[0] = {
    model,
    messages,
    maxOutputTokens: options.maxTokens || 4096,
  }

  // Only add temperature for non-reasoning models
  if (!isReasoning && options.temperature !== undefined) {
    streamOptions.temperature = options.temperature
  }

  const stream = await streamText(streamOptions)

  // Always use textStream for this function (simpler interface)
  for await (const chunk of stream.textStream) {
    yield { text: chunk }
  }
}

/**
 * Stream a chat response with reasoning/thinking content
 * Returns an async generator that yields text and reasoning chunks
 */
export async function* streamChatResponseWithReasoning(
  providerId: string,
  config: { apiKey: string; baseUrl?: string; model: string; apiType?: 'openai' | 'anthropic' },
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  options: { temperature?: number; maxTokens?: number } = {}
): AsyncGenerator<{ text: string; reasoning?: string }, void, unknown> {
  const provider = createProvider(providerId, config)
  const model = provider.createModel(config.model)

  const isReasoning = isReasoningModel(config.model)

  // Build streamText options
  const streamOptions: Parameters<typeof streamText>[0] = {
    model,
    messages,
    maxOutputTokens: options.maxTokens || 4096,
  }

  // Only add temperature for non-reasoning models
  if (!isReasoning && options.temperature !== undefined) {
    streamOptions.temperature = options.temperature
  }

  const stream = await streamText(streamOptions)

  // For reasoning models, use fullStream to capture reasoning
  // For non-reasoning models, use textStream for simplicity
  if (isReasoning) {
    let accumulatedReasoning: string[] = []
    let chunkCount = 0

    for await (const chunk of stream.fullStream) {
      chunkCount++
      const chunkAny = chunk as any
      console.log(`[Provider] Stream chunk ${chunkCount}:`, chunk.type,
        'textDelta:', chunkAny.textDelta ? 'yes' : 'no',
        'delta:', chunkAny.delta ? 'yes' : 'no',
        'text:', chunkAny.text ? 'yes' : 'no',
        'chunk keys:', Object.keys(chunkAny).join(', '))

      // Extract text from chunk
      let text = ''
      if (chunk.type === 'text-delta') {
        // 尝试不同的属性名
        text = chunkAny.textDelta || chunkAny.delta || chunkAny.text || ''
        console.log(`[Provider] Text delta: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`)
      }

      // Extract reasoning from chunk
      let reasoning: string | undefined = undefined
      if (chunk.type === 'reasoning-delta') {
        // 尝试不同的属性名
        reasoning = chunkAny.textDelta || chunkAny.delta || chunkAny.text || ''
        console.log(`[Provider] Reasoning delta: "${reasoning.substring(0, 50)}${reasoning.length > 50 ? '...' : ''}"`)

        if (reasoning) {
          accumulatedReasoning.push(reasoning)
        }
      }

      // For reasoning chunks, we yield them separately
      if (chunk.type === 'reasoning-delta') {
        yield { text: '', reasoning }
      } else if (text) {
        yield { text, reasoning: accumulatedReasoning.length > 0 ? accumulatedReasoning.join('') : undefined }
      }
    }

    console.log(`[Provider] Reasoning stream completed. Total chunks: ${chunkCount}`)
  } else {
    // For non-reasoning models, use textStream
    let chunkCount = 0
    for await (const chunk of stream.textStream) {
      chunkCount++
      console.log(`[Provider] Text stream chunk ${chunkCount}: "${chunk.substring(0, 50)}${chunk.length > 50 ? '...' : ''}"`)
      yield { text: chunk }
    }
    console.log(`[Provider] Text stream completed. Total chunks: ${chunkCount}`)
  }
}

/**
 * Generate a chat response with reasoning/thinking content
 * Returns both the response text and any reasoning process
 *
 * For DeepSeek reasoning models, uses streamText to capture reasoning tokens.
 * For other models, uses generateText.
 */
export async function generateChatResponseWithReasoning(
  providerId: string,
  config: { apiKey: string; baseUrl?: string; model: string; apiType?: 'openai' | 'anthropic' },
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<ChatResponseResult> {
  const provider = createProvider(providerId, config)
  const model = provider.createModel(config.model)

  const isReasoning = isReasoningModel(config.model)

  // For DeepSeek reasoning models, use streamText to capture reasoning
  // DeepSeek only exposes reasoning through streaming
  if (isReasoning && providerId === 'deepseek') {
    return generateWithStreamForReasoning(model, messages, options)
  }

  // For non-reasoning models, use generateText
  const generateOptions: Parameters<typeof generateText>[0] = {
    model,
    messages,
    maxOutputTokens: options.maxTokens || 4096,
  }

  // Only add temperature for non-reasoning models
  if (!isReasoning && options.temperature !== undefined) {
    generateOptions.temperature = options.temperature
  }

  const result = await generateText(generateOptions)

  // Extract reasoning content if available (for other providers that might support it)
  let reasoning: string | undefined = undefined

  if (result.reasoning) {
    if (Array.isArray(result.reasoning)) {
      reasoning = result.reasoning
        .map((part: any) => {
          if (typeof part === 'string') return part
          if (part.type === 'text') return part.text
          if (part.content) return part.content
          return ''
        })
        .filter(Boolean)
        .join('\n')
    } else if (typeof result.reasoning === 'string') {
      reasoning = result.reasoning
    } else if ((result.reasoning as any).content) {
      reasoning = (result.reasoning as any).content
    }
  }

  return {
    text: result.text,
    reasoning: reasoning || undefined,
  }
}

/**
 * Use streamText to capture reasoning from DeepSeek reasoning models
 * Collects the full stream and extracts reasoning and text parts
 */
async function generateWithStreamForReasoning(
  model: any,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<ChatResponseResult> {
  const streamOptions: Parameters<typeof streamText>[0] = {
    model,
    messages,
    maxOutputTokens: options.maxTokens || 4096,
  }

  const result = streamText(streamOptions)

  // Collect reasoning and text from the stream
  let reasoningText = ''
  let responseText = ''

  for await (const part of result.fullStream) {
    const partAny = part as any
    // Handle reasoning parts (DeepSeek reasoning model)
    if (part.type === 'reasoning-delta') {
      reasoningText += partAny.textDelta || partAny.delta || partAny.text || ''
    } else if (part.type === 'text-delta') {
      responseText += partAny.textDelta || partAny.delta || partAny.text || ''
    }
  }

  return {
    text: responseText,
    reasoning: reasoningText || undefined,
  }
}

/**
 * Stream callbacks for real-time updates
 */
export interface StreamCallbacks {
  onReasoningDelta?: (delta: string) => void
  onTextDelta?: (delta: string) => void
  onComplete?: (result: ChatResponseResult) => void
  onError?: (error: Error) => void
}


/**
 * Check if a model should use streaming
 * Now returns true for all models to provide faster feedback
 */
export function shouldUseStreaming(providerId: string, modelId: string): boolean {
  // Always use streaming for all models for faster feedback
  return true
}

/**
 * Generate a short title for a chat conversation
 */
export async function generateChatTitle(
  providerId: string,
  config: { apiKey: string; baseUrl?: string; model: string; apiType?: 'openai' | 'anthropic' },
  userMessage: string
): Promise<string> {
  const prompt = `Generate a short, concise title (max 6 words) for a chat conversation that starts with this message. Only respond with the title, nothing else:\n\n"${userMessage}"`

  const response = await generateChatResponse(
    providerId,
    config,
    [{ role: 'user', content: prompt }],
    { temperature: 0.7, maxTokens: 20 }
  )

  // Clean up the title - remove quotes
  return response.trim().replace(/^["']|["']$/g, '')
}

/**
 * Message type for tool-enabled chat
 * Supports regular messages, assistant messages with tool calls, and tool result messages
 */
export type ToolChatMessage =
  | { role: 'user' | 'system'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: Array<{ toolCallId: string; toolName: string; args: Record<string, any> }>; reasoningContent?: string }
  | { role: 'tool'; content: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: any }> }

/**
 * Stream a chat response with tools support
 * Returns an async generator that yields text, reasoning, and tool call chunks
 */
export async function* streamChatResponseWithTools(
  providerId: string,
  config: { apiKey: string; baseUrl?: string; model: string; apiType?: 'openai' | 'anthropic' },
  messages: ToolChatMessage[],
  tools: Record<string, { description: string; parameters: Array<{ name: string; type: string; description: string; required?: boolean; enum?: string[] }> }>,
  options: { temperature?: number; maxTokens?: number } = {}
): AsyncGenerator<StreamChunkWithTools, void, unknown> {
  const provider = createProvider(providerId, config)
  const model = provider.createModel(config.model)

  const isReasoning = isReasoningModel(config.model)

  // Convert our tool definitions to AI SDK format
  // AI SDK expects tools with inputSchema property
  const aiTools: Record<string, any> = {}
  for (const [toolId, toolDef] of Object.entries(tools)) {
    aiTools[toolId] = {
      description: toolDef.description,
      inputSchema: createZodSchema(toolDef.parameters),
    }
  }

  // Convert messages to AI SDK CoreMessage format
  const convertedMessages: any[] = messages.map(msg => {
    if (msg.role === 'user' || msg.role === 'system') {
      return { role: msg.role, content: msg.content }
    }
    if (msg.role === 'assistant') {
      // Assistant message with optional tool calls and reasoning content
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        const content: any[] = []
        if (msg.content) {
          content.push({ type: 'text', text: msg.content })
        }
        for (const tc of msg.toolCalls) {
          content.push({
            type: 'tool-call',
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            input: tc.args || {},  // DeepSeek provider expects 'input' not 'args'
          })
        }
        const assistantMsg: any = { role: 'assistant', content }
        // Include reasoning_content for DeepSeek Reasoner (required for tool calls in thinking mode)
        if (msg.reasoningContent) {
          assistantMsg.reasoning_content = msg.reasoningContent
        }
        return assistantMsg
      }
      return { role: 'assistant', content: msg.content }
    }
    if (msg.role === 'tool') {
      // Tool result message - convert to AI SDK expected format
      // output must have { type: 'text'|'json', value: ... } structure
      return {
        role: 'tool',
        content: msg.content.map((item: any) => ({
          type: item.type,
          toolCallId: item.toolCallId,
          toolName: item.toolName,
          output: { type: 'json', value: item.result },
        })),
      }
    }
    return msg
  })

  // Build streamText options
  const streamOptions: Parameters<typeof streamText>[0] = {
    model,
    messages: convertedMessages,
    tools: Object.keys(aiTools).length > 0 ? aiTools : undefined,
    maxOutputTokens: options.maxTokens || 4096,
  }

  // Only add temperature for non-reasoning models
  if (!isReasoning && options.temperature !== undefined) {
    streamOptions.temperature = options.temperature
  }

  console.log(`[Provider] Starting stream with ${Object.keys(aiTools).length} tools`)
  console.log(`[Provider] Messages count: ${convertedMessages.length}`)
  console.log(`[Provider] Messages:`, JSON.stringify(convertedMessages, null, 2))

  const stream = await streamText(streamOptions)

  // Process the full stream to capture all types of chunks
  for await (const chunk of stream.fullStream) {
    const chunkAny = chunk as any

    switch (chunk.type) {
      case 'text-delta':
        const text = chunkAny.textDelta || chunkAny.delta || chunkAny.text || ''
        if (text) {
          yield { type: 'text', text }
        }
        break

      case 'reasoning-delta':
        const reasoning = chunkAny.textDelta || chunkAny.delta || chunkAny.text || ''
        if (reasoning) {
          yield { type: 'reasoning', reasoning }
        }
        break

      case 'tool-call':
        console.log(`[Provider] Tool call:`, chunkAny)
        yield {
          type: 'tool-call',
          toolCall: {
            toolCallId: chunkAny.toolCallId,
            toolName: chunkAny.toolName,
            args: chunkAny.input || chunkAny.args || {},  // AI SDK uses 'input'
          },
        }
        break

      case 'tool-result':
        console.log(`[Provider] Tool result:`, chunkAny)
        yield {
          type: 'tool-result',
          toolResult: {
            toolCallId: chunkAny.toolCallId,
            result: chunkAny.result,
          },
        }
        break
    }
  }

  console.log(`[Provider] Stream with tools completed`)
}

/**
 * Convert ToolDefinition array to the format expected by streamChatResponseWithTools
 */
export function convertToolDefinitionsForAI(
  toolDefinitions: Array<{
    id: string
    name: string
    description: string
    parameters: Array<{ name: string; type: string; description: string; required?: boolean; enum?: string[] }>
  }>
): Record<string, { description: string; parameters: Array<{ name: string; type: string; description: string; required?: boolean; enum?: string[] }> }> {
  const result: Record<string, any> = {}

  for (const tool of toolDefinitions) {
    result[tool.id] = {
      description: tool.description,
      parameters: tool.parameters,
    }
  }

  return result
}

// Legacy export for backward compatibility
// @deprecated Use getAvailableProviders() instead
export const providerRegistry: Record<string, ProviderInfo> = Object.fromEntries(
  getProvidersFromRegistry().map(p => [p.id, p])
)
