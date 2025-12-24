/**
 * Provider Registry
 *
 * Central registry for all AI providers. Manages registration,
 * lookup, and instantiation of providers.
 */

import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { builtinProviders } from './builtin/index.js'
import type { ProviderDefinition, ProviderInfo, ProviderInstance, ProviderConfig } from './types.js'

// Registry storage
const providers = new Map<string, ProviderDefinition>()

/**
 * Initialize the registry with built-in providers
 */
export function initializeRegistry(): void {
  for (const provider of builtinProviders) {
    registerProvider(provider)
  }
}

/**
 * Register a provider definition
 */
export function registerProvider(definition: ProviderDefinition): void {
  if (providers.has(definition.id)) {
    console.warn(`Provider ${definition.id} is already registered. Overwriting.`)
  }
  providers.set(definition.id, definition)
}

/**
 * Unregister a provider
 */
export function unregisterProvider(providerId: string): boolean {
  return providers.delete(providerId)
}

/**
 * Get all registered provider info (for UI display)
 */
export function getAvailableProviders(): ProviderInfo[] {
  return Array.from(providers.values()).map(p => p.info)
}

/**
 * Get provider info by ID
 */
export function getProviderInfo(providerId: string): ProviderInfo | undefined {
  return providers.get(providerId)?.info
}

/**
 * Check if a provider is registered
 * Note: Custom providers (IDs starting with 'custom-') are dynamically supported
 */
export function isProviderSupported(providerId: string): boolean {
  return providers.has(providerId) || providerId.startsWith('custom-')
}

/**
 * Check if a provider requires system messages to be merged into user messages
 * Some APIs (like Zhipu) don't support system role when using tools
 */
export function requiresSystemMerge(providerId: string): boolean {
  const definition = providers.get(providerId)
  return definition?.requiresSystemMerge === true
}

/**
 * Create a provider instance
 *
 * @param providerId - The provider ID (built-in or custom-*)
 * @param config - Provider configuration including API key and optional base URL
 * @param apiType - For custom providers, specifies whether to use OpenAI or Anthropic SDK
 */
export function createProviderInstance(
  providerId: string,
  config: ProviderConfig & { apiType?: 'openai' | 'anthropic' }
): ProviderInstance {
  // Handle user-defined custom providers
  if (providerId.startsWith('custom-')) {
    return createCustomProviderInstance(config)
  }

  // Look up registered provider
  const definition = providers.get(providerId)
  if (!definition) {
    throw new Error(`Unsupported provider: ${providerId}`)
  }

  return definition.create(config)
}

/**
 * Create an instance for a user-defined custom provider
 */
function createCustomProviderInstance(
  config: ProviderConfig & { apiType?: 'openai' | 'anthropic' }
): ProviderInstance {
  const apiType = config.apiType || 'openai'

  if (apiType === 'anthropic') {
    const provider = createAnthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    })
    return {
      createModel: (modelId: string) => provider(modelId),
    }
  }

  // Default to OpenAI-compatible API
  if (!config.baseUrl) {
    throw new Error('Custom provider requires a base URL')
  }

  const provider = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  })
  return {
    // Use provider.chat() for OpenAI-compatible APIs (chat/completions endpoint)
    createModel: (modelId: string) => provider.chat(modelId),
  }
}

// Export types for convenience
export type { ProviderDefinition, ProviderInfo, ProviderInstance, ProviderConfig } from './types.js'
