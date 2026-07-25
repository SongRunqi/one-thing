import {
  getDefaultOnethingTokenFilePath,
  OnethingTokenStore,
} from '@onething/runtime/auth'
import type { OAuthToken } from '@shared/ipc.js'
import { getAuthHostPorts } from './host-ports.js'

export class TokenStore extends OnethingTokenStore<OAuthToken> {
  constructor(tokenFilePath = getDefaultOnethingTokenFilePath()) {
    super({
      tokenFilePath,
      cryptoAdapter: () => getAuthHostPorts().tokenCryptoAdapter?.(),
    })
  }
}

export const tokenStore = new TokenStore()
