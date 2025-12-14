/**
 * Provider Type Definitions
 *
 * Types used to define AI providers in a plugin-like fashion.
 */

import type { LanguageModel } from 'ai'

/**
 * Provider metadata for UI display
 */
export interface ProviderInfo {
  id: string
  name: string
  description: string
  defaultBaseUrl: string
  defaultModel: string
  /** Icon identifier used by the frontend */
  icon: string
  /** Whether this provider supports custom base URL */
  supportsCustomBaseUrl: boolean
  /** Whether this provider requires an API key */
  requiresApiKey: boolean
}

/**
 * Configuration passed when creating a provider instance
 */
export interface ProviderConfig {
  apiKey: string
  baseUrl?: string
}

/**
 * Provider instance with model creation capability
 */
export interface ProviderInstance {
  createModel: (modelId: string) => LanguageModel
}

/**
 * Factory function type for creating provider instances
 */
export type ProviderCreator = (config: ProviderConfig) => ProviderInstance

/**
 * Complete provider definition
 * This is what each provider file exports
 */
export interface ProviderDefinition {
  /** Unique identifier for the provider */
  id: string
  /** Provider metadata for UI display */
  info: ProviderInfo
  /** Factory function to create provider instances */
  create: ProviderCreator
}
