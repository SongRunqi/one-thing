import type { StreamEngineProviderAdapter } from '@onething/core/engine'
import type {
  CoreAppSettingsWithAI,
  CoreProviderAuthLike,
  CoreProviderAuthLogger,
  CoreProviderConfigLike,
  CoreSessionProviderSelection,
} from './provider-config.js'
import {
  getEffectiveOnethingProviderConfig,
  getOnethingProviderApiType,
  resolveOnethingProviderAuth,
} from './provider-runtime.js'

export interface OnethingStreamProviderAdapterOptions<
  TProvider extends CoreProviderConfigLike = CoreProviderConfigLike,
  TSettings extends CoreAppSettingsWithAI<TProvider> = CoreAppSettingsWithAI<TProvider>,
  TAuth extends CoreProviderAuthLike = CoreProviderAuthLike,
  TSession extends CoreSessionProviderSelection = CoreSessionProviderSelection,
> {
  getSession(sessionId: string): TSession | null | undefined
  isProviderSupported(providerId: string): boolean
  isOAuthProvider(providerId: string): boolean
  resolveApiKey(providerId: string, providerConfig: TProvider | undefined): string | null | undefined
  resolveOAuthAuth(providerId: string, apiKey?: string): Promise<TAuth | null>
  createApiKeyAuth?(apiKey: string): TAuth
  generateTitle(
    providerId: string,
    providerConfig: TProvider | undefined,
    content: string,
    options?: Record<string, unknown>,
  ): Promise<string>
  logger?: CoreProviderAuthLogger
}

export function createOnethingStreamProviderAdapter<
  TProvider extends CoreProviderConfigLike = CoreProviderConfigLike,
  TSettings extends CoreAppSettingsWithAI<TProvider> = CoreAppSettingsWithAI<TProvider>,
  TAuth extends CoreProviderAuthLike = CoreProviderAuthLike,
  TSession extends CoreSessionProviderSelection = CoreSessionProviderSelection,
>(
  options: OnethingStreamProviderAdapterOptions<TProvider, TSettings, TAuth, TSession>,
): StreamEngineProviderAdapter<TSettings, TProvider | undefined, TAuth> {
  return {
    getEffectiveConfig(settings, sessionId, override) {
      return getEffectiveOnethingProviderConfig<TProvider, TSession>(settings, sessionId, {
        getSession: options.getSession,
      }, override)
    },
    resolveAuth(providerId, providerConfig) {
      return resolveOnethingProviderAuth<TProvider, TAuth>(providerId, providerConfig, {
        isOAuthProvider: options.isOAuthProvider,
        resolveApiKey: options.resolveApiKey,
        resolveOAuthAuth: options.resolveOAuthAuth,
        createApiKeyAuth: options.createApiKeyAuth,
        logger: options.logger,
      })
    },
    getApiType(settings, providerId) {
      return getOnethingProviderApiType(settings, providerId)
    },
    isSupported(providerId) {
      return options.isProviderSupported(providerId)
    },
    requiresOAuth(providerId) {
      return options.isOAuthProvider(providerId)
    },
    generateTitle(providerId, providerConfig, content, titleOptions) {
      return options.generateTitle(providerId, providerConfig as TProvider | undefined, content, titleOptions)
    },
  }
}
