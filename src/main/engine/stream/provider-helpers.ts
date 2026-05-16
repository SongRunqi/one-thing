/**
 * Provider Helpers Module
 * Handles provider configuration and credential management
 */

import * as store from '../../store.js'
import type { AppSettings, ProviderConfig, CustomProviderConfig } from '../../../shared/ipc.js'
import { requiresOAuth } from '../../providers/index.js'
import { oauthManager } from '../../providers/auth/oauth-manager.js'
import { authService } from '../../auth/auth-service.js'
import type { ProviderAuthContext } from '../../auth/types.js'

/**
 * Extract detailed error information from API responses
 */
export function extractErrorDetails(error: any): string | undefined {
  const bodyDetails = extractResponseBodyDetails(error?.responseBody) ||
    extractResponseBodyDetails(error?.data?.responseBody)
  if (bodyDetails) return bodyDetails

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

    if (data.responseBody) {
      const details = extractResponseBodyDetails(data.responseBody)
      if (details) return details
    }

    if (typeof data === 'string') {
      return data
    }

    // Avoid surfacing full provider request snapshots in the UI/log payload.
    if (data.requestBodyValues || data.responseHeaders || data.statusCode) {
      return data.message || `Provider API request failed${data.statusCode ? ` (${data.statusCode})` : ''}`
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

function extractResponseBodyDetails(body: unknown): string | undefined {
  if (typeof body !== 'string' || !body.trim()) return undefined
  try {
    const parsed = JSON.parse(body)
    const message = parsed?.detail ||
      parsed?.error?.message ||
      parsed?.message ||
      parsed?.error
    if (typeof message === 'string' && message.trim()) return message.trim()
  } catch {
    // Fall back to compact text below.
  }
  const compact = body.replace(/\s+/g, ' ').trim()
  return compact || undefined
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
 * Resolve runtime auth without forcing OAuth providers through the API-key path.
 */
export async function resolveProviderAuth(
  providerId: string,
  providerConfig: ProviderConfig | undefined,
): Promise<ProviderAuthContext | null> {
  if (requiresOAuth(providerId)) {
    try {
      return await authService.resolveProviderAuth(providerId, providerConfig?.apiKey)
    } catch (error) {
      console.error(`Failed to resolve OAuth credentials for ${providerId}:`, error)
      return null
    }
  }

  const apiKey = providerConfig?.apiKey || ''
  return apiKey ? { kind: 'api-key', apiKey } : null
}

/**
 * Check if a provider has valid credentials (API key or OAuth token)
 */
export async function hasValidCredentials(providerId: string, providerConfig: ProviderConfig | undefined): Promise<boolean> {
  const auth = await resolveProviderAuth(providerId, providerConfig)
  return !!auth
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
  authContext: ProviderAuthContext
  baseUrl?: string
  temperature: number
}

/**
 * Get provider config for a chat request.
 *
 * Resolution order:
 * 1. Session lastProvider/lastModel (per-session override)
 * 2. Global settings (fallback)
 *
 * Note: API key is always fetched fresh (handles OAuth token refresh)
 */
export async function getProviderConfigForChat(
  sessionId: string
): Promise<ResolvedProviderConfig | null> {
  const settings = store.getSettings()
  const session = store.getSession(sessionId)
  if (session?.lastProvider && session?.lastModel) {
    const providerConfig = settings.ai.providers[session.lastProvider]
    const authContext = await resolveProviderAuth(session.lastProvider, providerConfig)

    if (authContext) {
      return {
        providerId: session.lastProvider,
        model: session.lastModel,
        apiKey: authContext.kind === 'api-key' ? authContext.apiKey : '',
        authContext,
        baseUrl: providerConfig?.baseUrl,
        temperature: providerConfig?.temperature ?? settings.ai.temperature,
      }
    }
  }

  // 3. Fall back to global settings
  const providerId = settings.ai.provider
  const providerConfig = settings.ai.providers[providerId]
  const authContext = await resolveProviderAuth(providerId, providerConfig)

  if (!authContext) {
    return null
  }

  return {
    providerId,
    model: providerConfig?.model || '',
    apiKey: authContext.kind === 'api-key' ? authContext.apiKey : '',
    authContext,
    baseUrl: providerConfig?.baseUrl,
    temperature: providerConfig?.temperature ?? settings.ai.temperature,
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
