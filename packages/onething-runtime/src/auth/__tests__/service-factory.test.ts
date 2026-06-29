import { describe, expect, it, vi } from 'vitest'
import type { OnethingAuthProviderDefinition } from '../types.js'
import {
  createOnethingAuthService,
  createOnethingAuthServiceOptions,
} from '../service-factory.js'
import type { OnethingAuthTokenStore } from '../auth-service.js'

function createTokenStore(): OnethingAuthTokenStore {
  return {
    getToken: vi.fn(async () => null),
    saveToken: vi.fn(async () => {}),
    deleteToken: vi.fn(async () => {}),
    isTokenExpired: vi.fn(() => false),
  }
}

describe('onething auth service factory', () => {
  it('uses runtime defaults for provider registry and callback server', () => {
    const tokenStore = createTokenStore()

    const options = createOnethingAuthServiceOptions({ tokenStore })

    expect(options.tokenStore).toBe(tokenStore)
    expect(options.getDefinition?.('codex')?.providerId).toBe('codex')
    expect(options.callbackServer).toBeDefined()
  })

  it('allows host adapters to override runtime defaults', () => {
    const tokenStore = createTokenStore()
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const definition: OnethingAuthProviderDefinition = {
      providerId: 'host-provider',
      name: 'Host Provider',
      flowKind: 'manual-pkce',
      oauthFlow: 'authorization-code',
      clientId: 'client',
      authorizationUrl: 'https://example.test/auth',
      tokenUrl: 'https://example.test/token',
      scopes: ['read'],
    }
    const getDefinition = vi.fn(() => definition)
    const callbackServer = {
      registerFlow: vi.fn(),
      unregisterState: vi.fn(),
      cleanup: vi.fn(),
    }

    const options = createOnethingAuthServiceOptions({
      tokenStore,
      fetch: fetchImpl,
      getDefinition,
      callbackServer,
    })

    expect(options.fetch).toBe(fetchImpl)
    expect(options.getDefinition?.('host-provider')).toBe(definition)
    expect(options.callbackServer).toBe(callbackServer)
  })

  it('creates a reusable runtime auth service instance', () => {
    const service = createOnethingAuthService({ tokenStore: createTokenStore() })

    expect(service.getDefinition('codex')?.providerId).toBe('codex')
  })
})
