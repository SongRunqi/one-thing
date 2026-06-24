/**
 * Provider Registry
 *
 * Central registry for all AI providers. Manages registration,
 * lookup, and instantiation of providers.
 */

import { builtinProviders } from './builtin/index.js'
import type { ProviderDefinition, ProviderInfo } from './types.js'

// Registry storage
const providers = new Map<string, ProviderDefinition>()

/**
 * Invalidate provider cache for a specific provider or all providers
 */
export function invalidateProviderCache(providerId?: string): void {
  if (providerId) {
    console.log(`[Provider] Cache invalidated for: ${providerId}`)
  } else {
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

// Export types for convenience
export type { ProviderDefinition, ProviderInfo, ProviderConfig } from './types.js'
