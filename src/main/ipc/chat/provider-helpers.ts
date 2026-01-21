/**
 * Provider Helpers Module
 * Handles provider configuration and credential management
 */

import * as store from '../../store.js'
import type { AppSettings, ProviderConfig, CustomProviderConfig } from '../../../shared/ipc.js'
import { requiresOAuth } from '../../providers/index.js'
import { oauthManager } from '../../services/auth/oauth-manager.js'
import { getCachedProviderConfig } from '../../stores/sessions.js'

/**
 * Extract detailed error information from API responses
 */
export function extractErrorDetails(error: any): string | undefined {
  // AI SDK wraps errors with additional context
  if (error.cause) {
    return extractErrorDetails(error.cause)
  }

  // For API errors with response data
  if (error.data) {
    const data = error.data

    // OpenAI error format: { error: { message: "...", type: "...", code: "..." } }
    if (data.error?.message) {
      const err = data.error
      let details = err.message
      if (err.type) details += ` (type: ${err.type})`
      if (err.code) details += ` (code: ${err.code})`
      return details
    }

    // Claude/Anthropic error format
    if (data.type === 'error' && data.error) {
      const err = data.error
      return `${err.type}: ${err.message}`
    }

    if (data.message) {
      return data.message
    }

    if (typeof data === 'string') {
      return data
    }

    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return undefined
    }
  }

  // Return message or stack trace
  return error.message || error.stack
}

/**
 * Get current provider config from settings
 */
export function getProviderConfig(settings: AppSettings): ProviderConfig | undefined {
  return settings.ai.providers[settings.ai.provider]
}

/**
 * Get the API key for a provider, handling OAuth providers
 * For OAuth providers, returns the OAuth access token
 * For regular providers, returns the configured API key
 */
export async function getApiKeyForProvider(providerId: string, providerConfig: ProviderConfig | undefined): Promise<string | null> {
  // Check if this is an OAuth provider
  if (requiresOAuth(providerId)) {
    try {
      const token = await oauthManager.refreshTokenIfNeeded(providerId)
      return token.accessToken
    } catch (error) {
      console.error(`Failed to get OAuth token for ${providerId}:`, error)
      return null
    }
  }

  // Regular provider - use API key from config
  return providerConfig?.apiKey || null
}

/**
 * Check if a provider has valid credentials (API key or OAuth token)
 */
export async function hasValidCredentials(providerId: string, providerConfig: ProviderConfig | undefined): Promise<boolean> {
  const apiKey = await getApiKeyForProvider(providerId, providerConfig)
  return !!apiKey
}

/**
 * Get effective provider and model for a session (session-level overrides global)
 */
export function getEffectiveProviderConfig(
  settings: AppSettings,
  sessionId: string
): { providerId: string; providerConfig: ProviderConfig | undefined; model: string } {
  const session = store.getSession(sessionId)

  // If session has saved provider/model, use those
  if (session?.lastProvider && session?.lastModel) {
    const providerId = session.lastProvider
    const providerConfig = settings.ai.providers[providerId]

    if (providerConfig) {
      // Return a modified config with the session's model
      return {
        providerId,
        providerConfig: {
          ...providerConfig,
          model: session.lastModel,
        },
        model: session.lastModel,
      }
    }
  }

  // Fall back to global settings
  const providerId = settings.ai.provider
  const providerConfig = settings.ai.providers[providerId]
  return {
    providerId,
    providerConfig,
    model: providerConfig?.model || '',
  }
}

/**
 * Get custom provider config by ID
 */
export function getCustomProviderConfig(settings: AppSettings, providerId: string): CustomProviderConfig | undefined {
  return settings.ai.customProviders?.find(p => p.id === providerId)
}

/**
 * Get apiType for a provider
 */
export function getProviderApiType(settings: AppSettings, providerId: string): 'openai' | 'anthropic' | undefined {
  if (providerId.startsWith('custom-')) {
    const customProvider = getCustomProviderConfig(settings, providerId)
    return customProvider?.apiType
  }
  return undefined
}

// ============================================================================
// Optimized Provider Config for Chat (Session-Level Caching)
// ============================================================================

export interface ResolvedProviderConfig {
  providerId: string
  model: string
  apiKey: string
  baseUrl?: string
  temperature: number
}

/**
 * Get provider config for a chat request with session-level optimization
 *
 * This function prioritizes:
 * 1. Session cached config (fastest, avoids repeated settings lookups)
 * 2. Session lastProvider/lastModel (backward compatibility)
 * 3. Global settings (fallback)
 *
 * Note: API key is always fetched fresh (handles OAuth token refresh)
 *
 * @param sessionId - The session ID
 * @returns Resolved provider config with API key, or null if credentials unavailable
 */
export async function getProviderConfigForChat(
  sessionId: string
): Promise<ResolvedProviderConfig | null> {
  const settings = store.getSettings()

  // 1. Try session cached config first (fastest path)
  const cached = getCachedProviderConfig(sessionId)
  if (cached) {
    const providerConfig = settings.ai.providers[cached.providerId]
    const apiKey = await getApiKeyForProvider(cached.providerId, providerConfig)

    if (apiKey) {
      return {
        providerId: cached.providerId,
        model: cached.model,
        apiKey,
        baseUrl: cached.baseUrl,
        temperature: cached.temperature ?? settings.ai.temperature,
      }
    }
    // If API key is missing, fall through to other methods
  }

  // 2. Try session lastProvider/lastModel (backward compatibility)
  const session = store.getSession(sessionId)
  if (session?.lastProvider && session?.lastModel) {
    const providerConfig = settings.ai.providers[session.lastProvider]
    const apiKey = await getApiKeyForProvider(session.lastProvider, providerConfig)

    if (apiKey) {
      return {
        providerId: session.lastProvider,
        model: session.lastModel,
        apiKey,
        baseUrl: providerConfig?.baseUrl,
        temperature: settings.ai.temperature,
      }
    }
  }

  // 3. Fall back to global settings
  const providerId = settings.ai.provider
  const providerConfig = settings.ai.providers[providerId]
  const apiKey = await getApiKeyForProvider(providerId, providerConfig)

  if (!apiKey) {
    return null
  }

  return {
    providerId,
    model: providerConfig?.model || '',
    apiKey,
    baseUrl: providerConfig?.baseUrl,
    temperature: settings.ai.temperature,
  }
}

/**
 * Check if credentials are missing and provide appropriate error message
 */
export function getCredentialsError(providerId: string): string {
  if (requiresOAuth(providerId)) {
    return `Not logged in to ${providerId}. Please login in settings.`
  }
  return 'API Key not configured. Please configure your AI settings.'
}
