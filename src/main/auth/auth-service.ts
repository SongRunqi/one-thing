import { createElectronAuthFetch } from '@onething/electron-host/auth/auth-fetch'
import {
  createOnethingAuthServiceOptions,
  OnethingAuthService,
  type OnethingAuthCallbackServerAdapter,
  type OnethingAuthServiceOptions,
  type OnethingAuthTokenStore,
} from '@onething/runtime/auth'
import type { OAuthToken } from '../../shared/ipc.js'
import { createRequiredAppFetch } from '../providers/bound-fetch.js'
import { tokenStore } from './token-store.js'

export interface MainAuthServiceOptions extends Partial<OnethingAuthServiceOptions<OAuthToken>> {
  tokenStore?: OnethingAuthTokenStore<OAuthToken>
  callbackServer?: OnethingAuthCallbackServerAdapter
}

const mainAuthFetch = createElectronAuthFetch({
  fallbackFetch: createRequiredAppFetch({ policy: 'auth' }),
})

export class AuthService extends OnethingAuthService<OAuthToken> {
  constructor(options: MainAuthServiceOptions = {}) {
    super(createOnethingAuthServiceOptions({
      fetch: mainAuthFetch,
      ...options,
      tokenStore: options.tokenStore ?? tokenStore,
    }))
  }
}

export const authService = new AuthService()
