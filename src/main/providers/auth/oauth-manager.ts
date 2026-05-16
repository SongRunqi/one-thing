/**
 * Compatibility facade for the new auth subsystem.
 *
 * New code should import from src/main/auth/auth-service.ts directly. This
 * facade keeps older provider/runtime call sites working while the auth
 * boundary lives under src/main/auth/.
 */

import type { OAuthToken } from '../../../shared/ipc.js'
import { authService } from '../../auth/auth-service.js'
import { generatePKCE } from '../../auth/auth-registry.js'
import type { AuthProviderDefinition } from '../../auth/types.js'

export type OAuthProviderConfig = AuthProviderDefinition

class OAuthManager {
  getConfig(providerId: string): OAuthProviderConfig | null {
    return authService.getDefinition(providerId) || null
  }

  generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    return generatePKCE()
  }

  buildAuthorizationUrl(providerId: string): { authUrl: string; state: string; flowId?: string } | null {
    throw new Error(`buildAuthorizationUrl is no longer supported directly for ${providerId}; use authService.start()`)
  }

  async exchangeCodeForToken(providerId: string, code: string, state: string): Promise<OAuthToken> {
    const response = await authService.completeManualCode(providerId, code, state)
    if (!response.success) {
      throw new Error(response.error || 'OAuth callback failed')
    }
    const token = await authService.getToken(providerId)
    if (!token) throw new Error('OAuth token was not saved')
    return token
  }

  async startDeviceFlow(providerId: string): Promise<{
    userCode: string
    verificationUri: string
    expiresIn: number
    interval: number
    flowId?: string
  }> {
    const response = await authService.start(providerId)
    if (!response.success || !response.userCode || !response.verificationUri) {
      throw new Error(response.error || 'Device flow start failed')
    }
    return {
      userCode: response.userCode,
      verificationUri: response.verificationUri,
      expiresIn: response.expiresIn || 900,
      interval: response.interval || 5,
      flowId: response.flowId,
    }
  }

  async pollDeviceFlow(providerId: string, flowId?: string): Promise<{ completed: boolean; error?: string }> {
    const response = await authService.pollDeviceFlow(providerId, flowId)
    return {
      completed: response.completed,
      error: response.pollStatus || response.error,
    }
  }

  refreshToken(providerId: string): Promise<OAuthToken> {
    return authService.refreshToken(providerId)
  }

  refreshTokenIfNeeded(providerId: string): Promise<OAuthToken> {
    return authService.refreshTokenIfNeeded(providerId)
  }

  isTokenExpired(token: OAuthToken): boolean {
    return authService.isTokenExpired(token)
  }

  getToken(providerId: string): Promise<OAuthToken | null> {
    return authService.getToken(providerId)
  }

  saveToken(providerId: string, token: OAuthToken): Promise<void> {
    return authService.saveToken(providerId, token)
  }

  deleteToken(providerId: string): Promise<void> {
    return authService.deleteToken(providerId)
  }

  isLoggedIn(providerId: string): Promise<boolean> {
    return authService.isLoggedIn(providerId)
  }
}

export const oauthManager = new OAuthManager()

