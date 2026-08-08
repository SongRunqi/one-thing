import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import {
  generatePKCE,
  getAuthProviderDefinition,
  normalizeGenericOAuthToken,
} from './registry.js'
import type {
  OnethingAuthAccount,
  OnethingAuthBodyFormat,
  OnethingAuthFlowState,
  OnethingAuthProviderDefinition,
  OnethingOAuthCallbackResponse,
  OnethingOAuthDevicePollResponse,
  OnethingOAuthStartResponse,
  OnethingOAuthStatusResponse,
  OnethingOAuthToken,
  OnethingProviderAuthContext,
} from './types.js'

const FLOW_TIMEOUT_MS = 5 * 60 * 1000
const REFRESH_BUFFER_MS = 5 * 60 * 1000

export interface OnethingAuthTokenStore<TToken extends OnethingOAuthToken = OnethingOAuthToken> {
  getToken(providerId: string): Promise<TToken | null>
  saveToken(providerId: string, token: TToken): Promise<void>
  deleteToken(providerId: string): Promise<void>
  isTokenExpired(token: TToken): boolean
}

export interface OnethingAuthCallbackRegistration {
  flowId: string
  providerId: string
  state: string
  path: string
  ports: number[]
  timeoutMs: number
  onCallback: (params: {
    code: string
    state: string
    /** RFC 9207 issuer identifier, when the AS stamped it on the redirect. */
    iss?: string
    flowId: string
    providerId: string
  }) => Promise<void>
}

export interface OnethingAuthCallbackServerAdapter {
  registerFlow(options: OnethingAuthCallbackRegistration): Promise<{ redirectUri: string; port: number }>
  unregisterState(state: string): void
  cleanup(): void
}

export interface OnethingAuthServiceOptions<TToken extends OnethingOAuthToken = OnethingOAuthToken> {
  tokenStore: OnethingAuthTokenStore<TToken>
  fetch?: typeof fetch
  getDefinition?: (providerId: string) => OnethingAuthProviderDefinition | undefined
  callbackServer?: OnethingAuthCallbackServerAdapter
  createId?: () => string
  now?: () => number
  logger?: Pick<Console, 'warn'>
}

export class OnethingAuthService<TToken extends OnethingOAuthToken = OnethingOAuthToken> extends EventEmitter {
  private readonly tokenStore: OnethingAuthTokenStore<TToken>
  private readonly fetchImpl: typeof fetch
  private readonly getDefinitionImpl: (providerId: string) => OnethingAuthProviderDefinition | undefined
  private readonly callbackServer?: OnethingAuthCallbackServerAdapter
  private readonly createId: () => string
  private readonly now: () => number
  private readonly logger: Pick<Console, 'warn'>
  private flows = new Map<string, OnethingAuthFlowState>()
  private providerFlowIds = new Map<string, string>()
  private providerErrors = new Map<string, string>()

  constructor(options: OnethingAuthServiceOptions<TToken>) {
    super()
    this.tokenStore = options.tokenStore
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.getDefinitionImpl = options.getDefinition ?? getAuthProviderDefinition
    this.callbackServer = options.callbackServer
    this.createId = options.createId ?? randomUUID
    this.now = options.now ?? (() => Date.now())
    this.logger = options.logger ?? console
  }

  getDefinition(providerId: string): OnethingAuthProviderDefinition | undefined {
    return this.getDefinitionImpl(providerId)
  }

  async start(providerId: string): Promise<OnethingOAuthStartResponse> {
    const definition = this.requireDefinition(providerId)
    this.clearProviderFlow(providerId)

    if (definition.flowKind === 'device-code') {
      return this.startDeviceFlow(definition)
    }

    const { codeVerifier, codeChallenge } = generatePKCE()
    const flowId = this.createId()
    const state = definition.stateStrategy === 'code-verifier' ? codeVerifier : this.createId()
    let redirectUri = definition.redirectUri || ''

    const flow: OnethingAuthFlowState = {
      flowId,
      providerId,
      kind: definition.flowKind,
      state,
      codeVerifier,
      codeChallenge,
      redirectUri,
      expiresAt: this.now() + FLOW_TIMEOUT_MS,
    }

    if (definition.flowKind === 'pkce-callback') {
      if (!this.callbackServer) {
        throw new Error(`Callback server not configured for ${providerId}`)
      }

      const callbackPath = definition.callbackPath || '/callback'
      const callbackPorts = definition.callbackPorts || [54545]
      const registration = await this.callbackServer.registerFlow({
        flowId,
        providerId,
        state,
        path: callbackPath,
        ports: callbackPorts,
        timeoutMs: FLOW_TIMEOUT_MS,
        onCallback: async ({ code, state: returnedState }) => {
          try {
            await this.completeAuthorizationCodeFlow(providerId, code, returnedState, flowId)
          } catch (error) {
            const message = this.toPublicError(error, 'OAuth callback failed')
            this.providerErrors.set(providerId, message)
            this.emit('token-expired', { providerId, error: message })
          }
        },
      })
      redirectUri = registration.redirectUri
      flow.redirectUri = redirectUri
    }

    this.flows.set(flowId, flow)
    this.providerFlowIds.set(providerId, flowId)
    this.providerErrors.delete(providerId)

    const authUrl = this.buildAuthorizationUrl(definition, {
      providerId,
      flowId,
      codeVerifier,
      codeChallenge,
      state,
      redirectUri,
    })

    return {
      success: true,
      authUrl,
      state,
      flowId,
      flowKind: definition.flowKind,
      expiresAt: flow.expiresAt,
      pollIntervalMs: definition.flowKind === 'pkce-callback' ? 2000 : undefined,
      requiresCodeEntry: definition.flowKind === 'manual-pkce',
      instructions: definition.flowKind === 'manual-pkce' ? definition.codeEntryInstructions : undefined,
      statusMessage: definition.statusMessage,
    }
  }

  async completeManualCode(
    providerId: string,
    code: string,
    state: string,
  ): Promise<OnethingOAuthCallbackResponse> {
    try {
      await this.completeAuthorizationCodeFlow(providerId, code, state)
      return { success: true }
    } catch (error) {
      const message = this.toPublicError(error, 'OAuth callback failed')
      this.providerErrors.set(providerId, message)
      return { success: false, error: message }
    }
  }

  async pollDeviceFlow(providerId: string, flowId?: string): Promise<OnethingOAuthDevicePollResponse> {
    const definition = this.requireDefinition(providerId)
    if (definition.flowKind !== 'device-code') {
      return { success: false, completed: false, error: `Device flow not supported for ${providerId}` }
    }

    const flow = this.getFlow(providerId, flowId)
    if (!flow?.deviceCode || flow.kind !== 'device-code') {
      return { success: false, completed: false, error: 'expired_token' }
    }
    if (this.now() > flow.expiresAt) {
      this.clearFlow(flow.flowId)
      return { success: false, completed: false, error: 'expired_token' }
    }

    const response = await this.authFetch(definition.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        client_id: definition.clientId,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: flow.deviceCode,
      }).toString(),
    })

    const data = await response.json()
    if (data.error) {
      if (data.error === 'authorization_pending') {
        return { success: true, completed: false, pollStatus: 'authorization_pending' }
      }
      if (data.error === 'slow_down') {
        flow.intervalMs = (flow.intervalMs || 5000) + 5000
        return { success: true, completed: false, pollStatus: 'slow_down' }
      }
      this.clearFlow(flow.flowId)
      return { success: false, completed: false, error: data.error, pollStatus: data.error }
    }

    const token = this.normalizeToken(definition, data)
    await this.tokenStore.saveToken(providerId, token)
    this.clearFlow(flow.flowId)
    this.providerErrors.delete(providerId)
    this.emit('token-refreshed', { providerId })
    return { success: true, completed: true }
  }

  async refreshToken(providerId: string): Promise<TToken> {
    const definition = this.requireDefinition(providerId)
    const currentToken = await this.tokenStore.getToken(providerId)
    if (!currentToken?.refreshToken) {
      throw new Error('No refresh token available')
    }

    const format = definition.refreshBodyFormat || definition.tokenBodyFormat || 'form'
    const params = definition.refreshParams
      ? definition.refreshParams(currentToken.refreshToken)
      : {
          client_id: definition.clientId,
          grant_type: 'refresh_token',
          refresh_token: currentToken.refreshToken,
        }

    const response = await this.authFetch(definition.refreshUrl || definition.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': contentTypeFor(format),
        'Accept': 'application/json',
        ...(definition.refreshHeaders ?? {}),
      },
      body: buildRequestBody(format, params),
    })

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`)
    }

    const data = await response.json()
    const token = this.normalizeToken(definition, data, currentToken)
    await this.tokenStore.saveToken(providerId, token)
    this.providerErrors.delete(providerId)
    this.emit('token-refreshed', { providerId })
    return token
  }

  async refreshTokenIfNeeded(providerId: string): Promise<TToken> {
    const token = await this.tokenStore.getToken(providerId)
    if (!token) throw new Error('Not logged in')

    if (token.expiresAt - this.now() < REFRESH_BUFFER_MS) {
      if (!token.refreshToken) {
        throw new Error('Token expired and no refresh token available')
      }
      return this.refreshToken(providerId)
    }

    return token
  }

  async getToken(providerId: string): Promise<TToken | null> {
    return this.tokenStore.getToken(providerId)
  }

  async saveToken(providerId: string, token: TToken): Promise<void> {
    await this.tokenStore.saveToken(providerId, token)
  }

  async deleteToken(providerId: string): Promise<void> {
    this.clearProviderFlow(providerId)
    await this.tokenStore.deleteToken(providerId)
    this.providerErrors.delete(providerId)
  }

  isTokenExpired(token: TToken): boolean {
    return this.tokenStore.isTokenExpired(token)
  }

  async isLoggedIn(providerId: string): Promise<boolean> {
    const token = await this.tokenStore.getToken(providerId)
    return !!token && !this.tokenStore.isTokenExpired(token)
  }

  async getStatus(providerId: string): Promise<OnethingOAuthStatusResponse> {
    const token = await this.tokenStore.getToken(providerId)
    const isExpired = token ? this.tokenStore.isTokenExpired(token) : false
    return {
      success: true,
      providerId,
      isLoggedIn: !!token && !isExpired,
      isExpired,
      canRefresh: !!token?.refreshToken,
      expiresAt: token?.expiresAt,
      account: toAccount(token),
      lastError: this.providerErrors.get(providerId),
    }
  }

  async resolveProviderAuth(providerId: string, apiKey?: string): Promise<OnethingProviderAuthContext | null> {
    const definition = this.getDefinition(providerId)
    if (!definition) {
      return apiKey ? { kind: 'api-key', apiKey } : null
    }

    const token = await this.refreshTokenIfNeeded(providerId)
    return {
      kind: 'oauth',
      token,
      account: toAccount(token) || {},
    }
  }

  cleanup(): void {
    this.callbackServer?.cleanup()
    this.flows.clear()
    this.providerFlowIds.clear()
  }

  private async startDeviceFlow(definition: OnethingAuthProviderDefinition): Promise<OnethingOAuthStartResponse> {
    if (!definition.deviceCodeUrl) {
      throw new Error(`Device flow not configured for ${definition.providerId}`)
    }

    const response = await this.authFetch(definition.deviceCodeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        client_id: definition.clientId,
        scope: definition.scopes.join(' '),
      }).toString(),
    })

    if (!response.ok) {
      throw new Error(`Device flow start failed: ${response.status}`)
    }

    const data = await response.json()
    const flowId = this.createId()
    const expiresIn = Number(data.expires_in || 900)
    const intervalMs = Number(data.interval || 5) * 1000
    const flow: OnethingAuthFlowState = {
      flowId,
      providerId: definition.providerId,
      kind: 'device-code',
      state: this.createId(),
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      intervalMs,
      expiresAt: this.now() + expiresIn * 1000,
    }

    this.flows.set(flowId, flow)
    this.providerFlowIds.set(definition.providerId, flowId)
    this.providerErrors.delete(definition.providerId)

    return {
      success: true,
      flowId,
      flowKind: 'device-code',
      userCode: flow.userCode,
      verificationUri: flow.verificationUri,
      expiresIn,
      interval: Math.round(intervalMs / 1000),
      pollIntervalMs: intervalMs,
      expiresAt: flow.expiresAt,
    }
  }

  private async completeAuthorizationCodeFlow(
    providerId: string,
    code: string,
    state: string,
    flowId?: string,
  ): Promise<TToken> {
    const definition = this.requireDefinition(providerId)
    const flow = this.getFlow(providerId, flowId)
    if (!flow) {
      throw new Error('OAuth flow has expired. Please try logging in again.')
    }

    let actualCode = code.trim()
    let actualState = state
    if (actualCode.includes('#')) {
      const parts = actualCode.split('#')
      actualCode = parts[0]
      if (parts[1]) actualState = parts[1]
    }

    if (actualState && actualState !== flow.state) {
      throw new Error('OAuth state mismatch. Please try logging in again.')
    }

    const format = definition.tokenBodyFormat || 'form'
    const params = definition.tokenParams
      ? definition.tokenParams({
          providerId,
          flowId: flow.flowId,
          codeVerifier: flow.codeVerifier,
          codeChallenge: flow.codeChallenge,
          state: flow.state,
          redirectUri: flow.redirectUri,
          code: actualCode,
        })
      : {
          grant_type: 'authorization_code',
          client_id: definition.clientId,
          code: actualCode,
          redirect_uri: flow.redirectUri || definition.redirectUri || '',
          code_verifier: flow.codeVerifier || '',
        }

    const response = await this.authFetch(definition.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': contentTypeFor(format),
        'Accept': 'application/json',
        ...(definition.tokenHeaders ?? {}),
      },
      body: buildRequestBody(format, params),
    })

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`)
    }

    const data = await response.json()
    const token = this.normalizeToken(definition, data)
    await this.tokenStore.saveToken(providerId, token)
    this.clearFlow(flow.flowId)
    this.providerErrors.delete(providerId)
    this.emit('token-refreshed', { providerId })
    return token
  }

  private buildAuthorizationUrl(
    definition: OnethingAuthProviderDefinition,
    ctx: {
      providerId: string
      flowId: string
      codeVerifier: string
      codeChallenge: string
      state: string
      redirectUri: string
    },
  ): string {
    if (!definition.authorizationUrl) {
      throw new Error(`Authorization URL not configured for ${definition.providerId}`)
    }
    const params = definition.authorizationParams
      ? definition.authorizationParams(ctx)
      : {
          client_id: definition.clientId,
          response_type: 'code',
          redirect_uri: ctx.redirectUri || definition.redirectUri || '',
          code_challenge: ctx.codeChallenge,
          code_challenge_method: 'S256',
          scope: definition.scopes.join(' '),
          state: ctx.state,
        }
    return `${definition.authorizationUrl}?${new URLSearchParams(params).toString()}`
  }

  private normalizeToken(
    definition: OnethingAuthProviderDefinition,
    data: unknown,
    currentToken?: TToken | null,
  ): TToken {
    return (definition.normalizeToken
      ? definition.normalizeToken(data, currentToken)
      : normalizeGenericOAuthToken(data, currentToken)) as TToken
  }

  private requireDefinition(providerId: string): OnethingAuthProviderDefinition {
    const definition = this.getDefinition(providerId)
    if (!definition) throw new Error(`Unknown OAuth provider: ${providerId}`)
    return definition
  }

  private getFlow(providerId: string, flowId?: string): OnethingAuthFlowState | undefined {
    const resolvedFlowId = flowId || this.providerFlowIds.get(providerId)
    if (!resolvedFlowId) return undefined
    const flow = this.flows.get(resolvedFlowId)
    if (!flow || flow.providerId !== providerId) return undefined
    return flow
  }

  private clearProviderFlow(providerId: string): void {
    const flowId = this.providerFlowIds.get(providerId)
    if (flowId) this.clearFlow(flowId)
  }

  private clearFlow(flowId: string): void {
    const flow = this.flows.get(flowId)
    if (!flow) return
    this.flows.delete(flowId)
    if (this.providerFlowIds.get(flow.providerId) === flowId) {
      this.providerFlowIds.delete(flow.providerId)
    }
    this.callbackServer?.unregisterState(flow.state)
  }

  private async authFetch(url: string, options: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, options)
    } catch (error) {
      this.logger.warn('[Auth] OAuth fetch failed:', error)
      throw error
    }
  }

  private toPublicError(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message
    return fallback
  }
}

function buildRequestBody(format: OnethingAuthBodyFormat, params: Record<string, string>): BodyInit {
  return format === 'json'
    ? JSON.stringify(params)
    : new URLSearchParams(params).toString()
}

function contentTypeFor(format: OnethingAuthBodyFormat): string {
  return format === 'json'
    ? 'application/json'
    : 'application/x-www-form-urlencoded'
}

function toAccount(token?: OnethingOAuthToken | null): OnethingAuthAccount | undefined {
  if (!token) return undefined
  const account: OnethingAuthAccount = {
    id: token.accountId,
    email: token.email,
    planType: token.planType,
    isFedramp: token.isFedrampAccount,
  }
  return Object.values(account).some(value => value !== undefined) ? account : undefined
}
