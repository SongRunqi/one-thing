import type { OAuthFlowType, OAuthToken } from '../../shared/ipc.js'

export type AuthFlowKind = 'pkce-callback' | 'manual-pkce' | 'device-code'
export type AuthBodyFormat = 'json' | 'form'
export type AuthStateStrategy = 'random' | 'code-verifier'

export interface AuthAccount {
  id?: string
  email?: string
  planType?: string
  isFedramp?: boolean
}

export type ProviderAuthContext =
  | { kind: 'api-key'; apiKey: string }
  | { kind: 'oauth'; token: OAuthToken; account: AuthAccount }

export interface AuthRequestContext {
  providerId: string
  flowId: string
  codeVerifier?: string
  codeChallenge?: string
  state?: string
  redirectUri?: string
}

export interface AuthProviderDefinition {
  providerId: string
  name: string
  flowKind: AuthFlowKind
  oauthFlow: OAuthFlowType
  clientId: string
  authorizationUrl?: string
  tokenUrl: string
  refreshUrl?: string
  deviceCodeUrl?: string
  scopes: string[]
  callbackPath?: string
  callbackPorts?: number[]
  redirectUri?: string
  stateStrategy?: AuthStateStrategy
  tokenBodyFormat?: AuthBodyFormat
  refreshBodyFormat?: AuthBodyFormat
  tokenHeaders?: Record<string, string>
  refreshHeaders?: Record<string, string>
  authorizationParams?: (ctx: AuthRequestContext) => Record<string, string>
  tokenParams?: (ctx: AuthRequestContext & { code: string }) => Record<string, string>
  refreshParams?: (refreshToken: string) => Record<string, string>
  normalizeToken?: (data: any, currentToken?: OAuthToken | null) => OAuthToken
  codeEntryInstructions?: string
  statusMessage?: string
}

export interface AuthFlowState {
  flowId: string
  providerId: string
  kind: AuthFlowKind
  state: string
  codeVerifier?: string
  codeChallenge?: string
  redirectUri?: string
  deviceCode?: string
  userCode?: string
  verificationUri?: string
  intervalMs?: number
  expiresAt: number
  lastError?: string
}

