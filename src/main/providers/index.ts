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

import { generateText, streamText, convertToModelMessages, wrapLanguageModel, type LanguageModel } from 'ai'
import type { UIMessage as AISDKUIMessage } from 'ai'
import { devToolsMiddleware } from '@ai-sdk/devtools'
import { z } from 'zod'
import { app } from 'electron'

/**
 * Wrap model with DevTools middleware in development mode
 * This enables inspection at http://localhost:4983 via `npx @ai-sdk/devtools`
 */
function wrapWithDevTools<T extends LanguageModel>(model: T): T {
  if (app.isPackaged) return model
   
  return wrapLanguageModel({
    model: model as any,
    middleware: devToolsMiddleware(),
  }) as any
}
import {
  initializeRegistry,
  getAvailableProviders as getProvidersFromRegistry,
  getProviderInfo as getInfoFromRegistry,
  isProviderSupported as isSupportedFromRegistry,
  createProviderInstance,
  createProviderInstanceAsync,
  requiresSystemMerge as requiresSystemMergeFromRegistry,
  requiresOAuth as requiresOAuthFromRegistry,
  getProviderDefinition,
} from './registry.js'
import { modelSupportsReasoningSync } from '../services/ai/model-registry.js'
import type { ProviderInfo, ProviderConfig } from './types.js'
import { oauthManager } from '../services/auth/oauth-manager.js'

// Multimodal content type for AI messages (Vercel AI SDK 5.x format)
export type AIMessageContent = string | Array<
  | { type: 'text'; text: string }
  | { type: 'image'; image: string; mediaType?: string }  // AI SDK 5.x uses 'mediaType'
  | { type: 'file'; data: string; mediaType: string }      // AI SDK 5.x uses 'mediaType'
>

// Format messages for logging without full base64 data
function formatMessagesForLog(messages: unknown[]): unknown[] {
  return messages.map(msg => {
    const m = msg as Record<string, unknown>
    if (Array.isArray(m.content)) {
      return {
        ...m,
        content: m.content.map((part: Record<string, unknown>) => {
          if (part.type === 'image' && typeof part.image === 'string') {
            const imgStr = part.image as string
            return { ...part, image: imgStr.substring(0, 50) + `... (${imgStr.length} chars)` }
          }
          return part
        }),
      }
    }
    return m
  })
}

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
 * Check if a provider requires OAuth authentication
 */
export function requiresOAuth(providerId: string): boolean {
  return requiresOAuthFromRegistry(providerId)
}

/**
 * Get OAuth config for an OAuth provider
 * Returns the OAuth token as apiKey for providers that support it
 */
export async function getOAuthProviderConfig(
  providerId: string,
  baseConfig: { baseUrl?: string; model?: string }
): Promise<{ apiKey: string; baseUrl?: string } | null> {
  if (!requiresOAuth(providerId)) {
    return null
  }

  try {
    const token = await oauthManager.refreshTokenIfNeeded(providerId)
    if (!token) {
      return null
    }

    return {
      apiKey: token.accessToken,
      baseUrl: baseConfig.baseUrl,
    }
  } catch (error) {
    console.error(`Failed to get OAuth config for ${providerId}:`, error)
    return null
  }
}

/**
 * Create a provider instance
 * For user-defined custom providers (IDs starting with 'custom-'), use apiType to determine the SDK
 */
export function createProvider(
  providerId: string,
  config: { apiKey?: string; baseUrl?: string; apiType?: 'openai' | 'anthropic' }
) {
  return createProviderInstance(providerId, config as ProviderConfig & { apiType?: 'openai' | 'anthropic' })
}

/**
 * Create a provider instance with OAuth support (async)
 * For OAuth providers, automatically fetches and refreshes tokens
 */
export async function createProviderAsync(
  providerId: string,
  config: { apiKey?: string; baseUrl?: string; apiType?: 'openai' | 'anthropic' }
) {
  return createProviderInstanceAsync(providerId, config as ProviderConfig & { apiType?: 'openai' | 'anthropic' })
}

/**
 * Check if a model is a reasoning/thinking model that doesn't support temperature
 * Uses Models.dev data for accurate detection, falls back to name patterns
 */
function isReasoningModel(modelId: string, providerId?: string): boolean {
  return modelSupportsReasoningSync(modelId, providerId)
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
 * Includes streaming tool input chunks for real-time parameter display
 */
export interface StreamChunkWithTools {
  type: 'text' | 'reasoning' | 'tool-call' | 'tool-result' | 'finish'
    | 'tool-input-start' | 'tool-input-delta' | 'tool-input-end'
  text?: string
  reasoning?: string
  toolCall?: AIToolCall
  toolResult?: {
    toolCallId: string
    result: any
  }
  /** Streaming tool input - start event */
  toolInputStart?: { toolCallId: string; toolName: string }
  /** Streaming tool input - incremental JSON delta */
  toolInputDelta?: { toolCallId: string; argsTextDelta: string }
  /** Streaming tool input - end event */
  toolInputEnd?: { toolCallId: string }
  /** Finish reason from AI model - used for loop control */
  finishReason?: 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error' | 'other' | 'unknown'
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
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
  const model = wrapWithDevTools(provider.createModel(config.model))

  const isReasoning = isReasoningModel(config.model, providerId)

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

// Chunk types for streamChatResponseWithReasoning
export type ReasoningStreamChunk =
  | { type: 'text'; text: string; reasoning?: string }
  | { type: 'finish'; usage: { inputTokens: number; outputTokens: number; totalTokens: number } }

/**
 * Stream a chat response with reasoning/thinking content
 * Returns an async generator that yields text and reasoning chunks, plus finish with usage
 */
export async function* streamChatResponseWithReasoning(
  providerId: string,
  config: { apiKey: string; baseUrl?: string; model: string; apiType?: 'openai' | 'anthropic' },
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: AIMessageContent; reasoningContent?: string }>,
  options: { temperature?: number; maxTokens?: number; abortSignal?: AbortSignal } = {}
): AsyncGenerator<ReasoningStreamChunk, void, unknown> {
  const provider = createProvider(providerId, config)
  const model = wrapWithDevTools(provider.createModel(config.model))

  const isReasoning = isReasoningModel(config.model, providerId)

  // Convert messages to include reasoning_content for DeepSeek Reasoner
  const convertedMessages = messages.map(msg => {
    if (msg.role === 'assistant' && msg.reasoningContent) {
      return {
        role: msg.role,
        content: msg.content,
        reasoning_content: msg.reasoningContent,
      } as any
    }
    return { role: msg.role, content: msg.content }
  })

  // Build streamText options
  const streamOptions: Parameters<typeof streamText>[0] = {
    model,
    messages: convertedMessages,
    maxOutputTokens: options.maxTokens || 4096,
  }

  // Only add temperature for non-reasoning models
  if (!isReasoning && options.temperature !== undefined) {
    streamOptions.temperature = options.temperature
  }

  // Add abort signal if provided
  if (options.abortSignal) {
    streamOptions.abortSignal = options.abortSignal
  }

  console.log(`[Provider] streamChatResponseWithReasoning - providerId: ${providerId}, model: ${config.model}`)
  console.log(`[Provider] Messages being sent:`, JSON.stringify(formatMessagesForLog(convertedMessages), null, 2))

  const stream = await streamText(streamOptions)

  // For reasoning models, use fullStream to capture reasoning
  // For non-reasoning models, use textStream for simplicity
  if (isReasoning) {
    let accumulatedReasoning: string[] = []
    let chunkCount = 0

    for await (const chunk of stream.fullStream) {
      chunkCount++
      const chunkAny = chunk as any

      // Extract text from chunk
      let text = ''
      if (chunk.type === 'text-delta') {
        text = chunkAny.textDelta || chunkAny.delta || chunkAny.text || ''
      }

      // Extract reasoning from chunk
      let reasoning: string | undefined = undefined
      if (chunk.type === 'reasoning-delta') {
        reasoning = chunkAny.textDelta || chunkAny.delta || chunkAny.text || ''
        if (reasoning) {
          accumulatedReasoning.push(reasoning)
        }
      }

      // Handle error chunks
      if (chunk.type === 'error') {
        const streamError = chunkAny.error || new Error('Unknown stream error')
        console.error(`[Provider] Stream error in reasoning stream:`, streamError)
        throw streamError
      }

      // For reasoning chunks, we yield them separately
      if (chunk.type === 'reasoning-delta') {
        yield { type: 'text' as const, text: '', reasoning }
      } else if (text) {
        yield { type: 'text' as const, text, reasoning: accumulatedReasoning.length > 0 ? accumulatedReasoning.join('') : undefined }
      }
    }

  } else {
    // For non-reasoning models, use fullStream to capture errors
    // (textStream silently swallows errors)
    let chunkCount = 0
    for await (const chunk of stream.fullStream) {
      chunkCount++
      const chunkAny = chunk as any

      if (chunk.type === 'text-delta') {
        const text = chunkAny.textDelta || ''
        if (text) {
          yield { type: 'text' as const, text }
        }
      } else if (chunk.type === 'file') {
        // Handle file chunks (e.g., generated images from Gemini)
        const file = chunkAny.file
        console.log(`[Provider] File chunk: mediaType=${file?.mediaType}, dataLength=${file?.base64?.length || file?.uint8Array?.length || 'unknown'}`)
        if (file) {
          // Convert to base64 data URL for display
          let base64Data = file.base64
          if (!base64Data && file.uint8Array) {
            // Convert Uint8Array to base64
            base64Data = Buffer.from(file.uint8Array).toString('base64')
          }
          if (base64Data) {
            const mediaType = file.mediaType || 'image/png'
            const dataUrl = `data:${mediaType};base64,${base64Data}`
            // Yield as markdown image for display
            yield { type: 'text' as const, text: `![Generated Image](${dataUrl})` }
          }
        }
      } else if (chunk.type === 'error') {
        // Handle stream errors - throw to be caught by caller
        const streamError = chunkAny.error || new Error('Unknown stream error')
        console.error(`[Provider] Stream error in simple stream:`, streamError)
        throw streamError
      }
    }
  }

  // Get usage data after stream completes and yield finish chunk
  try {
    const usage = await stream.usage
    yield {
      type: 'finish' as const,
      usage: {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
      },
    }
  } catch (usageError) {
    console.warn(`[Provider] Failed to get usage data from stream:`, usageError)
    yield { type: 'finish' as const, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } }
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
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: AIMessageContent; reasoningContent?: string }>,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<ChatResponseResult> {
  const provider = createProvider(providerId, config)
  const model = wrapWithDevTools(provider.createModel(config.model))

  const isReasoning = isReasoningModel(config.model, providerId)

  // Convert messages to include reasoning_content for DeepSeek Reasoner
  const convertedMessages = messages.map(msg => {
    if (msg.role === 'assistant' && msg.reasoningContent) {
      return {
        role: msg.role,
        content: msg.content,
        reasoning_content: msg.reasoningContent,
      } as any
    }
    return { role: msg.role, content: msg.content }
  })

  // For DeepSeek reasoning models, use streamText to capture reasoning
  // DeepSeek only exposes reasoning through streaming
  if (isReasoning && providerId === 'deepseek') {
    return generateWithStreamForReasoning(model, convertedMessages, options)
  }

  // For non-reasoning models, use generateText
  const generateOptions: Parameters<typeof generateText>[0] = {
    model,
    messages: convertedMessages,
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
  | { role: 'user' | 'system'; content: AIMessageContent }
  | { role: 'assistant'; content: AIMessageContent; toolCalls?: Array<{ toolCallId: string; toolName: string; args: Record<string, any> }>; reasoningContent?: string }
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
  options: { temperature?: number; maxTokens?: number; abortSignal?: AbortSignal } = {}
): AsyncGenerator<StreamChunkWithTools, void, unknown> {
  const provider = createProvider(providerId, config)
  const model = wrapWithDevTools(provider.createModel(config.model))

  const isReasoning = isReasoningModel(config.model, providerId)

  // Convert our tool definitions to AI SDK format
  // AI SDK expects tools with inputSchema property
  const aiTools: Record<string, any> = {}
  for (const [toolId, toolDef] of Object.entries(tools)) {
    aiTools[toolId] = {
      description: toolDef.description,
      inputSchema: createZodSchema(toolDef.parameters),
    }
  }

  // Check if this is a DeepSeek Reasoner model (requires reasoning_content in all assistant messages)
  const isDeepSeekReasoner = isReasoning && config.model.toLowerCase().includes('deepseek')

  // Check if this provider requires system messages to be merged into user messages
  const needsSystemMerge = requiresSystemMergeFromRegistry(providerId)

  // Convert messages to AI SDK CoreMessage format
  // For DeepSeek Reasoner, reasoning must be included as { type: 'reasoning', text: ... } parts
  // in the content array, not as a separate reasoning_content field
  let convertedMessages: any[] = messages.map(msg => {
    if (msg.role === 'system') {
      // AI SDK 5.x requires system content to be a string
      const content = typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n')
          : String(msg.content)
      return { role: 'system', content }
    }
    if (msg.role === 'user') {
      // User messages can be string or array of content parts
      return { role: 'user', content: msg.content }
    }
    if (msg.role === 'assistant') {
      // Check if we need complex content format (reasoning or tool calls)
      const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0
      const hasReasoning = isDeepSeekReasoner && msg.reasoningContent

      // For simple text-only responses, use string content (compatible with all APIs)
      if (!hasToolCalls && !hasReasoning) {
        return { role: 'assistant', content: msg.content || '' }
      }

      // Build content array with reasoning, text, and tool calls
      const content: any[] = []

      // For DeepSeek Reasoner, reasoning must be included as a content part
      // The provider's convertToDeepSeekChatMessages extracts { type: 'reasoning' } parts
      // and converts them to reasoning_content for the API
      if (hasReasoning) {
        content.push({ type: 'reasoning', text: msg.reasoningContent })
      }

      // Add text content (handle both string and array content)
      if (msg.content) {
        if (typeof msg.content === 'string') {
          content.push({ type: 'text', text: msg.content })
        } else if (Array.isArray(msg.content)) {
          // Content is already an array of content parts (multimodal)
          content.push(...msg.content)
        }
      }

      // Add tool calls
      if (hasToolCalls) {
        for (const tc of msg.toolCalls!) {
          // Sanitize args to ensure valid JSON (remove undefined values)
          let sanitizedInput: any
          try {
            sanitizedInput = JSON.parse(JSON.stringify(tc.args ?? {}))
          } catch {
            sanitizedInput = {}
          }
          content.push({
            type: 'tool-call',
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            input: sanitizedInput,  // AI SDK 5.x requires 'input', not 'args'
          })
        }
      }

      // If no content parts, use empty string for content (required by API)
      if (content.length === 0) {
        return { role: 'assistant', content: '' }
      }

      return { role: 'assistant', content }
    }
    if (msg.role === 'tool') {
      // Tool result message - convert to AI SDK 5.x format
      // AI SDK 5.x requires 'output' with { type: 'json', value: ... } structure
      // IMPORTANT: Must sanitize the result to remove undefined values (not valid JSON)
      return {
        role: 'tool',
        content: msg.content.map((item: any) => {
          // Sanitize the result by going through JSON serialization
          // This removes undefined values and ensures it's valid JSON
          let sanitizedResult: any
          try {
            sanitizedResult = JSON.parse(JSON.stringify(item.result ?? null))
          } catch {
            sanitizedResult = String(item.result)
          }
          return {
            type: item.type,
            toolCallId: item.toolCallId,
            toolName: item.toolName,
            output: { type: 'json', value: sanitizedResult },
          }
        }),
      }
    }
    return msg
  })

  // For providers that require system merge (like Zhipu), merge system messages into first user message
  if (needsSystemMerge && convertedMessages.length > 0) {
    const systemMessages: string[] = []
    const nonSystemMessages: any[] = []

    for (const msg of convertedMessages) {
      if (msg.role === 'system') {
        systemMessages.push(msg.content)
      } else {
        nonSystemMessages.push(msg)
      }
    }

    // If we have system messages and at least one user message, merge them
    if (systemMessages.length > 0 && nonSystemMessages.length > 0) {
      const firstUserIndex = nonSystemMessages.findIndex(m => m.role === 'user')
      if (firstUserIndex !== -1) {
        const systemPrefix = systemMessages.join('\n\n')
        const originalContent = nonSystemMessages[firstUserIndex].content
        nonSystemMessages[firstUserIndex] = {
          ...nonSystemMessages[firstUserIndex],
          content: `[System Instructions]\n${systemPrefix}\n\n[User Message]\n${originalContent}`,
        }
        convertedMessages = nonSystemMessages
        console.log(`[Provider] Merged ${systemMessages.length} system message(s) into first user message for ${providerId}`)
      }
    }
  }

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

  // Add abort signal if provided
  if (options.abortSignal) {
    streamOptions.abortSignal = options.abortSignal
  }

  // Log complete request body being sent to AI
  const requestBodyForLog = {
    model: config.model,
    messages: convertedMessages,
    tools: streamOptions.tools ? Object.fromEntries(
      Object.entries(streamOptions.tools).map(([id, tool]) => {
        const t = tool as any
        return [id, {
          description: t.description,
          parameters: t.inputSchema?.toJSONSchema ? t.inputSchema.toJSONSchema() : null,
        }]
      })
    ) : undefined,
    temperature: streamOptions.temperature,
    maxOutputTokens: streamOptions.maxOutputTokens,
  }
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
        yield {
          type: 'tool-call',
          toolCall: {
            toolCallId: chunkAny.toolCallId,
            toolName: chunkAny.toolName,
            args: chunkAny.input || chunkAny.args || {},
          },
        }
        break

      case 'tool-result':
        yield {
          type: 'tool-result',
          toolResult: {
            toolCallId: chunkAny.toolCallId,
            result: chunkAny.result,
          },
        }
        break

      case 'tool-input-start':
        const startToolCallId = chunkAny.toolCallId || chunkAny.id
        yield {
          type: 'tool-input-start',
          toolInputStart: {
            toolCallId: startToolCallId,
            toolName: chunkAny.toolName,
          },
        }
        break

      case 'tool-input-delta':
        yield {
          type: 'tool-input-delta',
          toolInputDelta: {
            toolCallId: chunkAny.toolCallId || chunkAny.id,
            argsTextDelta: chunkAny.inputTextDelta || '',
          },
        }
        break

      case 'error':
        // Handle stream errors - throw to be caught by caller
        // OpenAI Responses API error structure: { type: 'error', error: { message, code, type } }
        const rawError = chunkAny.error || chunkAny
        console.error(`[Provider] Stream error chunk received:`, rawError)

        // Extract error message from various possible structures
        const errorMessage = rawError?.message ||
          rawError?.error?.message ||
          (typeof rawError === 'string' ? rawError : 'Unknown stream error')
        const errorCode = rawError?.code || rawError?.error?.code || rawError?.error?.type

        console.error(`[Provider] Error message:`, errorMessage, `Code:`, errorCode)

        // Create a proper Error with the message
        const streamError = new Error(errorMessage)
        ;(streamError as any).code = errorCode
        ;(streamError as any).data = rawError
        throw streamError
    }
  }

  // Get usage data and finish reason after stream completes
  try {
    const [usage, finishReason] = await Promise.all([
      stream.usage,
      stream.finishReason,
    ])
    yield {
      type: 'finish',
      finishReason: finishReason || 'unknown',
      usage: {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
      },
    }
  } catch (usageError) {
    console.warn(`[Provider] Failed to get usage/finishReason:`, usageError)
    // Yield finish chunk without usage if we can't get it
    yield { type: 'finish', finishReason: 'unknown' }
  }
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

// ============================================================================
// UIMessage-based streaming (AI SDK 5.x native format)
// ============================================================================

/**
 * UIMessage 格式的消息（兼容 AI SDK 5.x）
 * 我们的 UIMessage 类型需要转换为 AI SDK 期望的格式
 */
import type { UIMessage } from '../../shared/ipc.js'

/**
 * 将我们的 UIMessage 转换为 AI SDK 期望的格式
 * AI SDK 的 convertToModelMessages 期望 { id, role, parts } 格式
 */
function convertOurUIMessageToAISDK(messages: UIMessage[]): AISDKUIMessage[] {
  return messages.map(msg => {
    // 将我们的 parts 转换为 AI SDK 格式
    const parts = msg.parts.map(part => {
      switch (part.type) {
        case 'text':
          return { type: 'text' as const, text: part.text }
        case 'reasoning':
          return { type: 'reasoning' as const, text: part.text }
        case 'file':
          return {
            type: 'file' as const,
            mediaType: part.mediaType,
            url: part.url,
          }
        default:
          // 工具调用 parts (type 以 'tool-' 开头)
          if (part.type.startsWith('tool-')) {
            const toolPart = part as any
            return {
              type: `tool-${toolPart.toolName}` as const,
              toolInvocation: {
                toolCallId: toolPart.toolCallId,
                toolName: toolPart.toolName,
                state: toolPart.state,
                args: toolPart.input,
                result: toolPart.output,
              },
            }
          }
          // 跳过 steps 和 error parts（它们是我们自定义的扩展）
          return null
      }
    }).filter(Boolean) as any[]

    return {
      id: msg.id,
      role: msg.role,
      parts,
    } as AISDKUIMessage
  })
}

/**
 * Stream chat response using UIMessage format directly
 * Uses AI SDK's convertToModelMessages for proper message conversion
 *
 * This is the new preferred way to stream chat responses
 */
export async function* streamChatWithUIMessages(
  providerId: string,
  config: { apiKey: string; baseUrl?: string; model: string; apiType?: 'openai' | 'anthropic' },
  uiMessages: UIMessage[],
  tools: Record<string, { description: string; parameters: Array<{ name: string; type: string; description: string; required?: boolean; enum?: string[] }> }>,
  options: { temperature?: number; maxTokens?: number; abortSignal?: AbortSignal } = {}
): AsyncGenerator<StreamChunkWithTools, void, unknown> {
  const provider = createProvider(providerId, config)
  const model = wrapWithDevTools(provider.createModel(config.model))

  const isReasoning = isReasoningModel(config.model, providerId)

  // Convert our tool definitions to AI SDK format
  const aiTools: Record<string, any> = {}
  for (const [toolId, toolDef] of Object.entries(tools)) {
    aiTools[toolId] = {
      description: toolDef.description,
      inputSchema: createZodSchema(toolDef.parameters),
    }
  }

  // Convert our UIMessage to AI SDK UIMessage format
  const aiSDKMessages = convertOurUIMessageToAISDK(uiMessages)

  // Use AI SDK's convertToModelMessages to convert UIMessages to ModelMessages
  // This handles all the complexity of converting parts to the correct format
  let modelMessages
  try {
    modelMessages = convertToModelMessages(aiSDKMessages)
    console.log(`[Provider] UIMessage -> ModelMessage conversion successful`)
    console.log(`[Provider] ModelMessages:`, JSON.stringify(formatMessagesForLog(modelMessages), null, 2))
  } catch (error) {
    console.error(`[Provider] Failed to convert UIMessages to ModelMessages:`, error)
    throw error
  }

  // Check if this provider requires system messages to be merged into user messages
  const needsSystemMerge = requiresSystemMergeFromRegistry(providerId)

  // For providers that require system merge, handle it
  if (needsSystemMerge && modelMessages.length > 0) {
    const systemMessages: string[] = []
    const nonSystemMessages: any[] = []

    for (const msg of modelMessages) {
      if (msg.role === 'system') {
        systemMessages.push(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content))
      } else {
        nonSystemMessages.push(msg)
      }
    }

    if (systemMessages.length > 0 && nonSystemMessages.length > 0) {
      const firstUserIndex = nonSystemMessages.findIndex(m => m.role === 'user')
      if (firstUserIndex !== -1) {
        const systemPrefix = systemMessages.join('\n\n')
        const originalContent = nonSystemMessages[firstUserIndex].content
        const mergedContent = typeof originalContent === 'string'
          ? `[System Instructions]\n${systemPrefix}\n\n[User Message]\n${originalContent}`
          : [{ type: 'text', text: `[System Instructions]\n${systemPrefix}\n\n[User Message]\n` }, ...originalContent]
        nonSystemMessages[firstUserIndex] = {
          ...nonSystemMessages[firstUserIndex],
          content: mergedContent,
        }
        modelMessages = nonSystemMessages
        console.log(`[Provider] Merged ${systemMessages.length} system message(s) for ${providerId}`)
      }
    }
  }

  // Build streamText options
  const streamOptions: Parameters<typeof streamText>[0] = {
    model,
    messages: modelMessages,
    tools: Object.keys(aiTools).length > 0 ? aiTools : undefined,
    maxOutputTokens: options.maxTokens || 4096,
  }

  // Only add temperature for non-reasoning models
  if (!isReasoning && options.temperature !== undefined) {
    streamOptions.temperature = options.temperature
  }

  // Add abort signal if provided
  if (options.abortSignal) {
    streamOptions.abortSignal = options.abortSignal
  }

  console.log(`[Provider] Starting stream with UIMessages - model: ${config.model}`)

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
        yield {
          type: 'tool-call',
          toolCall: {
            toolCallId: chunkAny.toolCallId,
            toolName: chunkAny.toolName,
            args: chunkAny.input || chunkAny.args || {},
          },
        }
        break

      case 'tool-result':
        yield {
          type: 'tool-result',
          toolResult: {
            toolCallId: chunkAny.toolCallId,
            result: chunkAny.result,
          },
        }
        break

      // Streaming tool input chunks (AI SDK v6)
      case 'tool-input-start':
        const uiStartToolCallId = chunkAny.toolCallId || chunkAny.id
        console.log(`[Provider] UIMessage tool input start:`, uiStartToolCallId, chunkAny.toolName)
        yield {
          type: 'tool-input-start',
          toolInputStart: {
            toolCallId: uiStartToolCallId,
            toolName: chunkAny.toolName,
          },
        }
        break

      case 'tool-input-delta':
        yield {
          type: 'tool-input-delta',
          toolInputDelta: {
            toolCallId: chunkAny.toolCallId || chunkAny.id,
            argsTextDelta: chunkAny.inputTextDelta || '',
          },
        }
        break

      case 'error':
        // OpenAI Responses API error structure: { type: 'error', error: { message, code, type } }
        const rawStreamError = chunkAny.error || chunkAny
        console.error(`[Provider] Stream error:`, rawStreamError)

        // Extract error message from various possible structures
        const streamErrorMessage = rawStreamError?.message ||
          rawStreamError?.error?.message ||
          (typeof rawStreamError === 'string' ? rawStreamError : 'Unknown stream error')
        const streamErrorCode = rawStreamError?.code || rawStreamError?.error?.code || rawStreamError?.error?.type

        console.error(`[Provider] Error message:`, streamErrorMessage, `Code:`, streamErrorCode)

        // Create a proper Error with the message
        const uiStreamError = new Error(streamErrorMessage)
        ;(uiStreamError as any).code = streamErrorCode
        ;(uiStreamError as any).data = rawStreamError
        throw uiStreamError
    }
  }

  // Get usage data and finish reason after stream completes
  try {
    const [usage, finishReason] = await Promise.all([
      stream.usage,
      stream.finishReason,
    ])
    yield {
      type: 'finish',
      finishReason: finishReason || 'unknown',
      usage: {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
      },
    }
    console.log(`[Provider] UIMessage stream completed, finishReason: ${finishReason}, usage:`, usage)
  } catch (usageError) {
    console.warn(`[Provider] Failed to get usage/finishReason:`, usageError)
    // Yield finish chunk without usage if we can't get it
    yield { type: 'finish', finishReason: 'unknown' }
  }
}

// Legacy export for backward compatibility
// @deprecated Use getAvailableProviders() instead
export const providerRegistry: Record<string, ProviderInfo> = Object.fromEntries(
  getProvidersFromRegistry().map(p => [p.id, p])
)
