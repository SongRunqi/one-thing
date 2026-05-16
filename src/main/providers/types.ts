/**
 * Provider Type Definitions
 *
 * Types used to define AI providers in a plugin-like fashion.
 */

import type { LanguageModel } from 'ai'
import type { OAuthFlowType, OAuthToken, OpenRouterModel } from '../../shared/ipc.js'
import type { ProviderAuthContext } from '../auth/types.js'

// Re-export from shared for consistency
export type { OpenRouterModel } from '../../shared/ipc.js'

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
  /** Whether this provider uses OAuth instead of API key */
  requiresOAuth?: boolean
  /** Type of OAuth flow (PKCE or Device) */
  oauthFlow?: OAuthFlowType
  /** Available models with their capabilities (fetched dynamically from OpenRouter) */
  models?: OpenRouterModel[]
}

/**
 * Configuration passed when creating a provider instance
 */
export interface ProviderConfig {
  apiKey?: string  // Optional for OAuth providers
  baseUrl?: string
  /** OAuth token (for OAuth providers) */
  oauthToken?: OAuthToken
  /** Resolved auth context for runtime provider adapters */
  authContext?: ProviderAuthContext
}

/**
 * Provider instance with model creation capability
 */
export interface ProviderInstance {
  createModel: (modelId: string) => LanguageModel
}

export type ProviderCallMode = 'stream' | 'generate'

export interface ProviderCallOptions {
  messages?: any[]
  providerOptions?: Record<string, any>
  tools?: any
  toolChoice?: any
  [key: string]: any
}

export interface ProviderCallPreparationContext {
  providerId: string
  modelId: string
  mode: ProviderCallMode
  isReasoningModel: boolean
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
  /** Optional provider-specific AI SDK call normalization before stream/generate. */
  prepareCallOptions?: (
    options: ProviderCallOptions,
    context: ProviderCallPreparationContext,
  ) => ProviderCallOptions | void
  /** Whether system messages should be merged into first user message (for APIs that don't support system role with tools) */
  requiresSystemMerge?: boolean
}
