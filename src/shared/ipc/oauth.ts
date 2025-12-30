/**
 * OAuth Module
 * OAuth-related type definitions for IPC communication
 */

// OAuth start request
export interface OAuthStartRequest {
  providerId: string
}

// OAuth start response (for authorization-code flow with PKCE)
export interface OAuthStartResponse {
  success: boolean
  // For PKCE flow - returns auth URL to open in browser
  authUrl?: string
  state?: string
  // For device flow - returns user code to display
  userCode?: string
  verificationUri?: string
  expiresIn?: number
  interval?: number
  // For manual code entry flow (Claude Code)
  requiresCodeEntry?: boolean
  instructions?: string
  error?: string
}

// OAuth callback request (after user completes auth in browser)
export interface OAuthCallbackRequest {
  providerId: string
  code: string
  state: string
}

// OAuth callback response
export interface OAuthCallbackResponse {
  success: boolean
  error?: string
}

// OAuth status request
export interface OAuthStatusRequest {
  providerId: string
}

// OAuth status response
export interface OAuthStatusResponse {
  success: boolean
  isLoggedIn: boolean
  expiresAt?: number
  error?: string
}

// OAuth logout request
export interface OAuthLogoutRequest {
  providerId: string
}

// OAuth logout response
export interface OAuthLogoutResponse {
  success: boolean
  error?: string
}

// OAuth device poll request (for device flow)
export interface OAuthDevicePollRequest {
  providerId: string
  deviceCode: string
}

// OAuth device poll response
export interface OAuthDevicePollResponse {
  success: boolean
  completed: boolean
  error?: string
  // 'authorization_pending' | 'slow_down' | 'expired_token' | 'access_denied'
  pollStatus?: string
}
