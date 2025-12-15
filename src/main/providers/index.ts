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

import { generateText } from 'ai'
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

  // Build generateText options
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

  // Extract reasoning content if available
  // AI SDK stores reasoning in different formats depending on the provider:
  // - DeepSeek: result.reasoning (array of ReasoningPart) or result.reasoning as string
  // - Other providers may use experimental_reasoning
  let reasoning: string | undefined = undefined

  if (result.reasoning) {
    // Handle array of reasoning parts (AI SDK format for streaming)
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

  // Fallback to experimental_reasoning if reasoning is not found
  if (!reasoning && (result as any).experimental_reasoning) {
    const expReasoning = (result as any).experimental_reasoning
    if (typeof expReasoning === 'string') {
      reasoning = expReasoning
    } else if (expReasoning.content) {
      reasoning = expReasoning.content
    }
  }

  return {
    text: result.text,
    reasoning: reasoning || undefined,
  }
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
