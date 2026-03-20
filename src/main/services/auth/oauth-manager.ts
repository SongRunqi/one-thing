/**
 * OAuth Manager Service
 *
 * Handles OAuth token storage, encryption, and refresh for OAuth-based providers.
 * Uses Electron's safeStorage API for secure token encryption.
 */

import { app, safeStorage, net } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { OAuthToken } from '../../../shared/ipc.js'

// Helper to use Electron's network stack for OAuth requests
// This helps bypass Cloudflare's bot detection
async function electronFetch(url: string, options: RequestInit): Promise<Response> {
  // Use net.fetch which uses Chromium's network stack
  // This handles cookies, TLS, and bot detection better than Node's fetch
  try {
    return await net.fetch(url, options as any)
  } catch (error) {
    // Fallback to regular fetch if net.fetch fails
    console.warn('net.fetch failed, falling back to regular fetch:', error)
    return fetch(url, options)
  }
}

// OAuth configuration for each provider
export interface OAuthProviderConfig {
  clientId: string
  authorizationUrl: string
  tokenUrl: string
  redirectUri: string
  scopes: string[]
  // Device flow specific
  deviceCodeUrl?: string
  // Refresh token endpoint (if different from tokenUrl)
  refreshUrl?: string
}

// PKCE state stored temporarily during OAuth flow
interface PKCEState {
  codeVerifier: string
  state: string
  createdAt: number
}

// Claude Code OAuth configuration (Claude Pro/Max)
// Uses claude.ai for authorization to get user:inference scope
const CLAUDE_CODE_CONFIG: OAuthProviderConfig = {
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  authorizationUrl: 'https://claude.ai/oauth/authorize',
  tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
  redirectUri: 'https://console.anthropic.com/oauth/code/callback',
  scopes: ['org:create_api_key', 'user:profile', 'user:inference'],
}

// GitHub Copilot OAuth configuration (Device Flow)
const GITHUB_COPILOT_CONFIG: OAuthProviderConfig = {
  clientId: 'Iv1.b507a08c87ecfe98', // VSCode GitHub CLI client ID
  authorizationUrl: 'https://github.com/login/device',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  deviceCodeUrl: 'https://github.com/login/device/code',
  redirectUri: '', // Not used for device flow
  scopes: ['copilot'],
}

// Provider configurations map
const OAUTH_CONFIGS: Record<string, OAuthProviderConfig> = {
  'claude-code': CLAUDE_CODE_CONFIG,
  'github-copilot': GITHUB_COPILOT_CONFIG,
}

class OAuthManager {
  private tokenFilePath: string
  private pkceStates: Map<string, PKCEState> = new Map()
  private deviceCodes: Map<string, { deviceCode: string; expiresAt: number }> = new Map()

  constructor() {
    const userDataPath = app.getPath('userData')
    this.tokenFilePath = path.join(userDataPath, 'oauth-tokens.json')
  }

  /**
   * Get OAuth configuration for a provider
   */
  getConfig(providerId: string): OAuthProviderConfig | null {
    return OAUTH_CONFIGS[providerId] || null
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    // Generate code verifier (43-128 characters, URL-safe)
    const codeVerifier = crypto.randomBytes(32).toString('base64url')

    // Generate code challenge using S256
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url')

    return { codeVerifier, codeChallenge }
  }

  /**
   * Store PKCE state for later verification
   */
  storePKCEState(providerId: string, codeVerifier: string, state: string): void {
    this.pkceStates.set(providerId, {
      codeVerifier,
      state,
      createdAt: Date.now(),
    })

    // Clean up old states (older than 10 minutes)
    setTimeout(() => {
      const stored = this.pkceStates.get(providerId)
      if (stored && Date.now() - stored.createdAt > 10 * 60 * 1000) {
        this.pkceStates.delete(providerId)
      }
    }, 10 * 60 * 1000)
  }

  /**
   * Get PKCE state (without removing it)
   */
  getPKCEState(providerId: string): PKCEState | null {
    return this.pkceStates.get(providerId) || null
  }

  /**
   * Clear PKCE state (call after successful token exchange)
   */
  clearPKCEState(providerId: string): void {
    this.pkceStates.delete(providerId)
  }

  /**
   * Store device code for polling
   */
  storeDeviceCode(providerId: string, deviceCode: string, expiresIn: number): void {
    this.deviceCodes.set(providerId, {
      deviceCode,
      expiresAt: Date.now() + expiresIn * 1000,
    })
  }

  /**
   * Get device code
   */
  getDeviceCode(providerId: string): string | null {
    const stored = this.deviceCodes.get(providerId)
    if (!stored || Date.now() > stored.expiresAt) {
      this.deviceCodes.delete(providerId)
      return null
    }
    return stored.deviceCode
  }

  /**
   * Clear device code
   */
  clearDeviceCode(providerId: string): void {
    this.deviceCodes.delete(providerId)
  }

  /**
   * Build authorization URL for PKCE flow
   *
   * IMPORTANT: Per opencode-anthropic-auth, the state parameter should be
   * the PKCE code_verifier value, not a random UUID.
   */
  buildAuthorizationUrl(providerId: string): { authUrl: string; state: string } | null {
    const config = this.getConfig(providerId)
    if (!config) return null

    const { codeVerifier, codeChallenge } = this.generatePKCE()

    // Use code_verifier as state (required by Claude Code OAuth)
    const state = codeVerifier

    // Store for later verification
    this.storePKCEState(providerId, codeVerifier, state)

    const params = new URLSearchParams({
      code: 'true', // Show code page instead of redirecting
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      scope: config.scopes.join(' '),
      state,
    })

    const authUrl = `${config.authorizationUrl}?${params.toString()}`
    return { authUrl, state }
  }

  /**
   * Exchange authorization code for tokens (PKCE flow)
   */
  async exchangeCodeForToken(providerId: string, code: string, state: string): Promise<OAuthToken> {
    const config = this.getConfig(providerId)
    if (!config) throw new Error(`Unknown provider: ${providerId}`)

    // Handle code#state format from Claude.ai callback page
    // The code might be in format "authorization_code#state_value"
    let actualCode = code.trim()
    let actualState = state
    if (actualCode.includes('#')) {
      const parts = actualCode.split('#')
      actualCode = parts[0]
      // Use the state from the code if available
      if (parts[1]) {
        actualState = parts[1]
      }
    }

    const pkceState = this.getPKCEState(providerId)
    if (!pkceState) throw new Error('No PKCE state found - OAuth flow may have expired. Please try logging in again.')

    // Use stored state if none provided or doesn't match
    if (!actualState) {
      actualState = pkceState.state
    }

    console.log(`[OAuth] Exchanging code for token:`)
    console.log(`  - Provider: ${providerId}`)
    console.log(`  - Code length: ${actualCode.length}`)
    console.log(`  - Code preview: ${actualCode.substring(0, 20)}...`)
    console.log(`  - State from code: ${actualState ? actualState.substring(0, 20) + '...' : 'none'}`)
    console.log(`  - Stored state: ${pkceState.state.substring(0, 20)}...`)

    // Use Electron's network stack with browser-like headers
    // Based on working implementation from claude-code-login
    const response = await electronFetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://claude.ai',
        'Referer': 'https://claude.ai/',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        code: actualCode,
        redirect_uri: config.redirectUri,
        code_verifier: pkceState.codeVerifier,
        state: actualState,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Token exchange failed: ${error}`)
    }

    const data = await response.json()

    // Anthropic returns snake_case fields
    const token: OAuthToken = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in || 28800) * 1000, // Default 8 hours
      tokenType: data.token_type || 'Bearer',
      scope: data.scope,
    }

    await this.saveToken(providerId, token)

    // Clear PKCE state only after successful exchange
    this.clearPKCEState(providerId)

    return token
  }

  /**
   * Start device flow (for GitHub Copilot)
   */
  async startDeviceFlow(providerId: string): Promise<{
    userCode: string
    verificationUri: string
    expiresIn: number
    interval: number
  }> {
    const config = this.getConfig(providerId)
    if (!config || !config.deviceCodeUrl) {
      throw new Error(`Device flow not supported for provider: ${providerId}`)
    }

    const response = await fetch(config.deviceCodeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        scope: config.scopes.join(' '),
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Device flow start failed: ${error}`)
    }

    const data = await response.json()

    // Store device code for polling
    this.storeDeviceCode(providerId, data.device_code, data.expires_in)

    return {
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresIn: data.expires_in,
      interval: data.interval || 5,
    }
  }

  /**
   * Poll for device flow token
   */
  async pollDeviceFlow(providerId: string): Promise<{ completed: boolean; error?: string }> {
    const config = this.getConfig(providerId)
    if (!config) throw new Error(`Unknown provider: ${providerId}`)

    const deviceCode = this.getDeviceCode(providerId)
    if (!deviceCode) {
      return { completed: false, error: 'expired_token' }
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: deviceCode,
      }),
    })

    const data = await response.json()

    // Check for error states
    if (data.error) {
      if (data.error === 'authorization_pending') {
        return { completed: false }
      }
      if (data.error === 'slow_down') {
        return { completed: false, error: 'slow_down' }
      }
      this.clearDeviceCode(providerId)
      return { completed: false, error: data.error }
    }

    // Success - save token
    const token: OAuthToken = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in || 28800) * 1000,
      tokenType: data.token_type || 'Bearer',
      scope: data.scope,
    }

    await this.saveToken(providerId, token)
    this.clearDeviceCode(providerId)

    return { completed: true }
  }

  /**
   * Refresh an OAuth token
   */
  async refreshToken(providerId: string): Promise<OAuthToken> {
    const config = this.getConfig(providerId)
    if (!config) throw new Error(`Unknown provider: ${providerId}`)

    const currentToken = await this.getToken(providerId)
    if (!currentToken?.refreshToken) {
      throw new Error('No refresh token available')
    }

    // Use Electron's network stack to avoid Cloudflare blocking
    // Use JSON for Anthropic, form-urlencoded for others
    const isAnthropic = providerId === 'claude-code'
    const response = await electronFetch(config.refreshUrl || config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': isAnthropic ? 'application/json' : 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: isAnthropic
        ? JSON.stringify({
            client_id: config.clientId,
            grant_type: 'refresh_token',
            refresh_token: currentToken.refreshToken,
          })
        : new URLSearchParams({
            client_id: config.clientId,
            grant_type: 'refresh_token',
            refresh_token: currentToken.refreshToken,
          }).toString(),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Token refresh failed: ${error}`)
    }

    const data = await response.json()

    const token: OAuthToken = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || currentToken.refreshToken, // Keep old if not returned
      expiresAt: Date.now() + (data.expires_in || 28800) * 1000,
      tokenType: data.token_type || 'Bearer',
      scope: data.scope,
    }

    await this.saveToken(providerId, token)
    return token
  }

  /**
   * Refresh token if it's about to expire (within 5 minutes)
   */
  async refreshTokenIfNeeded(providerId: string): Promise<OAuthToken> {
    const token = await this.getToken(providerId)
    if (!token) throw new Error('Not logged in')

    const fiveMinutes = 5 * 60 * 1000
    if (token.expiresAt - Date.now() < fiveMinutes) {
      if (token.refreshToken) {
        return this.refreshToken(providerId)
      }
      throw new Error('Token expired and no refresh token available')
    }

    return token
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: OAuthToken): boolean {
    return Date.now() >= token.expiresAt
  }

  /**
   * Get stored token for a provider
   */
  async getToken(providerId: string): Promise<OAuthToken | null> {
    try {
      if (!existsSync(this.tokenFilePath)) {
        return null
      }

      const encrypted = await readFile(this.tokenFilePath, 'utf-8')
      const tokens = JSON.parse(encrypted) as Record<string, string>

      const encryptedToken = tokens[providerId]
      if (!encryptedToken) return null

      // Decrypt using safeStorage
      if (safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(Buffer.from(encryptedToken, 'base64'))
        return JSON.parse(decrypted) as OAuthToken
      } else {
        // Fallback: stored as plain JSON (less secure, but works)
        return JSON.parse(encryptedToken) as OAuthToken
      }
    } catch (error) {
      console.error(`Failed to get OAuth token for ${providerId}:`, error)
      return null
    }
  }

  /**
   * Save token for a provider
   */
  async saveToken(providerId: string, token: OAuthToken): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.tokenFilePath)
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
      }

      // Load existing tokens
      let tokens: Record<string, string> = {}
      if (existsSync(this.tokenFilePath)) {
        const content = await readFile(this.tokenFilePath, 'utf-8')
        tokens = JSON.parse(content)
      }

      // Encrypt and save token
      const tokenJson = JSON.stringify(token)
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(tokenJson)
        tokens[providerId] = encrypted.toString('base64')
      } else {
        // Fallback: store as plain JSON (less secure)
        tokens[providerId] = tokenJson
      }

      await writeFile(this.tokenFilePath, JSON.stringify(tokens, null, 2))
    } catch (error) {
      console.error(`Failed to save OAuth token for ${providerId}:`, error)
      throw error
    }
  }

  /**
   * Delete token for a provider
   */
  async deleteToken(providerId: string): Promise<void> {
    try {
      if (!existsSync(this.tokenFilePath)) {
        return
      }

      const content = await readFile(this.tokenFilePath, 'utf-8')
      const tokens = JSON.parse(content) as Record<string, string>

      delete tokens[providerId]

      await writeFile(this.tokenFilePath, JSON.stringify(tokens, null, 2))
    } catch (error) {
      console.error(`Failed to delete OAuth token for ${providerId}:`, error)
      throw error
    }
  }

  /**
   * Check if a provider is logged in
   */
  async isLoggedIn(providerId: string): Promise<boolean> {
    const token = await this.getToken(providerId)
    return token !== null && !this.isTokenExpired(token)
  }
}

// Export singleton instance
export const oauthManager = new OAuthManager()
