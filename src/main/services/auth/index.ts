/**
 * Authentication Services
 *
 * This module provides authentication-related services including:
 * - OAuth token management
 * - PKCE flow handling
 * - Device flow for GitHub Copilot
 */

export {
  oauthManager,
  type OAuthProviderConfig,
} from './oauth-manager.js'
