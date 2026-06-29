import {
  OnethingAuthService,
  type OnethingAuthServiceOptions,
  type OnethingAuthTokenStore,
} from './auth-service.js'
import { callbackServerManager } from './callback-server.js'
import { getAuthProviderDefinition } from './registry.js'
import type { OnethingOAuthToken } from './types.js'

export interface OnethingAuthRuntimeOptions<TToken extends OnethingOAuthToken = OnethingOAuthToken>
  extends Partial<OnethingAuthServiceOptions<TToken>> {
  tokenStore: OnethingAuthTokenStore<TToken>
}

export function createOnethingAuthServiceOptions<TToken extends OnethingOAuthToken = OnethingOAuthToken>(
  options: OnethingAuthRuntimeOptions<TToken>,
): OnethingAuthServiceOptions<TToken> {
  return {
    fetch: options.fetch,
    getDefinition: options.getDefinition ?? getAuthProviderDefinition,
    callbackServer: options.callbackServer ?? callbackServerManager,
    createId: options.createId,
    now: options.now,
    logger: options.logger,
    tokenStore: options.tokenStore,
  }
}

export function createOnethingAuthService<TToken extends OnethingOAuthToken = OnethingOAuthToken>(
  options: OnethingAuthRuntimeOptions<TToken>,
): OnethingAuthService<TToken> {
  return new OnethingAuthService(createOnethingAuthServiceOptions(options))
}
