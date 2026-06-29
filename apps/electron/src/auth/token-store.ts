import {
  getDefaultOnethingTokenFilePath,
  OnethingTokenStore,
} from '@onething/runtime/auth'
import type { OAuthToken } from '@shared/ipc.js'
import { getElectronSafeStorage } from './electron-auth.js'

export class TokenStore extends OnethingTokenStore<OAuthToken> {
  constructor(tokenFilePath = getDefaultOnethingTokenFilePath()) {
    super({
      tokenFilePath,
      cryptoAdapter: getElectronSafeStorage,
    })
  }
}

export const tokenStore = new TokenStore()
