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
import { oauthManager } from '../services/auth/oauth-manager.js'

// Registry storage
const providers = new Map<string, ProviderDefinition>()

// ============ Provider 实例缓存 ============
const providerInstanceCache = new Map<string, {
  instance: ProviderInstance
  createdAt: number
}>()
const PROVIDER_CACHE_TTL = 5 * 60 * 1000  // 5 分钟

function getProviderCacheKey(providerId: string, config: ProviderConfig): string {
  return `${providerId}#${config.apiKey || ''}#${config.baseUrl || ''}`
}

function cleanExpiredProviderCache(): void {
  const now = Date.now()
  for (const [key, value] of providerInstanceCache.entries()) {
    if (now - value.createdAt > PROVIDER_CACHE_TTL) {
      providerInstanceCache.delete(key)
    }
  }
}

/**
 * Invalidate provider cache for a specific provider or all providers
 */
export function invalidateProviderCache(providerId?: string): void {
  if (providerId) {
    for (const key of providerInstanceCache.keys()) {
      if (key.startsWith(providerId + '#')) {
        providerInstanceCache.delete(key)
      }
    }
    console.log(`[Provider] Cache invalidated for: ${providerId}`)
  } else {
    providerInstanceCache.clear()
    console.log('[Provider] All caches invalidated')
  }
}

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
 * Check if a provider requires OAuth
 */
export function requiresOAuth(providerId: string): boolean {
  const definition = providers.get(providerId)
  return definition?.info.requiresOAuth === true
}

/**
 * Get the provider definition
 */
export function getProviderDefinition(providerId: string): ProviderDefinition | undefined {
  return providers.get(providerId)
}

/**
 * Create a provider instance (with caching)
 *
 * @param providerId - The provider ID (built-in or custom-*)
 * @param config - Provider configuration including API key and optional base URL
 * @param apiType - For custom providers, specifies whether to use OpenAI or Anthropic SDK
 */
export function createProviderInstance(
  providerId: string,
  config: ProviderConfig & { apiType?: 'openai' | 'anthropic' }
): ProviderInstance {
  // 清理过期缓存
  cleanExpiredProviderCache()

  const cacheKey = getProviderCacheKey(providerId, config)
  const cached = providerInstanceCache.get(cacheKey)

  // 有缓存直接返回
  if (cached) {
    return cached.instance
  }

  let instance: ProviderInstance

  // Handle user-defined custom providers
  if (providerId.startsWith('custom-')) {
    instance = createCustomProviderInstance(config)
  } else {
    // Look up registered provider
    const definition = providers.get(providerId)
    if (!definition) {
      throw new Error(`Unsupported provider: ${providerId}`)
    }
    instance = definition.create(config)
  }

  // 缓存实例
  providerInstanceCache.set(cacheKey, { instance, createdAt: Date.now() })

  return instance
}

/**
 * Create a provider instance with OAuth support (async)
 * For OAuth providers, this fetches the token first
 */
export async function createProviderInstanceAsync(
  providerId: string,
  config: ProviderConfig & { apiType?: 'openai' | 'anthropic' }
): Promise<ProviderInstance> {
  // Handle user-defined custom providers
  if (providerId.startsWith('custom-')) {
    return createCustomProviderInstance(config)
  }

  // Look up registered provider
  const definition = providers.get(providerId)
  if (!definition) {
    throw new Error(`Unsupported provider: ${providerId}`)
  }

  // Check if this is an OAuth provider
  if (definition.info.requiresOAuth) {
    // Fetch OAuth token
    const token = await oauthManager.refreshTokenIfNeeded(providerId)
    if (!token) {
      throw new Error(`Not logged in to ${definition.info.name}. Please login first.`)
    }

    // Create provider with OAuth token
    return definition.create({
      ...config,
      oauthToken: token,
    })
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
