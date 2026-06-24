/**
 * Claude Code Provider Definition
 *
 * Uses OAuth authentication with Claude Pro/Max subscription.
 * OAuth token is used with Authorization: Bearer header (not x-api-key).
 *
 * Based on opencode-anthropic-auth plugin implementation.
 */

import type { ProviderDefinition } from '../types.js'

const claudeCodeProvider: ProviderDefinition = {
  id: 'claude-code',

  info: {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Use Claude with your Claude Pro/Max subscription via OAuth',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    icon: 'claude-code',
    supportsCustomBaseUrl: false,
    requiresApiKey: false,
    requiresOAuth: true,
    oauthFlow: 'authorization-code',
    // Models fetched dynamically from OpenRouter API (filtered for Pro/Max tier)
  },

}

export default claudeCodeProvider
