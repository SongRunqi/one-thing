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
 * Chat response result with optional reasoning/thinking content
 */
export interface ChatResponseResult {
  text: string
  reasoning?: string  // Thinking/reasoning process if available
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
    // Handle reasoning parts (DeepSeek reasoning model)
    if (part.type === 'reasoning-delta') {
      reasoningText += part.text || ''
    } else if (part.type === 'text-delta') {
      responseText += part.text || ''
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
 * Generate a streaming chat response with reasoning
 * Provides real-time callbacks for reasoning and text deltas
 * For all models (not just reasoning models) to provide faster feedback
 */
export async function streamChatResponseWithReasoning(
  providerId: string,
  config: { apiKey: string; baseUrl?: string; model: string; apiType?: 'openai' | 'anthropic' },
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  callbacks: StreamCallbacks,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<ChatResponseResult> {
  const provider = createProvider(providerId, config)
  const model = provider.createModel(config.model)

  const isReasoning = isReasoningModel(config.model)

  const streamOptions: Parameters<typeof streamText>[0] = {
    model,
    messages,
    maxOutputTokens: options.maxTokens || 4096,
  }

  // Only add temperature for non-reasoning models
  if (!isReasoning && options.temperature !== undefined) {
    streamOptions.temperature = options.temperature
  }

  try {
    const result = streamText(streamOptions)

    let reasoningText = ''
    let responseText = ''

    for await (const part of result.fullStream) {
      if (part.type === 'reasoning-delta') {
        const delta = part.text || ''
        reasoningText += delta
        callbacks.onReasoningDelta?.(delta)
      } else if (part.type === 'text-delta') {
        const delta = part.text || ''
        responseText += delta
        callbacks.onTextDelta?.(delta)
      }
    }

    const finalResult: ChatResponseResult = {
      text: responseText,
      reasoning: reasoningText || undefined,
    }

    callbacks.onComplete?.(finalResult)
    return finalResult
  } catch (error: any) {
    callbacks.onError?.(error)
    throw error
  }
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

// Legacy export for backward compatibility
// @deprecated Use getAvailableProviders() instead
export const providerRegistry: Record<string, ProviderInfo> = Object.fromEntries(
  getProvidersFromRegistry().map(p => [p.id, p])
)
