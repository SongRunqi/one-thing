/**
 * Provider Helpers Module
 * Handles provider configuration and credential management
 */

import * as store from '../../store.js'
import type { AppSettings, ProviderConfig, CustomProviderConfig } from '../../../shared/ipc.js'
import type { JsonObject, JsonValue } from '../../../shared/json.js'
import { toJsonObject } from '../../../shared/json.js'
import { requiresOAuth } from '../../providers/index.js'
import { oauthManager } from '../../providers/auth/oauth-manager.js'
import { authService } from '../../auth/auth-service.js'
import type { ProviderAuthContext } from '../../auth/types.js'
import { resolveProviderApiKey } from '../../providers/env.js'

/**
 * Extract detailed error information from API responses
 */
export interface ProviderErrorDetails {
  message?: string
  stack?: string
  cause?: ProviderErrorDetails
  responseBody?: string
  data?: ProviderErrorData | string
}

interface ProviderErrorData extends JsonObject {
  message?: string
  type?: string
  code?: string | number
  statusCode?: string | number
  responseBody?: string
  requestBodyValues?: JsonValue
  responseHeaders?: JsonValue
  error?: ProviderNestedError | string
}

interface ProviderNestedError extends JsonObject {
  message?: string
  type?: string
  code?: string | number
}

export function extractErrorDetails(error: ProviderErrorDetails | undefined): string | undefined {
  if (!error) return undefined

  const data = typeof error.data === 'object' && error.data !== null ? error.data : undefined
  const bodyDetails = extractResponseBodyDetails(error.responseBody) ||
    extractResponseBodyDetails(data?.responseBody)
  if (bodyDetails) return bodyDetails

  // Provider runtimes may wrap errors with additional context.
  if (error.cause) {
    return extractErrorDetails(error.cause)
  }

  // For API errors with response data
  if (error.data) {
    if (typeof error.data === 'string') return error.data
    const data = error.data

    // OpenAI error format: { error: { message: "...", type: "...", code: "..." } }
    if (typeof data.error === 'object' && data.error?.message) {
      const err = data.error
      let details = err.message
      if (err.type) details += ` (type: ${err.type})`
      if (err.code) details += ` (code: ${err.code})`
      return details
    }

    // Claude/Anthropic error format
    if (data.type === 'error' && typeof data.error === 'object') {
      const err = data.error
      return `${err.type}: ${err.message}`
    }

    if (typeof data.message === 'string') {
      return data.message
    }

    if (data.responseBody) {
      const details = extractResponseBodyDetails(data.responseBody)
      if (details) return details
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

function extractResponseBodyDetails(body: string | undefined): string | undefined {
  if (typeof body !== 'string' || !body.trim()) return undefined
  try {
    const parsed = toJsonObject(JSON.parse(body) as JsonValue)
    const error = parsed.error
    const message = parsed.detail ||
      (error && typeof error === 'object' && !Array.isArray(error) ? error.message : undefined) ||
      parsed.message ||
      error
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
  if (providerId === 'acp') {
    return ''
  }

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

  // Regular provider - use manual API key, or an environment variable when configured/detected.
  return resolveProviderApiKey(providerId, providerConfig)
}

/**
 * Resolve runtime auth without forcing OAuth providers through the API-key path.
 */
export async function resolveProviderAuth(
  providerId: string,
  providerConfig: ProviderConfig | undefined,
): Promise<ProviderAuthContext | null> {
  if (providerId === 'acp') {
    return { kind: 'api-key', apiKey: '' }
  }

  if (requiresOAuth(providerId)) {
    try {
      return await authService.resolveProviderAuth(providerId, resolveProviderApiKey(providerId, providerConfig) ?? undefined)
    } catch (error) {
      console.error(`Failed to resolve OAuth credentials for ${providerId}:`, error)
      return null
    }
  }

  const apiKey = resolveProviderApiKey(providerId, providerConfig) || ''
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
